/**
 * GET /api/cron/inactivity-triggers
 *
 * Runs every hour (via Vercel Cron or pg_cron).
 * Fires three time-based automation triggers:
 *   - conversation_idle   — open conversations without an agent reply for X hours
 *   - contact_inactive    — contacts without any activity for X days
 *   - deal_stagnant       — open deals that haven't changed stage for X days
 *
 * For each active automation with one of these trigger types, we query
 * the relevant rows, deduplicate against recent automation_logs to avoid
 * re-firing on every tick, and dispatch.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runAutomationsForTrigger } from '@/lib/automations/engine'
import type { InactivityTriggerConfig } from '@/types'

export const maxDuration = 60

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
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

  const db = supabaseAdmin()
  const now = new Date()

  let fired = 0

  // ── Fetch all active inactivity automations ─────────────────────────────────
  const { data: automations } = await db
    .from('automations')
    .select('id, account_id, trigger_type, trigger_config')
    .in('trigger_type', ['conversation_idle', 'contact_inactive', 'deal_stagnant'])
    .eq('is_active', true)

  if (!automations || automations.length === 0) {
    return NextResponse.json({ fired: 0 })
  }

  for (const automation of automations) {
    const cfg = automation.trigger_config as InactivityTriggerConfig
    const threshold = cfg?.threshold ?? (automation.trigger_type === 'conversation_idle' ? 24 : 7)

    try {
      if (automation.trigger_type === 'conversation_idle') {
        fired += await fireConversationIdle(db, automation.account_id, automation.id, threshold, now)
      } else if (automation.trigger_type === 'contact_inactive') {
        fired += await fireContactInactive(db, automation.account_id, automation.id, threshold, now)
      } else if (automation.trigger_type === 'deal_stagnant') {
        fired += await fireDealStagnant(db, automation.account_id, automation.id, threshold, now)
      }
    } catch (err) {
      console.error(`[inactivity-triggers] ${automation.trigger_type} error:`, err)
    }
  }

  return NextResponse.json({ fired })
}

// ── conversation_idle ───────────────────────────────────────────────────────
// Open conversations where the last message is FROM the contact (not the agent)
// and that message is older than `threshold` hours.

async function fireConversationIdle(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  accountId: string,
  automationId: string,
  thresholdHours: number,
  now: Date,
): Promise<number> {
  const cutoff = new Date(now.getTime() - thresholdHours * 60 * 60 * 1000).toISOString()

  // Find open conversations whose last inbound message is older than the threshold
  const { data: conversations } = await db
    .from('conversations')
    .select('id, contact_id')
    .eq('account_id', accountId)
    .eq('status', 'open')
    .not('contact_id', 'is', null)

  if (!conversations?.length) return 0

  // For each conversation, check if the last message is from the contact and is older than cutoff
  const alreadyFired = await getRecentlyFired(db, automationId, thresholdHours)
  let count = 0

  for (const conv of conversations) {
    if (!conv.contact_id || alreadyFired.has(conv.contact_id)) continue

    const { data: lastMsg } = await db
      .from('messages')
      .select('created_at, direction')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!lastMsg) continue
    if (lastMsg.direction !== 'inbound') continue
    if (lastMsg.created_at > cutoff) continue

    runAutomationsForTrigger({
      accountId,
      triggerType: 'conversation_idle',
      contactId: conv.contact_id,
      context: { conversation_id: conv.id },
    }).catch((err) => console.error('[automations] conversation_idle error:', err))
    count++
  }

  return count
}

// ── contact_inactive ────────────────────────────────────────────────────────
// Contacts with no inbound message in the last `threshold` days.

async function fireContactInactive(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  accountId: string,
  automationId: string,
  thresholdDays: number,
  now: Date,
): Promise<number> {
  const cutoff = new Date(now.getTime() - thresholdDays * 24 * 60 * 60 * 1000).toISOString()
  const alreadyFired = await getRecentlyFired(db, automationId, thresholdDays * 24)

  // Contacts whose last inbound message is before cutoff
  const { data: contacts } = await db
    .from('contacts')
    .select('id')
    .eq('account_id', accountId)

  if (!contacts?.length) return 0
  let count = 0

  for (const contact of contacts) {
    if (alreadyFired.has(contact.id)) continue

    const { data: lastMsg } = await db
      .from('messages')
      .select('created_at')
      .eq('account_id', accountId)
      .eq('direction', 'inbound')
      .in('conversation_id',
        db
          .from('conversations')
          .select('id')
          .eq('account_id', accountId)
          .eq('contact_id', contact.id)
      )
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // If they never sent a message, or the last one is before cutoff
    if (lastMsg && lastMsg.created_at > cutoff) continue

    runAutomationsForTrigger({
      accountId,
      triggerType: 'contact_inactive',
      contactId: contact.id,
      context: {},
    }).catch((err) => console.error('[automations] contact_inactive error:', err))
    count++
  }

  return count
}

// ── deal_stagnant ───────────────────────────────────────────────────────────
// Open deals that haven't moved stage in `threshold` days.

async function fireDealStagnant(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  accountId: string,
  automationId: string,
  thresholdDays: number,
  now: Date,
): Promise<number> {
  const cutoff = new Date(now.getTime() - thresholdDays * 24 * 60 * 60 * 1000).toISOString()
  const alreadyFired = await getRecentlyFired(db, automationId, thresholdDays * 24)

  const { data: deals } = await db
    .from('deals')
    .select('id, contact_id, stage_id, updated_at')
    .eq('account_id', accountId)
    .eq('status', 'open')
    .lt('updated_at', cutoff)
    .not('contact_id', 'is', null)

  if (!deals?.length) return 0
  let count = 0

  for (const deal of deals) {
    if (!deal.contact_id || alreadyFired.has(deal.contact_id)) continue

    runAutomationsForTrigger({
      accountId,
      triggerType: 'deal_stagnant',
      contactId: deal.contact_id,
      context: { deal_id: deal.id, deal_stage_id: deal.stage_id },
    }).catch((err) => console.error('[automations] deal_stagnant error:', err))
    count++
  }

  return count
}

// ── Deduplication ───────────────────────────────────────────────────────────
// Returns contact_ids that already had this automation run within the threshold
// window, to avoid re-firing on every hourly tick.

async function getRecentlyFired(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  automationId: string,
  thresholdHours: number,
): Promise<Set<string>> {
  const since = new Date(Date.now() - thresholdHours * 60 * 60 * 1000).toISOString()
  const { data } = await db
    .from('automation_logs')
    .select('contact_id')
    .eq('automation_id', automationId)
    .gte('created_at', since)
    .not('contact_id', 'is', null)

  return new Set((data ?? []).map((r: { contact_id: string }) => r.contact_id))
}

export async function GET(request: Request) { return handler(request) }
export async function POST(request: Request) { return handler(request) }
