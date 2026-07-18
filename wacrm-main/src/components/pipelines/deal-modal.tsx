'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { formatCurrency } from '@/lib/currency'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  X, Pencil, Check, Trophy, XCircle, ArrowRight, RotateCcw,
  Loader2, CalendarDays, User, MessageSquare, Clock, CalendarPlus,
  ExternalLink, History, Trash2, Tag,
} from 'lucide-react'
// WhatsApp icon (inline SVG — not in lucide)
const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
  </svg>
)
import type { Deal, PipelineStage } from '@/types'
import { DealItemsPanel } from './deal-items-panel'
import { DealCustomFieldsPanel } from './deal-custom-fields-panel'
import { ContactDetailContent } from '@/components/contacts/contact-detail-view'
import { ScheduleEventModal, type CalendarEvent } from '@/components/calendar/schedule-event-modal'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Member { user_id: string; full_name: string }

type StageHistoryRow = {
  id: string
  entered_at: string
  exited_at: string | null
  stage: { id: string; name: string; color: string } | null
}

export interface DealModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  dealId: string | null
  initialDeal?: Deal | null
  initialStages?: PipelineStage[]
  members?: Member[]
  onDealMoved?: (dealId: string, stageId: string) => void
  onRefresh?: () => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}
function fmtDateTime(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const tomorrow = new Date(); tomorrow.setDate(today.getDate() + 1)
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  const t = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (same(d, today)) return `hoje · ${t}`
  if (same(d, tomorrow)) return `amanhã · ${t}`
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) + ` · ${t}`
}

function initials(name?: string | null) {
  return (name ?? '?').trim().charAt(0).toUpperCase()
}

function fixedKey(s: PipelineStage) {
  if (s.fixed_role === 'new_lead') return -999
  if (s.fixed_role === 'won') return 9998
  if (s.fixed_role === 'lost') return 9999
  return s.position
}

const STATUS_META = {
  open: { label: 'Em andamento', cls: 'bg-primary/10 text-primary' },
  won:  { label: 'Ganho',        cls: 'bg-primary/15 text-primary' },
  lost: { label: 'Perdido',      cls: 'bg-destructive/10 text-destructive' },
} as const

// ─── Component ───────────────────────────────────────────────────────────────

export function DealModal({
  open, onOpenChange, dealId, initialDeal, initialStages, members = [], onDealMoved, onRefresh,
}: DealModalProps) {
  const supabase = createClient()
  const router = useRouter()
  const { defaultCurrency } = useAuth()

  // Core data
  const [deal, setDeal] = useState<Deal | null>(initialDeal ?? null)
  const [stages, setStages] = useState<PipelineStage[]>(initialStages ?? [])
  const [dataLoading, setDataLoading] = useState(false)

  // Tab
  const [tab, setTab] = useState<'deal' | 'contact'>('deal')

  // Inline edit
  const [editMode, setEditMode] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editAssignee, setEditAssignee] = useState('')
  const [saving, setSaving] = useState(false)

  // Deal actions
  const [statusLoading, setStatusLoading] = useState(false)
  const [movingStage, setMovingStage] = useState<string | null>(null)

  // Live value from items
  const [liveValue, setLiveValue] = useState<number | null>(null)

  // Events
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [evLoading, setEvLoading] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [deletingEvent, setDeletingEvent] = useState<string | null>(null)

  // Stage history
  const [stageHistory, setStageHistory] = useState<StageHistoryRow[]>([])

  const currency = deal?.currency ?? defaultCurrency
  const sortedStages = [...stages].sort((a, b) => fixedKey(a) - fixedKey(b))
  const flowStages = sortedStages.filter(s => s.fixed_role !== 'lost')
  const currentIdx = flowStages.findIndex(s => s.id === deal?.stage_id)
  const nextStage = currentIdx >= 0 && currentIdx < flowStages.length - 1 ? flowStages[currentIdx + 1] : null
  const displayValue = liveValue ?? deal?.value ?? 0
  const status = (deal?.status ?? 'open') as keyof typeof STATUS_META
  const isWon = deal?.status === 'won'
  const isLost = deal?.status === 'lost'

  // ── Fetch deal + stages ──────────────────────────────────────────────────

  const fetchDeal = useCallback(async (id: string) => {
    setDataLoading(true)
    const { data } = await supabase
      .from('deals')
      .select('*, contact:contacts(id,name,phone,email,company), stage:pipeline_stages(id,name), assignee:profiles!deals_assigned_to_fkey(id,full_name), pipeline:pipelines(id,name)')
      .eq('id', id)
      .single()
    if (data) {
      setDeal(data as Deal)
      setLiveValue(null)
      if (data.pipeline_id && stages.length === 0) {
        const { data: s } = await supabase.from('pipeline_stages').select('*').eq('pipeline_id', data.pipeline_id).order('position')
        setStages((s ?? []) as PipelineStage[])
      }
      const { data: hist } = await supabase
        .from('deal_stage_history')
        .select('id, entered_at, exited_at, stage:pipeline_stages(id,name,color)')
        .eq('deal_id', id)
        .order('entered_at', { ascending: true })
      const normalized = (hist ?? []).map((row: {
        id: string; entered_at: string; exited_at: string | null
        stage: { id: string; name: string; color: string }[] | { id: string; name: string; color: string } | null
      }) => ({
        ...row,
        stage: Array.isArray(row.stage) ? (row.stage[0] ?? null) : row.stage,
      })) as StageHistoryRow[]
      setStageHistory(normalized)
    }
    setDataLoading(false)
  }, [supabase, stages.length])

  const fetchEvents = useCallback(async (id: string) => {
    setEvLoading(true)
    const res = await fetch(`/api/calendar/events?deal_id=${id}`)
    if (res.ok) { const d = await res.json(); setEvents(d.events ?? []) }
    setEvLoading(false)
  }, [])

  // ── Open/close lifecycle ─────────────────────────────────────────────────

  const deleteEvent = useCallback(async (eventId: string) => {
    setDeletingEvent(eventId)
    await fetch(`/api/calendar/events/${eventId}`, { method: 'DELETE' })
    setEvents(prev => prev.filter(e => e.id !== eventId))
    setDeletingEvent(null)
  }, [])

  useEffect(() => {
    if (!open) {
      setTab('deal')
      setEditMode(false)
      setEvents([])
      setStageHistory([])
      setLiveValue(null)
      return
    }
    if (dealId) {
      fetchDeal(dealId)
      fetchEvents(dealId)
    }
  }, [open, dealId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (initialDeal) setDeal(initialDeal)
  }, [initialDeal])

  useEffect(() => {
    if (initialStages?.length) setStages(initialStages)
  }, [initialStages])

  // ── ESC to close + body lock ─────────────────────────────────────────────

  useEffect(() => {
    if (!open) return
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape' && !editMode) onOpenChange(false) }
    window.addEventListener('keydown', fn)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', fn); document.body.style.overflow = '' }
  }, [open, editMode, onOpenChange])

  // ── Edit mode ────────────────────────────────────────────────────────────

  function enterEdit() {
    if (!deal) return
    setEditTitle(deal.title ?? '')
    setEditNotes(deal.notes ?? '')
    setEditDate(deal.expected_close_date ?? '')
    setEditAssignee((deal as Deal & { assigned_to?: string }).assigned_to ?? '')
    setEditMode(true)
  }

  async function saveEdit() {
    if (!deal) return
    setSaving(true)
    const payload: Record<string, unknown> = {
      title: editTitle.trim() || deal.title,
      notes: editNotes.trim() || null,
      expected_close_date: editDate || null,
      assigned_to: editAssignee || null,
    }
    const { error } = await supabase.from('deals').update(payload).eq('id', deal.id)
    if (error) { toast.error('Falha ao salvar'); setSaving(false); return }
    toast.success('Salvo')
    setDeal(prev => prev ? { ...prev, ...payload } as Deal : prev)
    setEditMode(false)
    setSaving(false)
    onRefresh?.()
  }

  // ── Open inbox for contact ───────────────────────────────────────────────

  const openInboxForContact = useCallback(async () => {
    const contactId = (deal as Deal & { contact?: { id: string } })?.contact?.id
    if (!contactId) return
    const { data } = await supabase
      .from('conversations')
      .select('id')
      .eq('contact_id', contactId)
      .order('last_message_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data?.id) {
      onOpenChange(false)
      router.push(`/inbox?c=${data.id}`)
    } else {
      toast.error('Nenhuma conversa encontrada para este contato')
    }
  }, [deal, supabase, router, onOpenChange])

  // ── Status change ────────────────────────────────────────────────────────

  async function changeStatus(s: 'won' | 'lost' | 'open') {
    if (!deal) return
    setStatusLoading(true)
    const res = await fetch(`/api/deals/${deal.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: s }),
    })
    if (!res.ok) { toast.error('Falha ao atualizar'); setStatusLoading(false); return }
    toast.success(s === 'won' ? 'Negócio ganho!' : s === 'lost' ? 'Negócio perdido' : 'Negócio reaberto')
    setDeal(prev => prev ? { ...prev, status: s } as Deal : prev)
    setStatusLoading(false)
    onRefresh?.()
  }

  // ── Stage move ───────────────────────────────────────────────────────────

  async function moveStage(stageId: string) {
    if (!deal) return
    setMovingStage(stageId)
    const targetStage = stages.find(s => s.id === stageId)
    const autoStatus = targetStage?.fixed_role === 'lost' ? 'lost' : targetStage?.fixed_role === 'won' ? 'won' : undefined
    setDeal(prev => prev ? { ...prev, stage_id: stageId, status: autoStatus ?? prev.status } as Deal : prev)
    onDealMoved?.(deal.id, stageId)
    const res = await fetch(`/api/deals/${deal.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage_id: stageId }),
    })
    if (!res.ok) toast.error('Falha ao mover')
    else onRefresh?.()
    setMovingStage(null)
  }


  // ─────────────────────────────────────────────────────────────────────────

  const now = new Date()
  const upcoming = events.filter(e => new Date(e.end_at) >= now).sort((a, b) => a.start_at.localeCompare(b.start_at))
  const past = events.filter(e => new Date(e.end_at) < now)

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[3px] animate-in fade-in duration-200"
        onClick={() => !editMode && onOpenChange(false)}
        aria-hidden
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4"
      >
        <div className="relative flex w-full flex-col bg-background shadow-2xl sm:max-w-3xl sm:rounded-2xl sm:max-h-[90vh] max-h-[95dvh] animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-250">

          {/* ── Header ─────────────────────────────────────────────────── */}
          <div className="flex shrink-0 flex-col border-b border-border">
            {/* Top row: title + actions */}
            <div className="flex items-start gap-3 px-5 pt-4 pb-3">
              <div className="min-w-0 flex-1">
                {editMode ? (
                  <input
                    autoFocus
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    className="w-full rounded-lg border border-primary bg-background px-3 py-1.5 text-base font-bold text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                  />
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base font-bold text-foreground leading-tight">
                      {dataLoading ? '...' : (deal?.title ?? '—')}
                    </h2>
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0', STATUS_META[status].cls)}>
                      {STATUS_META[status].label}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                {editMode ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setEditMode(false)}
                      disabled={saving}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={saveEdit}
                      disabled={saving}
                      className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                      Salvar
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={enterEdit}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors"
                  >
                    <Pencil className="size-3.5" />
                    Editar
                  </button>
                )}
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

            {/* Tab bar */}
            <div className="flex gap-0 px-5">
              {(['deal', 'contact'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={cn(
                    'border-b-2 pb-2.5 px-1 mr-5 text-sm font-semibold transition-colors',
                    tab === t
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t === 'deal' ? 'Negócio' : 'Contato'}
                </button>
              ))}
            </div>
          </div>

          {/* ── Scrollable body ──────────────────────────────────────── */}
          <div className={cn("flex-1", tab === 'contact' ? "flex flex-col overflow-hidden" : "overflow-y-auto")}>
            {dataLoading && !deal ? (
              <div className="flex h-64 items-center justify-center">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : tab === 'deal' ? (
              <DealTab
                deal={deal}
                stages={stages}
                flowStages={flowStages}
                currentIdx={currentIdx}
                nextStage={nextStage}
                displayValue={displayValue}
                currency={currency}
                members={members}
                editMode={editMode}
                editNotes={editNotes}
                setEditNotes={setEditNotes}
                editDate={editDate}
                setEditDate={setEditDate}
                editAssignee={editAssignee}
                setEditAssignee={setEditAssignee}
                statusLoading={statusLoading}
                movingStage={movingStage}
                isWon={isWon}
                isLost={isLost}
                evLoading={evLoading}
                upcoming={upcoming}
                past={past}
                deletingEvent={deletingEvent}
                stageHistory={stageHistory}
                onChangeStatus={changeStatus}
                onMoveStage={moveStage}
                onValueChange={setLiveValue}
                onDeleteEvent={deleteEvent}
                onSchedule={() => setScheduleOpen(true)}
                onOpenInbox={openInboxForContact}
                onOpenFull={() => { onOpenChange(false); router.push(`/negocios/${deal?.id}`) }}
              />
            ) : deal?.contact_id ? (
              <ContactDetailContent
                key={deal.contact_id}
                contactId={deal.contact_id}
                onUpdated={() => onRefresh?.()}
              />
            ) : (
              <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground">
                <User className="size-8 opacity-30" />
                <p className="text-sm">Nenhum contato vinculado</p>
              </div>
            )}
          </div>
        </div>
      </div>
      {deal && (
        <ScheduleEventModal
          open={scheduleOpen}
          onClose={() => setScheduleOpen(false)}
          dealId={deal.id}
          contactId={(deal as Deal & { contact?: { id: string } }).contact?.id}
          contactName={(deal as Deal & { contact?: { name: string | null } }).contact?.name ?? undefined}
          onCreated={(ev) => setEvents(prev => [...prev, ev].sort((a, b) => a.start_at.localeCompare(b.start_at)))}
        />
      )}
    </>
  )
}

// ─── Deal Tab ─────────────────────────────────────────────────────────────────

function DealTab({
  deal, stages, flowStages, currentIdx, nextStage, displayValue, currency,
  members, editMode, editNotes, setEditNotes, editDate, setEditDate,
  editAssignee, setEditAssignee, statusLoading, movingStage, isWon, isLost,
  evLoading, upcoming, past, deletingEvent, stageHistory,
  onChangeStatus, onMoveStage, onValueChange, onDeleteEvent, onSchedule, onOpenInbox, onOpenFull,
}: {
  deal: Deal | null
  stages: PipelineStage[]
  flowStages: PipelineStage[]
  currentIdx: number
  nextStage: PipelineStage | null
  displayValue: number
  currency: string
  members: Member[]
  editMode: boolean
  editNotes: string
  setEditNotes: (v: string) => void
  editDate: string
  setEditDate: (v: string) => void
  editAssignee: string
  setEditAssignee: (v: string) => void
  statusLoading: boolean
  movingStage: string | null
  isWon: boolean
  isLost: boolean
  evLoading: boolean
  upcoming: CalendarEvent[]
  past: CalendarEvent[]
  deletingEvent: string | null
  stageHistory: StageHistoryRow[]
  onChangeStatus: (s: 'won' | 'lost' | 'open') => void
  onMoveStage: (id: string) => void
  onValueChange: (v: number) => void
  onDeleteEvent: (id: string) => void
  onSchedule: () => void
  onOpenInbox: () => void
  onOpenFull: () => void
}) {
  if (!deal) return null

  return (
    <div className="space-y-5 px-5 py-5">

      {/* ── Value hero ─────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-primary/10 border border-primary/15 px-5 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-primary/60 mb-1">Valor do negócio</p>
        <p className="text-3xl font-extrabold tabular-nums text-foreground tracking-tight">
          {formatCurrency(displayValue, currency)}
        </p>
        {(deal as Deal & { pipeline?: { name: string } }).pipeline && (
          <p className="mt-1 text-xs text-muted-foreground">{(deal as Deal & { pipeline?: { name: string } }).pipeline!.name}</p>
        )}
      </div>

      {/* ── Stage progress ─────────────────────────────────────────── */}
      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Etapa</p>
        <div className="flex items-center gap-0 overflow-x-auto pb-1">
          {flowStages.map((s, i) => {
            const isCurrent = s.id === deal.stage_id
            const isPast = i < currentIdx
            const isMoving = movingStage === s.id
            return (
              <button
                key={s.id}
                type="button"
                disabled={isCurrent || !!statusLoading}
                onClick={() => onMoveStage(s.id)}
                title={s.name}
                className={cn('group relative shrink-0 transition-all', i > 0 && 'pl-2')}
              >
                {i > 0 && (
                  <div className={cn(
                    'absolute left-0 top-1/2 h-0.5 w-2 -translate-y-1/2',
                    isPast || isCurrent ? 'bg-primary/60' : 'bg-border',
                  )} />
                )}
                <span className={cn(
                  'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap border transition-all',
                  isCurrent
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : isPast
                    ? 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/20'
                    : 'border-border bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground',
                )}>
                  {isMoving
                    ? <Loader2 className="size-2.5 animate-spin" />
                    : <span className="size-1.5 rounded-full shrink-0" style={{ backgroundColor: isCurrent ? 'white' : (isPast ? 'var(--primary)' : s.color) }} />
                  }
                  {s.name}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Win/Lose/Next actions ──────────────────────────────────── */}
      <div className="flex gap-2">
        {!isWon && !isLost ? (
          <>
            <button
              type="button"
              disabled={statusLoading}
              onClick={() => onChangeStatus('won')}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 py-2.5 text-sm font-semibold text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
            >
              {statusLoading ? <Loader2 className="size-4 animate-spin" /> : <Trophy className="size-4" />}
              Ganhar
            </button>
            <button
              type="button"
              disabled={statusLoading}
              onClick={() => onChangeStatus('lost')}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 py-2.5 text-sm font-semibold text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50"
            >
              {statusLoading ? <Loader2 className="size-4 animate-spin" /> : <XCircle className="size-4" />}
              Perder
            </button>
            {nextStage && (
              <button
                type="button"
                disabled={!!movingStage}
                onClick={() => onMoveStage(nextStage.id)}
                title={`Mover para "${nextStage.name}"`}
                className="flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border bg-muted px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50"
              >
                {movingStage === nextStage.id ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
              </button>
            )}
          </>
        ) : (
          <button
            type="button"
            disabled={statusLoading}
            onClick={() => onChangeStatus('open')}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-muted py-2.5 text-sm font-semibold text-muted-foreground hover:bg-accent transition-colors disabled:opacity-50"
          >
            <RotateCcw className="size-4" />
            Reabrir negócio
          </button>
        )}
      </div>

      {/* ── Info grid ─────────────────────────────────────────────── */}
      <div className="grid gap-2 sm:grid-cols-2">
        {/* Contact */}
        {deal.contact && (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
              {initials(deal.contact.name ?? deal.contact.phone)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-muted-foreground">Contato</p>
              <p className="truncate text-sm font-semibold text-foreground">{deal.contact.name ?? deal.contact.phone ?? '—'}</p>
              {deal.contact.phone && deal.contact.name && (
                <p className="text-xs text-muted-foreground">{deal.contact.phone}</p>
              )}
            </div>
            <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
          </div>
        )}

        {deal.contact && (
          <button
            type="button"
            onClick={onOpenInbox}
            className="flex items-center gap-3 rounded-xl border border-[#25D366]/40 bg-[#25D366]/5 p-3 text-left hover:bg-[#25D366]/10 transition-colors"
          >
            <WhatsAppIcon className="size-4 shrink-0 text-[#25D366]" />
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground">WhatsApp</p>
              <p className="text-sm font-medium text-[#25D366]">Falar no WhatsApp</p>
            </div>
          </button>
        )}

        {/* Current stage */}
        {(deal as Deal & { stage?: { name: string } }).stage && (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
            <Tag className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-muted-foreground">Etapa</p>
              <p className="truncate text-sm font-medium text-foreground">
                {(deal as Deal & { stage?: { name: string } }).stage!.name}
              </p>
            </div>
          </div>
        )}

        {/* Created at */}
        {deal.created_at && (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
            <Clock className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-muted-foreground">Criado em</p>
              <p className="truncate text-sm font-medium text-foreground">
                {fmtDate(deal.created_at)}
              </p>
            </div>
          </div>
        )}

        {/* Assignee */}
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
          <User className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] text-muted-foreground">Responsável</p>
            {editMode ? (
              <select
                value={editAssignee}
                onChange={e => setEditAssignee(e.target.value)}
                className="mt-0.5 w-full bg-transparent text-sm font-medium text-foreground outline-none cursor-pointer"
              >
                <option value="">Sem responsável</option>
                {members.map(m => (
                  <option key={m.user_id} value={m.user_id}>{m.full_name}</option>
                ))}
              </select>
            ) : (
              <p className="truncate text-sm font-medium text-foreground">
                {deal.assignee?.full_name ?? 'Sem responsável'}
              </p>
            )}
          </div>
        </div>

        {/* Expected close date */}
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] text-muted-foreground">Previsão de fechamento</p>
            {editMode ? (
              <input
                type="date"
                value={editDate}
                onChange={e => setEditDate(e.target.value)}
                className="mt-0.5 w-full bg-transparent text-sm font-medium text-foreground outline-none"
              />
            ) : (
              <p className="truncate text-sm font-medium text-foreground">
                {deal.expected_close_date ? fmtDate(deal.expected_close_date) : '—'}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Observações</p>
        {editMode ? (
          <textarea
            value={editNotes}
            onChange={e => setEditNotes(e.target.value)}
            rows={3}
            placeholder="Adicionar observações..."
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary resize-none"
          />
        ) : (
          <p className={cn('whitespace-pre-wrap text-sm leading-relaxed', deal.notes ? 'text-foreground' : 'text-muted-foreground/60 italic')}>
            {deal.notes ?? 'Sem observações'}
          </p>
        )}
      </div>

      {/* Items */}
      <DealItemsPanel dealId={deal.id} currency={currency} onValueChange={onValueChange} />

      {/* Custom fields */}
      <DealCustomFieldsPanel dealId={deal.id} />

      {/* Events */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="size-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Agendamentos</span>
          </div>
          <button
            type="button"
            onClick={onSchedule}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <CalendarPlus className="size-3.5" />
            Agendar
          </button>
        </div>
        {evLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>
        ) : upcoming.length === 0 && past.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 py-6">
            <CalendarDays className="size-7 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">Sem agendamentos</p>
          </div>
        ) : (
          <div>
            {upcoming.length > 0 && (
              <>
                <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Próximos</p>
                <div className="divide-y divide-border">
                  {upcoming.map((ev, i) => (
                    <EventRow key={ev.id} ev={ev} highlight={i === 0} deleting={deletingEvent} onDelete={onDeleteEvent} />
                  ))}
                </div>
              </>
            )}
            {past.length > 0 && (
              <>
                <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-t border-border">Realizados</p>
                <div className="divide-y divide-border opacity-60">
                  {past.map(ev => (
                    <EventRow key={ev.id} ev={ev} deleting={deletingEvent} onDelete={onDeleteEvent} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Stage history */}
      {stageHistory.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-4">
            <History className="size-4 text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">Histórico de etapas</p>
          </div>
          <ol className="relative border-l border-border ml-2 space-y-0">
            {stageHistory.map((row, i) => {
              const color = row.stage?.color ?? 'var(--muted-foreground)'
              const isLast = i === stageHistory.length - 1
              const durationMs = row.exited_at
                ? new Date(row.exited_at).getTime() - new Date(row.entered_at).getTime()
                : Date.now() - new Date(row.entered_at).getTime()
              const durationDays = Math.floor(durationMs / 86_400_000)
              const durationHours = Math.floor((durationMs % 86_400_000) / 3_600_000)
              const durationLabel = durationDays > 0
                ? `${durationDays}d ${durationHours}h`
                : durationHours > 0 ? `${durationHours}h` : '< 1h'
              return (
                <li key={row.id} className="pb-5 pl-5 last:pb-0">
                  <span
                    className="absolute -left-[5px] mt-1 size-2.5 rounded-full border-2 border-background"
                    style={{ backgroundColor: isLast && !row.exited_at ? color : 'var(--muted-foreground)' }}
                  />
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-foreground leading-tight">{row.stage?.name ?? '—'}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(row.entered_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                        {' '}
                        {new Date(row.entered_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
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

      {/* Full page link */}
      <button
        type="button"
        onClick={onOpenFull}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-border py-2.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <ExternalLink className="size-3.5" />
        Ver página completa do negócio
      </button>
    </div>
  )
}

// ─── Small helpers ─────────────────────────────────────────────────────────────

function EventRow({ ev, highlight, deleting, onDelete }: {
  ev: CalendarEvent
  highlight?: boolean
  deleting: string | null
  onDelete: (id: string) => void
}) {
  return (
    <div className={cn('flex items-start gap-3 px-4 py-3', highlight && 'bg-primary/[0.03]')}>
      <div className={cn(
        'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold tabular-nums',
        highlight ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
      )}>
        {new Date(ev.start_at).getDate()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{ev.title}</p>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="size-3 shrink-0" />
          {fmtDateTime(ev.start_at)}
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
