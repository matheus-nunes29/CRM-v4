import { encrypt, decrypt } from '@/lib/whatsapp/encryption'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ')

export function buildGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/calendar/auth/google/callback`,
    response_type: 'code',
    scope: GOOGLE_SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

export async function exchangeGoogleCode(code: string): Promise<GoogleTokens> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/calendar/auth/google/callback`,
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) throw new Error(`Google token exchange failed: ${await res.text()}`)
  return res.json()
}

export async function refreshGoogleToken(encryptedRefresh: string): Promise<GoogleTokens> {
  const refreshToken = decrypt(encryptedRefresh)
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`Google token refresh failed: ${await res.text()}`)
  return res.json()
}

export async function getGoogleUserEmail(accessToken: string): Promise<string | null> {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return null
  const data = await res.json()
  return data.email ?? null
}

export interface GoogleTokens {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
}

export interface CreateEventInput {
  title: string
  description?: string
  startAt: string   // ISO 8601
  endAt: string     // ISO 8601
  attendeeEmails?: string[]
  addMeet?: boolean
  calendarId?: string
}

export interface GoogleCalendarEvent {
  id: string
  summary: string
  description?: string
  start: { dateTime: string; timeZone?: string }
  end: { dateTime: string; timeZone?: string }
  hangoutLink?: string
  attendees?: { email: string; displayName?: string }[]
  htmlLink: string
}

export async function createGoogleEvent(
  accessToken: string,
  input: CreateEventInput,
  calendarId = 'primary',
): Promise<GoogleCalendarEvent> {
  const body: Record<string, unknown> = {
    summary: input.title,
    description: input.description,
    start: { dateTime: input.startAt, timeZone: 'America/Sao_Paulo' },
    end: { dateTime: input.endAt, timeZone: 'America/Sao_Paulo' },
  }
  if (input.attendeeEmails?.length) {
    body.attendees = input.attendeeEmails.map((email) => ({ email }))
  }
  if (input.addMeet) {
    body.conferenceData = {
      createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } },
    }
  }

  const params = new URLSearchParams({ sendUpdates: 'all' })
  if (input.addMeet) params.set('conferenceDataVersion', '1')

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
  if (!res.ok) throw new Error(`Google Calendar create event failed: ${await res.text()}`)
  return res.json()
}

export async function deleteGoogleEvent(
  accessToken: string,
  providerEventId: string,
  calendarId = 'primary',
): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${providerEventId}?sendUpdates=all`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`Google Calendar delete event failed: ${await res.text()}`)
  }
}

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/** Retrieve the integration row for the account, refreshing the token if expired. */
export async function getIntegration(accountId: string) {
  const { data: row } = await supabaseAdmin()
    .from('calendar_integrations')
    .select('*')
    .eq('account_id', accountId)
    .eq('provider', 'google')
    .maybeSingle()

  if (!row) return null

  const expiresAt = row.token_expires_at ? new Date(row.token_expires_at) : null
  const needsRefresh = !expiresAt || expiresAt <= new Date(Date.now() + 60_000)

  if (needsRefresh && row.refresh_token) {
    try {
      const tokens = await refreshGoogleToken(row.refresh_token)
      const newExpiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      await supabaseAdmin()
        .from('calendar_integrations')
        .update({
          access_token: encrypt(tokens.access_token),
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

export { encrypt, decrypt }
