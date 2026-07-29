import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('account_id').eq('user_id', user.id).maybeSingle()
  if (!profile?.account_id) return NextResponse.json({ error: 'No account' }, { status: 403 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.title === 'string') update.title = body.title.trim().slice(0, 200)
  if (typeof body.content === 'string') update.content = body.content.trim().slice(0, 8000)
  if (typeof body.is_active === 'boolean') update.is_active = body.is_active

  const { data, error } = await supabase
    .from('ai_knowledge_items')
    .update(update)
    .eq('id', id)
    .eq('account_id', profile.account_id)
    .select()
    .maybeSingle()

  if (error) {
    const status = error.code === '42501' ? 403 : 500
    return NextResponse.json({ error: error.message }, { status })
  }
  if (!data) return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  return NextResponse.json({ item: data })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('account_id').eq('user_id', user.id).maybeSingle()
  if (!profile?.account_id) return NextResponse.json({ error: 'No account' }, { status: 403 })

  const { error } = await supabase
    .from('ai_knowledge_items')
    .delete()
    .eq('id', id)
    .eq('account_id', profile.account_id)

  if (error) {
    const status = error.code === '42501' ? 403 : 500
    return NextResponse.json({ error: error.message }, { status })
  }
  return NextResponse.json({ ok: true })
}
