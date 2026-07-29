import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('account_id').eq('user_id', user.id).maybeSingle()
  if (!profile?.account_id) return NextResponse.json({ error: 'No account' }, { status: 403 })

  const [historyRes, runsRes] = await Promise.all([
    supabase
      .from('ai_agent_config_history')
      .select('*')
      .eq('account_id', profile.account_id)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('ai_agent_runs')
      .select('id, conversation_id, contact_id, response_text, outcome, error_message, created_at')
      .eq('account_id', profile.account_id)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  if (historyRes.error) return NextResponse.json({ error: historyRes.error.message }, { status: 500 })
  if (runsRes.error) return NextResponse.json({ error: runsRes.error.message }, { status: 500 })

  return NextResponse.json({ history: historyRes.data ?? [], runs: runsRes.data ?? [] })
}
