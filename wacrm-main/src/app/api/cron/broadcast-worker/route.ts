/**
 * GET /api/cron/broadcast-worker
 *
 * Vercel Cron — runs every minute.
 * Finalizes completed broadcasts.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isInScheduleWindow, type ScheduleWindow } from '@/lib/broadcast/schedule-windows'

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
  const nowIso = new Date().toISOString()

  const { data: sendingBroadcasts } = await db
    .from('broadcasts')
    .select('id, schedule_windows, schedule_timezone')
    .eq('status', 'sending')
    .eq('broadcast_type', 'quick')

  const now = new Date()
  const eligibleBroadcasts = (sendingBroadcasts ?? []).filter((b: { id: string; schedule_windows: unknown; schedule_timezone: string | null }) => {
    const windows = b.schedule_windows as ScheduleWindow[] | null
    if (!windows?.length) return true
    return isInScheduleWindow(now, windows, b.schedule_timezone ?? 'America/Sao_Paulo')
  })
  const sendingIds = eligibleBroadcasts.map((b: { id: string }) => b.id)
  if (!sendingIds.length) return NextResponse.json({ processed: 0 })

  // Finalize completed broadcasts
  const affectedBroadcastIds = new Set(sendingIds)
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

  return NextResponse.json({ processed: 0 })
}

export async function GET(request: Request) { return handler(request) }
export async function POST(request: Request) { return handler(request) }
