import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('account_id').eq('user_id', user.id).single()
  if (!profile?.account_id) return NextResponse.json({ error: 'No account' }, { status: 400 })

  const url = new URL(req.url)
  const limit = Math.min(Number(url.searchParams.get('limit') ?? '50'), 200)

  const { data, error } = await supabase
    .from('capi_dispatch_log')
    .select('*, contact:contact_id(id, name, phone)')
    .eq('account_id', profile.account_id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
