'use client'

import { use, useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { formatCurrency } from '@/lib/currency'
import {
  ArrowLeft, Briefcase, CalendarDays, CalendarPlus,
  Clock, Loader2, Pencil, Tag, Trash2, User, History,
} from 'lucide-react'
import type { Deal, PipelineStage } from '@/types'
import { Button } from '@/components/ui/button'
import { DealForm } from '@/components/pipelines/deal-form'
import { DealItemsPanel } from '@/components/pipelines/deal-items-panel'
import { DealCustomFieldsPanel } from '@/components/pipelines/deal-custom-fields-panel'
import { ScheduleEventModal, type CalendarEvent } from '@/components/calendar/schedule-event-modal'
import { cn } from '@/lib/utils'

interface Props {
  params: Promise<{ id: string }>
}

interface DealDetail extends Omit<Deal, 'contact' | 'stage' | 'assignee'> {
  contact?: { id: string; name: string | null; phone: string | null } | null
  stage?: { id: string; name: string } | null
  assignee?: { id: string; full_name: string | null } | null
  pipeline?: { id: string; name: string } | null
}

const STATUS_META = {
  open: { label: 'Em andamento', className: 'bg-primary/10 text-primary' },
  won:  { label: 'Ganho',        className: 'bg-emerald-600/10 text-emerald-600' },
  lost: { label: 'Perdido',      className: 'bg-rose-500/10 text-rose-500' },
} as const

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export default function DealDetailPage({ params }: Props) {
  const { id } = use(params)
  const router = useRouter()
  const supabase = createClient()
  const { defaultCurrency } = useAuth()

  const [deal, setDeal]     = useState<DealDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [liveValue, setLiveValue] = useState<number | null>(null)
  const [stages, setStages]   = useState<PipelineStage[]>([])
  const [formOpen, setFormOpen] = useState(false)

  const [events, setEvents]           = useState<CalendarEvent[]>([])
  const [eventsLoading, setEvLoad]    = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [deletingEvent, setDeleting]  = useState<string | null>(null)

  type StageHistoryRow = {
    id: string
    entered_at: string
    exited_at: string | null
    stage: { id: string; name: string; color: string } | null
  }
  const [stageHistory, setStageHistory] = useState<StageHistoryRow[]>([])

  const fetchDeal = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('deals')
      .select(`*, contact:contacts(id,name,phone), stage:pipeline_stages(id,name), assignee:profiles!deals_assigned_to_fkey(id,full_name), pipeline:pipelines(id,name)`)
      .eq('id', id)
      .single()

    if (data) {
      setDeal(data as DealDetail)
      if (data.pipeline_id) {
        const { data: s } = await supabase.from('pipeline_stages').select('*').eq('pipeline_id', data.pipeline_id).order('position', { ascending: true })
        setStages((s as PipelineStage[]) ?? [])
      }
      const { data: hist } = await supabase
        .from('deal_stage_history')
        .select('id, entered_at, exited_at, stage:pipeline_stages(id,name,color)')
        .eq('deal_id', id)
        .order('entered_at', { ascending: true })
      // Supabase returns nested one-to-one joins as arrays; unwrap stage
      const normalized = (hist ?? []).map((row: {
        id: string; entered_at: string; exited_at: string | null
        stage: { id: string; name: string; color: string }[] | { id: string; name: string; color: string } | null
      }) => ({
        ...row,
        stage: Array.isArray(row.stage) ? (row.stage[0] ?? null) : row.stage,
      })) as StageHistoryRow[]
      setStageHistory(normalized)
    }
    setLoading(false)
  }, [id, supabase])

  const loadEvents = useCallback(async () => {
    setEvLoad(true)
    const res = await fetch(`/api/calendar/events?deal_id=${id}`)
    if (res.ok) { const d = await res.json(); setEvents(d.events ?? []) }
    setEvLoad(false)
  }, [id])

  const deleteEvent = async (eventId: string) => {
    if (!confirm('Remover este agendamento?')) return
    setDeleting(eventId)
    await fetch(`/api/calendar/events/${eventId}`, { method: 'DELETE' })
    setEvents(prev => prev.filter(e => e.id !== eventId))
    setDeleting(null)
  }

  useEffect(() => { fetchDeal() }, [fetchDeal])
  useEffect(() => { loadEvents() }, [loadEvents])

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  if (!deal) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-muted-foreground">
        <Briefcase className="h-10 w-10 opacity-30" />
        <p className="text-sm">Negócio não encontrado.</p>
        <Button variant="ghost" size="sm" onClick={() => router.push('/negocios')}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Voltar
        </Button>
      </div>
    )
  }

  const statusMeta = STATUS_META[deal.status as keyof typeof STATUS_META] ?? STATUS_META.open
  const now = new Date()
  const upcoming = events.filter(e => new Date(e.end_at) >= now).sort((a, b) => a.start_at.localeCompare(b.start_at))
  const past     = events.filter(e => new Date(e.end_at) < now).sort((a, b) => b.start_at.localeCompare(a.start_at))

  return (
    <div className="mx-auto max-w-5xl animate-in fade-in-50 duration-200">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-5">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-1.5 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
        <Button size="sm" onClick={() => setFormOpen(true)} className="gap-1.5">
          <Pencil className="h-4 w-4" /> Editar
        </Button>
      </div>

      {/* Two-column layout */}
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">

        {/* ── Left column ── */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* Header card */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Briefcase className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-foreground">{deal.title ?? 'Negócio'}</h1>
                  {deal.pipeline?.name && <p className="text-sm text-muted-foreground">{deal.pipeline.name}</p>}
                </div>
              </div>
              <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium shrink-0', statusMeta.className)}>
                {statusMeta.label}
              </span>
            </div>
            {(() => {
              const displayValue = liveValue ?? deal.value
              return displayValue != null && displayValue > 0 ? (
                <p className="text-2xl font-bold text-foreground">
                  {formatCurrency(displayValue, deal.currency ?? defaultCurrency)}
                </p>
              ) : null
            })()}
          </div>

          {/* Info grid */}
          <div className="grid gap-3 sm:grid-cols-2">
            {deal.contact && (
              <InfoCard icon={<User className="h-4 w-4" />} label="Contato"
                value={deal.contact.name ?? deal.contact.phone ?? '—'}
                onClick={() => router.push(`/contacts/${deal.contact!.id}`)} />
            )}
            {deal.stage && (
              <InfoCard icon={<Tag className="h-4 w-4" />} label="Etapa" value={deal.stage.name} />
            )}
            {deal.assignee && (
              <InfoCard icon={<User className="h-4 w-4" />} label="Responsável" value={deal.assignee.full_name ?? '—'} />
            )}
            {deal.created_at && (
              <InfoCard icon={<CalendarDays className="h-4 w-4" />} label="Criado em"
                value={new Date(deal.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })} />
            )}
            {deal.expected_close_date && (
              <InfoCard icon={<CalendarDays className="h-4 w-4" />} label="Previsão de fechamento"
                value={new Date(deal.expected_close_date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })} />
            )}
          </div>

          {/* Notes */}
          {deal.notes && (
            <div className="rounded-xl border border-border bg-card p-4 space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Observações</p>
              <p className="whitespace-pre-wrap text-sm text-foreground">{deal.notes}</p>
            </div>
          )}

          {/* Items (products/services) */}
          <DealItemsPanel
            dealId={deal.id}
            currency={deal.currency ?? defaultCurrency}
            onValueChange={setLiveValue}
          />

          {/* Custom fields */}
          <DealCustomFieldsPanel dealId={deal.id} />

          {/* Stage history timeline */}
          {stageHistory.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-4">
                <History className="size-4 text-muted-foreground" />
                <p className="text-sm font-semibold text-foreground">Histórico de etapas</p>
              </div>
              <ol className="relative border-l border-border ml-2 space-y-0">
                {stageHistory.map((row, i) => {
                  const color = row.stage?.color ?? '#6b7280'
                  const isLast = i === stageHistory.length - 1
                  const durationMs = row.exited_at
                    ? new Date(row.exited_at).getTime() - new Date(row.entered_at).getTime()
                    : Date.now() - new Date(row.entered_at).getTime()
                  const durationDays = Math.floor(durationMs / 86_400_000)
                  const durationHours = Math.floor((durationMs % 86_400_000) / 3_600_000)
                  const durationLabel = durationDays > 0
                    ? `${durationDays}d ${durationHours}h`
                    : durationHours > 0
                    ? `${durationHours}h`
                    : '< 1h'

                  return (
                    <li key={row.id} className="pb-5 pl-5 last:pb-0">
                      {/* dot */}
                      <span
                        className="absolute -left-[5px] mt-1 size-2.5 rounded-full border-2 border-background"
                        style={{ backgroundColor: isLast && !row.exited_at ? color : '#6b7280' }}
                      />
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-foreground leading-tight">
                            {row.stage?.name ?? '—'}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {new Date(row.entered_at).toLocaleDateString('pt-BR', {
                              day: '2-digit', month: 'short', year: 'numeric',
                            })}
                            {' '}
                            {new Date(row.entered_at).toLocaleTimeString('pt-BR', {
                              hour: '2-digit', minute: '2-digit',
                            })}
                          </p>
                        </div>
                        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground bg-muted/60 rounded px-1.5 py-0.5 mt-0.5">
                          {durationLabel}
                        </span>
                      </div>
                    </li>
                  )
                })}
              </ol>
            </div>
          )}
        </div>

        {/* ── Right column — Agendamentos ── */}
        <div className="w-full lg:w-72 xl:w-80 shrink-0 lg:sticky lg:top-4">
          <div className="rounded-xl border border-border bg-card overflow-hidden">

            {/* Panel header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <CalendarDays className="size-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">Agendamentos</span>
              </div>
              <button
                type="button"
                onClick={() => setScheduleOpen(true)}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <CalendarPlus className="size-3.5" />
                Agendar
              </button>
            </div>

            {/* Loading */}
            {eventsLoading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* Empty */}
            {!eventsLoading && events.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-10 px-4 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                  <CalendarDays className="size-5 text-muted-foreground/50" />
                </div>
                <p className="text-sm font-medium text-foreground">Sem agendamentos</p>
                <p className="text-xs text-muted-foreground">Clique em Agendar para criar o primeiro compromisso deste negócio.</p>
              </div>
            )}

            {/* Upcoming events */}
            {!eventsLoading && upcoming.length > 0 && (
              <div>
                <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Próximos
                </p>
                <div className="divide-y divide-border">
                  {upcoming.map((ev, i) => (
                    <EventRow
                      key={ev.id}
                      ev={ev}
                      highlight={i === 0}
                      deleting={deletingEvent}
                      onDelete={deleteEvent}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Past events */}
            {!eventsLoading && past.length > 0 && (
              <div className="border-t border-border">
                <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Realizados
                </p>
                <div className="divide-y divide-border opacity-60">
                  {past.map((ev) => (
                    <EventRow key={ev.id} ev={ev} deleting={deletingEvent} onDelete={deleteEvent} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {deal.pipeline_id && (
        <DealForm
          open={formOpen}
          onOpenChange={setFormOpen}
          deal={deal as unknown as Deal}
          pipelineId={deal.pipeline_id}
          stages={stages}
          onSaved={() => { setFormOpen(false); fetchDeal() }}
        />
      )}

      <ScheduleEventModal
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        dealId={deal.id}
        contactId={deal.contact?.id}
        contactName={deal.contact?.name ?? undefined}
        onCreated={(ev) => setEvents(prev => [...prev, ev].sort((a, b) => a.start_at.localeCompare(b.start_at)))}
      />
    </div>
  )
}

// ─── Event row ────────────────────────────────────────────────────────────────

function EventRow({ ev, highlight, deleting, onDelete }: {
  ev: CalendarEvent
  highlight?: boolean
  deleting: string | null
  onDelete: (id: string) => void
}) {
  return (
    <div className={cn('flex items-start gap-3 px-4 py-3', highlight && 'bg-primary/[0.03]')}>
      <div className={cn(
        'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold tabular-nums',
        highlight ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
      )}>
        {new Date(ev.start_at).getDate()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-medium text-foreground leading-tight">{ev.title}</p>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="size-3 shrink-0" />
          <span className="capitalize">{fmtDate(ev.start_at)}</span>
          <span>·</span>
          <span>{fmtTime(ev.start_at)} – {fmtTime(ev.end_at)}</span>
        </p>
      </div>
      <button
        type="button"
        onClick={() => onDelete(ev.id)}
        disabled={deleting === ev.id}
        className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
        aria-label="Remover agendamento"
      >
        {deleting === ev.id
          ? <Loader2 className="size-3.5 animate-spin" />
          : <Trash2 className="size-3.5" />}
      </button>
    </div>
  )
}

// ─── Info card ────────────────────────────────────────────────────────────────

function InfoCard({ icon, label, value, onClick }: {
  icon: React.ReactNode
  label: string
  value: string
  onClick?: () => void
}) {
  const Wrapper = onClick ? 'button' : 'div'
  return (
    <Wrapper
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 rounded-xl border border-border bg-card p-3.5 text-left',
        onClick && 'cursor-pointer transition-colors hover:bg-accent',
      )}
    >
      <span className="text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium text-foreground">{value}</p>
      </div>
    </Wrapper>
  )
}
