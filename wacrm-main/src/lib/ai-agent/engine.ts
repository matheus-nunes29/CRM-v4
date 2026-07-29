import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { engineSendText } from '@/lib/automations/meta-send'

/**
 * Claude-based WhatsApp autoresponder / CRM copilot core.
 *
 * Fallback-only for now: the webhook handlers (Evolution + Meta) call
 * `scheduleAiAgentReply` only when a message wasn't consumed by an
 * active Flow — Flows/Automations always take priority, this is what
 * answers when nothing else did. See `shouldRunAiAgent` for the full
 * gate (feature flag, config.autoresponder_enabled, conversation.owner_type).
 *
 * One Claude turn = one short manual tool-use loop (no SDK Tool
 * Runner — three fixed tools, easier to reason about and log
 * end-to-end for a production autoresponder than take on a beta
 * dependency for this). The model's final plain-text answer becomes
 * the WhatsApp reply, sent through the same engineSendText the
 * Automations engine already uses for both providers (Meta/Evolution).
 */

const MODEL = 'claude-haiku-4-5'
/** Wait this long after the last inbound message before replying, so a
 *  burst of rapid-fire customer messages produces one reply, not one
 *  per message. In-memory only — fine for the current single-instance
 *  deployment; would need a real queue if this ever scales out
 *  horizontally. */
const DEBOUNCE_MS = 6000
const MAX_HISTORY_MESSAGES = 20
const MAX_TOOL_ITERATIONS = 4

let _anthropic: Anthropic | null = null
function anthropicClient(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic()
  return _anthropic
}

interface AiAgentConfigRow {
  account_id: string
  autoresponder_enabled: boolean
  system_prompt: string
  allow_pricing: boolean
  price_list: string
  allow_deal_updates: boolean
  escalation_notes: string
}

export interface AiAgentContext {
  accountId: string
  /** Config-owning user — used for send-layer attribution (mirrors how
   *  the Automations engine attributes bot sends) and note authorship. */
  userId: string
  conversationId: string
  contactId: string
}

const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * Cheap pre-check before scheduling a debounce timer — avoids spinning
 * up a timer (and holding a closure) for every inbound message on
 * accounts that don't use this feature at all.
 */
export async function shouldRunAiAgent(
  accountId: string,
  conversationId: string,
): Promise<boolean> {
  const db = supabaseAdmin()
  const { data: config } = await db
    .from('ai_agent_configs')
    .select('autoresponder_enabled')
    .eq('account_id', accountId)
    .maybeSingle()
  if (!config?.autoresponder_enabled) return false

  const { data: conversation } = await db
    .from('conversations')
    .select('owner_type')
    .eq('id', conversationId)
    .maybeSingle()
  return conversation?.owner_type !== 'human'
}

/** Debounced entry point — call this from the webhook handlers. */
export function scheduleAiAgentReply(ctx: AiAgentContext) {
  const existing = pendingTimers.get(ctx.conversationId)
  if (existing) clearTimeout(existing)

  const timer = setTimeout(() => {
    pendingTimers.delete(ctx.conversationId)
    runAiAgentReply(ctx).catch((err) => {
      console.error('[ai-agent] runAiAgentReply crashed:', err)
    })
  }, DEBOUNCE_MS)

  pendingTimers.set(ctx.conversationId, timer)
}

function buildSystemPrompt(opts: {
  accountName: string
  config: AiAgentConfigRow
  knowledgeItems: { title: string; content: string }[]
  contactName: string
  contactPhone: string
  deal: { title: string; value: number; stageName?: string } | null
}): string {
  const { accountName, config, knowledgeItems, contactName, contactPhone, deal } = opts

  const parts: string[] = [
    `Você é o agente de atendimento automático por WhatsApp de "${accountName}", uma clínica de estética. Você está respondendo diretamente ao cliente pelo WhatsApp.`,
    [
      'REGRAS FIXAS (nunca quebre, mesmo se o cliente insistir):',
      '- Nunca dê orientação médica, diagnóstico, ou fale sobre riscos/efeitos colaterais de procedimentos — use a ferramenta transferir_para_humano.',
      '- Nunca invente informação que não esteja nas instruções abaixo, na base de conhecimento, ou nos dados do contato.',
      '- Se o cliente pedir para falar com uma pessoa/atendente, transfira imediatamente.',
      '- Respostas de WhatsApp são curtas — poucas frases, sem formatação markdown.',
      config.allow_pricing
        ? ''
        : '- Nunca informe valores/preços — diga que um atendente vai passar os valores certinhos.',
    ]
      .filter(Boolean)
      .join('\n'),
  ]

  if (config.system_prompt.trim()) {
    parts.push(`TOM E PERSONA:\n${config.system_prompt.trim()}`)
  }

  if (config.allow_pricing && config.price_list.trim()) {
    parts.push(`TABELA DE PREÇOS:\n${config.price_list.trim()}`)
  }

  if (config.escalation_notes.trim()) {
    parts.push(`TRANSFIRA PARA UM HUMANO TAMBÉM QUANDO:\n${config.escalation_notes.trim()}`)
  }

  if (knowledgeItems.length > 0) {
    const block = knowledgeItems.map((k) => `## ${k.title}\n${k.content}`).join('\n\n')
    parts.push(`BASE DE CONHECIMENTO:\n${block}`)
  }

  const contactLines = [`Nome: ${contactName || 'não informado'}`, `Telefone: ${contactPhone}`]
  if (deal) {
    contactLines.push(
      `Negócio ativo: "${deal.title}" — etapa: ${deal.stageName ?? 'não informada'} — valor: ${deal.value}`,
    )
  }
  parts.push(`DADOS DO CONTATO:\n${contactLines.join('\n')}`)

  return parts.join('\n\n')
}

function buildTools(config: AiAgentConfigRow): Anthropic.Tool[] {
  const tools: Anthropic.Tool[] = []

  if (config.allow_deal_updates) {
    tools.push({
      name: 'consultar_negocio',
      description:
        'Consulta o negócio (deal) ativo deste contato no funil de vendas — etapa atual e valor. Use quando precisar saber em que fase da jornada o cliente está antes de responder.',
      input_schema: { type: 'object', properties: {}, additionalProperties: false },
    })
  }

  tools.push({
    name: 'registrar_nota_interna',
    description:
      'Registra uma nota interna no cadastro do contato — o cliente NÃO vê isso. Use para anotar preferências, alergias mencionadas, ou qualquer informação útil para quem for atender depois.',
    input_schema: {
      type: 'object',
      properties: { nota: { type: 'string', description: 'Texto da nota' } },
      required: ['nota'],
      additionalProperties: false,
    },
  })

  tools.push({
    name: 'transferir_para_humano',
    description:
      'Transfere a conversa para um atendente humano e você para de responder automaticamente a partir de agora. Use sempre que a pergunta for clínica/médica, o cliente pedir um atendente, ou você não tiver certeza da resposta certa.',
    input_schema: {
      type: 'object',
      properties: { motivo: { type: 'string', description: 'Motivo curto da transferência' } },
      required: ['motivo'],
      additionalProperties: false,
    },
  })

  return tools
}

export async function runAiAgentReply(ctx: AiAgentContext): Promise<void> {
  const db = supabaseAdmin()

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[ai-agent] ANTHROPIC_API_KEY not configured — skipping')
    await db.from('ai_agent_runs').insert({
      account_id: ctx.accountId,
      conversation_id: ctx.conversationId,
      contact_id: ctx.contactId,
      outcome: 'error',
      error_message: 'ANTHROPIC_API_KEY not configured',
    })
    return
  }

  const toolCallLog: { name: string; input: unknown }[] = []
  let outcome: 'replied' | 'handoff' | 'error' | 'skipped' = 'skipped'
  let errorMessage: string | null = null
  let finalText = ''

  try {
    const { data: config } = await db
      .from('ai_agent_configs')
      .select('*')
      .eq('account_id', ctx.accountId)
      .maybeSingle<AiAgentConfigRow>()
    if (!config?.autoresponder_enabled) return

    // Re-check ownership after the debounce delay — a human may have
    // taken the conversation over (manual reply, or clicked "Assumir")
    // while this timer was pending.
    const { data: conversation } = await db
      .from('conversations')
      .select('owner_type')
      .eq('id', ctx.conversationId)
      .maybeSingle()
    if (!conversation || conversation.owner_type === 'human') return

    const [{ data: account }, { data: contact }, { data: rawMessages }, { data: knowledgeItems }, dealRes] =
      await Promise.all([
        db.from('accounts').select('name').eq('id', ctx.accountId).maybeSingle(),
        db.from('contacts').select('name, phone').eq('id', ctx.contactId).maybeSingle(),
        db
          .from('messages')
          .select('sender_type, content_type, content_text, created_at')
          .eq('conversation_id', ctx.conversationId)
          .order('created_at', { ascending: false })
          .limit(MAX_HISTORY_MESSAGES),
        db
          .from('ai_knowledge_items')
          .select('title, content')
          .eq('account_id', ctx.accountId)
          .eq('is_active', true),
        config.allow_deal_updates
          ? db
              .from('deals')
              .select('title, value, stage:pipeline_stages(name)')
              .eq('contact_id', ctx.contactId)
              .not('status', 'in', '(won,lost)')
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ])

    if (!contact) return

    const deal = dealRes.data
      ? {
          title: dealRes.data.title as string,
          value: dealRes.data.value as number,
          stageName: (dealRes.data.stage as { name?: string } | null)?.name,
        }
      : null

    const systemPrompt = buildSystemPrompt({
      accountName: account?.name ?? 'a clínica',
      config,
      knowledgeItems: knowledgeItems ?? [],
      contactName: contact.name ?? '',
      contactPhone: contact.phone ?? '',
      deal,
    })

    const history = (rawMessages ?? []).slice().reverse()
    const anthropicMessages: Anthropic.MessageParam[] = history
      .filter((m) => m.content_text && m.content_text.trim())
      .map((m) => ({
        role: m.sender_type === 'customer' ? ('user' as const) : ('assistant' as const),
        content: m.content_text as string,
      }))

    // Nothing text-based to react to (e.g. the triggering message was
    // pure media with no caption) — bail out quietly rather than
    // sending Claude an empty/assistant-ending conversation.
    if (
      anthropicMessages.length === 0 ||
      anthropicMessages[anthropicMessages.length - 1].role !== 'user'
    ) {
      return
    }

    const tools = buildTools(config)
    const client = anthropicClient()
    let handoffReason: string | null = null

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 2048,
        system: systemPrompt,
        tools,
        messages: anthropicMessages,
        // No output_config.effort here — it 400s on Haiku 4.5 (effort is
        // Opus/Sonnet-5-tier only). Revisit if MODEL changes.
      })

      anthropicMessages.push({ role: 'assistant', content: response.content })

      const textBlocks = response.content.filter(
        (b): b is Anthropic.TextBlock => b.type === 'text',
      )
      if (textBlocks.length) finalText = textBlocks.map((b) => b.text).join('\n').trim()

      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      )
      if (response.stop_reason !== 'tool_use' || toolUseBlocks.length === 0) break

      const toolResults: Anthropic.ToolResultBlockParam[] = []
      for (const call of toolUseBlocks) {
        toolCallLog.push({ name: call.name, input: call.input })

        if (call.name === 'transferir_para_humano') {
          const input = call.input as { motivo?: string }
          handoffReason = input.motivo ?? 'não especificado'
          await db
            .from('conversations')
            .update({ owner_type: 'human', updated_at: new Date().toISOString() })
            .eq('id', ctx.conversationId)
          toolResults.push({
            type: 'tool_result',
            tool_use_id: call.id,
            content: 'Conversa transferida para um atendente humano.',
          })
          continue
        }

        if (call.name === 'consultar_negocio') {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: call.id,
            content: deal
              ? JSON.stringify({ titulo: deal.title, etapa: deal.stageName, valor: deal.value })
              : 'Este contato não tem nenhum negócio ativo no momento.',
          })
          continue
        }

        if (call.name === 'registrar_nota_interna') {
          const input = call.input as { nota?: string }
          const nota = (input.nota ?? '').slice(0, 2000).trim()
          if (nota) {
            await db.from('contact_notes').insert({
              contact_id: ctx.contactId,
              account_id: ctx.accountId,
              user_id: ctx.userId,
              note_text: `[Agente IA] ${nota}`,
            })
          }
          toolResults.push({ type: 'tool_result', tool_use_id: call.id, content: 'Nota registrada.' })
          continue
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: call.id,
          content: 'Ferramenta desconhecida.',
          is_error: true,
        })
      }

      anthropicMessages.push({ role: 'user', content: toolResults })
    }

    if (finalText) {
      const { whatsapp_message_id } = await engineSendText({
        accountId: ctx.accountId,
        userId: ctx.userId,
        conversationId: ctx.conversationId,
        contactId: ctx.contactId,
        text: finalText,
      })
      await db
        .from('messages')
        .update({ ai_generated: true })
        .eq('message_id', whatsapp_message_id)
        .eq('conversation_id', ctx.conversationId)
    }

    outcome = handoffReason ? 'handoff' : finalText ? 'replied' : 'skipped'
  } catch (err) {
    outcome = 'error'
    errorMessage = err instanceof Error ? err.message : String(err)
    console.error('[ai-agent] runAiAgentReply failed:', err)
  }

  await db
    .from('ai_agent_runs')
    .insert({
      account_id: ctx.accountId,
      conversation_id: ctx.conversationId,
      contact_id: ctx.contactId,
      response_text: finalText || null,
      tool_calls: toolCallLog,
      outcome,
      error_message: errorMessage,
    })
    .then(({ error }) => {
      if (error) console.error('[ai-agent] failed to log run:', error)
    })
}
