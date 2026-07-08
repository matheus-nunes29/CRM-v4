import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type Period = '7d' | '30d' | '90d' | 'all'

function periodBounds(period: Period): { start: Date; duration: number } {
  const now = new Date()
  if (period === 'all') return { start: new Date(0), duration: now.getTime() }
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90
  const start = new Date(now.getTime() - days * 86_400_000)
  return { start, duration: days * 86_400_000 }
}

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

  const accountId = profile.account_id as string
  const url = new URL(req.url)
  const pipelineId = url.searchParams.get('pipeline_id')
  const period = (url.searchParams.get('period') ?? '30d') as Period

  // ── Return pipeline list when no pipeline selected ──────────────────────
  if (!pipelineId) {
    const { data: pipelines } = await supabase
      .from('pipelines')
      .select('id, name')
      .eq('account_id', accountId)
      .order('created_at', { ascending: true })
    return NextResponse.json({ pipelines: pipelines ?? [] })
  }

  const { start: periodStart, duration: periodDuration } = periodBounds(period)
  const prevStart = new Date(periodStart.getTime() - periodDuration)

  // ── Parallel data fetches ────────────────────────────────────────────────
  const [
    stagesRes, dealsRes, historyRes, stalledHistRes,
    lossReasonsRes, prevDealsRes, openDealsAllRes,
  ] = await Promise.all([
    supabase
      .from('pipeline_stages')
      .select('id, name, color, position')
      .eq('pipeline_id', pipelineId)
      .order('position', { ascending: true }),

    supabase
      .from('deals')
      .select('id, stage_id, status, value, assigned_to, loss_reason_id, assignee:profiles!deals_assigned_to_fkey(full_name)')
      .eq('pipeline_id', pipelineId)
      .eq('account_id', accountId)
      .gte('created_at', period === 'all' ? '2000-01-01' : periodStart.toISOString()),

    supabase
      .from('deal_stage_history')
      .select('stage_id, entered_at, exited_at')
      .eq('pipeline_id', pipelineId)
      .eq('account_id', accountId)
      .gte('entered_at', period === 'all' ? '2000-01-01' : periodStart.toISOString()),

    supabase
      .from('deal_stage_history')
      .select('deal_id, stage_id, entered_at')
      .eq('pipeline_id', pipelineId)
      .eq('account_id', accountId)
      .is('exited_at', null),

    supabase
      .from('loss_reasons')
      .select('id, label')
      .eq('account_id', accountId),

    supabase
      .from('deals')
      .select('id, status, value')
      .eq('pipeline_id', pipelineId)
      .eq('account_id', accountId)
      .gte('created_at', period === 'all' ? '2000-01-01' : prevStart.toISOString())
      .lt('created_at', period === 'all' ? '2100-01-01' : periodStart.toISOString()),

    supabase
      .from('deals')
      .select('id, title, stage_id, value, currency, updated_at, contact:contacts(name)')
      .eq('pipeline_id', pipelineId)
      .eq('account_id', accountId)
      .eq('status', 'open'),
  ])

  const stages   = stagesRes.data ?? []
  const deals    = (dealsRes.data ?? []) as Array<{
    id: string; stage_id: string; status: string; value: number
    assigned_to: string | null; loss_reason_id: string | null
    assignee: { full_name: string | null } | { full_name: string | null }[] | null
  }>
  const history      = historyRes.data ?? []
  const stalledHist  = (stalledHistRes.data ?? []) as Array<{ deal_id: string; stage_id: string; entered_at: string }>
  const lossReasons  = lossReasonsRes.data ?? []
  const prevDeals    = (prevDealsRes.data ?? []) as Array<{ id: string; status: string; value: number }>
  const openDealsAll = (openDealsAllRes.data ?? []) as Array<{
    id: string; title: string; stage_id: string; value: number
    currency: string; updated_at: string
    contact: { name: string | null } | { name: string | null }[] | null
  }>

  const stageMap = new Map(stages.map(s => [s.id, s]))

  // ── Per-stage deal counts ────────────────────────────────────────────────
  type StageStat = { open: number; open_value: number; won: number; lost: number; won_value: number; lost_value: number }
  const stageStats = new Map<string, StageStat>()
  stages.forEach(s => stageStats.set(s.id, { open: 0, open_value: 0, won: 0, lost: 0, won_value: 0, lost_value: 0 }))

  for (const d of deals) {
    const stat = stageStats.get(d.stage_id)
    if (!stat) continue
    const v = d.value ?? 0
    if (d.status === 'open')  { stat.open++;  stat.open_value  += v }
    if (d.status === 'won')   { stat.won++;   stat.won_value   += v }
    if (d.status === 'lost')  { stat.lost++;  stat.lost_value  += v }
  }

  // ── Stage avg time from history ──────────────────────────────────────────
  const stageTimes = new Map<string, number[]>()
  for (const row of history) {
    const ms = (row.exited_at ? new Date(row.exited_at).getTime() : Date.now()) - new Date(row.entered_at).getTime()
    const days = ms / 86_400_000
    if (!stageTimes.has(row.stage_id)) stageTimes.set(row.stage_id, [])
    stageTimes.get(row.stage_id)!.push(days)
  }
  const stageAvgDays = new Map<string, number>()
  for (const [stageId, times] of stageTimes) {
    stageAvgDays.set(stageId, times.reduce((a, b) => a + b, 0) / times.length)
  }

  // ── Funnel stages ────────────────────────────────────────────────────────
  const funnel = stages.map(s => {
    const stat = stageStats.get(s.id) ?? { open: 0, open_value: 0, won: 0, lost: 0, won_value: 0, lost_value: 0 }
    return {
      stage_id:       s.id,
      stage_name:     s.name,
      stage_color:    s.color,
      position:       s.position,
      open_count:     stat.open,
      open_value:     stat.open_value,
      avg_days:       stageAvgDays.get(s.id) ?? null,
      won_from_stage: stat.won,
      lost_from_stage: stat.lost,
      won_value:      stat.won_value,
      lost_value:     stat.lost_value,
    }
  })

  // ── Summary ──────────────────────────────────────────────────────────────
  const wonDeals  = deals.filter(d => d.status === 'won')
  const lostDeals = deals.filter(d => d.status === 'lost')
  const openDeals = deals.filter(d => d.status === 'open')
  const totalWon  = wonDeals.length
  const totalLost = lostDeals.length
  const wonValue  = wonDeals.reduce((s, d) => s + (d.value ?? 0), 0)
  const lostValue = lostDeals.reduce((s, d) => s + (d.value ?? 0), 0)
  const openValue = openDeals.reduce((s, d) => s + (d.value ?? 0), 0)
  const winRate   = (totalWon + totalLost) > 0 ? totalWon / (totalWon + totalLost) : 0

  const prevWon   = prevDeals.filter(d => d.status === 'won').length
  const prevLost  = prevDeals.filter(d => d.status === 'lost').length
  const prevWinRate = (prevWon + prevLost) > 0 ? prevWon / (prevWon + prevLost) : null

  const summary = {
    total_created:  deals.length,
    total_open:     openDeals.length,
    total_won:      totalWon,
    total_lost:     totalLost,
    win_rate:       winRate,
    won_value:      wonValue,
    lost_value:     lostValue,
    open_value:     openValue,
    prev_win_rate:  prevWinRate,
    prev_won_count: prevWon,
    delta_win_rate: prevWinRate !== null ? winRate - prevWinRate : null,
  }

  // ── Loss reasons ─────────────────────────────────────────────────────────
  const lrMap = new Map(lossReasons.map(lr => [lr.id, lr.label]))
  const lrStats = new Map<string, { label: string; count: number; value: number }>()
  for (const d of lostDeals) {
    const key   = d.loss_reason_id ?? '__none__'
    const label = d.loss_reason_id ? (lrMap.get(d.loss_reason_id) ?? 'Desconhecido') : 'Sem motivo informado'
    const stat  = lrStats.get(key) ?? { label, count: 0, value: 0 }
    stat.count++
    stat.value += d.value ?? 0
    lrStats.set(key, stat)
  }
  const loss_reasons_data = [...lrStats.entries()]
    .map(([id, s]) => ({ id, label: s.label, count: s.count, value: s.value }))
    .sort((a, b) => b.count - a.count)

  // ── Stalled deals ────────────────────────────────────────────────────────
  const stalledMap = new Map(stalledHist.map(r => [r.deal_id, r.entered_at]))
  const stalled_deals = openDealsAll
    .map(d => {
      const refDate  = stalledMap.get(d.id) ?? d.updated_at
      const days     = Math.floor((Date.now() - new Date(refDate).getTime()) / 86_400_000)
      const stage    = stageMap.get(d.stage_id)
      const contactRaw = d.contact
      const contact    = Array.isArray(contactRaw) ? (contactRaw[0] ?? null) : contactRaw
      return {
        id:           d.id,
        title:        d.title,
        stage_name:   stage?.name ?? '—',
        stage_color:  stage?.color ?? '#6b7280',
        days_stalled: days,
        value:        d.value ?? 0,
        currency:     d.currency ?? 'BRL',
        contact_name: contact?.name ?? null,
      }
    })
    .sort((a, b) => b.days_stalled - a.days_stalled)
    .slice(0, 10)

  // ── Assignee performance ─────────────────────────────────────────────────
  type AssigneeStat = { full_name: string; won: number; lost: number; won_value: number }
  const aStats = new Map<string, AssigneeStat>()
  for (const d of deals) {
    if (!d.assigned_to) continue
    const raw  = d.assignee
    const name = Array.isArray(raw) ? raw[0]?.full_name : (raw as { full_name: string | null } | null)?.full_name
    if (!name) continue
    const stat = aStats.get(d.assigned_to) ?? { full_name: name, won: 0, lost: 0, won_value: 0 }
    if (d.status === 'won')  { stat.won++;  stat.won_value += d.value ?? 0 }
    if (d.status === 'lost')   stat.lost++
    aStats.set(d.assigned_to, stat)
  }
  const assignees = [...aStats.entries()]
    .map(([id, s]) => ({
      id,
      full_name: s.full_name,
      won:       s.won,
      lost:      s.lost,
      win_rate:  (s.won + s.lost) > 0 ? s.won / (s.won + s.lost) : 0,
      won_value: s.won_value,
    }))
    .sort((a, b) => b.won - a.won)

  return NextResponse.json({
    pipeline:     { id: pipelineId },
    period,
    period_start: periodStart.toISOString(),
    funnel,
    summary,
    loss_reasons: loss_reasons_data,
    stalled_deals,
    assignees,
  })
}
