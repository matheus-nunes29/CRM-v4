import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { runAutomationsForTrigger } from '@/lib/automations/engine'

function supabaseAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/** POST /api/contacts/:id/tags — add a tag */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: contactId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', user.id)
    .single()
  if (!profile?.account_id) return NextResponse.json({ error: 'No account' }, { status: 400 })

  const { tag_id } = (await req.json()) as { tag_id: string }
  if (!tag_id) return NextResponse.json({ error: 'tag_id required' }, { status: 400 })

  const admin = supabaseAdmin()

  // Verify contact belongs to this account
  const { data: contact } = await admin
    .from('contacts')
    .select('id')
    .eq('id', contactId)
    .eq('account_id', profile.account_id)
    .maybeSingle()
  if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })

  const { error } = await admin
    .from('contact_tags')
    .upsert({ contact_id: contactId, tag_id }, { onConflict: 'contact_id,tag_id', ignoreDuplicates: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  runAutomationsForTrigger({
    accountId: profile.account_id,
    triggerType: 'tag_added',
    contactId,
    context: { tag_id },
  }).catch((err) => console.error('[automations] tag_added error:', err))

  return NextResponse.json({ ok: true })
}

/** DELETE /api/contacts/:id/tags — remove a tag */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: contactId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', user.id)
    .single()
  if (!profile?.account_id) return NextResponse.json({ error: 'No account' }, { status: 400 })

  const { tag_id } = (await req.json()) as { tag_id: string }
  if (!tag_id) return NextResponse.json({ error: 'tag_id required' }, { status: 400 })

  const admin = supabaseAdmin()

  // Verify contact belongs to this account
  const { data: contact } = await admin
    .from('contacts')
    .select('id')
    .eq('id', contactId)
    .eq('account_id', profile.account_id)
    .maybeSingle()
  if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })

  const { error } = await admin
    .from('contact_tags')
    .delete()
    .eq('contact_id', contactId)
    .eq('tag_id', tag_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  runAutomationsForTrigger({
    accountId: profile.account_id,
    triggerType: 'tag_removed',
    contactId,
    context: { tag_id },
  }).catch((err) => console.error('[automations] tag_removed error:', err))

  return NextResponse.json({ ok: true })
}
