/**
 * POST /api/calendar/webhooks/google
 *
 * Receives Google Calendar push notifications.
 * Google sends a POST with headers X-Goog-Channel-Id and X-Goog-Resource-State.
 * On receiving "exists" (= something changed), we re-sync that account.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { syncGoogleCalendar } from '@/lib/calendar/sync'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function POST(request: NextRequest) {
  const channelId = request.headers.get('x-goog-channel-id')
  const resourceState = request.headers.get('x-goog-resource-state')

  // 'sync' is the initial handshake — acknowledge but don't sync yet
  if (resourceState === 'sync') {
    return new NextResponse(null, { status: 200 })
  }

  if (!channelId || resourceState !== 'exists') {
    return new NextResponse(null, { status: 200 })
  }

  // Find the account that owns this channel
  const { data: integration } = await admin()
    .from('calendar_integrations')
    .select('account_id')
    .eq('watch_channel_id', channelId)
    .maybeSingle()

  if (!integration?.account_id) {
    return new NextResponse(null, { status: 200 })
  }

  // Sync in background — respond immediately so Google doesn't retry
  syncGoogleCalendar(integration.account_id).catch((err) =>
    console.error('[calendar/webhook] sync failed:', err),
  )

  return new NextResponse(null, { status: 200 })
}
