import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { getIntegration, deleteGoogleEvent, updateGoogleEvent, decrypt } from '@/lib/calendar/google'

function supabaseAdmin() {
  return createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('account_id').eq('user_id', user.id).maybeSingle()
  if (!profile?.account_id) return NextResponse.json({ error: 'No account' }, { status: 403 })

  const body = await request.json()
  const { title, description, start_at, end_at, attendee_emails } = body

  const { data: evt } = await supabase
    .from('calendar_events')
    .select('provider_event_id, calendar_id, account_id')
    .eq('id', id)
    .eq('account_id', profile.account_id)
    .maybeSingle()

  if (!evt) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  // Update in Google
  if (evt.provider_event_id) {
    const integration = await getIntegration(profile.account_id)
    if (integration) {
      const accessToken = decrypt(integration.access_token)
      await updateGoogleEvent(accessToken, evt.provider_event_id, {
        title, description, startAt: start_at, endAt: end_at, attendeeEmails: attendee_emails,
      }, evt.calendar_id)
    }
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (title !== undefined) updates.title = title
  if (description !== undefined) updates.description = description
  if (start_at !== undefined) updates.start_at = start_at
  if (end_at !== undefined) updates.end_at = end_at
  if (attendee_emails !== undefined) updates.attendees = attendee_emails.map((e: string) => ({ email: e }))

  const { data: updated, error } = await supabaseAdmin().from('calendar_events').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ event: updated })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('account_id').eq('user_id', user.id).maybeSingle()
  if (!profile?.account_id) return NextResponse.json({ error: 'No account' }, { status: 403 })

  const { data: evt } = await supabase
    .from('calendar_events')
    .select('provider_event_id, calendar_id, account_id')
    .eq('id', id)
    .eq('account_id', profile.account_id)
    .maybeSingle()

  if (!evt) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  if (evt.provider_event_id) {
    const integration = await getIntegration(profile.account_id)
    if (integration) {
      const accessToken = decrypt(integration.access_token)
      await deleteGoogleEvent(accessToken, evt.provider_event_id, evt.calendar_id)
    }
  }

  await supabaseAdmin().from('calendar_events').delete().eq('id', id)
  return NextResponse.json({ success: true })
}
