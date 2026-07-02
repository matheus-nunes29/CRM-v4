import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { getSystemEvolutionConfig } from '@/lib/whatsapp/evolution-api'

interface AudienceConfig {
  type: 'all' | 'tags' | 'custom_field' | 'csv'
  tagIds?: string[]
  customField?: { fieldId: string; operator: 'is' | 'is_not' | 'contains'; value: string }
  csvContacts?: { phone: string; name?: string; company?: string }[]
  excludeTagIds?: string[]
}

const INSERT_BATCH = 200
const MIN_DELAY_MS = 300
const MAX_DELAY_MS = 10 * 60 * 1000

export async function POST(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

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
    return NextResponse.json(
      { error: 'Your profile is not linked to an account.' },
      { status: 403 },
    )
  }

  const body = await request.json()
  const { name, quick_template_id, audience, delay_seconds } = body as {
    name: string
    quick_template_id: string
    audience: AudienceConfig
    delay_seconds?: number
  }

  // Clamp delay between 300 ms and 10 minutes
  const delayMs = Math.min(
    Math.max((delay_seconds ?? 10) * 1000, MIN_DELAY_MS),
    MAX_DELAY_MS,
  )

  if (!name?.trim() || !quick_template_id || !audience) {
    return NextResponse.json(
      { error: 'name, quick_template_id and audience are required' },
      { status: 400 },
    )
  }

  // ── Load quick template ────────────────────────────────────────────────────
  const { data: template, error: tplErr } = await supabase
    .from('quick_templates')
    .select('id, name, body, media_type, media_url, messages')
    .eq('id', quick_template_id)
    .eq('account_id', accountId)
    .maybeSingle()

  if (tplErr || !template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  }

  // ── Resolve Evolution config ───────────────────────────────────────────────
  const { data: waConfig } = await supabase
    .from('whatsapp_config')
    .select('provider, evolution_instance_name')
    .eq('account_id', accountId)
    .maybeSingle()

  if (!waConfig || waConfig.provider !== 'evolution' || !waConfig.evolution_instance_name) {
    return NextResponse.json(
      { error: 'Quick broadcasts require Evolution API (unofficial provider). Configure it in WhatsApp settings.' },
      { status: 400 },
    )
  }

  let evoCfg
  try {
    evoCfg = getSystemEvolutionConfig(waConfig.evolution_instance_name)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: `Evolution server not configured: ${msg}` }, { status: 503 })
  }

  // ── Resolve audience contacts ──────────────────────────────────────────────
  type ContactRow = { id: string; name: string | null; phone: string | null; company: string | null }
  let contacts: ContactRow[] = []

  if (audience.type === 'all') {
    const { data } = await supabase
      .from('contacts')
      .select('id, name, phone, company')
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
        .select('id, name, phone, company')
        .eq('account_id', accountId)
        .in('id', ids)
      contacts = (data ?? []) as ContactRow[]
    }
  } else if (audience.type === 'csv' && audience.csvContacts?.length) {
    const byPhone = new Map(audience.csvContacts.filter(r => r.phone).map(r => [r.phone, r]))
    const phones = [...byPhone.keys()]
    if (phones.length > 0) {
      const { data: existing } = await supabase
        .from('contacts')
        .select('id, name, phone, company')
        .eq('account_id', accountId)
        .in('phone', phones)
      const existingMap = new Map((existing ?? []).map((c: ContactRow) => [c.phone, c]))
      // Upsert missing contacts
      const missing = phones.filter(p => !existingMap.has(p)).map(p => ({
        account_id: accountId,
        phone: p,
        name: byPhone.get(p)?.name ?? null,
        company: byPhone.get(p)?.company ?? null,
      }))
      if (missing.length > 0) {
        const { data: created } = await supabaseAdmin().from('contacts').insert(missing).select('id, name, phone, company')
        for (const c of (created ?? []) as ContactRow[]) existingMap.set(c.phone, c)
      }
      contacts = [...existingMap.values()]
    }
  }

  // Apply exclude tags
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
      template_name: template.name,
      template_language: 'pt_BR',
      template_variables: {},
      broadcast_type: 'quick',
      quick_template_id: template.id,
      quick_template_body: template.body,
      audience_filter: { type: audience.type, tagIds: audience.tagIds },
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

  // ── Schedule recipients — cron worker handles actual sending ──────────────
  // Each contact's first message is scheduled at:
  //   baseTime + index × (contact_delay + total_sequence_delay)
  //
  // total_sequence_delay = sum of delay_before_ms of all messages after the first.
  // This ensures Contact N+1 starts only after Contact N has finished all messages.
  // Subsequent messages within a sequence are rescheduled dynamically by the worker
  // (message_index tracks progress; no sleep() in the function).
  type MsgDef = { delay_before_ms?: number }
  const templateMsgs = template.messages as MsgDef[] | null
  const totalSequenceMs =
    templateMsgs && templateMsgs.length > 1
      ? templateMsgs.slice(1).reduce((sum, m) => sum + (m.delay_before_ms ?? 0), 0)
      : 0
  const contactIntervalMs = Math.max(delayMs, MIN_DELAY_MS) + totalSequenceMs

  const baseTime = Date.now()
  const recipientRows = contacts.map((c, index) => {
    const jitter = index === 0 ? 0 : (Math.random() * 10 - 5) * 1000
    const scheduledMs = baseTime + index * contactIntervalMs + jitter
    return {
      broadcast_id: broadcast.id,
      contact_id: c.id,
      status: 'pending' as const,
      scheduled_at: new Date(scheduledMs).toISOString(),
    }
  })

  for (let i = 0; i < recipientRows.length; i += INSERT_BATCH) {
    const { error: rErr } = await adminDb
      .from('broadcast_recipients')
      .insert(recipientRows.slice(i, i + INSERT_BATCH))
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

  // Broadcast stays 'sending'; the cron worker will flip it to 'sent'/'failed'
  // once all scheduled recipients have been processed.
  return NextResponse.json({ broadcastId: broadcast.id, scheduled: contacts.length })
}
