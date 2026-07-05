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

  const [eventsResult, integration] = await Promise.all([
    query,
    getIntegration(profile.account_id),
  ])

  if (eventsResult.error) return NextResponse.json({ error: eventsResult.error.message }, { status: 500 })

  return NextResponse.json({
    events: eventsResult.data,
    has_google_integration: !!integration,
  })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('account_id').eq('user_id', user.id).maybeSingle()
  if (!profile?.account_id) return NextResponse.json({ error: 'No account' }, { status: 403 })

  const body = await request.json()
  const { title, description, start_at, end_at, contact_id, deal_id, assigned_to, attendee_emails, add_meet } = body

  if (!title || !start_at || !end_at) {
    return NextResponse.json({ error: 'title, start_at and end_at are required' }, { status: 400 })
  }
  if (!assigned_to) {
    return NextResponse.json({ error: 'assigned_to is required' }, { status: 400 })
  }

  let providerEventId: string | null = null
  let meetLink: string | null = null
  let calendarId = 'primary'
  let provider = 'internal'

  // Push to Google if integration is connected — non-blocking if it fails
  const integration = await getIntegration(profile.account_id)
  if (integration) {
    try {
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
      providerEventId = gcEvent.id
      meetLink = gcEvent.hangoutLink ?? null
      calendarId = integration.calendar_id
      provider = 'google'
    } catch (err) {
      console.error('[calendar/events POST] Google push failed, saving internally:', err)
    }
  }

  const { data: saved, error: dbErr } = await supabaseAdmin()
    .from('calendar_events')
    .insert({
      account_id: profile.account_id,
      created_by: user.id,
      contact_id: contact_id ?? null,
      deal_id: deal_id ?? null,
      assigned_to: assigned_to ?? null,
      provider,
      provider_event_id: providerEventId,
      calendar_id: calendarId,
      title,
      description: description ?? null,
      start_at,
      end_at,
      meet_link: meetLink,
      attendees: attendee_emails?.map((e: string) => ({ email: e })) ?? [],
    })
    .select()
    .single()

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })
  return NextResponse.json({ event: saved }, { status: 201 })
}
