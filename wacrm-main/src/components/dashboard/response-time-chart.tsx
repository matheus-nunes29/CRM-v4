"use client"

import { Clock } from 'lucide-react'
import { DOW_SHORT_MON_FIRST } from '@/lib/dashboard/date-utils'
import type { ResponseTimeSummary } from '@/lib/dashboard/types'
import { BarChart } from '@/components/tremor/bar-chart'
import { EmptyState } from './empty-state'
import { Skeleton } from './skeleton'

interface ResponseTimeChartProps {
  data: ResponseTimeSummary | null
  loading: boolean
  thresholdMinutes?: number
}

const CATEGORY = 'Média de minutos'

// Nice round step for a given max value (in minutes)
function niceStep(max: number): number {
  if (max <= 5) return 1
  if (max <= 15) return 3
  if (max <= 30) return 5
  if (max <= 60) return 10
  if (max <= 120) return 20
  if (max <= 240) return 30
  return 60
}

export function ResponseTimeChart({
  data,
  loading,
  thresholdMinutes = 5,
}: ResponseTimeChartProps) {
  const hasData = data?.buckets.some((b) => b.avgMinutes != null) ?? false

  const chartData =
    data?.buckets.map((b, i) => ({
      day: DOW_SHORT_MON_FIRST[i],
      [CATEGORY]: b.avgMinutes ?? 0,
      samples: b.samples,
    })) ?? []

  // Recharts v3 doesn't resolve "auto" domain via the Redux store context in
  // the vendored Tremor BarChart, causing all ticks to land at 0. We compute
  // explicit ticks so both domain and labels are always correct.
  const dataMax = chartData.reduce(
    (m, row) => Math.max(m, (row[CATEGORY] as number) ?? 0),
    0,
  )
  const step = niceStep(dataMax > 0 ? dataMax : 10)
  const tickCount = Math.ceil((dataMax > 0 ? dataMax : 10) / step) + 1
  const yTicks = Array.from({ length: tickCount }, (_, i) => i * step)
  const yMax = yTicks[yTicks.length - 1]

  const axisLabel = (mins: number): string => `${Math.round(mins)}min`

  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Tempo Médio de Primeira Resposta
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Minutos para responder à primeira mensagem sem resposta do cliente, por
            dia da semana
          </p>
        </div>
        <div className="flex items-center gap-3 text-right text-xs">
          {thresholdMinutes > 0 && (
            <span className="rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 font-medium text-rose-300 tabular-nums">
              meta {thresholdMinutes}min
            </span>
          )}
          {data && (data.thisWeekAvg != null || data.lastWeekAvg != null) && (
            <div>
              <div className="text-muted-foreground">
                Esta semana:{' '}
                <span className="font-medium text-foreground tabular-nums">
                  {fmtHeader(data.thisWeekAvg)}
                </span>
              </div>
              <div className="text-muted-foreground">
                Semana passada:{' '}
                <span className="tabular-nums">{fmtHeader(data.lastWeekAvg)}</span>
              </div>
            </div>
          )}
        </div>
      </header>

      <div className="p-5">
        {loading || !data ? (
          <Skeleton className="h-[260px] w-full" />
        ) : !hasData ? (
          <EmptyState
            icon={Clock}
            title="Nenhuma resposta registrada ainda"
            hint="Este gráfico é preenchido conforme você responde às mensagens dos clientes."
          />
        ) : (
          <BarChart
            data={chartData}
            index="day"
            categories={[CATEGORY]}
            colors={['emerald']}
            valueFormatter={axisLabel}
            maxValue={yMax}
            yAxisTicks={yTicks}
            showLegend={false}
            yAxisWidth={56}
            className="h-[260px]"
          />
        )}
      </div>
    </section>
  )
}

// Header summary: human-friendly mixed units (1s, 28min, 1.9h)
function fmtHeader(mins: number | null): string {
  if (mins == null) return '—'
  if (mins < 1) return `${Math.max(1, Math.round(mins * 60))}s`
  if (mins < 60) return `${mins.toFixed(1)}min`
  return `${(mins / 60).toFixed(1)}h`
}
