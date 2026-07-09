'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { formatCurrency } from '@/lib/currency'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  X, Pencil, Trophy, XCircle, User, CalendarDays,
  Clock, MessageSquare, ArrowRight, Loader2, CalendarPlus,
  Trash2, RotateCcw,
} from 'lucide-react'
import type { Deal, PipelineStage } from '@/types'
import { DealItemsPanel } from './deal-items-panel'

interface CalendarEvent {
  id: string
  title: string
  start_at: string
  end_at: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  deal: Deal | null
  stages: PipelineStage[]
  onDealMoved: (dealId: string, stageId: string) => void
  onEdit: (deal: Deal) => void
  onRefresh: () => void
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
    + ' · ' + new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
function fmtNextEvent(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const tomorrow = new Date(); tomorrow.setDate(today.getDate() + 1)
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  const t = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (same(d, today)) return `hoje · ${t}`
  if (same(d, tomorrow)) return `amanhã · ${t}`
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) + ` · ${t}`
}

const STATUS_META = {
  open: { label: 'Em andamento', className: 'bg-primary/10 text-primary' },
  won:  { label: 'Ganho',        className: 'bg-emerald-600/10 text-emerald-600' },
  lost: { label: 'Perdido',      className: 'bg-rose-500/10 text-rose-500' },
} as const

function fixedKey(s: PipelineStage) {
  if (s.fixed_role === 'new_lead') return -999
  if (s.fixed_role === 'won') return 9998
  if (s.fixed_role === 'lost') return 9999
  return s.position
}

export function DealDrawer({ open, onOpenChange, deal, stages, onDealMoved, onEdit, onRefresh }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const { defaultCurrency } = useAuth()

  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [statusLoading, setStatusLoading] = useState(false)
  const [liveValue, setLiveValue] = useState<number | null>(null)
  const [movingToStage, setMovingToStage] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const currency = deal?.currency ?? defaultCurrency

  const sortedStages = [...stages].sort((a, b) => fixedKey(a) - fixedKey(b))
  // Regular flow stages (excluding lost which is a sidebar)
  const flowStages = sortedStages.filter(s => s.fixed_role !== 'lost')
  const currentStageIndex = flowStages.findIndex(s => s.id === deal?.stage_id)
  const nextStage = currentStageIndex >= 0 && currentStageIndex < flowStages.length - 1
    ? flowStages[currentStageIndex + 1]
    : null

  const loadEvents = useCallback(async (dealId: string) => {
    setEventsLoading(true)
    const res = await fetch(`/api/calendar/events?deal_id=${dealId}`)
    if (res.ok) { const d = await res.json(); setEvents(d.events ?? []) }
    setEventsLoading(false)
  }, [])

  useEffect(() => {
    if (open && deal?.id) {
      loadEvents(deal.id)
      setLiveValue(null)
    } else {
      setEvents([])
    }
  }, [open, deal?.id, loadEvents])

  // Close on ESC
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onOpenChange(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onOpenChange])

  // Lock body scroll when open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  async function changeStatus(status: 'won' | 'lost' | 'open') {
    if (!deal) return
    setStatusLoading(true)
    const res = await fetch(`/api/deals/${deal.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (!res.ok) {
      toast.error('Falha ao atualizar status')
    } else {
      toast.success(status === 'won' ? 'Negócio ganho!' : status === 'lost' ? 'Negócio marcado como perdido' : 'Negócio reaberto')
      onRefresh()
      onOpenChange(false)
    }
    setStatusLoading(false)
  }

  async function moveToStage(stageId: string) {
    if (!deal) return
    setMovingToStage(stageId)
    onDealMoved(deal.id, stageId)
    // Small delay for optimistic UX then close
    setTimeout(() => {
      setMovingToStage(null)
      onOpenChange(false)
    }, 300)
  }

  const now = new Date()
  const upcoming = events.filter(e => new Date(e.end_at) >= now).sort((a, b) => a.start_at.localeCompare(b.start_at))
  const past = events.filter(e => new Date(e.end_at) < now)

  const status = (deal?.status ?? 'open') as keyof typeof STATUS_META
  const statusMeta = STATUS_META[status]
  const displayValue = liveValue ?? deal?.value ?? 0
  const isWon = deal?.status === 'won'
  const isLost = deal?.status === 'lost'

  if (!deal) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] transition-opacity duration-300',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={() => onOpenChange(false)}
        aria-hidden
      />

      {/* Drawer panel */}
      <div
        ref={panelRef}
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-background shadow-2xl transition-transform duration-300 ease-out md:w-[480px] lg:w-[520px]',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
        role="dialog"
        aria-modal="true"
      >
        {/* ── Header ── */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0', statusMeta.className)}>
                {statusMeta.label}
              </span>
            </div>
            <h2 className="mt-1 text-base font-bold leading-tight text-foreground break-words">
              {deal.title}
            </h2>
            {displayValue > 0 && (
              <p className="mt-0.5 text-xl font-bold text-primary tabular-nums">
                {formatCurrency(displayValue, currency)}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => { onOpenChange(false); onEdit(deal) }}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors"
            >
              <Pencil className="size-3.5" />
              Editar
            </button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label="Fechar"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* ── Stage progress bar ── */}
        <div className="shrink-0 border-b border-border px-5 py-3">
          <div className="flex items-center gap-0 overflow-x-auto pb-1 scrollbar-none">
            {flowStages.map((stage, i) => {
              const isCurrent = stage.id === deal.stage_id
              const isPast = i < currentStageIndex
              const isMoving = movingToStage === stage.id

              return (
                <button
                  key={stage.id}
                  type="button"
                  disabled={isCurrent || statusLoading}
                  onClick={() => moveToStage(stage.id)}
                  title={stage.name}
                  className={cn(
                    'group relative flex min-w-0 shrink-0 items-center transition-all',
                    i > 0 && 'pl-2',
                  )}
                >
                  {/* connector line */}
                  {i > 0 && (
                    <div className={cn(
                      'absolute left-0 top-1/2 h-0.5 w-2 -translate-y-1/2',
                      isPast || isCurrent ? 'bg-primary/60' : 'bg-border',
                    )} />
                  )}

                  <span className={cn(
                    'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap transition-all border',
                    isCurrent
                      ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                      : isPast
                      ? 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/20'
                      : 'border-border bg-muted/50 text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground',
                    isMoving && 'opacity-60',
                  )}>
                    {isMoving
                      ? <Loader2 className="size-2.5 animate-spin" />
                      : (
                        <span
                          className="size-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: isCurrent ? 'currentColor' : (isPast ? 'rgb(var(--primary))' : stage.color) }}
                        />
                      )
                    }
                    {stage.name}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto">
          <div className="space-y-4 px-5 py-4">

            {/* Win / Lose / Reopen actions */}
            <div className="flex gap-2">
              {!isWon && !isLost && (
                <>
                  <button
                    type="button"
                    disabled={statusLoading}
                    onClick={() => changeStatus('won')}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 py-2.5 text-sm font-semibold text-emerald-600 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                  >
                    {statusLoading ? <Loader2 className="size-4 animate-spin" /> : <Trophy className="size-4" />}
                    Ganhar
                  </button>
                  <button
                    type="button"
                    disabled={statusLoading}
                    onClick={() => changeStatus('lost')}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 py-2.5 text-sm font-semibold text-rose-500 hover:bg-rose-500/20 transition-colors disabled:opacity-50"
                  >
                    {statusLoading ? <Loader2 className="size-4 animate-spin" /> : <XCircle className="size-4" />}
                    Perder
                  </button>
                  {nextStage && (
                    <button
                      type="button"
                      disabled={!!movingToStage}
                      onClick={() => moveToStage(nextStage.id)}
                      title={`Mover para "${nextStage.name}"`}
                      className="flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border bg-muted px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50"
                    >
                      {movingToStage === nextStage.id
                        ? <Loader2 className="size-4 animate-spin" />
                        : <ArrowRight className="size-4" />}
                    </button>
                  )}
                </>
              )}
              {(isWon || isLost) && (
                <button
                  type="button"
                  disabled={statusLoading}
                  onClick={() => changeStatus('open')}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-muted py-2.5 text-sm font-semibold text-muted-foreground hover:bg-accent transition-colors disabled:opacity-50"
                >
                  <RotateCcw className="size-4" />
                  Reabrir negócio
                </button>
              )}
            </div>

            {/* Info grid */}
            <div className="grid gap-2 grid-cols-2">
              {deal.contact && (
                <button
                  type="button"
                  onClick={() => { onOpenChange(false); router.push(`/contacts/${deal.contact!.id}`) }}
                  className="col-span-2 flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-left hover:bg-accent transition-colors group"
                >
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {(deal.contact.name ?? deal.contact.phone ?? '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] text-muted-foreground">Contato</p>
                    <p className="truncate text-sm font-medium text-foreground">
                      {deal.contact.name ?? deal.contact.phone ?? '—'}
                    </p>
                  </div>
                  <MessageSquare className="size-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
                </button>
              )}

              {deal.assignee && (
                <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-3">
                  <User className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground">Responsável</p>
                    <p className="truncate text-sm font-medium text-foreground">{deal.assignee.full_name ?? '—'}</p>
                  </div>
                </div>
              )}

              {deal.expected_close_date && (
                <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-3">
                  <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground">Previsão de fechamento</p>
                    <p className="truncate text-sm font-medium text-foreground">{fmtDate(deal.expected_close_date)}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Notes */}
            {deal.notes && (
              <div className="rounded-xl border border-border bg-card p-4 space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Observações</p>
                <p className="whitespace-pre-wrap text-sm text-foreground leading-relaxed">{deal.notes}</p>
              </div>
            )}

            {/* Items */}
            <DealItemsPanel
              dealId={deal.id}
              currency={currency}
              onValueChange={setLiveValue}
            />

            {/* Agendamentos */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div className="flex items-center gap-2">
                  <CalendarDays className="size-4 text-muted-foreground" />
                  <span className="text-sm font-semibold text-foreground">Agendamentos</span>
                </div>
                <button
                  type="button"
                  onClick={() => { onOpenChange(false); router.push(`/negocios/${deal.id}`) }}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <CalendarPlus className="size-3.5" />
                  Ver tudo
                </button>
              </div>

              {eventsLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </div>
              ) : events.length === 0 ? (
                <div className="flex flex-col items-center gap-1.5 py-6 text-center">
                  <CalendarDays className="size-7 text-muted-foreground/30" />
                  <p className="text-xs text-muted-foreground">Sem agendamentos</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {upcoming.slice(0, 3).map((ev, i) => (
                    <EventRow key={ev.id} ev={ev} highlight={i === 0} />
                  ))}
                  {past.length > 0 && upcoming.length === 0 && (
                    <EventRow ev={past[0]} />
                  )}
                  {(upcoming.length > 3 || (upcoming.length > 0 && past.length > 0)) && (
                    <button
                      type="button"
                      onClick={() => { onOpenChange(false); router.push(`/negocios/${deal.id}`) }}
                      className="flex w-full items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Ver todos os agendamentos <ArrowRight className="size-3" />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Link to full page */}
            <button
              type="button"
              onClick={() => { onOpenChange(false); router.push(`/negocios/${deal.id}`) }}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-border py-2.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              Ver página completa do negócio <ArrowRight className="size-3.5" />
            </button>

          </div>
        </div>
      </div>
    </>
  )
}

function EventRow({ ev, highlight }: { ev: CalendarEvent; highlight?: boolean }) {
  return (
    <div className={cn('flex items-start gap-3 px-4 py-3', highlight && 'bg-primary/[0.03]')}>
      <div className={cn(
        'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold tabular-nums',
        highlight ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
      )}>
        {new Date(ev.start_at).getDate()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-medium text-foreground leading-tight">{ev.title}</p>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="size-3 shrink-0" />
          {fmtNextEvent(ev.start_at)}
        </p>
      </div>
    </div>
  )
}
