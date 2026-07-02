/**
 * POST /api/whatsapp/broadcast/run
 *
 * Full server-side broadcast runner for Meta API (official) templates.
 * Runs entirely on the server so the user can navigate away without
 * interrupting the send loop.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { sendTemplateMessage } from '@/lib/whatsapp/meta-api'
import { decrypt } from '@/lib/whatsapp/encryption'
import { isMessageTemplate } from '@/lib/whatsapp/template-row-guard'
import {
  sanitizePhoneForMeta,
  isValidE164,
  phoneVariants,
  isRecipientNotAllowedError,
} from '@/lib/whatsapp/phone-utils'

export const maxDuration = 300

const SEND_BATCH_SIZE = 10
const SEND_BATCH_DELAY_MS = 1000
const INSERT_BATCH_SIZE = 200

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

type VariableMapping =
  | { type: 'static'; value: string }
  | { type: 'field'; value: string }
  | { type: 'custom_field'; value: string }

interface AudienceConfig {
  type: 'all' | 'tags' | 'custom_field' | 'csv'
  tagIds?: string[]
  customField?: { fieldId: string; operator: 'is' | 'is_not' | 'contains'; value: string }
  csvContacts?: { phone: string; name?: string; company?: string }[]
  excludeTagIds?: string[]
}

type ContactRow = {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  company: string | null
}

function resolveParams(
  variables: Record<string, VariableMapping>,
  contact: ContactRow,
  customValues?: Map<string, string>,
): string[] {
  const keys = Object.keys(variables).sort((a, b) => {
    const an = Number(a)
    const bn = Number(b)
    if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn
    return a.localeCompare(b)
  })
  return keys.map((key) => {
    const v = variables[key]
    if (v.type === 'static') return v.value
    if (v.type === 'field') {
      const fieldMap: Record<string, string | undefined> = {
        name: contact.name ?? undefined,
        phone: contact.phone ?? undefined,
        email: contact.email ?? undefined,
        company: contact.company ?? undefined,
      }
      return fieldMap[v.value] ?? ''
    }
    return customValues?.get(v.value) ?? ''
  })
}

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', user.id)
    .maybeSingle()
  const accountId = profile?.account_id as string | undefined
  if (!accountId) {
    return NextResponse.json({ error: 'Your profile is not linked to an account.' }, { status: 403 })
  }

  const body = await request.json()
  const { name, template_name, template_language, variables, audience } = body as {
    name: string
    template_name: string
    template_language: string
    variables: Record<string, VariableMapping>
    audience: AudienceConfig
  }

  if (!name?.trim() || !template_name || !audience) {
    return NextResponse.json(
      { error: 'name, template_name and audience are required' },
      { status: 400 },
    )
  }

  // ── Load WhatsApp config ───────────────────────────────────────────────────
  const { data: config } = await supabase
    .from('whatsapp_config')
    .select('*')
    .eq('account_id', accountId)
    .single()
  if (!config) {
    return NextResponse.json({ error: 'WhatsApp not configured.' }, { status: 400 })
  }

  const accessToken = decrypt(config.access_token)

  // ── Load template ──────────────────────────────────────────────────────────
  const { data: rawTemplateRow } = await supabase
    .from('message_templates')
    .select('*')
    .eq('account_id', accountId)
    .eq('name', template_name)
    .eq('language', template_language || 'en_US')
    .maybeSingle()
  if (rawTemplateRow && !isMessageTemplate(rawTemplateRow)) {
    return NextResponse.json(
      { error: 'Template row is malformed — run "Sync from Meta" in Settings first.' },
      { status: 500 },
    )
  }
  const templateRow = rawTemplateRow ?? null

  // ── Resolve audience contacts ──────────────────────────────────────────────
  let contacts: ContactRow[] = []

  if (audience.type === 'all') {
    const { data } = await supabase
      .from('contacts')
      .select('id, name, phone, email, company')
      .eq('account_id', accountId)
    contacts = (data ?? []) as ContactRow[]
  } else if (audience.type === 'tags' && audience.tagIds?.length) {
    const { data: tagRows } = await supabase
      .from('contact_tags')
      .select('contact_id')
      .in('tag_id', audience.tagIds)
    const ids = [...new Set((tagRows ?? []).map((r: { contact_id: string }) => r.contact_id))]
    if (ids.length > 0) {
      const { data } = await supabase
        .from('contacts')
        .select('id, name, phone, email, company')
        .eq('account_id', accountId)
        .in('id', ids)
      contacts = (data ?? []) as ContactRow[]
    }
  } else if (audience.type === 'custom_field' && audience.customField) {
    const { fieldId, operator, value } = audience.customField
    let q = supabase.from('contact_custom_values').select('contact_id').eq('custom_field_id', fieldId)
    if (operator === 'is') q = q.eq('value', value)
    else if (operator === 'is_not') q = q.neq('value', value)
    else if (operator === 'contains') q = q.ilike('value', `%${value}%`)
    const { data: matches } = await q
    const contactIds = [...new Set((matches ?? []).map((m: { contact_id: string }) => m.contact_id))]
    if (contactIds.length > 0) {
      const { data } = await supabase
        .from('contacts')
        .select('id, name, phone, email, company')
        .eq('account_id', accountId)
        .in('id', contactIds)
      contacts = (data ?? []) as ContactRow[]
    }
  } else if (audience.type === 'csv' && audience.csvContacts?.length) {
    const byPhone = new Map(audience.csvContacts.filter((r) => r.phone).map((r) => [r.phone, r]))
    const phones = [...byPhone.keys()]
    if (phones.length > 0) {
      const { data: existing } = await supabase
        .from('contacts')
        .select('id, name, phone, email, company')
        .eq('account_id', accountId)
        .in('phone', phones)
      const existingMap = new Map((existing ?? []).map((c: ContactRow) => [c.phone, c]))
      const missing = phones
        .filter((p) => !existingMap.has(p))
        .map((p) => ({
          account_id: accountId,
          phone: p,
          name: byPhone.get(p)?.name ?? null,
          company: byPhone.get(p)?.company ?? null,
        }))
      if (missing.length > 0) {
        const { data: created } = await supabaseAdmin()
          .from('contacts')
          .insert(missing)
          .select('id, name, phone, email, company')
        for (const c of (created ?? []) as ContactRow[]) existingMap.set(c.phone, c)
      }
      contacts = [...existingMap.values()]
    }
  }

  if (audience.excludeTagIds?.length) {
    const { data: excludeRows } = await supabase
      .from('contact_tags')
      .select('contact_id')
      .in('tag_id', audience.excludeTagIds)
    const excludedIds = new Set((excludeRows ?? []).map((r: { contact_id: string }) => r.contact_id))
    contacts = contacts.filter((c) => !excludedIds.has(c.id))
  }

  if (contacts.length === 0) {
    return NextResponse.json({ error: 'No contacts found for this audience.' }, { status: 400 })
  }

  // ── Create broadcast row ───────────────────────────────────────────────────
  const adminDb = supabaseAdmin()
  const { data: broadcast, error: broadcastErr } = await adminDb
    .from('broadcasts')
    .insert({
      user_id: user.id,
      account_id: accountId,
      name: name.trim(),
      template_name,
      template_language: template_language || 'en_US',
      template_variables: variables ?? {},
      audience_filter: {
        type: audience.type,
        tagIds: audience.tagIds,
        customField: audience.customField,
        excludeTagIds: audience.excludeTagIds,
      },
      status: 'sending',
      total_recipients: contacts.length,
      sent_count: 0,
      delivered_count: 0,
      read_count: 0,
      replied_count: 0,
      failed_count: 0,
    })
    .select()
    .single()

  if (broadcastErr || !broadcast) {
    return NextResponse.json(
      { error: `Failed to create broadcast: ${broadcastErr?.message ?? 'unknown'}` },
      { status: 500 },
    )
  }

  // ── Insert recipients ──────────────────────────────────────────────────────
  const recipientRows = contacts.map((c) => ({
    broadcast_id: broadcast.id,
    contact_id: c.id,
    status: 'pending' as const,
  }))

  for (let i = 0; i < recipientRows.length; i += INSERT_BATCH_SIZE) {
    const { error: rErr } = await adminDb
      .from('broadcast_recipients')
      .insert(recipientRows.slice(i, i + INSERT_BATCH_SIZE))
    if (rErr) {
      await adminDb
        .from('broadcasts')
        .update({ status: 'failed', failed_count: contacts.length })
        .eq('id', broadcast.id)
      return NextResponse.json(
        { error: `Failed to insert recipients: ${rErr.message}` },
        { status: 500 },
      )
    }
  }

  // ── Load custom field values for all contacts ──────────────────────────────
  const customValueIndex = new Map<string, Map<string, string>>()
  const CV_PAGE = 500
  for (let i = 0; i < contacts.length; i += CV_PAGE) {
    const ids = contacts.slice(i, i + CV_PAGE).map((c) => c.id)
    const { data: cvRows } = await supabase
      .from('contact_custom_values')
      .select('contact_id, custom_field_id, value')
      .in('contact_id', ids)
    for (const row of cvRows ?? []) {
      const bucket = customValueIndex.get(row.contact_id) ?? new Map<string, string>()
      bucket.set(row.custom_field_id, row.value ?? '')
      customValueIndex.set(row.contact_id, bucket)
    }
  }

  const contactById = new Map(contacts.map((c) => [c.id, c]))

  // ── Fetch inserted recipients ──────────────────────────────────────────────
  const { data: recipients } = await adminDb
    .from('broadcast_recipients')
    .select('id, contact_id')
    .eq('broadcast_id', broadcast.id)

  let sentCount = 0
  let failedCount = 0

  // ── Send loop ──────────────────────────────────────────────────────────────
  for (let i = 0; i < (recipients ?? []).length; i += SEND_BATCH_SIZE) {
    const batch = (recipients ?? []).slice(i, i + SEND_BATCH_SIZE)

    for (const recipient of batch) {
      const contact = contactById.get(recipient.contact_id)
      if (!contact?.phone) {
        failedCount++
        await adminDb
          .from('broadcast_recipients')
          .update({ status: 'failed', error_message: 'No phone number' })
          .eq('id', recipient.id)
        continue
      }

      const sanitized = sanitizePhoneForMeta(contact.phone)
      if (!isValidE164(sanitized)) {
        failedCount++
        await adminDb
          .from('broadcast_recipients')
          .update({ status: 'failed', error_message: 'Invalid phone number format' })
          .eq('id', recipient.id)
        continue
      }

      const params = resolveParams(variables ?? {}, contact, customValueIndex.get(contact.id))
      const variants = phoneVariants(sanitized)
      let sentMessageId: string | null = null
      let lastError: string | null = null

      for (const variant of variants) {
        try {
          const result = await sendTemplateMessage({
            phoneNumberId: config.phone_number_id,
            accessToken,
            to: variant,
            templateName: template_name,
            language: template_language || 'en_US',
            template: templateRow ?? undefined,
            params,
          })
          sentMessageId = result.messageId
          lastError = null
          break
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error'
          if (!isRecipientNotAllowedError(msg)) { lastError = msg; break }
          lastError = msg
        }
      }

      if (sentMessageId) {
        sentCount++
        await adminDb
          .from('broadcast_recipients')
          .update({ status: 'sent', sent_at: new Date().toISOString(), whatsapp_message_id: sentMessageId })
          .eq('id', recipient.id)
      } else {
        failedCount++
        await adminDb
          .from('broadcast_recipients')
          .update({ status: 'failed', error_message: lastError ?? 'Unknown error' })
          .eq('id', recipient.id)
      }
    }

    // Update counts mid-send so the broadcast detail page shows live progress
    await adminDb
      .from('broadcasts')
      .update({ sent_count: sentCount, failed_count: failedCount })
      .eq('id', broadcast.id)

    if (i + SEND_BATCH_SIZE < (recipients ?? []).length) {
      await sleep(SEND_BATCH_DELAY_MS)
    }
  }

  // ── Finalize ───────────────────────────────────────────────────────────────
  const finalStatus = failedCount === contacts.length ? 'failed' : 'sent'
  await adminDb
    .from('broadcasts')
    .update({ status: finalStatus, sent_count: sentCount, failed_count: failedCount })
    .eq('id', broadcast.id)

  return NextResponse.json({ broadcastId: broadcast.id, sentCount, failedCount })
}
