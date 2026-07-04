import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'

const WAPI_INSTANCE_ID = process.env.WAPI_INSTANCE_ID ?? ''
const WAPI_TOKEN = process.env.WAPI_TOKEN ?? ''


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
  wapi_lid?: string | null
}

async function resolveContacts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  accountId: string,
  audience: AudienceConfig,
): Promise<ContactRow[]> {
  let contacts: ContactRow[] = []

  if (audience.type === 'all') {
    const { data } = await supabase
      .from('contacts')
      .select('id, name, phone, wapi_lid')
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
        .select('id, name, phone, wapi_lid')
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
        .select('id, name, phone, wapi_lid')
        .eq('account_id', accountId)
        .in('id', contactIds)
      contacts = (data ?? []) as ContactRow[]
    }
  } else if (audience.type === 'csv' && audience.csvContacts?.length) {
    const byPhone = new Map(
      audience.csvContacts.filter((r) => r.phone).map((r) => [r.phone!, r]),
    )
    const phones = [...byPhone.keys()]
    if (phones.length > 0) {
      const { data: existing } = await supabase
        .from('contacts')
        .select('id, name, phone, wapi_lid')
        .eq('account_id', accountId)
        .in('phone', phones)
      const existingMap = new Map((existing ?? []).map((c: ContactRow) => [c.phone!, c]))
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
          .select('id, name, phone, wapi_lid')
        for (const c of (created ?? []) as ContactRow[]) existingMap.set(c.phone!, c)
      }
      contacts = [...existingMap.values()]
    }
  }

  if (audience.excludeTagIds?.length) {
    const { data: excludeRows } = await supabase
      .from('contact_tags')
      .select('contact_id')
      .in('tag_id', audience.excludeTagIds)
    const excludedIds = new Set(
      (excludeRows ?? []).map((r: { contact_id: string }) => r.contact_id),
    )
    contacts = contacts.filter((c) => !excludedIds.has(c.id))
  }

  return contacts
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

  const { data: config } = await supabase
    .from('whatsapp_config')
    .select('provider')
    .eq('account_id', accountId)
    .single()
  if (!config || config.provider !== 'wapi') {
    return NextResponse.json({ error: 'W-API não está ativo nesta conta.' }, { status: 400 })
  }

  const body = await request.json()
  const { name, quick_template_id, delay_seconds, audience } = body as {
    name: string
    quick_template_id: string
    delay_seconds?: number
    audience: AudienceConfig
  }

  if (!name?.trim() || !quick_template_id || !audience) {
    return NextResponse.json(
      { error: 'name, quick_template_id e audience são obrigatórios' },
      { status: 400 },
    )
  }

  const { data: template, error: tplErr } = await supabase
    .from('quick_templates')
    .select('id, name, body')
    .eq('id', quick_template_id)
    .eq('account_id', accountId)
    .single()
  if (tplErr || !template) {
    return NextResponse.json({ error: 'Template não encontrado.' }, { status: 404 })
  }

  const contacts = await resolveContacts(supabase, accountId, audience)
  if (contacts.length === 0) {
    return NextResponse.json(
      { error: 'Nenhum contato encontrado para este público.' },
      { status: 400 },
    )
  }

  const delaySec = Math.max(delay_seconds ?? 10, 1)
  const adminDb = supabaseAdmin()

  // Cache WAPI credentials in whatsapp_config so tick-broadcasts can use them
  // as fallback for broadcasts that don't have inline credentials (e.g. created
  // during a code transition). Fire-and-forget; non-fatal if it fails.
  adminDb
    .from('whatsapp_config')
    .update({ wapi_token: WAPI_TOKEN })
    .eq('account_id', accountId)
    .eq('provider', 'wapi')
    .then(() => {})
    .catch(() => {})

  // Create broadcast record — store W-API credentials so the background cron
  // (tick-broadcasts) can access them without needing Vercel env vars
  const { data: broadcast, error: bcErr } = await adminDb
    .from('broadcasts')
    .insert({
      user_id: user.id,
      account_id: accountId,
      name: name.trim(),
      broadcast_type: 'quick',
      quick_template_id,
      quick_template_body: (template as { body: string }).body,
      template_name: (template as { name: string }).name,
      template_language: 'pt_BR',
      delay_seconds: delaySec,
      wapi_instance_id: WAPI_INSTANCE_ID,
      wapi_token: WAPI_TOKEN,
      status: 'sending',
      total_recipients: contacts.length,
      sent_count: 0,
      failed_count: 0,
      delivered_count: 0,
      read_count: 0,
      replied_count: 0,
    })
    .select()
    .single()

  if (bcErr || !broadcast) {
    return NextResponse.json(
      { error: `Falha ao criar disparo: ${bcErr?.message ?? 'unknown'}` },
      { status: 500 },
    )
  }

  // Pre-calculate scheduled_at for every recipient based on their position in
  // the queue. The cron job (tick-broadcasts) fires every minute and sends
  // whichever recipients are due — no single long-running function needed.
  const startTime = Date.now()
  const INSERT_BATCH = 200
  for (let i = 0; i < contacts.length; i += INSERT_BATCH) {
    const batch = contacts.slice(i, i + INSERT_BATCH)
    const { error: rErr } = await adminDb
      .from('broadcast_recipients')
      .insert(
        batch.map((c, j) => ({
          broadcast_id: broadcast.id,
          contact_id: c.id,
          status: 'pending',
          scheduled_at: new Date(startTime + (i + j) * delaySec * 1000).toISOString(),
        })),
      )
    if (rErr) {
      await adminDb
        .from('broadcasts')
        .update({ status: 'failed', failed_count: contacts.length })
        .eq('id', broadcast.id)
      return NextResponse.json(
        { error: `Falha ao inserir destinatários: ${rErr.message}` },
        { status: 500 },
      )
    }
  }

  // Trigger an immediate tick so the first recipient is sent right away
  // instead of waiting for the cron. If this fails the cron picks it up
  // within the next minute — so we don't hard-fail on error here.
  adminDb.functions.invoke('tick-broadcasts', { body: {} }).catch((err) => {
    console.warn('[broadcast-quick] immediate tick failed (cron will recover):', err)
  })

  return NextResponse.json({
    broadcastId: broadcast.id,
    sentCount: 0,
    failedCount: 0,
    processing: true,
  })
}
