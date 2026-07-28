import { encrypt, decrypt } from '@/lib/whatsapp/encryption'
import { createClient } from '@supabase/supabase-js'

const MICROSOFT_TENANT = process.env.MICROSOFT_TENANT_ID || 'common'
const MICROSOFT_SCOPES = [
  'openid',
  'offline_access',
  'User.Read',
  'Calendars.ReadWrite',
].join(' ')

function authorizeUrl() {
  return `https://login.microsoftonline.com/${MICROSOFT_TENANT}/oauth2/v2.0/authorize`
}
function tokenUrl() {
  return `https://login.microsoftonline.com/${MICROSOFT_TENANT}/oauth2/v2.0/token`
}
function redirectUri() {
  return `${process.env.NEXT_PUBLIC_APP_URL}/api/calendar/auth/microsoft/callback`
}

export function buildMicrosoftAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: 'code',
    response_mode: 'query',
    scope: MICROSOFT_SCOPES,
    state,
  })
  return `${authorizeUrl()}?${params}`
}

export interface MicrosoftTokens {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
}

export async function exchangeMicrosoftCode(code: string): Promise<MicrosoftTokens> {
  const res = await fetch(tokenUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
      scope: MICROSOFT_SCOPES,
    }),
  })
  if (!res.ok) throw new Error(`Microsoft token exchange failed: ${await res.text()}`)
  return res.json()
}

export async function refreshMicrosoftToken(encryptedRefresh: string): Promise<MicrosoftTokens> {
  const refreshToken = decrypt(encryptedRefresh)
  const res = await fetch(tokenUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      grant_type: 'refresh_token',
      scope: MICROSOFT_SCOPES,
    }),
  })
  if (!res.ok) throw new Error(`Microsoft token refresh failed: ${await res.text()}`)
  return res.json()
}

export async function getMicrosoftUserEmail(accessToken: string): Promise<string | null> {
  const res = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return null
  const data = await res.json()
  return data.mail ?? data.userPrincipalName ?? null
}

export interface CreateEventInput {
  title: string
  description?: string
  startAt: string   // ISO 8601, UTC (Date#toISOString())
  endAt: string     // ISO 8601, UTC
  attendeeEmails?: string[]
  addMeet?: boolean  // Teams meeting link
  calendarId?: string
}

export interface MicrosoftCalendarEvent {
  id: string
  subject?: string
  body?: { content?: string; contentType?: string }
  start: { dateTime?: string; timeZone?: string }
  end: { dateTime?: string; timeZone?: string }
  onlineMeeting?: { joinUrl?: string } | null
  attendees?: { emailAddress: { address: string; name?: string } }[]
  webLink?: string
  '@removed'?: { reason: string }
}

// Graph's `dateTime` field is a local wall-clock string with no offset —
// it does NOT parse a trailing "Z"/offset, it just ignores it and combines
// the digits with the sibling `timeZone`. Our stored start_at/end_at are
// always UTC ISO strings (Date#toISOString()), so we strip the "Z" and
// declare the zone as UTC explicitly rather than mirror Google's hardcoded
// "America/Sao_Paulo" — this way the instant is correct regardless of
// which timezone the connected mailbox actually operates in.
function toGraphDateTime(iso: string): { dateTime: string; timeZone: string } {
  return { dateTime: iso.replace('Z', ''), timeZone: 'UTC' }
}

function fromGraphDateTime(dt?: { dateTime?: string; timeZone?: string }): string | null {
  if (!dt?.dateTime) return null
  // Requests are made with `Prefer: outlook.timezone="UTC"`, so this is
  // already UTC wall-clock — just needs the "Z" back to be a valid ISO instant.
  const raw = dt.dateTime.endsWith('Z') ? dt.dateTime : `${dt.dateTime}Z`
  return new Date(raw).toISOString()
}

function eventsPath(calendarId = 'primary'): string {
  return calendarId === 'primary'
    ? 'https://graph.microsoft.com/v1.0/me/events'
    : `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(calendarId)}/events`
}

export async function createMicrosoftEvent(
  accessToken: string,
  input: CreateEventInput,
  calendarId = 'primary',
): Promise<MicrosoftCalendarEvent> {
  const body: Record<string, unknown> = {
    subject: input.title,
    body: { contentType: 'text', content: input.description ?? '' },
    start: toGraphDateTime(input.startAt),
    end: toGraphDateTime(input.endAt),
  }
  if (input.attendeeEmails?.length) {
    body.attendees = input.attendeeEmails.map((email) => ({
      emailAddress: { address: email },
      type: 'required',
    }))
  }
  if (input.addMeet) {
    body.isOnlineMeeting = true
    body.onlineMeetingProvider = 'teamsForBusiness'
  }

  const res = await fetch(eventsPath(calendarId), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'outlook.timezone="UTC"',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Microsoft Calendar create event failed: ${await res.text()}`)
  return res.json()
}

export async function updateMicrosoftEvent(
  accessToken: string,
  providerEventId: string,
  input: Partial<CreateEventInput>,
  calendarId = 'primary',
): Promise<MicrosoftCalendarEvent> {
  const body: Record<string, unknown> = {}
  if (input.title) body.subject = input.title
  if (input.description !== undefined) body.body = { contentType: 'text', content: input.description }
  if (input.startAt) body.start = toGraphDateTime(input.startAt)
  if (input.endAt) body.end = toGraphDateTime(input.endAt)
  if (input.attendeeEmails) {
    body.attendees = input.attendeeEmails.map((email) => ({
      emailAddress: { address: email },
      type: 'required',
    }))
  }

  const res = await fetch(`${eventsPath(calendarId)}/${providerEventId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'outlook.timezone="UTC"',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Microsoft Calendar update event failed: ${await res.text()}`)
  return res.json()
}

export async function deleteMicrosoftEvent(
  accessToken: string,
  providerEventId: string,
  calendarId = 'primary',
): Promise<void> {
  const res = await fetch(`${eventsPath(calendarId)}/${providerEventId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok && res.status !== 404) {
    throw new Error(`Microsoft Calendar delete event failed: ${await res.text()}`)
  }
}

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/** Retrieve the Microsoft integration row for the account, refreshing the token if expired. */
export async function getIntegration(accountId: string) {
  const { data: row } = await supabaseAdmin()
    .from('calendar_integrations')
    .select('*')
    .eq('account_id', accountId)
    .eq('provider', 'microsoft')
    .maybeSingle()

  if (!row) return null

  const expiresAt = row.token_expires_at ? new Date(row.token_expires_at) : null
  const needsRefresh = !expiresAt || expiresAt <= new Date(Date.now() + 60_000)

  if (needsRefresh && row.refresh_token) {
    try {
      const tokens = await refreshMicrosoftToken(row.refresh_token)
      const newExpiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      await supabaseAdmin()
        .from('calendar_integrations')
        .update({
          access_token: encrypt(tokens.access_token),
          // Microsoft only returns a new refresh_token sometimes — keep the
          // old one (still valid) when it doesn't.
          ...(tokens.refresh_token ? { refresh_token: encrypt(tokens.refresh_token) } : {}),
          token_expires_at: newExpiry,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
      return { ...row, access_token: encrypt(tokens.access_token), token_expires_at: newExpiry }
    } catch {
      return row
    }
  }

  return row
}

export interface MicrosoftEventListParams {
  calendarId?: string
  timeMin?: string
  timeMax?: string
  deltaLink?: string
}

function calendarViewDeltaPath(calendarId = 'primary'): string {
  return calendarId === 'primary'
    ? 'https://graph.microsoft.com/v1.0/me/calendarView/delta'
    : `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(calendarId)}/calendarView/delta`
}

/**
 * Paginates through Graph's delta query (following @odata.nextLink) until
 * it returns @odata.deltaLink, collecting every item along the way.
 * Mirrors listGoogleEvents' single-call shape even though Graph's delta
 * protocol needs multiple round-trips internally.
 */
export async function listMicrosoftEvents(
  accessToken: string,
  params: MicrosoftEventListParams = {},
): Promise<{ items: MicrosoftCalendarEvent[]; nextDeltaLink?: string }> {
  const { calendarId = 'primary', timeMin, timeMax, deltaLink } = params

  let url: string
  if (deltaLink) {
    url = deltaLink
  } else {
    const p = new URLSearchParams()
    if (timeMin) p.set('startDateTime', timeMin)
    if (timeMax) p.set('endDateTime', timeMax)
    url = `${calendarViewDeltaPath(calendarId)}?${p}`
  }

  const items: MicrosoftCalendarEvent[] = []
  let nextDeltaLink: string | undefined

  while (url) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Prefer: 'outlook.timezone="UTC", odata.maxpagesize=250',
      },
    })
    if (res.status === 410) throw new Error('SYNC_TOKEN_EXPIRED')
    if (!res.ok) throw new Error(`Microsoft Calendar list events failed: ${await res.text()}`)
    const data = await res.json()
    items.push(...(data.value ?? []))
    nextDeltaLink = data['@odata.deltaLink']
    url = data['@odata.nextLink']
  }

  return { items, nextDeltaLink }
}

export { toGraphDateTime, fromGraphDateTime }

// ─── Push notifications (Graph subscriptions) ──────────────────────────────
//
// Graph subscriptions on the `me/events` resource expire after ~4230
// minutes (~2.94 days) max — much shorter than Google's 7-day channels —
// so renewal rides the same "opportunistic, on every sync" pattern as
// Google rather than a dedicated cron. `clientState` is a shared secret
// Graph echoes back on every notification; unlike the Google webhook (which
// trusts the channel id alone), the Microsoft webhook route verifies it.

const SUBSCRIPTION_MAX_MINUTES = 4230

export async function setupMicrosoftSubscription(
  accessToken: string,
  notificationUrl: string,
  clientState: string,
): Promise<{ id: string; expirationDateTime: string }> {
  const expirationDateTime = new Date(Date.now() + SUBSCRIPTION_MAX_MINUTES * 60_000).toISOString()
  const res = await fetch('https://graph.microsoft.com/v1.0/subscriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      changeType: 'created,updated,deleted',
      notificationUrl,
      resource: 'me/events',
      expirationDateTime,
      clientState,
    }),
  })
  if (!res.ok) throw new Error(`Microsoft Calendar subscription setup failed: ${await res.text()}`)
  return res.json()
}

export async function renewMicrosoftSubscription(
  accessToken: string,
  subscriptionId: string,
): Promise<{ id: string; expirationDateTime: string }> {
  const expirationDateTime = new Date(Date.now() + SUBSCRIPTION_MAX_MINUTES * 60_000).toISOString()
  const res = await fetch(`https://graph.microsoft.com/v1.0/subscriptions/${subscriptionId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expirationDateTime }),
  })
  if (!res.ok) throw new Error(`Microsoft Calendar subscription renewal failed: ${await res.text()}`)
  return res.json()
}

export { encrypt, decrypt }
