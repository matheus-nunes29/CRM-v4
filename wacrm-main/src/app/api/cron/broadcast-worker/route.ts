/**
 * GET /api/cron/broadcast-worker
 *
 * Vercel Cron — runs every minute.
 * Picks up pending broadcast_recipients whose scheduled_at has passed
 * and sends them via Evolution API (quick broadcasts).
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  sendTextMessage,
  sendMediaMessage,
  getSystemEvolutionConfig,
  toEvolutionPhone,
  type EvolutionMediaType,
} from '@/lib/whatsapp/evolution-api'
import { sanitizePhoneForMeta, isValidE164 } from '@/lib/whatsapp/phone-utils'

export const maxDuration = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _admin: any = null
function adminDb() {
  if (!_admin) {
    _admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
  }
  return _admin
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

function resolveQuickVars(
  body: string,
  contact: { name?: string | null; phone?: string | null; company?: string | null },
): string {
  return body
    .replace(/\{\{nome\}\}/gi, contact.name ?? '')
    .replace(/\{\{telefone\}\}/gi, contact.phone ?? '')
    .replace(/\{\{empresa\}\}/gi, contact.company ?? '')
}

async function handler(request: Request) {
  // Accept calls from Vercel cron (Bearer CRON_SECRET) or Supabase pg_net
  // (Bearer SUPABASE_SERVICE_ROLE_KEY). Both are server-side callers only.
  const auth = request.headers.get('authorization')?.replace('Bearer ', '')
  const validTokens = [
    process.env.CRON_SECRET,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  ].filter(Boolean)
  if (validTokens.length > 0 && !validTokens.includes(auth ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = adminDb()
  const now = new Date().toISOString()

  // ── Only process recipients from actively-sending broadcasts ─────────────
  const { data: sendingBroadcasts } = await db
    .from('broadcasts')
    .select('id')
    .eq('status', 'sending')
    .eq('broadcast_type', 'quick')

  const sendingIds = (sendingBroadcasts ?? []).map((b: { id: string }) => b.id)
  if (!sendingIds.length) return NextResponse.json({ processed: 0 })

  // ── Fetch due recipients ─────────────────────────────────────────────────
  const { data: due } = await db
    .from('broadcast_recipients')
    .select('id, broadcast_id, contact_id')
    .eq('status', 'pending')
    .in('broadcast_id', sendingIds)
    .lte('scheduled_at', now)
    .order('scheduled_at', { ascending: true })
    .limit(30)

  if (!due?.length) return NextResponse.json({ processed: 0 })

  // ── Batch-load related data ───────────────────────────────────────────────
  const broadcastIds = [...new Set(due.map((r: { broadcast_id: string }) => r.broadcast_id))]
  const contactIds = [...new Set(due.map((r: { contact_id: string }) => r.contact_id))]

  const [{ data: broadcasts }, { data: contacts }] = await Promise.all([
    db
      .from('broadcasts')
      .select('id, account_id, quick_template_id, broadcast_type')
      .in('id', broadcastIds),
    db
      .from('contacts')
      .select('id, phone, name, company')
      .in('id', contactIds),
  ])

  const quickBroadcastIds = new Set(
    (broadcasts ?? [])
      .filter((b: { broadcast_type: string }) => b.broadcast_type === 'quick')
      .map((b: { id: string }) => b.id),
  )
  const quickRecipients = due.filter((r: { broadcast_id: string }) => quickBroadcastIds.has(r.broadcast_id))

  if (!quickRecipients.length) return NextResponse.json({ processed: 0 })

  const broadcastMap = new Map((broadcasts ?? []).map((b: { id: string }) => [b.id, b]))
  const contactMap = new Map((contacts ?? []).map((c: { id: string }) => [c.id, c]))

  // Load templates
  const templateIds = [...new Set(
    quickRecipients
      .map((r: { broadcast_id: string }) => (broadcastMap.get(r.broadcast_id) as { quick_template_id?: string })?.quick_template_id)
      .filter(Boolean),
  )]
  const { data: templates } = await db
    .from('quick_templates')
    .select('id, body, media_type, media_url, messages')
    .in('id', templateIds)
  const templateMap = new Map((templates ?? []).map((t: { id: string }) => [t.id, t]))

  // Load Evolution configs
  const accountIds = [...new Set(
    quickRecipients
      .map((r: { broadcast_id: string }) => (broadcastMap.get(r.broadcast_id) as { account_id?: string })?.account_id)
      .filter(Boolean),
  )]
  const { data: configs } = await db
    .from('whatsapp_config')
    .select('account_id, evolution_instance_name')
    .in('account_id', accountIds)
    .eq('provider', 'evolution')
  const configMap = new Map((configs ?? []).map((c: { account_id: string }) => [c.account_id, c]))

  // ── Process each recipient ────────────────────────────────────────────────
  const affectedBroadcastIds = new Set<string>()
  let processed = 0

  for (const recipient of quickRecipients) {
    const broadcast = broadcastMap.get(recipient.broadcast_id) as {
      id: string; account_id: string; quick_template_id: string
    } | undefined
    const contact = contactMap.get(recipient.contact_id) as {
      id: string; phone: string | null; name: string | null; company: string | null
    } | undefined

    affectedBroadcastIds.add(recipient.broadcast_id)

    if (!broadcast || !contact?.phone) {
      await db.from('broadcast_recipients')
        .update({ status: 'failed', error_message: 'Missing contact or broadcast data' })
        .eq('id', recipient.id)
      continue
    }

    const template = templateMap.get(broadcast.quick_template_id) as {
      body: string; media_type: string | null; media_url: string | null; messages: unknown
    } | undefined
    const config = configMap.get(broadcast.account_id) as {
      evolution_instance_name: string
    } | undefined

    if (!template || !config?.evolution_instance_name) {
      await db.from('broadcast_recipients')
        .update({ status: 'failed', error_message: 'Template or Evolution config not found' })
        .eq('id', recipient.id)
      continue
    }

    let evoCfg
    try {
      evoCfg = getSystemEvolutionConfig(config.evolution_instance_name)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Evolution config error'
      await db.from('broadcast_recipients')
        .update({ status: 'failed', error_message: msg })
        .eq('id', recipient.id)
      continue
    }

    const sanitized = sanitizePhoneForMeta(contact.phone)
    if (!isValidE164(sanitized)) {
      await db.from('broadcast_recipients')
        .update({ status: 'failed', error_message: 'Invalid phone number' })
        .eq('id', recipient.id)
      continue
    }

    const evoPhone = toEvolutionPhone(sanitized)

    type MsgDef = {
      body: string
      media_type?: string | null
      media_url?: string | null
      delay_before_ms?: number
    }
    const msgs = template.messages as MsgDef[] | null
    const sequence: MsgDef[] =
      msgs && msgs.length > 0
        ? msgs
        : [{ body: template.body, media_type: template.media_type, media_url: template.media_url }]

    let failed = false
    let lastMsgId = ''

    for (let msgIdx = 0; msgIdx < sequence.length; msgIdx++) {
      const msg = sequence[msgIdx]
      if (msgIdx > 0 && msg.delay_before_ms) {
        await sleep(msg.delay_before_ms)
      }
      const text = resolveQuickVars(msg.body, contact)
      try {
        let result
        if (msg.media_url && msg.media_type) {
          result = await sendMediaMessage(
            evoCfg,
            evoPhone,
            msg.media_type as EvolutionMediaType,
            msg.media_url,
            msg.media_type !== 'audio' ? text : undefined,
          )
        } else {
          result = await sendTextMessage(evoCfg, evoPhone, text)
        }
        lastMsgId = result.messageId || ''
      } catch (err) {
        failed = true
        const errMsg = err instanceof Error ? err.message : 'Send failed'
        await db.from('broadcast_recipients')
          .update({ status: 'failed', error_message: `Msg ${msgIdx + 1}: ${errMsg}` })
          .eq('id', recipient.id)
        break
      }
    }

    if (!failed) {
      await db.from('broadcast_recipients')
        .update({ status: 'sent', sent_at: new Date().toISOString(), whatsapp_message_id: lastMsgId || null })
        .eq('id', recipient.id)
      processed++
    }
  }

  // ── Finalize completed broadcasts ─────────────────────────────────────────
  for (const broadcastId of affectedBroadcastIds) {
    const { count: pendingCount } = await db
      .from('broadcast_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('broadcast_id', broadcastId)
      .eq('status', 'pending')

    if (pendingCount === 0) {
      const [{ count: sentCount }, { count: failedCount }] = await Promise.all([
        db.from('broadcast_recipients').select('id', { count: 'exact', head: true }).eq('broadcast_id', broadcastId).eq('status', 'sent'),
        db.from('broadcast_recipients').select('id', { count: 'exact', head: true }).eq('broadcast_id', broadcastId).eq('status', 'failed'),
      ])
      const total = (sentCount ?? 0) + (failedCount ?? 0)
      const finalStatus = total > 0 && (failedCount ?? 0) === total ? 'failed' : 'sent'
      await db.from('broadcasts')
        .update({ status: finalStatus, sent_count: sentCount ?? 0, failed_count: failedCount ?? 0 })
        .eq('id', broadcastId)
    }
  }

  return NextResponse.json({ processed })
}

// pg_cron calls via net.http_post; Vercel cron calls via GET
export async function GET(request: Request) { return handler(request) }
export async function POST(request: Request) { return handler(request) }
