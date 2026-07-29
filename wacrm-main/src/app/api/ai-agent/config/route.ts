import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'

function supabaseAdmin() {
  return createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const DEFAULT_CONFIG = {
  autoresponder_enabled: false,
  copilot_enabled: false,
  system_prompt: '',
  allow_pricing: false,
  price_list: '',
  allow_deal_updates: true,
  escalation_notes: '',
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('account_id').eq('user_id', user.id).maybeSingle()
  if (!profile?.account_id) return NextResponse.json({ error: 'No account' }, { status: 403 })

  // RLS (ai_agent_configs_select) already scopes this to the caller's
  // account — no explicit .eq needed, but it's harmless to keep for
  // clarity and to match every other route in this file.
  const { data, error } = await supabase
    .from('ai_agent_configs')
    .select('*')
    .eq('account_id', profile.account_id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // No row yet (never saved) — return the defaults rather than 404, so
  // the settings screen always has something to render.
  return NextResponse.json({ config: data ?? { account_id: profile.account_id, ...DEFAULT_CONFIG } })
}

export async function PUT(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('account_id, id').eq('user_id', user.id).maybeSingle()
  if (!profile?.account_id) return NextResponse.json({ error: 'No account' }, { status: 403 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

  const update = {
    account_id: profile.account_id,
    autoresponder_enabled: Boolean(body.autoresponder_enabled),
    copilot_enabled: Boolean(body.copilot_enabled),
    system_prompt: typeof body.system_prompt === 'string' ? body.system_prompt.slice(0, 8000) : '',
    allow_pricing: Boolean(body.allow_pricing),
    price_list: typeof body.price_list === 'string' ? body.price_list.slice(0, 8000) : '',
    allow_deal_updates: Boolean(body.allow_deal_updates),
    escalation_notes: typeof body.escalation_notes === 'string' ? body.escalation_notes.slice(0, 4000) : '',
    updated_by: profile.id,
    updated_at: new Date().toISOString(),
  }

  // Upsert via the user's own session — RLS (ai_agent_configs_write)
  // requires an 'admin' account_role, so a non-admin gets a clean 403
  // from Postgres itself rather than us having to re-implement the
  // role check here.
  const { data, error } = await supabase
    .from('ai_agent_configs')
    .upsert(update, { onConflict: 'account_id' })
    .select()
    .single()

  if (error) {
    const status = error.code === '42501' ? 403 : 500
    return NextResponse.json({ error: error.message }, { status })
  }

  // History snapshot — service role, since there's no client insert
  // policy on ai_agent_config_history (it's an audit trail, not
  // something a client should be able to forge independently of an
  // actual config save).
  await supabaseAdmin()
    .from('ai_agent_config_history')
    .insert({
      account_id: profile.account_id,
      changed_by: profile.id,
      summary: [
        update.autoresponder_enabled ? 'WhatsApp: ativo' : 'WhatsApp: desativado',
        update.copilot_enabled ? 'Copiloto: ativo' : 'Copiloto: desativado',
      ].join(' · '),
      snapshot: update,
    })
    .then(({ error: histErr }) => {
      if (histErr) console.error('[ai-agent/config] history insert failed:', histErr)
    })

  return NextResponse.json({ config: data })
}
