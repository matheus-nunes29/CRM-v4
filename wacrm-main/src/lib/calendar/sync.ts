/**
 * Syncs Google Calendar events into the calendar_events table.
 * Uses incremental sync (syncToken) when available; full sync otherwise.
 * Upserts by provider_event_id so duplicates are idempotent.
 */
import { createClient } from '@supabase/supabase-js'
import {
  getIntegration,
  listGoogleEvents,
  setupGoogleWatch,
  decrypt,
  type GoogleCalendarEvent,
} from './google'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function syncGoogleCalendar(accountId: string): Promise<{ synced: number; deleted: number }> {
  const integration = await getIntegration(accountId)
  if (!integration) return { synced: 0, deleted: 0 }

  const accessToken = decrypt(integration.access_token)
  const calendarId = integration.calendar_id ?? 'primary'
  let syncToken: string | undefined = integration.sync_token ?? undefined

  // Default window: 3 months back, 12 months forward
  const timeMin = syncToken ? undefined : new Date(Date.now() - 90 * 864e5).toISOString()
  const timeMax = syncToken ? undefined : new Date(Date.now() + 365 * 864e5).toISOString()

  let items: GoogleCalendarEvent[] = []
  let nextSyncToken: string | undefined

  try {
    const result = await listGoogleEvents(accessToken, { calendarId, timeMin, timeMax, syncToken })
    items = result.items
    nextSyncToken = result.nextSyncToken
  } catch (err) {
    if ((err as Error).message === 'SYNC_TOKEN_EXPIRED') {
      // Full re-sync
      await admin().from('calendar_integrations').update({ sync_token: null }).eq('id', integration.id)
      return syncGoogleCalendar(accountId)
    }
    throw err
  }

  let synced = 0
  let deleted = 0

  for (const item of items) {
    // Cancelled = deleted in Google
    if (item.status === 'cancelled') {
      await admin().from('calendar_events')
        .delete()
        .eq('account_id', accountId)
        .eq('provider_event_id', item.id)
      deleted++
      continue
    }

    const startAt = item.start?.dateTime ?? item.start?.date
    const endAt = item.end?.dateTime ?? item.end?.date
    if (!startAt || !endAt) continue

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin().from('calendar_events') as any).upsert(
      {
        account_id: accountId,
        provider: 'google',
        provider_event_id: item.id,
        calendar_id: calendarId,
        title: item.summary ?? '(sem título)',
        description: item.description ?? null,
        start_at: new Date(startAt).toISOString(),
        end_at: new Date(endAt).toISOString(),
        meet_link: item.hangoutLink ?? null,
        attendees: (item.attendees ?? []).map((a) => ({ email: a.email, name: a.displayName })),
        status: item.status ?? 'confirmed',
        provider_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'account_id,provider,provider_event_id' },
    )
    synced++
  }

  // Persist the new sync token
  if (nextSyncToken) {
    await admin().from('calendar_integrations')
      .update({ sync_token: nextSyncToken, updated_at: new Date().toISOString() })
      .eq('id', integration.id)
  }

  // Ensure watch channel is active (renew if close to expiry or missing)
  await ensureWatchChannel(accountId, integration, accessToken, calendarId)

  return { synced, deleted }
}

async function ensureWatchChannel(
  accountId: string,
  integration: Record<string, unknown>,
  accessToken: string,
  calendarId: string,
) {
  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/calendar/webhooks/google`
  if (!webhookUrl.startsWith('https://')) return // webhooks require HTTPS

  const expiresAt = integration.watch_expires_at as string | null
  const isExpiring = !expiresAt || new Date(expiresAt) <= new Date(Date.now() + 24 * 3600_000)

  if (!isExpiring) return

  try {
    const channelId = `${accountId}-${Date.now()}`
    const watch = await setupGoogleWatch(accessToken, calendarId, channelId, webhookUrl)
    await admin().from('calendar_integrations').update({
      watch_channel_id: watch.id,
      watch_resource_id: watch.resourceId,
      watch_expires_at: new Date(parseInt(watch.expiration)).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('account_id', accountId).eq('provider', 'google')
  } catch (err) {
    // Non-fatal: sync still worked, webhook just won't fire until next sync
    console.warn('[calendar/sync] watch setup failed:', (err as Error).message)
  }
}
