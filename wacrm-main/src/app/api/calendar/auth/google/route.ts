import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildGoogleAuthUrl } from '@/lib/calendar/google'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!profile?.account_id) return NextResponse.json({ error: 'No account' }, { status: 403 })

  // Encode account_id + user_id in state to recover after redirect
  const state = Buffer.from(JSON.stringify({ accountId: profile.account_id, userId: user.id })).toString('base64url')
  return NextResponse.redirect(buildGoogleAuthUrl(state))
}
