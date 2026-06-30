import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function generateCode(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', user.id)
    .single()
  if (!profile?.account_id) return NextResponse.json({ error: 'No account' }, { status: 400 })

  const { data, error } = await supabase
    .from('tracking_links')
    .select('*')
    .eq('account_id', profile.account_id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ links: data ?? [] })
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

  const body = await req.json()
  const {
    name, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    destination_phone, initial_message,
  } = body

  if (!name?.trim() || !destination_phone?.trim()) {
    return NextResponse.json({ error: 'name and destination_phone are required' }, { status: 400 })
  }

  // Generate a unique code (retry on collision)
  let code = ''
  for (let attempt = 0; attempt < 5; attempt++) {
    code = generateCode()
    const { data: existing } = await supabase
      .from('tracking_links')
      .select('id')
      .eq('code', code)
      .maybeSingle()
    if (!existing) break
  }

  const { data, error } = await supabase
    .from('tracking_links')
    .insert({
      account_id: profile.account_id,
      code,
      name: name.trim(),
      utm_source: utm_source?.trim() || null,
      utm_medium: utm_medium?.trim() || null,
      utm_campaign: utm_campaign?.trim() || null,
      utm_content: utm_content?.trim() || null,
      utm_term: utm_term?.trim() || null,
      destination_phone: destination_phone.trim(),
      initial_message: initial_message?.trim() || 'Olá!',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ link: data }, { status: 201 })
}

export async function DELETE(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', user.id)
    .single()
  if (!profile?.account_id) return NextResponse.json({ error: 'No account' }, { status: 400 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabase
    .from('tracking_links')
    .delete()
    .eq('id', id)
    .eq('account_id', profile.account_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
