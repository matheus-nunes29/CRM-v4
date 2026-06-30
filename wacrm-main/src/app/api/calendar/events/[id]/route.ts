import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { getIntegration, deleteGoogleEvent, decrypt } from '@/lib/calendar/google'

function supabaseAdmin() {
  return createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
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
