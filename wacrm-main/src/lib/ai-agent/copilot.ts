import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/automations/admin-client'

/**
 * Internal CRM copilot — the second surface of the AI agent (the first
 * is the WhatsApp autoresponder in ./engine.ts). Read-only by design:
 * it answers questions about contacts/deals/pipeline by querying the
 * CRM directly, but has no tool that mutates data — an action request
 * gets a "do it yourself in the CRM" answer instead. Stateless across
 * requests: the client resends the full chat history each turn (see
 * src/components/copilot/copilot-widget.tsx), nothing is persisted
 * server-side.
 */

const MODEL = 'claude-haiku-4-5'
const MAX_TOOL_ITERATIONS = 4
const MAX_HISTORY_MESSAGES = 20

let _anthropic: Anthropic | null = null
function anthropicClient(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic()
  return _anthropic
}

export interface CopilotMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function isCopilotEnabled(accountId: string): Promise<boolean> {
  const db = supabaseAdmin()
  const { data } = await db
    .from('ai_agent_configs')
    .select('copilot_enabled')
    .eq('account_id', accountId)
    .maybeSingle()
  return !!data?.copilot_enabled
}

function buildSystemPrompt(accountName: string): string {
  const today = new Date().toISOString().slice(0, 10)
  return [
    `Você é o copiloto interno do CRM de "${accountName}", uma clínica de estética. Está conversando com um membro da equipe, não com um cliente — pode ser direto e técnico.`,
    `Hoje é ${today}. Use essa data pra calcular períodos relativos ("esse mês", "essa semana", "últimos 30 dias") — ex: "esse mês" = data_inicio no dia 1 do mês corrente.`,
    'Use as ferramentas disponíveis para consultar dados reais antes de responder. Nunca invente nomes, números ou status que você não consultou.',
    'Você só tem acesso de LEITURA. Se pedirem uma ação (mudar etapa, enviar mensagem, editar algo), explique que ainda não pode executar isso e diga onde a pessoa faz isso manualmente no CRM.',
    'Respostas curtas e objetivas — quem pergunta já conhece o CRM, não precisa de explicações básicas.',
  ].join('\n\n')
}

function buildTools(): Anthropic.Tool[] {
  return [
    {
      name: 'buscar_contatos',
      description:
        'Busca contatos pelo nome ou telefone (parcial). Use antes de detalhar_contato quando você não tiver o ID do contato.',
      input_schema: {
        type: 'object',
        properties: { termo: { type: 'string', description: 'Nome ou telefone (parcial) a buscar' } },
        required: ['termo'],
        additionalProperties: false,
      },
    },
    {
      name: 'detalhar_contato',
      description:
        'Retorna o perfil completo de um contato: tags, notas recentes, negócios e últimas mensagens da conversa.',
      input_schema: {
        type: 'object',
        properties: { contato_id: { type: 'string', description: 'UUID do contato' } },
        required: ['contato_id'],
        additionalProperties: false,
      },
    },
    {
      name: 'negocios_parados',
      description:
        'Lista negócios abertos sem atualização há X dias (padrão 5) — útil para identificar quem precisa de follow-up.',
      input_schema: {
        type: 'object',
        properties: {
          dias: { type: 'number', description: 'Mínimo de dias sem atualização' },
        },
        additionalProperties: false,
      },
    },
    {
      name: 'resumo_funil',
      description: 'Retorna a contagem de negócios abertos por etapa, em cada funil (pipeline) da conta.',
      input_schema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      name: 'negocios_por_status',
      description:
        'Lista negócios ganhos ou perdidos num período, com a soma dos valores — use pra perguntas de faturamento/vendas ("quanto ganhamos esse mês", "negócios perdidos essa semana"). Filtra pela data real de entrada na etapa de ganho/perda quando o funil tem essa etapa marcada; a resposta inclui um campo "fonte" — se vier "ultima_atualizacao_aproximada", avise que é uma aproximação (funil sem etapa de ganho/perda marcada).',
      input_schema: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['won', 'lost'], description: "'won' para ganhos, 'lost' para perdidos" },
          data_inicio: { type: 'string', description: 'Data inicial YYYY-MM-DD (inclusive). Sem isso, usa os últimos 30 dias.' },
          data_fim: { type: 'string', description: 'Data final YYYY-MM-DD (inclusive). Sem isso, usa hoje.' },
        },
        required: ['status'],
        additionalProperties: false,
      },
    },
  ]
}

async function executeTool(
  db: SupabaseClient,
  accountId: string,
  name: string,
  input: unknown,
): Promise<string> {
  const args = (input ?? {}) as Record<string, unknown>

  switch (name) {
    case 'buscar_contatos': {
      const termo = String(args.termo ?? '').trim()
      if (!termo) return 'Termo de busca vazio.'
      const { data } = await db
        .from('contacts')
        .select('id, name, phone')
        .eq('account_id', accountId)
        .or(`name.ilike.%${termo}%,phone.ilike.%${termo}%`)
        .limit(10)
      return data?.length ? JSON.stringify(data) : 'Nenhum contato encontrado.'
    }

    case 'detalhar_contato': {
      const contatoId = String(args.contato_id ?? '')
      if (!contatoId) return 'contato_id vazio.'

      const [{ data: contact }, { data: notes }, { data: deals }, { data: tagRows }, { data: conversation }] =
        await Promise.all([
          db.from('contacts').select('id, name, phone').eq('id', contatoId).eq('account_id', accountId).maybeSingle(),
          db
            .from('contact_notes')
            .select('note_text, created_at')
            .eq('contact_id', contatoId)
            .order('created_at', { ascending: false })
            .limit(5),
          db
            .from('deals')
            .select('title, value, status, stage:pipeline_stages(name)')
            .eq('contact_id', contatoId)
            .order('created_at', { ascending: false })
            .limit(10),
          db.from('contact_tags').select('tags(name)').eq('contact_id', contatoId),
          db.from('conversations').select('id').eq('contact_id', contatoId).eq('account_id', accountId).maybeSingle(),
        ])

      if (!contact) return 'Contato não encontrado nesta conta.'

      let lastMessages: unknown[] = []
      if (conversation) {
        const { data: msgs } = await db
          .from('messages')
          .select('sender_type, content_text, created_at')
          .eq('conversation_id', conversation.id)
          .order('created_at', { ascending: false })
          .limit(5)
        lastMessages = msgs ?? []
      }

      const tags = (tagRows ?? [])
        .map((t) => (t as { tags: { name?: string } | null }).tags?.name)
        .filter((n): n is string => !!n)

      return JSON.stringify({ contact, notes: notes ?? [], deals: deals ?? [], tags, lastMessages })
    }

    case 'negocios_parados': {
      const dias = Number(args.dias) > 0 ? Number(args.dias) : 5
      const cutoff = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString()
      const { data } = await db
        .from('deals')
        .select('title, value, updated_at, contact:contacts(name), stage:pipeline_stages(name)')
        .eq('account_id', accountId)
        .not('status', 'in', '(won,lost)')
        .lt('updated_at', cutoff)
        .order('updated_at', { ascending: true })
        .limit(25)
      return data?.length ? JSON.stringify(data) : `Nenhum negócio parado há mais de ${dias} dias.`
    }

    case 'resumo_funil': {
      const { data: pipelines } = await db.from('pipelines').select('id, name').eq('account_id', accountId)
      const result: { funil: string; etapas: { etapa: string; negocios: number }[] }[] = []
      for (const p of pipelines ?? []) {
        const { data: stages } = await db
          .from('pipeline_stages')
          .select('id, name')
          .eq('pipeline_id', p.id)
          .order('position', { ascending: true })
        const etapas: { etapa: string; negocios: number }[] = []
        for (const s of stages ?? []) {
          const { count } = await db
            .from('deals')
            .select('id', { count: 'exact', head: true })
            .eq('stage_id', s.id)
            .eq('status', 'open')
          etapas.push({ etapa: s.name, negocios: count ?? 0 })
        }
        result.push({ funil: p.name, etapas })
      }
      return result.length ? JSON.stringify(result) : 'Nenhum funil configurado nesta conta.'
    }

    case 'negocios_por_status': {
      const status = args.status === 'lost' ? 'lost' : args.status === 'won' ? 'won' : null
      if (!status) return "status inválido — use 'won' ou 'lost'."

      const isValidDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

      const dataInicio = isValidDate(args.data_inicio)
        ? args.data_inicio
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      // Inclusive end-of-day: add one day and use "<" rather than "<=" on
      // a bare date, so a deal updated later on data_fim itself is included.
      const dataFimExclusive = isValidDate(args.data_fim)
        ? new Date(new Date(`${args.data_fim}T00:00:00Z`).getTime() + 24 * 60 * 60 * 1000).toISOString()
        : new Date(new Date().getTime() + 24 * 60 * 60 * 1000).toISOString()

      // Prefer deal_stage_history for the real "entered the won/lost
      // stage" timestamp over the deals.updated_at approximation — find
      // the account's stage(s) tagged with this fixed_role first.
      const { data: pipelines } = await db.from('pipelines').select('id').eq('account_id', accountId)
      const pipelineIds = (pipelines ?? []).map((p) => p.id as string)
      const { data: stages } = pipelineIds.length
        ? await db.from('pipeline_stages').select('id').in('pipeline_id', pipelineIds).eq('fixed_role', status)
        : { data: [] as { id: string }[] }
      const stageIds = (stages ?? []).map((s) => s.id as string)

      if (stageIds.length > 0) {
        const { data: historyRows } = await db
          .from('deal_stage_history')
          .select('deal_id, entered_at')
          .in('stage_id', stageIds)
          .gte('entered_at', `${dataInicio}T00:00:00Z`)
          .lt('entered_at', dataFimExclusive)
          .order('entered_at', { ascending: false })
          .limit(50)

        if (!historyRows?.length) return `Nenhum negócio ${status === 'won' ? 'ganho' : 'perdido'} nesse período.`

        const dealIds = historyRows.map((h) => h.deal_id as string)
        const { data: deals } = await db
          .from('deals')
          .select('id, title, value, contact:contacts(name)')
          .in('id', dealIds)
          .eq('account_id', accountId)

        const negocios = historyRows.map((h) => {
          const d = deals?.find((x) => x.id === h.deal_id)
          return {
            titulo: d?.title ?? '(negócio removido)',
            valor: d?.value ?? 0,
            contato: (d?.contact as { name?: string } | null)?.name,
            data: h.entered_at,
          }
        })
        const total = negocios.reduce((sum, d) => sum + (Number(d.valor) || 0), 0)
        return JSON.stringify({ total_valor: total, quantidade: negocios.length, negocios, fonte: 'entrada_na_etapa' })
      }

      // Fallback for accounts whose pipeline has no stage tagged with
      // this fixed_role — same approximation as before (deals.updated_at).
      const { data } = await db
        .from('deals')
        .select('title, value, updated_at, contact:contacts(name)')
        .eq('account_id', accountId)
        .eq('status', status)
        .gte('updated_at', `${dataInicio}T00:00:00Z`)
        .lt('updated_at', dataFimExclusive)
        .order('updated_at', { ascending: false })
        .limit(50)

      if (!data?.length) return `Nenhum negócio ${status === 'won' ? 'ganho' : 'perdido'} nesse período.`
      const total = data.reduce((sum, d) => sum + (Number(d.value) || 0), 0)
      return JSON.stringify({ total_valor: total, quantidade: data.length, negocios: data, fonte: 'ultima_atualizacao_aproximada' })
    }

    default:
      return 'Ferramenta desconhecida.'
  }
}

export async function runCopilotTurn(accountId: string, history: CopilotMessage[]): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY não configurada')
  }

  const db = supabaseAdmin()
  const { data: account } = await db.from('accounts').select('name').eq('id', accountId).maybeSingle()

  const systemPrompt = buildSystemPrompt(account?.name ?? 'a clínica')
  const tools = buildTools()
  const client = anthropicClient()

  const messages: Anthropic.MessageParam[] = history
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content }))

  let finalText = ''

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      tools,
      messages,
      // No output_config.effort here — it 400s on Haiku 4.5 (effort is
      // Opus/Sonnet-5-tier only). Revisit if MODEL changes.
    })

    messages.push({ role: 'assistant', content: response.content })

    const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text')
    if (textBlocks.length) finalText = textBlocks.map((b) => b.text).join('\n').trim()

    const toolUseBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    if (response.stop_reason !== 'tool_use' || toolUseBlocks.length === 0) break

    const toolResults: Anthropic.ToolResultBlockParam[] = []
    for (const call of toolUseBlocks) {
      const result = await executeTool(db, accountId, call.name, call.input)
      toolResults.push({ type: 'tool_result', tool_use_id: call.id, content: result })
    }
    messages.push({ role: 'user', content: toolResults })
  }

  return finalText || 'Não consegui gerar uma resposta — tenta reformular a pergunta.'
}
