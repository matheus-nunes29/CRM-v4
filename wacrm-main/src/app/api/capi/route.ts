import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', user.id)
    .single()
  if (!profile?.account_id) return NextResponse.json({ config: null })

  const { data } = await supabase
    .from('meta_pixel_config')
    .select('id, pixel_id, test_event_code, created_at, updated_at')
    .eq('account_id', profile.account_id)
    .maybeSingle()

  // Never return the access_token to the client
  return NextResponse.json({ config: data ?? null })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', user.id)
    .single()
  if (!profile?.account_id) return NextResponse.json({ error: 'No account' }, { status: 400 })

  const { pixel_id, access_token, test_event_code } = await req.json()
  if (!pixel_id?.trim() || !access_token?.trim()) {
    return NextResponse.json({ error: 'pixel_id and access_token are required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('meta_pixel_config')
    .upsert(
      {
        account_id: profile.account_id,
        pixel_id: pixel_id.trim(),
        access_token: access_token.trim(),
        test_event_code: test_event_code?.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'account_id' },
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', user.id)
    .single()
  if (!profile?.account_id) return NextResponse.json({ error: 'No account' }, { status: 400 })

  await supabase
    .from('meta_pixel_config')
    .delete()
    .eq('account_id', profile.account_id)

  return NextResponse.json({ ok: true })
}
