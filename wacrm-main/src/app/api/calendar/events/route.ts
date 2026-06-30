import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { getIntegration, createGoogleEvent, decrypt } from '@/lib/calendar/google'

function supabaseAdmin() {
  return createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('account_id').eq('user_id', user.id).maybeSingle()
  if (!profile?.account_id) return NextResponse.json({ error: 'No account' }, { status: 403 })

  const { searchParams } = request.nextUrl
  const contactId = searchParams.get('contact_id')
  const dealId = searchParams.get('deal_id')

  let query = supabase
    .from('calendar_events')
    .select('*, contact:contacts(id,name,phone), deal:deals(id,title)')
    .eq('account_id', profile.account_id)
    .order('start_at', { ascending: true })

  if (contactId) query = query.eq('contact_id', contactId)
  if (dealId) query = query.eq('deal_id', dealId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ events: data })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('account_id').eq('user_id', user.id).maybeSingle()
  if (!profile?.account_id) return NextResponse.json({ error: 'No account' }, { status: 403 })

  const body = await request.json()
  const { title, description, start_at, end_at, contact_id, deal_id, attendee_emails, add_meet } = body

  if (!title || !start_at || !end_at) {
    return NextResponse.json({ error: 'title, start_at and end_at are required' }, { status: 400 })
  }

  const integration = await getIntegration(profile.account_id)
  if (!integration) {
    return NextResponse.json({ error: 'Google Calendar não conectado. Vá em Configurações → Agenda.' }, { status: 400 })
  }

  const accessToken = decrypt(integration.access_token)
  const gcEvent = await createGoogleEvent(accessToken, {
    title,
    description,
    startAt: start_at,
    endAt: end_at,
    attendeeEmails: attendee_emails ?? [],
    addMeet: add_meet ?? false,
    calendarId: integration.calendar_id,
  })

  const { data: saved, error: dbErr } = await supabaseAdmin()
    .from('calendar_events')
    .insert({
      account_id: profile.account_id,
      created_by: user.id,
      contact_id: contact_id ?? null,
      deal_id: deal_id ?? null,
      provider: 'google',
      provider_event_id: gcEvent.id,
      calendar_id: integration.calendar_id,
      title,
      description: description ?? null,
      start_at,
      end_at,
      meet_link: gcEvent.hangoutLink ?? null,
      attendees: attendee_emails?.map((e: string) => ({ email: e })) ?? [],
    })
    .select()
    .single()

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })
  return NextResponse.json({ event: saved }, { status: 201 })
}
