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
    title,
    value,
    pipeline_id,
    stage_id,
    contact_id,
    assigned_to,
    notes,
    expected_close_date,
    currency,
  } = body as {
    title: string
    value?: number
    pipeline_id: string
    stage_id: string
    contact_id?: string | null
    assigned_to?: string | null
    notes?: string | null
    expected_close_date?: string | null
    currency?: string
  }

  if (!title?.trim() || !pipeline_id || !stage_id) {
    return NextResponse.json({ error: 'title, pipeline_id e stage_id são obrigatórios' }, { status: 400 })
  }

  const admin = supabaseAdmin()

  const { data: acct } = await admin
    .from('accounts')
    .select('default_currency')
    .eq('id', profile.account_id)
    .maybeSingle()

  const { data: deal, error } = await admin
    .from('deals')
    .insert({
      account_id: profile.account_id,
      user_id: user.id,
      title: title.trim(),
      value: value ?? 0,
      currency: currency ?? acct?.default_currency ?? 'BRL',
      pipeline_id,
      stage_id,
      contact_id: contact_id ?? null,
      assigned_to: assigned_to ?? null,
      notes: notes?.trim() || null,
      expected_close_date: expected_close_date || null,
      status: 'open',
    })
    .select('id')
    .single()

  if (error || !deal) {
    return NextResponse.json({ error: error?.message ?? 'unknown' }, { status: 500 })
  }

  if (contact_id) {
    runAutomationsForTrigger({
      accountId: profile.account_id,
      triggerType: 'deal_created',
      contactId: contact_id,
      context: { deal_id: deal.id, deal_stage_id: stage_id },
    }).catch((err) => console.error('[automations] deal_created error:', err))

    // Also fire deal_stage_entered for the initial stage
    runAutomationsForTrigger({
      accountId: profile.account_id,
      triggerType: 'deal_stage_entered',
      contactId: contact_id,
      context: { deal_id: deal.id, deal_stage_id: stage_id },
    }).catch((err) => console.error('[automations] deal_stage_entered (on create) error:', err))
  }

  return NextResponse.json({ id: deal.id })
}
