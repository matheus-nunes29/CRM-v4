import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', user.id)
    .single()
  if (!profile?.account_id) return NextResponse.json({ error: 'No account' }, { status: 400 })

  const accountId = profile.account_id

  const url = new URL(req.url)
  const from = url.searchParams.get('from')   // ISO date e.g. "2024-01-01"
  const to   = url.searchParams.get('to')     // ISO date e.g. "2024-12-31"

  // ── 1. Conversations ──────────────────────────────────────────────────
  let convQuery = supabase
    .from('conversations')
    .select('*')
    .eq('contact_id', supabase.from('contacts').select('id').eq('account_id', accountId))

  // Fetch conversations for this account via contacts join
  const { data: convRaw } = await supabase
    .from('conversations')
    .select('*, contacts!inner(account_id)')
    .eq('contacts.account_id', accountId)
    .order('created_at', { ascending: false })

  // filter by date if provided
  let conversations = (convRaw ?? []) as Record<string, unknown>[]
  if (from) conversations = conversations.filter((c) => (c.created_at as string) >= from)
  if (to)   conversations = conversations.filter((c) => (c.created_at as string) <= to + 'T23:59:59Z')

  if (conversations.length === 0) {
    return NextResponse.json([], {
      headers: {
        'Content-Disposition': `attachment; filename="conversas_${new Date().toISOString().slice(0, 10)}.json"`,
        'Content-Type': 'application/json; charset=utf-8',
      },
    })
  }

  const convIds = conversations.map((c) => c.id as string)

  // ── 2. Messages for all conversations ────────────────────────────────
  const { data: messagesRaw } = await supabase
    .from('messages')
    .select('*')
    .in('conversation_id', convIds)
    .order('created_at', { ascending: true })

  const messagesByConv = new Map<string, Record<string, unknown>[]>()
  for (const msg of messagesRaw ?? []) {
    const m = msg as Record<string, unknown>
    const cid = m.conversation_id as string
    if (!messagesByConv.has(cid)) messagesByConv.set(cid, [])
    messagesByConv.get(cid)!.push(m)
  }

  // ── 3. Profiles map (agents) ──────────────────────────────────────────
  const { data: profilesRaw } = await supabase
    .from('profiles')
    .select('id, user_id, full_name, email')
    .eq('account_id', accountId)

  const profileById = new Map<string, { full_name: string; email: string }>()
  const profileByUserId = new Map<string, { full_name: string; email: string }>()
  for (const p of profilesRaw ?? []) {
    const pr = p as { id: string; user_id: string; full_name: string; email: string }
    profileById.set(pr.id, { full_name: pr.full_name, email: pr.email })
    profileByUserId.set(pr.user_id, { full_name: pr.full_name, email: pr.email })
  }

  // ── 4. Contacts for this account ──────────────────────────────────────
  const contactIds = [...new Set(conversations.map((c) => c.contact_id as string))]
  const { data: contactsRaw } = await supabase
    .from('contacts')
    .select('*')
    .in('id', contactIds)

  const contactMap = new Map<string, Record<string, unknown>>()
  for (const c of contactsRaw ?? []) contactMap.set((c as Record<string, unknown>).id as string, c as Record<string, unknown>)

  // ── 5. Deals (latest open deal per contact, fall back to most recent) ─
  const { data: dealsRaw } = await supabase
    .from('deals')
    .select('*')
    .eq('account_id', accountId)
    .in('contact_id', contactIds)
    .order('created_at', { ascending: false })

  // Keep latest deal per contact
  const dealByContact = new Map<string, Record<string, unknown>>()
  for (const d of dealsRaw ?? []) {
    const deal = d as Record<string, unknown>
    const cid = deal.contact_id as string
    if (!dealByContact.has(cid)) dealByContact.set(cid, deal)
  }

  // ── 6. Pipeline stages & pipelines ───────────────────────────────────
  const { data: stagesRaw } = await supabase
    .from('pipeline_stages')
    .select('id, name, pipeline_id')
    .eq('account_id', accountId)

  const stageMap = new Map<string, { name: string; pipeline_id: string }>()
  for (const s of stagesRaw ?? []) {
    const stage = s as { id: string; name: string; pipeline_id: string }
    stageMap.set(stage.id, { name: stage.name, pipeline_id: stage.pipeline_id })
  }

  const { data: pipelinesRaw } = await supabase
    .from('pipelines')
    .select('id, name')
    .eq('account_id', accountId)

  const pipelineMap = new Map<string, string>()
  for (const p of pipelinesRaw ?? []) {
    const pl = p as { id: string; name: string }
    pipelineMap.set(pl.id, pl.name)
  }

  // ── 7. Assemble output ────────────────────────────────────────────────
  const output = conversations.map((conv) => {
    const contact = contactMap.get(conv.contact_id as string) ?? {}
    const deal    = dealByContact.get(conv.contact_id as string)
    const agent   = (conv.assigned_agent_id
      ? profileById.get(conv.assigned_agent_id as string)
      : null) ?? null

    const stage    = deal ? stageMap.get(deal.stage_id as string) ?? null : null
    const pipeline = stage ? pipelineMap.get(stage.pipeline_id) ?? null : null

    const messages = (messagesByConv.get(conv.id as string) ?? []).map((msg) => {
      // Resolve agent name for messages sent by an agent
      let senderName: string | null = null
      if (msg.sender_type === 'agent' || msg.sender_type === 'bot') {
        const p = msg.sender_id
          ? profileById.get(msg.sender_id as string) ?? profileByUserId.get(msg.sender_id as string)
          : null
        senderName = p?.full_name ?? p?.email ?? 'Agente'
      } else {
        senderName = (contact.name as string) ?? (contact.phone as string) ?? 'Cliente'
      }

      return {
        id:           msg.id,
        enviada_em:   msg.created_at,
        remetente:    msg.sender_type,           // 'customer' | 'agent' | 'bot'
        remetente_nome: senderName,
        tipo:         msg.content_type,
        texto:        msg.content_text ?? null,
        midia_url:    msg.media_url ?? null,
        status:       msg.status,
        resposta_a:   msg.reply_to_message_id ?? null,
      }
    })

    return {
      conversa_id:         conv.id,
      status:              conv.status,
      criada_em:           conv.created_at,
      ultima_mensagem_em:  conv.last_message_at ?? null,
      total_mensagens:     messages.length,

      contato: {
        id:      contact.id ?? null,
        nome:    contact.name ?? null,
        telefone: contact.phone ?? null,
        email:   contact.email ?? null,
        empresa: contact.company ?? null,
        origem: {
          utm_source:   contact.utm_source   ?? null,
          utm_medium:   contact.utm_medium   ?? null,
          utm_campaign: contact.utm_campaign ?? null,
          utm_content:  contact.utm_content  ?? null,
          utm_term:     contact.utm_term     ?? null,
          gclid:        contact.gclid        ?? null,
        },
      },

      atendente: agent
        ? { nome: agent.full_name ?? null, email: agent.email ?? null }
        : null,

      negocio: deal
        ? {
            id:                      deal.id,
            titulo:                  deal.title,
            valor:                   deal.value ?? null,
            moeda:                   deal.currency ?? null,
            status:                  deal.status,
            etapa:                   stage?.name ?? null,
            pipeline:                pipeline ?? null,
            data_fechamento_prevista: deal.expected_close_date ?? null,
            criado_em:               deal.created_at,
          }
        : null,

      mensagens: messages,
    }
  })

  return new NextResponse(JSON.stringify(output, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="conversas_${new Date().toISOString().slice(0, 10)}.json"`,
    },
  })
}
