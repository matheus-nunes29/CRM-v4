import type { SupabaseClient } from '@supabase/supabase-js'
import {
  dayKeysInRange,
  DOW_SHORT_MON_FIRST,
  daysAgoStart,
  localDayKey,
  mondayIndex,
  startOfLocalDay,
} from './date-utils'
import type {
  ActivityItem,
  ConversationsSeriesPoint,
  MetricsBundle,
  PipelineDonutData,
  PipelineStageSlice,
  ResponseTimeBucket,
  ResponseTimeSummary,
} from './types'

type DB = SupabaseClient

/** Inclusive local-day range: [start, end], both at local midnight. */
export interface DateRange {
  start: Date
  end: Date
}

export interface DashboardFilters {
  range: DateRange
  ownerId?: string
}

const DAY_MS = 86_400_000

/** Exclusive upper bound (start of the day *after* `end`), for `.lt()` filters. */
function exclusiveEnd(end: Date): Date {
  const out = startOfLocalDay(end)
  out.setDate(out.getDate() + 1)
  return out
}

// --- 1. Metric cards ---------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ow(q: any, field: string, ownerId?: string): any {
  return ownerId ? q.eq(field, ownerId) : q
}

export async function loadMetrics(db: DB, filters: DashboardFilters): Promise<MetricsBundle> {
  const ownerId = filters.ownerId
  const since = startOfLocalDay(filters.range.start)
  const until = exclusiveEnd(filters.range.end)
  const durationMs = until.getTime() - since.getTime()
  const prevSince = new Date(since.getTime() - durationMs)
  const sinceISO = since.toISOString()
  const untilISO = until.toISOString()
  const prevSinceISO = prevSince.toISOString()

  const [convCur, convPrev, contactCur, contactPrev, msgCur, msgPrev, openDeals] = await Promise.all([
    ow(db.from('conversations').select('id', { count: 'exact', head: true }).gte('created_at', sinceISO).lt('created_at', untilISO), 'user_id', ownerId),
    ow(db.from('conversations').select('id', { count: 'exact', head: true }).gte('created_at', prevSinceISO).lt('created_at', sinceISO), 'user_id', ownerId),
    ow(db.from('contacts').select('id', { count: 'exact', head: true }).gte('created_at', sinceISO).lt('created_at', untilISO), 'user_id', ownerId),
    ow(db.from('contacts').select('id', { count: 'exact', head: true }).gte('created_at', prevSinceISO).lt('created_at', sinceISO), 'user_id', ownerId),
    db.from('messages').select('id', { count: 'exact', head: true }).eq('sender_type', 'agent').gte('created_at', sinceISO).lt('created_at', untilISO),
    db.from('messages').select('id', { count: 'exact', head: true }).eq('sender_type', 'agent').gte('created_at', prevSinceISO).lt('created_at', sinceISO),
    ow(db.from('deals').select('value, status').eq('status', 'open'), 'assigned_to', ownerId),
  ])

  const openDealsRows = (openDeals.data ?? []) as { value: number | null }[]

  return {
    activeConversations: {
      current: convCur.count ?? 0,
      previous: convPrev.count ?? 0,
    },
    newContactsToday: {
      current: contactCur.count ?? 0,
      previous: contactPrev.count ?? 0,
    },
    openDealsValue: openDealsRows.reduce((sum, d) => sum + (d.value ?? 0), 0),
    openDealsCount: openDealsRows.length,
    messagesSentToday: {
      current: msgCur.count ?? 0,
      previous: msgPrev.count ?? 0,
    },
  }
}

// --- 2. Conversations over time ---------------------------------------

export async function loadConversationsSeries(
  db: DB,
  range: DateRange,
): Promise<ConversationsSeriesPoint[]> {
  const start = startOfLocalDay(range.start).toISOString()
  const until = exclusiveEnd(range.end).toISOString()
  const { data, error } = await db
    .from('messages')
    .select('created_at, sender_type')
    .gte('created_at', start)
    .lt('created_at', until)
    .order('created_at', { ascending: true })
  if (error) throw error

  const keys = dayKeysInRange(range.start, range.end)
  const buckets = new Map<string, { incoming: number; outgoing: number }>()
  for (const k of keys) buckets.set(k, { incoming: 0, outgoing: 0 })

  for (const row of (data ?? []) as { created_at: string; sender_type: string }[]) {
    const key = localDayKey(row.created_at)
    const bucket = buckets.get(key)
    if (!bucket) continue
    if (row.sender_type === 'customer') bucket.incoming += 1
    else bucket.outgoing += 1
  }

  return keys.map((day) => ({ day, ...(buckets.get(day) ?? { incoming: 0, outgoing: 0 }) }))
}

// --- 3. Pipeline donut -------------------------------------------------

export async function loadPipelineDonut(db: DB, ownerId?: string): Promise<PipelineDonutData> {
  let dealsQ = db.from('deals').select('stage_id, value, status').eq('status', 'open')
  if (ownerId) dealsQ = dealsQ.eq('assigned_to', ownerId)

  const [stagesRes, dealsRes] = await Promise.all([
    db.from('pipeline_stages').select('id, name, color, pipeline_id, position').order('position'),
    dealsQ,
  ])

  const stages =
    (stagesRes.data ?? []) as { id: string; name: string; color: string }[]
  const deals = (dealsRes.data ?? []) as { stage_id: string; value: number | null }[]

  const byStage = new Map<string, { count: number; total: number }>()
  for (const d of deals) {
    const row = byStage.get(d.stage_id) ?? { count: 0, total: 0 }
    row.count += 1
    row.total += d.value ?? 0
    byStage.set(d.stage_id, row)
  }

  const slices: PipelineStageSlice[] = stages
    .map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color || '#64748b',
      dealCount: byStage.get(s.id)?.count ?? 0,
      totalValue: byStage.get(s.id)?.total ?? 0,
    }))
    .filter((s) => s.totalValue > 0 || s.dealCount > 0)

  return {
    stages: slices,
    totalValue: slices.reduce((sum, s) => sum + s.totalValue, 0),
  }
}

// --- 4. Response time by day of week ----------------------------------

export async function loadResponseTime(db: DB): Promise<ResponseTimeSummary> {
  const fourteenDaysAgo = daysAgoStart(13).toISOString()
  const { data, error } = await db
    .from('messages')
    .select('conversation_id, sender_type, created_at')
    .gte('created_at', fourteenDaysAgo)
    .order('conversation_id', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error

  const rows = (data ?? []) as {
    conversation_id: string
    sender_type: string
    created_at: string
  }[]

  interface Sample {
    customerAt: Date
    responseAt: Date
  }
  const samples: Sample[] = []

  let currentConv = ''
  let pendingCustomer: Date | null = null
  for (const row of rows) {
    if (row.conversation_id !== currentConv) {
      currentConv = row.conversation_id
      pendingCustomer = null
    }
    const ts = new Date(row.created_at)
    if (row.sender_type === 'customer') {
      if (!pendingCustomer) pendingCustomer = ts
    } else if (pendingCustomer) {
      samples.push({ customerAt: pendingCustomer, responseAt: ts })
      pendingCustomer = null
    }
  }

  const now = new Date()
  const thisWeekStart = daysAgoStart(mondayIndex(now))
  const lastWeekStart = daysAgoStart(mondayIndex(now) + 7)

  const byDow = new Map<number, number[]>()
  for (let i = 0; i < 7; i++) byDow.set(i, [])
  const thisWeekMins: number[] = []
  const lastWeekMins: number[] = []

  for (const s of samples) {
    const diffMin = (s.responseAt.getTime() - s.customerAt.getTime()) / 60_000
    if (diffMin < 0) continue
    const dow = mondayIndex(s.customerAt)
    byDow.get(dow)!.push(diffMin)
    if (s.customerAt >= thisWeekStart) {
      thisWeekMins.push(diffMin)
    } else if (s.customerAt >= lastWeekStart && s.customerAt < thisWeekStart) {
      lastWeekMins.push(diffMin)
    }
  }

  const avg = (arr: number[]) =>
    arr.length === 0 ? null : arr.reduce((a, b) => a + b, 0) / arr.length

  const buckets: ResponseTimeBucket[] = Array.from({ length: 7 }, (_, dow) => {
    const samps = byDow.get(dow) ?? []
    return {
      dow,
      avgMinutes: avg(samps),
      samples: samps.length,
    }
  })

  void DOW_SHORT_MON_FIRST

  return {
    buckets,
    thisWeekAvg: avg(thisWeekMins),
    lastWeekAvg: avg(lastWeekMins),
  }
}

// --- 5. Activity feed --------------------------------------------------

export async function loadActivity(db: DB, limit = 20): Promise<ActivityItem[]> {
  const [msgs, contacts, deals, broadcasts, autoLogs] = await Promise.all([
    db
      .from('messages')
      .select('id, content_text, sender_type, created_at, conversation_id, conversations(contact_id, contacts(name, phone))')
      .eq('sender_type', 'customer')
      .order('created_at', { ascending: false })
      .limit(10),
    db
      .from('contacts')
      .select('id, name, phone, created_at')
      .order('created_at', { ascending: false })
      .limit(10),
    db
      .from('deals')
      .select('id, title, updated_at, stage:pipeline_stages(name)')
      .order('updated_at', { ascending: false })
      .limit(10),
    db
      .from('broadcasts')
      .select('id, name, status, total_recipients, created_at')
      .order('created_at', { ascending: false })
      .limit(5),
    db
      .from('automation_logs')
      .select('id, trigger_event, status, created_at, automation:automations(name), contact:contacts(name, phone)')
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const items: ActivityItem[] = []

  for (const m of (msgs.data ?? []) as unknown as Array<{
    id: string
    content_text: string | null
    created_at: string
    conversation_id: string
    conversations:
      | { contact_id: string | null; contacts: { name: string | null; phone: string }[] | { name: string | null; phone: string } | null }[]
      | { contact_id: string | null; contacts: { name: string | null; phone: string }[] | { name: string | null; phone: string } | null }
      | null
  }>) {
    const conv = Array.isArray(m.conversations) ? m.conversations[0] : m.conversations
    const contact = Array.isArray(conv?.contacts) ? conv?.contacts[0] : conv?.contacts
    const who = contact?.name || contact?.phone || 'Desconhecido'
    items.push({
      id: `msg-${m.id}`,
      kind: 'message',
      text: `Nova mensagem de ${who}`,
      at: m.created_at,
      href: `/inbox?c=${m.conversation_id}`,
    })
  }

  for (const c of (contacts.data ?? []) as Array<{ id: string; name: string | null; phone: string; created_at: string }>) {
    items.push({
      id: `contact-${c.id}`,
      kind: 'contact',
      text: `Novo contato: ${c.name || c.phone}`,
      at: c.created_at,
      href: '/contacts',
    })
  }

  for (const d of (deals.data ?? []) as unknown as Array<{
    id: string
    title: string
    updated_at: string
    stage: { name: string }[] | { name: string } | null
  }>) {
    const stage = Array.isArray(d.stage) ? d.stage[0] : d.stage
    items.push({
      id: `deal-${d.id}`,
      kind: 'deal',
      text: stage?.name
        ? `Negócio "${d.title}" em ${stage.name}`
        : `Negócio "${d.title}" atualizado`,
      at: d.updated_at,
      href: '/pipelines',
    })
  }

  const BROADCAST_STATUS_PT: Record<string, string> = {
    draft: 'rascunho',
    scheduled: 'agendado',
    sending: 'enviando',
    failed: 'falhou',
  }

  for (const b of (broadcasts.data ?? []) as Array<{
    id: string
    name: string
    status: string
    total_recipients: number
    created_at: string
  }>) {
    const label =
      b.status === 'sent'
        ? `enviado para ${b.total_recipients} contatos`
        : `${BROADCAST_STATUS_PT[b.status] ?? b.status} (${b.total_recipients} destinatários)`
    items.push({
      id: `broadcast-${b.id}`,
      kind: 'broadcast',
      text: `Disparo "${b.name}" ${label}`,
      at: b.created_at,
      href: '/broadcasts',
    })
  }

  for (const l of (autoLogs.data ?? []) as unknown as Array<{
    id: string
    trigger_event: string
    status: string
    created_at: string
    automation: { name: string }[] | { name: string } | null
    contact: { name: string | null; phone: string }[] | { name: string | null; phone: string } | null
  }>) {
    const automation = Array.isArray(l.automation) ? l.automation[0] : l.automation
    const contact = Array.isArray(l.contact) ? l.contact[0] : l.contact
    const who = contact?.name || contact?.phone || 'um contato'
    const autoName = automation?.name || 'Automação'
    items.push({
      id: `auto-${l.id}`,
      kind: 'automation',
      text: `Automação "${autoName}" ${l.status === 'failed' ? 'falhou para' : 'disparada para'} ${who}`,
      at: l.created_at,
    })
  }

  return items
    .sort((a, b) => (a.at > b.at ? -1 : a.at < b.at ? 1 : 0))
    .slice(0, limit)
}
