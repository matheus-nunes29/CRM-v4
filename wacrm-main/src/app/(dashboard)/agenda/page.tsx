'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  CalendarDays,
  CalendarPlus,
  Clock,
  Loader2,
  Trash2,
  Video,
  User,
  Briefcase,
  AlertCircle,
  Settings,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScheduleEventModal, type CalendarEvent } from '@/components/calendar/schedule-event-modal'

interface EnrichedEvent extends CalendarEvent {
  description?: string | null
  attendees?: { email: string }[]
  contact?: { id: string; name: string | null; phone: string } | null
  deal?: { id: string; title: string } | null
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
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

export default function AgendaPage() {
  const [events, setEvents] = useState<EnrichedEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState<boolean | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/calendar/events')
    if (res.status === 400) { setConnected(false); setLoading(false); return }
    const data = await res.json()
    setConnected(true)
    setEvents(data.events ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleDelete = async (id: string) => {
    if (!confirm('Remover este evento da agenda e do Google Calendar?')) return
    setDeleting(id)
    await fetch(`/api/calendar/events/${id}`, { method: 'DELETE' })
    setEvents((prev) => prev.filter((e) => e.id !== id))
    setDeleting(null)
  }

  const upcoming = events.filter((e) => new Date(e.end_at) >= new Date())
  const past = events.filter((e) => new Date(e.end_at) < new Date())
  const groups = groupByDay(upcoming)
  const pastGroups = groupByDay(past.reverse())

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Agenda</h1>
          <p className="mt-1 text-sm text-muted-foreground">Compromissos sincronizados com o Google Calendar.</p>
        </div>
        <Button onClick={() => setShowModal(true)}>
          <CalendarPlus className="size-4" />
          Novo evento
        </Button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && connected === false && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card py-16 text-center">
          <AlertCircle className="size-8 text-muted-foreground/40" />
          <p className="text-sm font-medium text-foreground">Google Calendar não conectado</p>
          <p className="text-xs text-muted-foreground max-w-xs">Vá em Configurações → Agenda e conecte sua conta Google para começar a agendar.</p>
          <Link href="/settings?tab=calendar" className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent transition-colors">
            <Settings className="size-4" />
            Conectar Google Calendar
          </Link>
        </div>
      )}

      {!loading && connected && events.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card py-16 text-center">
          <CalendarDays className="size-8 text-muted-foreground/40" />
          <p className="text-sm font-medium text-foreground">Nenhum evento agendado</p>
          <p className="text-xs text-muted-foreground">Crie seu primeiro evento clicando em "Novo evento".</p>
        </div>
      )}

      {!loading && connected && upcoming.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Próximos</h2>
          {groups.map(([day, evs]) => (
            <div key={day} className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground capitalize">{formatDate(`${day}T12:00:00`)}</p>
              {evs.map((ev) => <EventCard key={ev.id} ev={ev} onDelete={handleDelete} deleting={deleting} />)}
            </div>
          ))}
        </section>
      )}

      {!loading && connected && past.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Passados</h2>
          {pastGroups.map(([day, evs]) => (
            <div key={day} className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground capitalize">{formatDate(`${day}T12:00:00`)}</p>
              {evs.map((ev) => <EventCard key={ev.id} ev={ev} onDelete={handleDelete} deleting={deleting} past />)}
            </div>
          ))}
        </section>
      )}

      <ScheduleEventModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onCreated={(ev) => { setEvents((prev) => [...prev, ev as EnrichedEvent].sort((a, b) => a.start_at.localeCompare(b.start_at))) }}
      />
    </div>
  )
}

function EventCard({ ev, onDelete, deleting, past }: {
  ev: EnrichedEvent
  onDelete: (id: string) => void
  deleting: string | null
  past?: boolean
}) {
  return (
    <div className={`rounded-xl border bg-card px-4 py-3 transition-opacity ${past ? 'opacity-60' : ''}`}>
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
            {ev.meet_link && (
              <a href={ev.meet_link} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-500 hover:underline">
                <Video className="size-3" />
                Google Meet
              </a>
            )}
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
          {ev.description && <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">{ev.description}</p>}
        </div>
        <button
          type="button"
          onClick={() => onDelete(ev.id)}
          disabled={deleting === ev.id}
          className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive transition-colors"
          title="Remover evento"
        >
          {deleting === ev.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
        </button>
      </div>
    </div>
  )
}
