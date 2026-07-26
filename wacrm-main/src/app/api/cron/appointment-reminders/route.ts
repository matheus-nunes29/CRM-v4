/**
 * GET/POST /api/cron/appointment-reminders
 *
 * Meant to run every 15 minutes (see the crontab entry on the VPS —
 * there's no pg_cron in this self-hosted Supabase instance and no
 * Vercel Cron either, since this app isn't deployed on Vercel).
 *
 * Fires the 'appointment_upcoming' automation trigger: for every active
 * automation of that type, finds calendar_events whose start_at falls
 * in the window [now + hours_before, now + hours_before + 15min) and
 * dispatches one automation run per matching event — deduplicated via
 * automation_fired_events (061) so a slow tick can't double-send.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runAutomationsForTrigger } from '@/lib/automations/engine'
import type { AppointmentUpcomingTriggerConfig } from '@/types'

export const maxDuration = 60

// Must match the crontab interval — the window this tick claims. If the
// interval is ever changed on the VPS, update this too so events don't
// fall in the gap between two ticks.
const TICK_MINUTES = 15

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

  const { data: automations } = await db
    .from('automations')
    .select('id, account_id, trigger_config')
    .eq('trigger_type', 'appointment_upcoming')
    .eq('is_active', true)

  if (!automations || automations.length === 0) {
    return NextResponse.json({ fired: 0 })
  }

  let fired = 0

  for (const automation of automations) {
    try {
      fired += await fireAppointmentUpcoming(db, automation, now)
    } catch (err) {
      console.error('[appointment-reminders] automation error:', automation.id, err)
    }
  }

  return NextResponse.json({ fired })
}

async function fireAppointmentUpcoming(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  automation: { id: string; account_id: string; trigger_config: unknown },
  now: Date,
): Promise<number> {
  const cfg = automation.trigger_config as AppointmentUpcomingTriggerConfig
  const hoursBefore = cfg?.hours_before ?? 24

  const windowStart = new Date(now.getTime() + hoursBefore * 60 * 60 * 1000)
  const windowEnd = new Date(windowStart.getTime() + TICK_MINUTES * 60 * 1000)

  const { data: events } = await db
    .from('calendar_events')
    .select('id, title, start_at, contact_id')
    .eq('account_id', automation.account_id)
    .neq('status', 'cancelled')
    .not('contact_id', 'is', null)
    .gte('start_at', windowStart.toISOString())
    .lt('start_at', windowEnd.toISOString())

  if (!events?.length) return 0

  let count = 0
  for (const event of events) {
    // Claim this (automation, event) pair before dispatching — the
    // UNIQUE constraint rejects a duplicate if another tick already
    // claimed it, so we skip rather than send twice.
    const { error: claimErr } = await db
      .from('automation_fired_events')
      .insert({ automation_id: automation.id, calendar_event_id: event.id })
    if (claimErr) continue // already fired (unique violation) or a transient error — skip either way

    runAutomationsForTrigger({
      accountId: automation.account_id,
      triggerType: 'appointment_upcoming',
      contactId: event.contact_id,
      context: {
        vars: {
          event_title: event.title,
          event_start_at: new Date(event.start_at).toLocaleString('pt-BR', {
            weekday: 'long',
            day: '2-digit',
            month: 'long',
            hour: '2-digit',
            minute: '2-digit',
          }),
          hours_before: hoursBefore,
        },
      },
    }).catch((err) => console.error('[automations] appointment_upcoming error:', err))
    count++
  }

  return count
}

export async function GET(request: Request) { return handler(request) }
export async function POST(request: Request) { return handler(request) }
