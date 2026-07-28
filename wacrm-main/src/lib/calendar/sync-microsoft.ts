/**
 * Syncs Microsoft/Outlook Calendar events into the calendar_events table.
 * Uses Graph's delta query (deltaLink, stored in the sync_token column —
 * same column Google's syncToken uses, just a different provider's opaque
 * cursor) when available; full sync otherwise. Upserts by provider_event_id
 * so duplicates are idempotent. Mirrors src/lib/calendar/sync.ts.
 */
import { createClient } from '@supabase/supabase-js'
import {
  getIntegration,
  listMicrosoftEvents,
  setupMicrosoftSubscription,
  renewMicrosoftSubscription,
  fromGraphDateTime,
  decrypt,
  type MicrosoftCalendarEvent,
} from './microsoft'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function syncMicrosoftCalendar(accountId: string): Promise<{ synced: number; deleted: number }> {
  const integration = await getIntegration(accountId)
  if (!integration) return { synced: 0, deleted: 0 }

  const accessToken = decrypt(integration.access_token)
  const calendarId = integration.calendar_id ?? 'primary'
  const deltaLink: string | undefined = integration.sync_token ?? undefined

  // Default window: 3 months back, 12 months forward — same as Google.
  const timeMin = deltaLink ? undefined : new Date(Date.now() - 90 * 864e5).toISOString()
  const timeMax = deltaLink ? undefined : new Date(Date.now() + 365 * 864e5).toISOString()

  let items: MicrosoftCalendarEvent[] = []
  let nextDeltaLink: string | undefined

  try {
    const result = await listMicrosoftEvents(accessToken, { calendarId, timeMin, timeMax, deltaLink })
    items = result.items
    nextDeltaLink = result.nextDeltaLink
  } catch (err) {
    if ((err as Error).message === 'SYNC_TOKEN_EXPIRED') {
      // Full re-sync
      await admin().from('calendar_integrations').update({ sync_token: null }).eq('id', integration.id)
      return syncMicrosoftCalendar(accountId)
    }
    throw err
  }

  let synced = 0
  let deleted = 0

  for (const item of items) {
    // Removed items carry an `@removed` marker instead of a status field.
    if (item['@removed']) {
      await admin().from('calendar_events')
        .delete()
        .eq('account_id', accountId)
        .eq('provider_event_id', item.id)
      deleted++
      continue
    }

    const startAt = fromGraphDateTime(item.start)
    const endAt = fromGraphDateTime(item.end)
    if (!startAt || !endAt) continue

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin().from('calendar_events') as any).upsert(
      {
        account_id: accountId,
        provider: 'microsoft',
        provider_event_id: item.id,
        calendar_id: calendarId,
        title: item.subject ?? '(sem título)',
        description: item.body?.content ?? null,
        start_at: startAt,
        end_at: endAt,
        meet_link: item.onlineMeeting?.joinUrl ?? null,
        attendees: (item.attendees ?? []).map((a) => ({ email: a.emailAddress.address, name: a.emailAddress.name })),
        status: 'confirmed',
        provider_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'account_id,provider,provider_event_id' },
    )
    synced++
  }

  // Persist the new delta cursor
  if (nextDeltaLink) {
    await admin().from('calendar_integrations')
      .update({ sync_token: nextDeltaLink, updated_at: new Date().toISOString() })
      .eq('id', integration.id)
  }

  // Ensure the push-notification subscription is active (renew if close to expiry or missing)
  await ensureSubscription(accountId, integration, accessToken)

  return { synced, deleted }
}

async function ensureSubscription(
  accountId: string,
  integration: Record<string, unknown>,
  accessToken: string,
) {
  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/calendar/webhooks/microsoft`
  if (!webhookUrl.startsWith('https://')) return // webhooks require HTTPS

  const expiresAt = integration.watch_expires_at as string | null
  const isExpiring = !expiresAt || new Date(expiresAt) <= new Date(Date.now() + 12 * 3600_000)

  if (!isExpiring) return

  // `watch_resource_id` doubles as the clientState secret for Microsoft —
  // the same generic column Google's implementation leaves unused for its
  // own resourceId there; reused here rather than a schema migration.
  const clientState = (integration.watch_resource_id as string | null) || crypto.randomUUID()
  const existingSubscriptionId = integration.watch_channel_id as string | null

  try {
    let sub: { id: string; expirationDateTime: string }
    if (existingSubscriptionId) {
      try {
        sub = await renewMicrosoftSubscription(accessToken, existingSubscriptionId)
      } catch {
        sub = await setupMicrosoftSubscription(accessToken, webhookUrl, clientState)
      }
    } else {
      sub = await setupMicrosoftSubscription(accessToken, webhookUrl, clientState)
    }
    await admin().from('calendar_integrations').update({
      watch_channel_id: sub.id,
      watch_resource_id: clientState,
      watch_expires_at: sub.expirationDateTime,
      updated_at: new Date().toISOString(),
    }).eq('account_id', accountId).eq('provider', 'microsoft')
  } catch (err) {
    // Non-fatal: sync still worked, webhook just won't fire until next sync
    console.warn('[calendar/sync-microsoft] subscription setup failed:', (err as Error).message)
  }
}
