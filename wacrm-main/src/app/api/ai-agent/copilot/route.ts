import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runCopilotTurn, isCopilotEnabled, type CopilotMessage } from '@/lib/ai-agent/copilot'

function sanitizeMessages(raw: unknown): CopilotMessage[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(
      (m): m is CopilotMessage =>
        !!m &&
        typeof m === 'object' &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string' &&
        m.content.trim().length > 0,
    )
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }))
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!profile?.account_id) return NextResponse.json({ error: 'No account' }, { status: 403 })

  const enabled = await isCopilotEnabled(profile.account_id)
  if (!enabled) {
    return NextResponse.json(
      { error: 'O Agente de IA não está ativo para esta conta. Ative em Configurações > Agente de IA.' },
      { status: 403 },
    )
  }

  const body = await request.json().catch(() => null)
  const messages = sanitizeMessages(body?.messages)
  if (messages.length === 0) {
    return NextResponse.json({ error: "'messages' é obrigatório" }, { status: 400 })
  }
  if (messages[messages.length - 1].role !== 'user') {
    return NextResponse.json({ error: 'A última mensagem precisa ser do usuário' }, { status: 400 })
  }

  try {
    const reply = await runCopilotTurn(profile.account_id, messages)
    return NextResponse.json({ reply })
  } catch (err) {
    console.error('[ai-agent/copilot] failed:', err)
    return NextResponse.json({ error: 'Falha ao consultar o copiloto' }, { status: 500 })
  }
}
