import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('account_id').eq('user_id', user.id).single()
  if (!profile?.account_id) return NextResponse.json({ error: 'No account' }, { status: 400 })

  const { data, error } = await supabase
    .from('stage_triggers')
    .select('*')
    .eq('account_id', profile.account_id)
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('account_id').eq('user_id', user.id).single()
  if (!profile?.account_id) return NextResponse.json({ error: 'No account' }, { status: 400 })

  const { stage_id, keyword, match_type } = await req.json() as {
    stage_id: string
    keyword: string
    match_type?: 'exact' | 'contains'
  }

  if (!stage_id || !keyword?.trim()) {
    return NextResponse.json({ error: 'stage_id and keyword required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('stage_triggers')
    .insert({
      account_id: profile.account_id,
      stage_id,
      keyword: keyword.trim(),
      match_type: match_type ?? 'contains',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json() as { id: string }
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabase.from('stage_triggers').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
