"use client"

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { formatCurrency } from '@/lib/currency'
import {
  MessageSquare,
  UserPlus,
  DollarSign,
  Send,
  Loader2,
  Megaphone,
  MousePointerClick,
  Users,
  Briefcase,
  Trophy,
  Copy,
  Check,
} from 'lucide-react'

import {
  loadActivity,
  loadConversationsSeries,
  loadMetrics,
  loadPipelineDonut,
  loadResponseTime,
} from '@/lib/dashboard/queries'
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

type RangeDays = 7 | 30 | 90

// ── Campaign stats ────────────────────────────────────────────

interface CampaignStat {
  id: string
  name: string
  code: string
  utm_source: string | null
  click_count: number
  leads_total: number
  deals_total: number
  deals_won: number
  revenue_won: number
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

function fmtBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function convRate(won: number, total: number) {
  if (total === 0) return '—'
  return `${Math.round((won / total) * 100)}%`
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
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
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
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">{s.click_count.toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">{s.leads_total.toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">{s.deals_total.toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <span className={cn('font-medium', s.deals_won > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>
                      {s.deals_won.toLocaleString('pt-BR')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground hidden md:table-cell">
                    {convRate(s.deals_won, s.deals_total)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums hidden lg:table-cell">
                    <span className={cn('font-medium', Number(s.revenue_won) > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>
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

// ── Main page ─────────────────────────────────────────────────

export default function DashboardPage() {
  const { defaultCurrency } = useAuth()
  const [metrics, setMetrics] = useState<MetricsBundle | null>(null)
  const [metricsLoading, setMetricsLoading] = useState(true)

  const [range, setRange] = useState<RangeDays>(30)
  const [series, setSeries] = useState<Record<RangeDays, ConversationsSeriesPoint[] | null>>({
    7: null,
    30: null,
    90: null,
  })
  const [seriesLoading, setSeriesLoading] = useState(true)

  const [pipeline, setPipeline] = useState<PipelineDonutData | null>(null)
  const [pipelineLoading, setPipelineLoading] = useState(true)

  const [responseTime, setResponseTime] = useState<ResponseTimeSummary | null>(null)
  const [responseTimeLoading, setResponseTimeLoading] = useState(true)

  const [activity, setActivity] = useState<ActivityItem[] | null>(null)
  const [activityLoading, setActivityLoading] = useState(true)

  const loadAll = useCallback(() => {
    const db = createClient()

    void loadMetrics(db)
      .then((m) => setMetrics(m))
      .catch((err) => console.error('[dashboard] metrics failed:', err))
      .finally(() => setMetricsLoading(false))

    void loadConversationsSeries(db, 30)
      .then((s) => setSeries((prev) => ({ ...prev, 30: s })))
      .catch((err) => console.error('[dashboard] series failed:', err))
      .finally(() => setSeriesLoading(false))

    void loadPipelineDonut(db)
      .then((p) => setPipeline(p))
      .catch((err) => console.error('[dashboard] pipeline failed:', err))
      .finally(() => setPipelineLoading(false))

    void loadResponseTime(db)
      .then((r) => setResponseTime(r))
      .catch((err) => console.error('[dashboard] response time failed:', err))
      .finally(() => setResponseTimeLoading(false))

    void loadActivity(db, 50)
      .then((a) => setActivity(a))
      .catch((err) => console.error('[dashboard] activity failed:', err))
      .finally(() => setActivityLoading(false))
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const handleRangeChange = useCallback(
    (r: RangeDays) => {
      setRange(r)
      if (series[r] !== null) return
      setSeriesLoading(true)
      const db = createClient()
      loadConversationsSeries(db, r)
        .then((s) => setSeries((prev) => ({ ...prev, [r]: s })))
        .catch((err) => console.error('[dashboard] series failed:', err))
        .finally(() => setSeriesLoading(false))
    },
    [series],
  )

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Análises em tempo real de conversas, contatos, negócios, disparos e automações.
        </p>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="bg-transparent h-10 gap-0 rounded-none px-0 border-b border-border w-full justify-start">
          {[
            { value: 'overview', label: 'Visão Geral' },
            { value: 'campanhas', label: 'Campanhas' },
          ].map(({ value, label }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="rounded-none h-10 px-4 text-sm font-medium text-muted-foreground whitespace-nowrap
                border-b-2 border-transparent
                data-[state=active]:border-primary data-[state=active]:text-primary
                hover:text-foreground transition-colors bg-transparent"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="mt-5 space-y-5">
          {/* Metric cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {metricsLoading || !metrics ? (
              Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
            ) : (
              <>
                <MetricCard
                  title="Conversas Ativas"
                  value={metrics.activeConversations.current.toLocaleString()}
                  icon={MessageSquare}
                  delta={{
                    sign: metrics.activeConversations.previous,
                    label: deltaLabel(metrics.activeConversations.previous, 'novas hoje vs ontem'),
                  }}
                />
                <MetricCard
                  title="Novos Contatos Hoje"
                  value={metrics.newContactsToday.current.toLocaleString()}
                  icon={UserPlus}
                  delta={{
                    sign: metrics.newContactsToday.current - metrics.newContactsToday.previous,
                    label: deltaLabel(
                      metrics.newContactsToday.current - metrics.newContactsToday.previous,
                      'vs ontem',
                    ),
                  }}
                />
                <MetricCard
                  title="Valor de Negócios Abertos"
                  value={formatCurrency(metrics.openDealsValue, defaultCurrency)}
                  icon={DollarSign}
                  subtitle={`${metrics.openDealsCount} negócio${metrics.openDealsCount === 1 ? '' : 's'} aberto${metrics.openDealsCount === 1 ? '' : 's'}`}
                />
                <MetricCard
                  title="Mensagens Enviadas Hoje"
                  value={metrics.messagesSentToday.current.toLocaleString()}
                  icon={Send}
                  delta={{
                    sign: metrics.messagesSentToday.current - metrics.messagesSentToday.previous,
                    label: deltaLabel(
                      metrics.messagesSentToday.current - metrics.messagesSentToday.previous,
                      'vs ontem',
                    ),
                  }}
                />
              </>
            )}
          </div>

          <QuickActions />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <div className="h-full lg:col-span-3">
              <ConversationsChart
                series={series}
                loading={seriesLoading}
                range={range}
                onRangeChange={handleRangeChange}
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

        <TabsContent value="campanhas" className="mt-5">
          <CampanhasTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function deltaLabel(delta: number, suffix: string): string {
  if (delta === 0) return `Sem variação ${suffix}`
  const sign = delta > 0 ? '+' : ''
  return `${sign}${delta.toLocaleString()} ${suffix}`
}
