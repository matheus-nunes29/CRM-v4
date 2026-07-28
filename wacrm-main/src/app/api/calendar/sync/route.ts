import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncGoogleCalendar } from '@/lib/calendar/sync'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('account_id').eq('user_id', user.id).maybeSingle()
  if (!profile?.account_id) return NextResponse.json({ error: 'No account' }, { status: 403 })

  try {
    const result = await syncGoogleCalendar(profile.account_id)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[calendar/sync] failed:', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
