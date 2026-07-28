/**
 * POST /api/calendar/webhooks/microsoft
 *
 * Receives Microsoft Graph change notifications for `me/events` subscriptions.
 *
 * Graph validates a new/renewed subscription by POSTing this same URL with
 * a `validationToken` query param and expecting it echoed back as plain
 * text within 10s — handled first, before touching the DB.
 *
 * Real notifications are a POST body `{ value: [{ subscriptionId,
 * clientState, ... }] }`. Unlike the Google webhook (which trusts the
 * channel id alone), we verify `clientState` against the secret stored at
 * subscription time so a guessed subscriptionId can't trigger a re-sync.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { syncMicrosoftCalendar } from '@/lib/calendar/sync-microsoft'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function POST(request: NextRequest) {
  const validationToken = request.nextUrl.searchParams.get('validationToken')
  if (validationToken !== null) {
    return new NextResponse(validationToken, { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }

  const body = await request.json().catch(() => null) as { value?: { subscriptionId: string; clientState?: string }[] } | null
  const notifications = body?.value ?? []

  const accountIds = new Set<string>()

  for (const note of notifications) {
    if (!note.subscriptionId) continue
    const { data: integration } = await admin()
      .from('calendar_integrations')
      .select('account_id, watch_resource_id')
      .eq('watch_channel_id', note.subscriptionId)
      .eq('provider', 'microsoft')
      .maybeSingle()

    if (!integration?.account_id) continue
    if (integration.watch_resource_id !== note.clientState) continue // clientState mismatch — ignore

    accountIds.add(integration.account_id)
  }

  // Sync in background — respond immediately so Graph doesn't retry
  for (const accountId of accountIds) {
    syncMicrosoftCalendar(accountId).catch((err) =>
      console.error('[calendar/webhook-microsoft] sync failed:', err),
    )
  }

  return new NextResponse(null, { status: 202 })
}
