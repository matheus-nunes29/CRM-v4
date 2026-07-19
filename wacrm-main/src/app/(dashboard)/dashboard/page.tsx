"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { formatCurrency } from '@/lib/currency'
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Briefcase,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  DollarSign,
  ExternalLink,
  Megaphone,
  MessageSquare,
  MousePointerClick,
  Send,
  SlidersHorizontal,
  Trophy,
  TrendingUp,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react'

import {
  loadActivity,
  loadConversationsSeries,
  loadMetrics,
  loadPipelineDonut,
  loadResponseTime,
  type DateRange,
} from '@/lib/dashboard/queries'
import {
  addMonths,
  endOfMonthOrToday,
  isSameMonth,
  localDayKey,
  startOfMonth,
} from '@/lib/dashboard/date-utils'
import type {
  ActivityItem,
  ConversationsSeriesPoint,
  MetricsBundle,
  PipelineDonutData,
  ResponseTimeSummary,
} from '@/lib/dashboard/types'

import { MetricCard } from '@/components/dashboard/metric-card'
import { SkeletonCard } from '@/components/dashboard/skeleton'
import { QuickActions } from '@/components/dashboard/quick-actions'
import { ConversationsChart } from '@/components/dashboard/conversations-chart'
import { PipelineDonut } from '@/components/dashboard/pipeline-donut'
import { ResponseTimeChart } from '@/components/dashboard/response-time-chart'
import { ActivityFeed } from '@/components/dashboard/activity-feed'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────

interface Member { user_id: string; full_name: string; avatar_url: string | null }

interface FunnelStage {
  stage_id: string
  stage_name: string
  stage_color: string | null
  open_count: number
  avg_days: number | null
  won_from_stage: number
  lost_from_stage: number
}
interface FunnelSummary {
  total_created: number; total_open: number; total_won: number; total_lost: number
  win_rate: number; won_value: number; lost_value: number; open_value: number
  delta_win_rate: number | null; prev_win_rate: number | null
}
interface FunnelData { funnel: FunnelStage[]; summary: FunnelSummary }
interface FunnelPipeline { id: string; name: string }

// ── Helpers ────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function fmtBRL(v: number, currency = 'BRL') {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(v)
}
function convRate(won: number, total: number) {
  if (total === 0) return '—'
  return `${Math.round((won / total) * 100)}%`
}
function deltaLabel(delta: number, suffix: string): string {
  if (delta === 0) return `Sem variação ${suffix}`
  return `${delta > 0 ? '+' : ''}${delta.toLocaleString('pt-BR')} ${suffix}`
}
function fmtDays(d: number | null) {
  if (d === null) return '—'
  return d < 1 ? '< 1d' : `${Math.round(d)}d`
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) return null
  const pct = Math.round(delta * 100)
  if (pct === 0) return <span className="text-xs text-muted-foreground">sem variação</span>
  const up = pct > 0
  return (
    <span className={cn('flex items-center gap-0.5 text-xs font-medium', up ? 'text-emerald-400' : 'text-rose-400')}>
      {up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
      {Math.abs(pct)}pp vs anterior
    </span>
  )
}

// ── Campaign stats (unchanged) ────────────────────────────────

interface CampaignStat {
  id: string; name: string; code: string; utm_source: string | null
  click_count: number; leads_total: number; deals_total: number
  deals_won: number; revenue_won: number
}

function StatCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: React.ElementType }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="size-3.5" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="text-xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  )
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className="ml-1 inline-flex items-center justify-center rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
      title="Copiar link"
    >
      {copied ? <Check className="size-3 text-green-500" /> : <Copy className="size-3" />}
    </button>
  )
}

function CampanhasTab() {
  const supabase = createClient()
  const [stats, setStats] = useState<CampaignStat[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.rpc('campaign_stats').then(({ data, error }) => {
      if (!error && data) setStats(data as CampaignStat[])
      setLoading(false)
    })
  }, [supabase])

  const totals = stats.reduce(
    (acc, s) => ({
      clicks: acc.clicks + s.click_count,
      leads: acc.leads + s.leads_total,
      deals: acc.deals + s.deals_total,
      won: acc.won + s.deals_won,
      revenue: acc.revenue + Number(s.revenue_won),
    }),
    { clicks: 0, leads: 0, deals: 0, won: 0, revenue: 0 },
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="size-5 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    )
  }

  if (stats.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-20 text-center">
        <Megaphone className="size-8 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">Nenhuma campanha criada ainda.</p>
        <p className="text-xs text-muted-foreground">Crie links rastreáveis em Configurações → Links de campanha.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Cliques totais" value={totals.clicks.toLocaleString('pt-BR')} icon={MousePointerClick} />
        <StatCard label="Leads gerados" value={totals.leads.toLocaleString('pt-BR')} icon={Users} />
        <StatCard label="Negócios abertos" value={totals.deals.toLocaleString('pt-BR')} icon={Briefcase} />
        <StatCard label="Receita ganha" value={fmtBRL(totals.revenue)} icon={Trophy} />
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Campanha</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Cliques</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Leads</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Negócios</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Ganhos</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground hidden md:table-cell">Conversão</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground hidden lg:table-cell">Receita</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s, i) => {
              const link = typeof window !== 'undefined' ? `${window.location.origin}/r/${s.code}` : `/r/${s.code}`
              return (
                <tr key={s.id} className={cn('border-b border-border last:border-0', i % 2 !== 0 && 'bg-muted/20')}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground truncate max-w-[200px]">{s.name}</p>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-0.5 mt-0.5">
                      /r/{s.code}
                      <CopyBtn text={link} />
                      {s.utm_source && (
                        <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">{s.utm_source}</span>
                      )}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{s.click_count.toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{s.leads_total.toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{s.deals_total.toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <span className={cn('font-medium', s.deals_won > 0 ? 'text-emerald-400' : 'text-muted-foreground')}>
                      {s.deals_won.toLocaleString('pt-BR')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground hidden md:table-cell">
                    {convRate(s.deals_won, s.deals_total)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums hidden lg:table-cell">
                    <span className={cn('font-medium', Number(s.revenue_won) > 0 ? 'text-emerald-400' : 'text-muted-foreground')}>
                      {fmtBRL(Number(s.revenue_won))}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Mini funnel section ────────────────────────────────────────

function MiniFunnelSection({ funnelPipelines, funnelPipelineId, setFunnelPipelineId, funnelData, funnelLoading }: {
  funnelPipelines: FunnelPipeline[]
  funnelPipelineId: string | null
  setFunnelPipelineId: (id: string) => void
  funnelData: FunnelData | null
  funnelLoading: boolean
}) {
  const barsRef = useRef<HTMLDivElement>(null)
  const [animated, setAnimated] = useState(false)
  useEffect(() => {
    setAnimated(false)
    const t = setTimeout(() => setAnimated(true), 100)
    return () => clearTimeout(t)
  }, [funnelData])

  const summary = funnelData?.summary
  const funnel = funnelData?.funnel ?? []
  const maxOpen = Math.max(...funnel.map(s => s.open_count), 1)
  const firstCount = funnel[0]?.open_count ?? 1

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">Funil de Vendas</h2>
        </div>
        <div className="flex items-center gap-3">
          {funnelPipelines.length > 1 && (
            <div className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5">
              <select
                value={funnelPipelineId ?? ''}
                onChange={e => setFunnelPipelineId(e.target.value)}
                className="bg-transparent text-xs font-medium text-foreground focus:outline-none"
              >
                {funnelPipelines.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}
          <Link
            href="/funil"
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-primary transition-colors"
          >
            Ver completo <ExternalLink className="size-3" />
          </Link>
        </div>
      </div>

      {funnelLoading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
          Carregando...
        </div>
      ) : !summary ? (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
          <TrendingUp className="size-8 text-muted-foreground/30" />
          <p className="text-xs text-muted-foreground">Nenhuma pipeline selecionada.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5 lg:flex-row lg:gap-8">
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 gap-3 lg:w-56 lg:shrink-0 lg:grid-cols-1">
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-[11px] text-muted-foreground">Taxa de vitória</p>
              <p className="mt-0.5 text-xl font-bold">{Math.round(summary.win_rate * 100)}%</p>
              <DeltaBadge delta={summary.delta_win_rate} />
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-[11px] text-muted-foreground">Valor ganho</p>
              <p className="mt-0.5 text-xl font-bold text-emerald-400">{fmtBRL(summary.won_value)}</p>
              <p className="text-[11px] text-muted-foreground">{summary.total_won} negócios</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-[11px] text-muted-foreground">Criados no período</p>
              <p className="mt-0.5 text-xl font-bold">{summary.total_created}</p>
              <p className="text-[11px] text-muted-foreground">{summary.total_open} em aberto</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-[11px] text-muted-foreground">Valor perdido</p>
              <p className="mt-0.5 text-xl font-bold text-rose-400">{fmtBRL(summary.lost_value)}</p>
              <p className="text-[11px] text-muted-foreground">{summary.total_lost} negócios</p>
            </div>
          </div>

          {/* Funnel bars */}
          <div ref={barsRef} className="flex flex-1 flex-col gap-2.5">
            {funnel.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">Sem dados para o período.</p>
            ) : funnel.map((stage, i) => {
              const pct = (stage.open_count / maxOpen) * 100
              const conversion = firstCount > 0 ? Math.round((stage.open_count / firstCount) * 100) : 0
              const color = stage.stage_color ?? '#6b7280'
              return (
                <div key={stage.stage_id} className="flex items-center gap-3">
                  <div className="flex flex-1 flex-col gap-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium">{stage.stage_name}</span>
                      <div className="flex shrink-0 items-center gap-2 text-xs">
                        {i > 0 && (
                          <span className="text-muted-foreground tabular-nums">{conversion}%</span>
                        )}
                        <span className="font-semibold tabular-nums">{stage.open_count}</span>
                      </div>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-border/40">
                      <div
                        className="h-full rounded-full"
                        style={{
                          background: color,
                          width: `${pct}%`,
                          transform: animated ? 'scaleX(1)' : 'scaleX(0)',
                          transformOrigin: 'left',
                          transition: animated
                            ? `transform 600ms cubic-bezier(0.4,0,0.2,1) ${i * 70}ms`
                            : 'none',
                        }}
                      />
                    </div>
                  </div>
                  <div className="hidden w-28 shrink-0 items-center justify-end gap-2 text-[11px] text-muted-foreground sm:flex">
                    <span title="Tempo médio"><Clock className="mr-0.5 inline size-3" />{fmtDays(stage.avg_days)}</span>
                    <span className="text-emerald-400" title="Ganhos"><Trophy className="inline size-3" />{stage.won_from_stage}</span>
                    <span className="text-rose-400" title="Perdidos"><XCircle className="inline size-3" />{stage.lost_from_stage}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────

export default function DashboardPage() {
  const { defaultCurrency } = useAuth()

  // ── Filters ──
  // Default: current month, month-to-date. Users can page to a previous
  // month (capped at the current one — no data exists for the future) or
  // switch to an arbitrary custom range.
  const [rangeMode, setRangeMode] = useState<'month' | 'custom'>('month')
  const [monthCursor, setMonthCursor] = useState<Date>(() => startOfMonth(new Date()))
  const [customStart, setCustomStart] = useState<string>('')
  const [customEnd, setCustomEnd] = useState<string>('')
  const [ownerId, setOwnerId] = useState<string>('')
  const [members, setMembers] = useState<Member[]>([])

  const range: DateRange = useMemo(() => {
    if (rangeMode === 'custom' && customStart && customEnd) {
      return { start: new Date(`${customStart}T00:00:00`), end: new Date(`${customEnd}T00:00:00`) }
    }
    return { start: monthCursor, end: endOfMonthOrToday(monthCursor) }
  }, [rangeMode, monthCursor, customStart, customEnd])

  // ── Overview data ──
  const [metrics, setMetrics] = useState<MetricsBundle | null>(null)
  const [metricsLoading, setMetricsLoading] = useState(true)
  const [series, setSeries] = useState<ConversationsSeriesPoint[] | null>(null)
  const [seriesLoading, setSeriesLoading] = useState(true)
  const [pipeline, setPipelineDonut] = useState<PipelineDonutData | null>(null)
  const [pipelineLoading, setPipelineLoading] = useState(true)
  const [responseTime, setResponseTime] = useState<ResponseTimeSummary | null>(null)
  const [responseTimeLoading, setResponseTimeLoading] = useState(true)
  const [activity, setActivity] = useState<ActivityItem[] | null>(null)
  const [activityLoading, setActivityLoading] = useState(true)

  // ── Funnel data ──
  const [funnelPipelines, setFunnelPipelines] = useState<FunnelPipeline[]>([])
  const [funnelPipelineId, setFunnelPipelineId] = useState<string | null>(null)
  const [funnelData, setFunnelData] = useState<FunnelData | null>(null)
  const [funnelLoading, setFunnelLoading] = useState(false)

  // ── Load members once ──
  useEffect(() => {
    fetch('/api/account/members')
      .then(r => r.json())
      .then(j => setMembers((j.members ?? []) as Member[]))
      .catch(() => {})
  }, [])

  // ── Load funnel pipelines once ──
  useEffect(() => {
    fetch('/api/reports/pipeline-funnel')
      .then(r => r.json())
      .then(j => {
        if (j.pipelines?.length) {
          setFunnelPipelines(j.pipelines)
          setFunnelPipelineId(j.pipelines[0].id)
        }
      })
      .catch(() => {})
  }, [])

  // ── Load funnel when pipeline or range changes ──
  useEffect(() => {
    if (!funnelPipelineId) return
    setFunnelLoading(true)
    setFunnelData(null)
    const start = localDayKey(range.start)
    const end = localDayKey(range.end)
    fetch(`/api/reports/pipeline-funnel?pipeline_id=${funnelPipelineId}&start=${start}&end=${end}`)
      .then(r => r.json())
      .then(j => { setFunnelData(j); setFunnelLoading(false) })
      .catch(() => setFunnelLoading(false))
  }, [funnelPipelineId, range])

  // ── Load metrics/charts when filters change ──
  const loadAll = useCallback(() => {
    const db = createClient()
    const filters = { range, ownerId: ownerId || undefined }

    setMetricsLoading(true)
    setSeriesLoading(true)
    setPipelineLoading(true)
    setResponseTimeLoading(true)
    setActivityLoading(true)

    void loadMetrics(db, filters)
      .then(m => setMetrics(m))
      .catch(err => console.error('[dashboard] metrics:', err))
      .finally(() => setMetricsLoading(false))

    void loadConversationsSeries(db, range)
      .then(s => setSeries(s))
      .catch(err => console.error('[dashboard] series:', err))
      .finally(() => setSeriesLoading(false))

    void loadPipelineDonut(db, ownerId || undefined)
      .then(p => setPipelineDonut(p))
      .catch(err => console.error('[dashboard] donut:', err))
      .finally(() => setPipelineLoading(false))

    void loadResponseTime(db)
      .then(r => setResponseTime(r))
      .catch(err => console.error('[dashboard] response time:', err))
      .finally(() => setResponseTimeLoading(false))

    void loadActivity(db, 50)
      .then(a => setActivity(a))
      .catch(err => console.error('[dashboard] activity:', err))
      .finally(() => setActivityLoading(false))
  }, [range, ownerId])

  useEffect(() => { loadAll() }, [loadAll])

  // ── Metric card titles adapt to the selected range ──
  const periodLabel = rangeMode === 'month'
    ? capitalize(monthCursor.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }))
    : `${range.start.toLocaleDateString('pt-BR')} – ${range.end.toLocaleDateString('pt-BR')}`
  const vsLabel = `vs. período anterior`

  return (
    <div className="space-y-5">
      {/* ── Header + filters ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Visão geral de conversas, contatos, negócios e funil de vendas.
          </p>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Month navigator / custom range */}
          {rangeMode === 'month' ? (
            <div className="flex items-center gap-1 rounded-lg border border-border bg-card px-1 py-1">
              <button
                type="button"
                onClick={() => setMonthCursor(m => addMonths(m, -1))}
                aria-label="Mês anterior"
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ChevronLeft className="size-4" />
              </button>
              <span className="min-w-[128px] text-center text-xs font-medium text-foreground capitalize">
                {monthCursor.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
              </span>
              <button
                type="button"
                onClick={() => setMonthCursor(m => addMonths(m, 1))}
                disabled={isSameMonth(monthCursor, new Date())}
                aria-label="Próximo mês"
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5">
              <input
                type="date"
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
                aria-label="Data inicial"
                className="bg-transparent text-xs font-medium text-foreground focus:outline-none [color-scheme:light] dark:[color-scheme:dark]"
              />
              <span className="text-xs text-muted-foreground">até</span>
              <input
                type="date"
                value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
                aria-label="Data final"
                className="bg-transparent text-xs font-medium text-foreground focus:outline-none [color-scheme:light] dark:[color-scheme:dark]"
              />
            </div>
          )}

          <button
            type="button"
            onClick={() => setRangeMode(m => m === 'month' ? 'custom' : 'month')}
            className={cn(
              'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
              rangeMode === 'custom'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-card text-muted-foreground hover:text-foreground',
            )}
          >
            <SlidersHorizontal className="size-3.5" />
            Personalizado
          </button>

          {/* Owner select */}
          {members.length > 0 && (
            <div className="relative flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5">
              <Users className="size-3.5 shrink-0 text-muted-foreground" />
              <select
                value={ownerId}
                onChange={e => setOwnerId(e.target.value)}
                className="appearance-none bg-transparent pr-5 text-xs font-medium text-foreground focus:outline-none"
              >
                <option value="">Toda equipe</option>
                {members.map(m => (
                  <option key={m.user_id} value={m.user_id}>{m.full_name || m.user_id}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 size-3 text-muted-foreground" />
            </div>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <Tabs defaultValue="overview">
        <TabsList className="h-10 w-full justify-start gap-0 rounded-none border-b border-border bg-transparent px-0">
          {[
            { value: 'overview', label: 'Visão Geral' },
            { value: 'funil', label: 'Funil de Vendas' },
            { value: 'campanhas', label: 'Campanhas' },
          ].map(({ value, label }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="h-10 rounded-none border-b-2 border-transparent bg-transparent px-4 text-sm font-medium text-muted-foreground whitespace-nowrap
                data-[state=active]:border-primary data-[state=active]:text-primary
                hover:text-foreground transition-colors"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ── Overview ── */}
        <TabsContent value="overview" className="mt-5 space-y-5">
          {/* KPI cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {metricsLoading || !metrics ? (
              Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
            ) : (
              <>
                <MetricCard
                  title={`Conversas (${periodLabel})`}
                  value={metrics.activeConversations.current.toLocaleString('pt-BR')}
                  icon={MessageSquare}
                  delta={{
                    sign: metrics.activeConversations.current - metrics.activeConversations.previous,
                    label: deltaLabel(metrics.activeConversations.current - metrics.activeConversations.previous, vsLabel),
                  }}
                />
                <MetricCard
                  title={`Contatos (${periodLabel})`}
                  value={metrics.newContactsToday.current.toLocaleString('pt-BR')}
                  icon={UserPlus}
                  delta={{
                    sign: metrics.newContactsToday.current - metrics.newContactsToday.previous,
                    label: deltaLabel(metrics.newContactsToday.current - metrics.newContactsToday.previous, vsLabel),
                  }}
                />
                <MetricCard
                  title="Negócios em aberto"
                  value={formatCurrency(metrics.openDealsValue, defaultCurrency)}
                  icon={DollarSign}
                  subtitle={`${metrics.openDealsCount} negócio${metrics.openDealsCount === 1 ? '' : 's'}`}
                />
                <MetricCard
                  title={`Mensagens enviadas (${periodLabel})`}
                  value={metrics.messagesSentToday.current.toLocaleString('pt-BR')}
                  icon={Send}
                  delta={{
                    sign: metrics.messagesSentToday.current - metrics.messagesSentToday.previous,
                    label: deltaLabel(metrics.messagesSentToday.current - metrics.messagesSentToday.previous, vsLabel),
                  }}
                />
              </>
            )}
          </div>

          <QuickActions />

          {/* Conversations chart + Pipeline donut */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <div className="h-full lg:col-span-3">
              <ConversationsChart
                series={series}
                loading={seriesLoading}
              />
            </div>
            <div className="h-full lg:col-span-2">
              <PipelineDonut
                data={pipeline}
                loading={pipelineLoading}
                currency={defaultCurrency}
              />
            </div>
          </div>

          <ResponseTimeChart data={responseTime} loading={responseTimeLoading} />
          <ActivityFeed items={activity} loading={activityLoading} />
        </TabsContent>

        {/* ── Funil ── */}
        <TabsContent value="funil" className="mt-5">
          <MiniFunnelSection
            funnelPipelines={funnelPipelines}
            funnelPipelineId={funnelPipelineId}
            setFunnelPipelineId={setFunnelPipelineId}
            funnelData={funnelData}
            funnelLoading={funnelLoading}
          />
        </TabsContent>

        {/* ── Campanhas ── */}
        <TabsContent value="campanhas" className="mt-5">
          <CampanhasTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
