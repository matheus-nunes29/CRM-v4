'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  ArrowDown,
  ArrowUp,
  Clock,
  Minus,
  TrendingUp,
  Trophy,
  Users,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type Period = '7d' | '30d' | '90d' | 'all'

interface Pipeline { id: string; name: string }

interface FunnelStage {
  stage_id: string
  stage_name: string
  stage_color: string | null
  position: number
  open_count: number
  open_value: number
  avg_days: number | null
  won_from_stage: number
  lost_from_stage: number
  won_value: number
  lost_value: number
}

interface Summary {
  total_created: number
  total_open: number
  total_won: number
  total_lost: number
  win_rate: number
  won_value: number
  lost_value: number
  open_value: number
  prev_win_rate: number | null
  prev_won_count: number
  delta_win_rate: number | null
}

interface LossReason {
  id: string
  label: string
  count: number
  value: number
}

interface StalledDeal {
  id: string
  title: string
  stage_name: string
  stage_color: string
  days_stalled: number
  value: number
  currency: string
  contact_name: string | null
}

interface Assignee {
  id: string
  full_name: string
  won: number
  lost: number
  win_rate: number
  won_value: number
}

interface FunnelData {
  funnel: FunnelStage[]
  summary: Summary
  loss_reasons: LossReason[]
  stalled_deals: StalledDeal[]
  assignees: Assignee[]
}

function fmt(v: number, currency = 'BRL') {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(v)
}

function fmtDays(d: number | null) {
  if (d === null) return '—'
  if (d < 1) return '< 1d'
  return `${Math.round(d)}d`
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) return null
  const pct = Math.round(delta * 100)
  if (pct === 0) return <span className="text-xs text-muted-foreground">0%</span>
  const up = pct > 0
  return (
    <span className={cn('flex items-center gap-0.5 text-xs font-medium', up ? 'text-emerald-400' : 'text-rose-400')}>
      {up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
      {Math.abs(pct)}%
    </span>
  )
}

function StallBadge({ days }: { days: number }) {
  const cls =
    days >= 14
      ? 'bg-rose-500/15 text-rose-400'
      : days >= 7
        ? 'bg-amber-500/15 text-amber-400'
        : 'bg-muted text-muted-foreground'
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', cls)}>
      <Clock className="size-3" />
      {days}d
    </span>
  )
}

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: '90d', label: '90 dias' },
  { value: 'all', label: 'Todos' },
]

export default function FunilPage() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [selectedPipeline, setSelectedPipeline] = useState<string | null>(null)
  const [period, setPeriod] = useState<Period>('30d')
  const [data, setData] = useState<FunnelData | null>(null)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  // Load pipelines on mount
  useEffect(() => {
    ;(async () => {
      const res = await fetch('/api/reports/pipeline-funnel')
      const json = await res.json()
      if (json.pipelines?.length) {
        setPipelines(json.pipelines)
        setSelectedPipeline(json.pipelines[0].id)
      }
    })()
  }, [])

  // Load funnel data when pipeline or period changes
  useEffect(() => {
    if (!selectedPipeline) return
    setLoading(true)
    fetch(`/api/reports/pipeline-funnel?pipeline_id=${selectedPipeline}&period=${period}`)
      .then(r => r.json())
      .then(json => { setData(json); setLoading(false) })
      .catch(() => setLoading(false))
  }, [selectedPipeline, period])

  const funnel = data?.funnel ?? []
  const summary = data?.summary
  const maxOpen = Math.max(...funnel.map(s => s.open_count), 1)

  // Animated bars
  const barsRef = useRef<HTMLDivElement>(null)
  const [animated, setAnimated] = useState(false)
  useEffect(() => {
    setAnimated(false)
    const t = setTimeout(() => setAnimated(true), 80)
    return () => clearTimeout(t)
  }, [data])

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      {/* Header + selectors */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="size-5 text-primary" />
          <h1 className="text-lg font-semibold">Funil de Vendas</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Pipeline selector */}
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5">
            <select
              value={selectedPipeline ?? ''}
              onChange={e => setSelectedPipeline(e.target.value)}
              className="bg-transparent text-sm font-medium text-foreground focus:outline-none"
            >
              {pipelines.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Period pills */}
          <div className="flex rounded-lg border border-border bg-card p-0.5">
            {PERIOD_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setPeriod(opt.value)}
                className={cn(
                  'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                  period === opt.value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
          Carregando...
        </div>
      )}

      {!loading && data && (
        <>
          {/* KPI cards */}
          {summary && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">Taxa de vitória</p>
                <div className="mt-1 flex items-end gap-2">
                  <span className="text-2xl font-bold">{Math.round(summary.win_rate * 100)}%</span>
                  <DeltaBadge delta={summary.delta_win_rate} />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {summary.total_won} ganhos · {summary.total_lost} perdidos
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">Valor ganho</p>
                <p className="mt-1 text-2xl font-bold text-emerald-400">{fmt(summary.won_value)}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {summary.total_won} negócio{summary.total_won !== 1 ? 's' : ''}
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">Valor perdido</p>
                <p className="mt-1 text-2xl font-bold text-rose-400">{fmt(summary.lost_value)}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {summary.total_lost} negócio{summary.total_lost !== 1 ? 's' : ''}
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">Em aberto</p>
                <p className="mt-1 text-2xl font-bold">{fmt(summary.open_value)}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {summary.total_open} negócio{summary.total_open !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
          )}

          {/* Funnel chart + stage table */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold">Funil por etapa</h2>

            {funnel.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Nenhum dado para o período selecionado.</p>
            ) : (
              <div ref={barsRef} className="flex flex-col gap-3">
                {funnel.map((stage, i) => {
                  const pct = (stage.open_count / maxOpen) * 100
                  const color = stage.stage_color ?? '#6b7280'
                  return (
                    <div key={stage.stage_id} className="flex items-center gap-3">
                      {/* Bar + label */}
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-medium" title={stage.stage_name}>
                            {stage.stage_name}
                          </span>
                          <span className="shrink-0 text-xs font-semibold tabular-nums">
                            {stage.open_count}
                          </span>
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
                                ? `transform 600ms cubic-bezier(0.4,0,0.2,1) ${i * 80}ms`
                                : 'none',
                            }}
                          />
                        </div>
                      </div>

                      {/* Meta */}
                      <div className="hidden w-40 shrink-0 items-center justify-end gap-3 text-xs text-muted-foreground sm:flex">
                        <span title="Tempo médio nesta etapa">
                          <Clock className="mr-0.5 inline size-3" />{fmtDays(stage.avg_days)}
                        </span>
                        <span className="text-emerald-400" title="Ganhos desta etapa">
                          <Trophy className="mr-0.5 inline size-3" />{stage.won_from_stage}
                        </span>
                        <span className="text-rose-400" title="Perdidos desta etapa">
                          <XCircle className="mr-0.5 inline size-3" />{stage.lost_from_stage}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Bottom grid: loss reasons + stalled + assignees */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Loss reasons */}
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-4 text-sm font-semibold">Motivos de perda</h2>
              {data.loss_reasons.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">Nenhum negócio perdido no período.</p>
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {data.loss_reasons.map(lr => {
                    const pct = Math.round((lr.count / (summary?.total_lost || 1)) * 100)
                    return (
                      <li key={lr.id}>
                        <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                          <span className="truncate font-medium" title={lr.label}>{lr.label}</span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">{lr.count} ({pct}%)</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/40">
                          <div
                            className="h-full rounded-full bg-rose-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {/* Stalled deals */}
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-4 text-sm font-semibold">Negócios parados</h2>
              {data.stalled_deals.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">Nenhum negócio em aberto.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {data.stalled_deals.slice(0, 8).map(d => (
                    <li key={d.id} className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-muted/30 transition-colors">
                      <div
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: d.stage_color }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{d.title}</p>
                        <p className="truncate text-[10px] text-muted-foreground">{d.stage_name}{d.contact_name ? ` · ${d.contact_name}` : ''}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <StallBadge days={d.days_stalled} />
                        {d.value > 0 && (
                          <p className="mt-0.5 text-[10px] text-muted-foreground tabular-nums">{fmt(d.value, d.currency)}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Assignee performance */}
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-4 text-sm font-semibold">Performance por responsável</h2>
              {data.assignees.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">Nenhum dado de responsáveis no período.</p>
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {data.assignees.slice(0, 8).map(a => (
                    <li key={a.id} className="flex items-center gap-3">
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                        {a.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{a.full_name}</p>
                        <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-border/40">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${Math.round(a.win_rate * 100)}%` }}
                          />
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xs font-semibold tabular-nums">{Math.round(a.win_rate * 100)}%</p>
                        <p className="text-[10px] text-muted-foreground tabular-nums">
                          {a.won}G · {a.lost}P
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}

      {!loading && !data && pipelines.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <TrendingUp className="size-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Nenhuma pipeline encontrada.<br />Crie uma pipeline para visualizar o funil.</p>
        </div>
      )}
    </div>
  )
}
