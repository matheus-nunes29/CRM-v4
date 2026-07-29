import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('account_id').eq('user_id', user.id).maybeSingle()
  if (!profile?.account_id) return NextResponse.json({ error: 'No account' }, { status: 403 })

  const { data, error } = await supabase
    .from('ai_knowledge_items')
    .select('*')
    .eq('account_id', profile.account_id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data ?? [] })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('account_id, id').eq('user_id', user.id).maybeSingle()
  if (!profile?.account_id) return NextResponse.json({ error: 'No account' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  const content = typeof body?.content === 'string' ? body.content.trim() : ''
  if (!title || !content) {
    return NextResponse.json({ error: "'title' and 'content' are required" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('ai_knowledge_items')
    .insert({
      account_id: profile.account_id,
      title: title.slice(0, 200),
      content: content.slice(0, 8000),
      source: 'manual',
      created_by: profile.id,
    })
    .select()
    .single()

  if (error) {
    const status = error.code === '42501' ? 403 : 500
    return NextResponse.json({ error: error.message }, { status })
  }
  return NextResponse.json({ item: data }, { status: 201 })
}
