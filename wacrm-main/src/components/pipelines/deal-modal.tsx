'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { formatCurrency } from '@/lib/currency'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  X, Pencil, Check, Trophy, XCircle, ArrowRight, RotateCcw,
  Loader2, CalendarDays, User, MessageSquare, Clock, CalendarPlus,
  Tag, Building2, Phone, Mail, StickyNote, ExternalLink,
  Briefcase, ChevronRight,
} from 'lucide-react'
import type { Deal, PipelineStage, Contact, Tag as TagType, CustomField, ContactNote } from '@/types'
import { DealItemsPanel } from './deal-items-panel'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Member { user_id: string; full_name: string }
interface CalEvent { id: string; title: string; start_at: string; end_at: string }
interface ContactDetail extends Contact {
  custom_values?: { value: string | null; field: CustomField }[]
}
interface DealStub { id: string; title: string; value: number; status: string; stage: { name: string } | null }

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
  won:  { label: 'Ganho',        cls: 'bg-emerald-600/10 text-emerald-600' },
  lost: { label: 'Perdido',      cls: 'bg-rose-500/10 text-rose-500' },
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
  const [events, setEvents] = useState<CalEvent[]>([])
  const [evLoading, setEvLoading] = useState(false)

  // Contact tab
  const [contactDetail, setContactDetail] = useState<ContactDetail | null>(null)
  const [contactNotes, setContactNotes] = useState<ContactNote[]>([])
  const [contactDeals, setContactDeals] = useState<DealStub[]>([])
  const [contactLoading, setContactLoading] = useState(false)

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

  useEffect(() => {
    if (!open) {
      setTab('deal')
      setEditMode(false)
      setContactDetail(null)
      setContactNotes([])
      setContactDeals([])
      setEvents([])
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

  // ── Contact tab ──────────────────────────────────────────────────────────

  const fetchContactData = useCallback(async (contactId: string, currentDealId: string) => {
    setContactLoading(true)
    const [{ data: contactData }, { data: notesData }, { data: dealsData }] = await Promise.all([
      supabase
        .from('contacts')
        .select('*, contact_tags(tags(id,name,color)), custom_values:contact_custom_values(value, field:custom_fields(id,field_name,field_type,entity_type,show_on_card))')
        .eq('id', contactId)
        .single(),
      supabase.from('contact_notes').select('*').eq('contact_id', contactId).order('created_at', { ascending: false }),
      supabase
        .from('deals')
        .select('id, title, value, status, stage:pipeline_stages(id,name)')
        .eq('contact_id', contactId)
        .neq('id', currentDealId)
        .order('created_at', { ascending: false })
        .limit(10),
    ])

    if (contactData) {
      // Flatten contact_tags → tags
      const raw = contactData as Record<string, unknown>
      const ct = raw.contact_tags as { tags: unknown }[] | undefined
      if (ct) {
        raw.tags = ct.map((x) => x.tags).filter(Boolean)
        delete raw.contact_tags
      }
      setContactDetail(raw as unknown as ContactDetail)
    }
    setContactNotes((notesData ?? []) as ContactNote[])

    // Unwrap stage array from supabase join
    const ds = (dealsData ?? []).map((d: Record<string, unknown>) => ({
      ...d,
      stage: Array.isArray(d.stage) ? (d.stage[0] ?? null) : d.stage,
    })) as DealStub[]
    setContactDeals(ds)
    setContactLoading(false)
  }, [supabase])

  useEffect(() => {
    if (tab === 'contact' && deal?.contact_id && !contactDetail) {
      fetchContactData(deal.contact_id, deal.id)
    }
  }, [tab, deal, contactDetail, fetchContactData])

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
          <div className="flex-1 overflow-y-auto">
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
                onChangeStatus={changeStatus}
                onMoveStage={moveStage}
                onValueChange={setLiveValue}
                onOpenFull={() => { onOpenChange(false); router.push(`/negocios/${deal?.id}`) }}
              />
            ) : (
              <ContactTab
                contact={(deal?.contact ?? null) as Contact | null}
                contactDetail={contactDetail}
                contactNotes={contactNotes}
                contactDeals={contactDeals}
                loading={contactLoading}
                currentDealValue={displayValue}
                currency={currency}
                onOpenContact={() => { onOpenChange(false); router.push(`/contacts/${deal?.contact_id}`) }}
              />
            )}
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Deal Tab ─────────────────────────────────────────────────────────────────

function DealTab({
  deal, stages, flowStages, currentIdx, nextStage, displayValue, currency,
  members, editMode, editNotes, setEditNotes, editDate, setEditDate,
  editAssignee, setEditAssignee, statusLoading, movingStage, isWon, isLost,
  evLoading, upcoming, past, onChangeStatus, onMoveStage, onValueChange, onOpenFull,
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
  upcoming: CalEvent[]
  past: CalEvent[]
  onChangeStatus: (s: 'won' | 'lost' | 'open') => void
  onMoveStage: (id: string) => void
  onValueChange: (v: number) => void
  onOpenFull: () => void
}) {
  if (!deal) return null

  return (
    <div className="space-y-5 px-5 py-5">

      {/* ── Value hero ─────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/15 px-5 py-4">
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
                    : <span className="size-1.5 rounded-full shrink-0" style={{ backgroundColor: isCurrent ? 'white' : (isPast ? 'rgb(var(--primary))' : s.color) }} />
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
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 py-2.5 text-sm font-semibold text-emerald-600 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
            >
              {statusLoading ? <Loader2 className="size-4 animate-spin" /> : <Trophy className="size-4" />}
              Ganhar
            </button>
            <button
              type="button"
              disabled={statusLoading}
              onClick={() => onChangeStatus('lost')}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 py-2.5 text-sm font-semibold text-rose-500 hover:bg-rose-500/20 transition-colors disabled:opacity-50"
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
          <div className="col-span-2 flex items-center gap-3 rounded-xl border border-border bg-card p-3">
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

      {/* Events */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="size-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Agendamentos</span>
          </div>
          <button
            type="button"
            onClick={onOpenFull}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <CalendarPlus className="size-3.5" />
            Ver tudo
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
          <div className="divide-y divide-border">
            {upcoming.slice(0, 3).map((ev, i) => <EventRow key={ev.id} ev={ev} highlight={i === 0} />)}
            {upcoming.length === 0 && past.length > 0 && <EventRow ev={past[0]} />}
          </div>
        )}
      </div>

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

// ─── Contact Tab ──────────────────────────────────────────────────────────────

function ContactTab({
  contact, contactDetail, contactNotes, contactDeals, loading, currentDealValue, currency, onOpenContact,
}: {
  contact: Contact | null
  contactDetail: ContactDetail | null
  contactNotes: ContactNote[]
  contactDeals: DealStub[]
  loading: boolean
  currentDealValue: number
  currency: string
  onOpenContact: () => void
}) {
  if (!contact) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground">
        <User className="size-8 opacity-30" />
        <p className="text-sm">Nenhum contato vinculado</p>
      </div>
    )
  }

  if (loading) {
    return <div className="flex h-48 items-center justify-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
  }

  const tags = (contactDetail?.tags ?? contact.tags ?? []) as TagType[]
  const customValues = (contactDetail?.custom_values ?? []).filter(cv => cv.field.entity_type === 'contact' && cv.value)

  return (
    <div className="space-y-5 px-5 py-5">

      {/* Contact header */}
      <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4">
        <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xl font-bold text-primary">
          {initials(contactDetail?.name ?? contact.name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold text-foreground">{contactDetail?.name ?? contact.name ?? '—'}</p>
          {contact.phone && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground mt-0.5">
              <Phone className="size-3.5" />
              {contact.phone}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onOpenContact}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors"
        >
          <ExternalLink className="size-3.5" />
          Ver contato
        </button>
      </div>

      {/* Details */}
      <div className="grid gap-2 sm:grid-cols-2">
        {(contactDetail?.email ?? contact.email) && (
          <InfoRow icon={<Mail className="size-3.5" />} label="E-mail" value={contactDetail?.email ?? contact.email ?? ''} />
        )}
        {(contactDetail?.company ?? contact.company) && (
          <InfoRow icon={<Building2 className="size-3.5" />} label="Empresa" value={contactDetail?.company ?? contact.company ?? ''} />
        )}
        {contact.created_at && (
          <InfoRow icon={<CalendarDays className="size-3.5" />} label="Cadastrado em" value={fmtDate(contact.created_at)} />
        )}
        {(contactDetail?.utm_source ?? contact.utm_source) && (
          <InfoRow icon={<Tag className="size-3.5" />} label="Origem" value={contactDetail?.utm_source ?? contact.utm_source ?? ''} />
        )}
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Tags</p>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                style={{ backgroundColor: t.color + '22', color: t.color, border: `1px solid ${t.color}44` }}
              >
                <span className="size-1.5 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                {t.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Custom fields */}
      {customValues.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Campos personalizados</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {customValues.map(cv => (
              <InfoRow key={cv.field.id} icon={<StickyNote className="size-3.5" />} label={cv.field.field_name} value={cv.value ?? ''} />
            ))}
          </div>
        </div>
      )}

      {/* Contact notes */}
      {contactNotes.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Notas do contato</p>
          <div className="space-y-2">
            {contactNotes.slice(0, 3).map(n => (
              <div key={n.id} className="rounded-xl border border-border bg-card p-3">
                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{n.note_text}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">{fmtDate(n.created_at)}</p>
              </div>
            ))}
            {contactNotes.length > 3 && (
              <p className="text-xs text-muted-foreground text-center">+{contactNotes.length - 3} notas adicionais</p>
            )}
          </div>
        </div>
      )}

      {/* Other deals */}
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Outros negócios {contactDeals.length > 0 && `(${contactDeals.length})`}
        </p>
        {contactDeals.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Nenhum outro negócio</p>
        ) : (
          <div className="space-y-1.5">
            {contactDeals.map(d => {
              const st = STATUS_META[(d.status as keyof typeof STATUS_META) ?? 'open']
              return (
                <div key={d.id} className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
                  <Briefcase className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{d.title}</p>
                    <p className="text-xs text-muted-foreground">{d.stage?.name ?? '—'}</p>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="text-sm font-semibold tabular-nums text-foreground">{formatCurrency(d.value, currency)}</span>
                    <span className={cn('rounded-full px-1.5 py-0.5 text-[9px] font-semibold', st.cls)}>{st.label}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Small helpers ─────────────────────────────────────────────────────────────

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-border bg-card p-3">
      <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground break-words">{value}</p>
      </div>
    </div>
  )
}

function EventRow({ ev, highlight }: { ev: CalEvent; highlight?: boolean }) {
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
    </div>
  )
}
