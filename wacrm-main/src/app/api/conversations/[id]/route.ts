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

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
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
  const { status, assigned_agent_id } = body as {
    status?: 'open' | 'pending' | 'closed'
    assigned_agent_id?: string | null
  }

  if (!status && assigned_agent_id === undefined) {
    return NextResponse.json({ error: 'status or assigned_agent_id required' }, { status: 400 })
  }

  const admin = supabaseAdmin()

  const { data: conversation } = await admin
    .from('conversations')
    .select('id, contact_id, status, assigned_agent_id, account_id')
    .eq('id', id)
    .eq('account_id', profile.account_id)
    .single()

  if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (status) update.status = status
  if (assigned_agent_id !== undefined) update.assigned_agent_id = assigned_agent_id

  const { error } = await admin
    .from('conversations')
    .update(update)
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const contactId = conversation.contact_id as string | null

  if (contactId) {
    // Conversa Encerrada
    if (status === 'closed' && conversation.status !== 'closed') {
      runAutomationsForTrigger({
        accountId: profile.account_id,
        triggerType: 'conversation_closed',
        contactId,
        context: { conversation_id: id },
      }).catch((err) => console.error('[automations] conversation_closed error:', err))
    }

    // Conversa Atribuída
    if (assigned_agent_id && assigned_agent_id !== conversation.assigned_agent_id) {
      runAutomationsForTrigger({
        accountId: profile.account_id,
        triggerType: 'conversation_assigned',
        contactId,
        context: { conversation_id: id, agent_id: assigned_agent_id },
      }).catch((err) => console.error('[automations] conversation_assigned error:', err))
    }
  }

  return NextResponse.json({ ok: true })
}
