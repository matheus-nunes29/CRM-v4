'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  Briefcase,
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Loader2,
  Settings,
  Trash2,
  User,
  Video,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScheduleEventModal, type CalendarEvent } from '@/components/calendar/schedule-event-modal'
import { CalendarGrid, type CalEvent } from '@/components/calendar/calendar-grid'
import { CalendarTimeGrid } from '@/components/calendar/calendar-time-grid'

// ─── Types ──────────────────────────────────────────────────────────────────

interface EnrichedEvent extends CalendarEvent {
  description?: string | null
  attendees?: { email: string }[]
  contact?: { id: string; name: string | null; phone: string } | null
  deal?: { id: string; title: string } | null
}

type View = 'day' | 'week' | 'month'

// ─── Date helpers ────────────────────────────────────────────────────────────

function startOfWeek(d: Date): Date {
  const r = new Date(d)
  r.setDate(r.getDate() - r.getDay())   // Sunday = 0
  r.setHours(0, 0, 0, 0)
  return r
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function addMonths(d: Date, n: number): Date {
  const r = new Date(d)
  r.setMonth(r.getMonth() + n)
  return r
}

function weekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function groupByDay(events: EnrichedEvent[]): [string, EnrichedEvent[]][] {
  const map = new Map<string, EnrichedEvent[]>()
  for (const ev of events) {
    const day = ev.start_at.slice(0, 10)
    if (!map.has(day)) map.set(day, [])
    map.get(day)!.push(ev)
  }
  return Array.from(map.entries())
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AgendaPage() {
  const today = new Date()

  const [events, setEvents] = useState<EnrichedEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [hasGoogleIntegration, setHasGoogleIntegration] = useState<boolean | null>(null)

  const [view, setView] = useState<View>('week')
  const [baseDate, setBaseDate] = useState<Date>(today)

  const [showModal, setShowModal] = useState(false)
  const [defaultDate, setDefaultDate] = useState<Date | undefined>()
  const [selectedEvent, setSelectedEvent] = useState<EnrichedEvent | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const syncedRef = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/calendar/events')
    if (!res.ok) { setLoading(false); return }
    const data = await res.json()
    setEvents(data.events ?? [])
    setHasGoogleIntegration(data.has_google_integration ?? false)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    if (!syncedRef.current) {
      syncedRef.current = true
      fetch('/api/calendar/sync', { method: 'POST' }).then(() => load()).catch(() => {})
    }
  }, [load])

  // ── Navigation ──────────────────────────────────────────────────────────

  const navigate = (dir: 1 | -1) => {
    if (view === 'day')   setBaseDate((d) => addDays(d, dir))
    if (view === 'week')  setBaseDate((d) => addDays(d, dir * 7))
    if (view === 'month') setBaseDate((d) => addMonths(d, dir))
  }

  const goToday = () => setBaseDate(today)

  // ── Header label ────────────────────────────────────────────────────────

  const headerLabel = (() => {
    if (view === 'day') {
      return baseDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    }
    if (view === 'week') {
      const ws = startOfWeek(baseDate)
      const we = addDays(ws, 6)
      const sameMonth = ws.getMonth() === we.getMonth()
      if (sameMonth) {
        return `${ws.getDate()} – ${we.getDate()} de ${ws.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`
      }
      return `${ws.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })} – ${we.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })}`
    }
    return baseDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  })()

  // ── Event handlers ──────────────────────────────────────────────────────

  const handleSlotClick = (date: Date, hour: number) => {
    const d = new Date(date)
    d.setHours(hour, 0, 0, 0)
    setDefaultDate(d)
    setShowModal(true)
  }

  const handleDayClick = (date: Date) => {
    const d = new Date(date)
    d.setHours(9, 0, 0, 0)
    setDefaultDate(d)
    setShowModal(true)
  }

  const handleEventClick = (ev: CalEvent) => {
    setSelectedEvent(events.find((e) => e.id === ev.id) ?? null)
  }

  const handleCreated = (ev: CalendarEvent) => {
    setEvents((prev) => [...prev, ev as EnrichedEvent].sort((a, b) => a.start_at.localeCompare(b.start_at)))
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Remover este evento da agenda?')) return
    setDeleting(id)
    await fetch(`/api/calendar/events/${id}`, { method: 'DELETE' })
    setEvents((prev) => prev.filter((e) => e.id !== id))
    if (selectedEvent?.id === id) setSelectedEvent(null)
    setDeleting(null)
  }

  // ── Derived data ─────────────────────────────────────────────────────────

  const gridEvents: CalEvent[] = events.map((e) => ({
    id: e.id, title: e.title, start_at: e.start_at, end_at: e.end_at, meet_link: e.meet_link,
  }))

  const currentWeekDays = weekDays(startOfWeek(baseDate))
  const upcomingEvents = events.filter((e) => new Date(e.end_at) >= today)
  const pastEvents = events.filter((e) => new Date(e.end_at) < today)

  return (
    <div className="flex h-full flex-col gap-4">
      {/* ── Page header ── */}
      <div className="flex items-center justify-between gap-4">
        {/* Navigation */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => navigate(1)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight className="size-4" />
          </button>
          <button
            type="button"
            onClick={goToday}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors"
          >
            Hoje
          </button>
          <span className="ml-1 text-sm font-semibold text-foreground capitalize">{headerLabel}</span>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            {(['day', 'week', 'month'] as View[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${view === v ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'}`}
              >
                {v === 'day' ? 'Diária' : v === 'week' ? 'Semanal' : 'Mensal'}
              </button>
            ))}
          </div>
          <Button onClick={() => { setDefaultDate(undefined); setShowModal(true) }}>
            <CalendarPlus className="size-4" />
            Novo evento
          </Button>
        </div>
      </div>

      {/* ── Google Calendar nudge ── */}
      {!loading && hasGoogleIntegration === false && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-2.5">
          <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
            <AlertCircle className="size-4 shrink-0 text-amber-500" />
            <span>Conecte o <strong className="text-foreground">Google Calendar</strong> para sincronizar nos dois sentidos.</span>
          </div>
          <Link
            href="/settings?tab=calendar"
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors"
          >
            <Settings className="size-3.5" />
            Conectar
          </Link>
        </div>
      )}

      {loading && (
        <div className="flex flex-1 items-center justify-center py-20">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && (
        <div className="flex flex-1 gap-4 min-h-0">
          {/* ── Main calendar area ── */}
          <div className="flex-1 min-w-0">
            {view === 'day' && (
              <CalendarTimeGrid
                days={[baseDate]}
                events={gridEvents}
                onSlotClick={handleSlotClick}
                onEventClick={handleEventClick}
              />
            )}

            {view === 'week' && (
              <CalendarTimeGrid
                days={currentWeekDays}
                events={gridEvents}
                onSlotClick={handleSlotClick}
                onEventClick={handleEventClick}
              />
            )}

            {view === 'month' && (
              <CalendarGrid
                year={baseDate.getFullYear()}
                month={baseDate.getMonth()}
                events={gridEvents}
                onPrev={() => navigate(-1)}
                onNext={() => navigate(1)}
                onToday={goToday}
                onDayClick={handleDayClick}
                onEventClick={handleEventClick}
              />
            )}
          </div>

          {/* ── Event detail sidebar ── */}
          {selectedEvent && (
            <EventDetailPanel
              ev={selectedEvent}
              onClose={() => setSelectedEvent(null)}
              onDelete={handleDelete}
              deleting={deleting}
            />
          )}
        </div>
      )}

      {/* ── List fallback (hidden, kept for future reference) ── */}
      {false && (
        <>
          {upcomingEvents.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Próximos</h2>
              {groupByDay(upcomingEvents).map(([day, evs]) => (
                <div key={day} className="space-y-2">
                  {evs.map((ev) => <EventCard key={ev.id} ev={ev} onDelete={handleDelete} deleting={deleting} />)}
                </div>
              ))}
            </section>
          )}
          {pastEvents.length > 0 && (
            <section className="space-y-4">
              {groupByDay([...pastEvents].reverse()).map(([day, evs]) => (
                <div key={day} className="space-y-2">
                  {evs.map((ev) => <EventCard key={ev.id} ev={ev} onDelete={handleDelete} deleting={deleting} past />)}
                </div>
              ))}
            </section>
          )}
        </>
      )}

      <ScheduleEventModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onCreated={handleCreated}
        defaultDate={defaultDate}
      />
    </div>
  )
}

// ─── Event detail panel ──────────────────────────────────────────────────────

function EventDetailPanel({ ev, onClose, onDelete, deleting }: {
  ev: EnrichedEvent
  onClose: () => void
  onDelete: (id: string) => void
  deleting: string | null
}) {
  return (
    <div className="w-72 shrink-0 rounded-xl border border-border bg-card p-4 space-y-4 self-start sticky top-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground leading-snug">{ev.title}</h3>
        <button type="button" onClick={onClose} className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors">
          <X className="size-4" />
        </button>
      </div>

      <div className="space-y-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Clock className="size-3.5 shrink-0" />
          <span>
            {new Date(ev.start_at).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })}
            {' · '}
            {formatTime(ev.start_at)} – {formatTime(ev.end_at)}
          </span>
        </div>

        {ev.meet_link && (
          <div className="flex items-center gap-2">
            <Video className="size-3.5 shrink-0 text-blue-500" />
            <a href={ev.meet_link} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline flex items-center gap-1">
              Google Meet <ExternalLink className="size-3" />
            </a>
          </div>
        )}

        {ev.contact && (
          <div className="flex items-center gap-2">
            <User className="size-3.5 shrink-0" />
            <Link href={`/contacts/${ev.contact.id}`} className="hover:text-foreground">
              {ev.contact.name ?? ev.contact.phone}
            </Link>
          </div>
        )}

        {ev.deal && (
          <div className="flex items-center gap-2">
            <Briefcase className="size-3.5 shrink-0" />
            <span>{ev.deal.title}</span>
          </div>
        )}

        {ev.description && (
          <p className="pt-1 text-foreground/80 leading-relaxed">{ev.description}</p>
        )}
      </div>

      <button
        type="button"
        onClick={() => onDelete(ev.id)}
        disabled={deleting === ev.id}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
      >
        {deleting === ev.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
        Remover evento
      </button>
    </div>
  )
}

// ─── Event card (list view) ──────────────────────────────────────────────────

function EventCard({ ev, onDelete, deleting, past }: {
  ev: EnrichedEvent
  onDelete: (id: string) => void
  deleting: string | null
  past?: boolean
}) {
  return (
    <div className={`rounded-xl border bg-card px-4 py-3 ${past ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <CalendarDays className="size-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm text-foreground truncate">{ev.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="size-3" />
              {formatTime(ev.start_at)} – {formatTime(ev.end_at)}
            </span>
            {ev.contact && (
              <Link href={`/contacts/${ev.contact.id}`} className="flex items-center gap-1 hover:text-foreground">
                <User className="size-3" />
                {ev.contact.name ?? ev.contact.phone}
              </Link>
            )}
            {ev.deal && (
              <span className="flex items-center gap-1">
                <Briefcase className="size-3" />
                {ev.deal.title}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onDelete(ev.id)}
          disabled={deleting === ev.id}
          className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive transition-colors"
        >
          {deleting === ev.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
        </button>
      </div>
    </div>
  )
}
