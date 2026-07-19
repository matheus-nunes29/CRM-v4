/**
 * GET /api/cron/broadcast-worker
 *
 * Runs every minute. Sends due recipients for "quick" broadcasts
 * (message sequences with per-recipient delay spacing, sent via the
 * account's Evolution API instance) and finalizes broadcasts once every
 * recipient has been processed.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isInScheduleWindow, type ScheduleWindow } from '@/lib/broadcast/schedule-windows'
import { sendEvolutionMessage } from '@/lib/whatsapp/evolution'
import { decrypt } from '@/lib/whatsapp/encryption'
import type { TemplateMessage } from '@/types'

export const maxDuration = 60

const EVOLUTION_SERVER_URL = (process.env.EVOLUTION_SERVER_URL ?? '').replace(/\/$/, '')
const EVOLUTION_GLOBAL_API_KEY = process.env.EVOLUTION_GLOBAL_API_KEY ?? ''

// A recipient stuck "in flight" for longer than this is assumed to be
// from a crashed/interrupted run, not an actual concurrent worker —
// safe to re-pick-up rather than leave it stuck forever.
const LOCK_STALE_MS = 2 * 60 * 1000
// Cap how many recipients this single invocation sends, so one tick
// can't run past maxDuration if a lot come due at once.
const MAX_SENDS_PER_TICK = 50

const DEFAULT_SEQUENCE_DELAY_MS = 30_000

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

function personalize(body: string, contact: { name: string | null; phone: string | null; company: string | null }): string {
  return body
    .replace(/\{\{nome\}\}/g, contact.name ?? '')
    .replace(/\{\{telefone\}\}/g, contact.phone ?? '')
    .replace(/\{\{empresa\}\}/g, contact.company ?? '')
}

function messageTypeFor(mediaType: TemplateMessage['media_type']): 'text' | 'image' | 'video' | 'audio' {
  if (mediaType === 'image' || mediaType === 'video' || mediaType === 'audio') return mediaType
  return 'text'
}

async function handler(request: Request) {
  const auth = request.headers.get('authorization')?.replace('Bearer ', '')
  const validTokens = [
    process.env.CRON_SECRET,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  ].filter(Boolean)
  if (validTokens.length > 0 && !validTokens.includes(auth ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = adminDb()

  const { data: sendingBroadcasts } = await db
    .from('broadcasts')
    .select('id, account_id, quick_template_id, schedule_windows, schedule_timezone')
    .eq('status', 'sending')
    .eq('broadcast_type', 'quick')

  const now = new Date()
  const eligibleBroadcasts = (sendingBroadcasts ?? []).filter(
    (b: { schedule_windows: unknown; schedule_timezone: string | null }) => {
      const windows = b.schedule_windows as ScheduleWindow[] | null
      if (!windows?.length) return true
      return isInScheduleWindow(now, windows, b.schedule_timezone ?? 'America/Sao_Paulo')
    },
  )
  if (!eligibleBroadcasts.length) return NextResponse.json({ processed: 0 })

  let sent = 0

  for (const broadcast of eligibleBroadcasts) {
    if (sent >= MAX_SENDS_PER_TICK) break

    // Config + template are the same for every recipient of this
    // broadcast — fetch once per broadcast, not per recipient.
    const [{ data: config }, { data: template }] = await Promise.all([
      db
        .from('whatsapp_config')
        .select('evolution_instance_name, evolution_api_key')
        .eq('account_id', broadcast.account_id)
        .maybeSingle(),
      broadcast.quick_template_id
        ? db
            .from('quick_templates')
            .select('body, media_type, media_url, messages')
            .eq('id', broadcast.quick_template_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    if (!config?.evolution_instance_name || !template) continue
    const instanceKey = config.evolution_api_key ? decrypt(config.evolution_api_key) : EVOLUTION_GLOBAL_API_KEY

    const sequence: TemplateMessage[] =
      template.messages?.length
        ? (template.messages as TemplateMessage[])
        : [{ body: template.body, media_type: template.media_type, media_url: template.media_url }]

    const staleThreshold = new Date(Date.now() - LOCK_STALE_MS).toISOString()
    const { data: dueRecipients } = await db
      .from('broadcast_recipients')
      .select('id, contact_id, message_index, contact:contacts(name, phone, company)')
      .eq('broadcast_id', broadcast.id)
      .eq('status', 'pending')
      .lte('scheduled_at', now.toISOString())
      .or(`processing_started_at.is.null,processing_started_at.lt.${staleThreshold}`)
      .order('scheduled_at', { ascending: true })
      .limit(MAX_SENDS_PER_TICK - sent)

    for (const recipient of dueRecipients ?? []) {
      if (sent >= MAX_SENDS_PER_TICK) break

      // Optimistic lock — if this returns no row, another (overlapping)
      // invocation already picked it up; skip rather than double-send.
      const { data: locked } = await db
        .from('broadcast_recipients')
        .update({ processing_started_at: new Date().toISOString() })
        .eq('id', recipient.id)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle()
      if (!locked) continue

      const contact = Array.isArray(recipient.contact) ? recipient.contact[0] : recipient.contact
      const phone = String(contact?.phone ?? '').replace(/\D/g, '')
      const msgIndex = recipient.message_index ?? 0
      const step = sequence[msgIndex]

      if (!phone || !step) {
        await db
          .from('broadcast_recipients')
          .update({ status: 'failed', error_message: 'Invalid recipient or template step', processing_started_at: null })
          .eq('id', recipient.id)
        sent++
        continue
      }

      const result = await sendEvolutionMessage({
        serverUrl: EVOLUTION_SERVER_URL,
        apiKey: instanceKey,
        instanceName: config.evolution_instance_name,
        phone,
        messageType: messageTypeFor(step.media_type),
        text: personalize(step.body, contact),
        mediaUrl: step.media_url,
      })
      sent++

      if (!result.ok) {
        await db
          .from('broadcast_recipients')
          .update({ status: 'failed', error_message: result.error ?? 'Evolution API error', processing_started_at: null })
          .eq('id', recipient.id)
        continue
      }

      const isLastStep = msgIndex >= sequence.length - 1
      if (isLastStep) {
        await db
          .from('broadcast_recipients')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            whatsapp_message_id: result.messageId || null,
            processing_started_at: null,
          })
          .eq('id', recipient.id)
      } else {
        const nextDelayMs = sequence[msgIndex + 1]?.delay_before_ms ?? DEFAULT_SEQUENCE_DELAY_MS
        await db
          .from('broadcast_recipients')
          .update({
            message_index: msgIndex + 1,
            scheduled_at: new Date(Date.now() + nextDelayMs).toISOString(),
            processing_started_at: null,
          })
          .eq('id', recipient.id)
      }
    }
  }

  // Recompute progress / finalize once every recipient is done.
  for (const broadcast of eligibleBroadcasts) {
    const { count: pendingCount } = await db
      .from('broadcast_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('broadcast_id', broadcast.id)
      .eq('status', 'pending')

    const [{ count: sentCount }, { count: failedCount }] = await Promise.all([
      db.from('broadcast_recipients').select('id', { count: 'exact', head: true }).eq('broadcast_id', broadcast.id).eq('status', 'sent'),
      db.from('broadcast_recipients').select('id', { count: 'exact', head: true }).eq('broadcast_id', broadcast.id).eq('status', 'failed'),
    ])

    const update: Record<string, unknown> = { sent_count: sentCount ?? 0, failed_count: failedCount ?? 0 }
    if (pendingCount === 0) {
      const total = (sentCount ?? 0) + (failedCount ?? 0)
      update.status = total > 0 && (failedCount ?? 0) === total ? 'failed' : 'sent'
    }
    await db.from('broadcasts').update(update).eq('id', broadcast.id)
  }

  return NextResponse.json({ processed: sent })
}

export async function GET(request: Request) { return handler(request) }
export async function POST(request: Request) { return handler(request) }
