import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'

function supabaseAdmin() {
  return createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('account_id').eq('user_id', user.id).maybeSingle()
  if (!profile?.account_id) return NextResponse.json({ error: 'No account' }, { status: 403 })

  const { data, error } = await supabase
    .from('ai_agent_corrections')
    .select('*')
    .eq('account_id', profile.account_id)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ corrections: data ?? [] })
}

/**
 * Any account member (not just admins) can flag a bad reply from the
 * Inbox — the correction itself is low-risk (it's additive, reviewable
 * in the "Correções" tab) and staff on the floor are exactly who
 * notices a bad AI reply first. Uses the service-role client because
 * the write spans two tables (the correction row + the linked
 * knowledge item, which is admin-only under RLS) as one unit.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('account_id, id').eq('user_id', user.id).maybeSingle()
  if (!profile?.account_id) return NextResponse.json({ error: 'No account' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const originalResponse = typeof body?.original_response === 'string' ? body.original_response.trim() : ''
  const correctedResponse = typeof body?.corrected_response === 'string' ? body.corrected_response.trim() : ''
  const note = typeof body?.note === 'string' ? body.note.trim() : ''
  const conversationId = typeof body?.conversation_id === 'string' ? body.conversation_id : null
  const messageId = typeof body?.message_id === 'string' ? body.message_id : null

  if (!correctedResponse) {
    return NextResponse.json({ error: "'corrected_response' is required" }, { status: 400 })
  }

  const admin = supabaseAdmin()

  // Verify the conversation (if given) actually belongs to this
  // account before trusting it — this route bypasses RLS via the
  // service-role client, so it re-does the tenancy check by hand.
  if (conversationId) {
    const { data: conv } = await admin
      .from('conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('account_id', profile.account_id)
      .maybeSingle()
    if (!conv) {
      return NextResponse.json({ error: 'conversation_id does not belong to this account' }, { status: 403 })
    }
  }

  const { data: knowledgeItem, error: knowledgeErr } = await admin
    .from('ai_knowledge_items')
    .insert({
      account_id: profile.account_id,
      title: 'Correção de resposta',
      content: note ? `${note}\n\nResposta correta: ${correctedResponse}` : `Resposta correta: ${correctedResponse}`,
      source: 'correction',
      created_by: profile.id,
    })
    .select()
    .single()

  if (knowledgeErr) {
    console.error('[ai-agent/corrections] knowledge item insert failed:', knowledgeErr)
    return NextResponse.json({ error: 'Failed to save correction' }, { status: 500 })
  }

  const { data: correction, error } = await admin
    .from('ai_agent_corrections')
    .insert({
      account_id: profile.account_id,
      conversation_id: conversationId,
      message_id: messageId,
      original_response: originalResponse,
      corrected_response: correctedResponse,
      note,
      knowledge_item_id: knowledgeItem.id,
      created_by: profile.id,
    })
    .select()
    .single()

  if (error) {
    console.error('[ai-agent/corrections] correction insert failed:', error)
    return NextResponse.json({ error: 'Failed to save correction' }, { status: 500 })
  }

  return NextResponse.json({ correction }, { status: 201 })
}
