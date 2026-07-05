'use client'

import { useMemo } from 'react'
import { Video } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface CalEvent {
  id: string
  title: string
  start_at: string
  end_at: string
  meet_link?: string | null
  status?: string
}

interface Props {
  year: number
  month: number  // 0-based
  events: CalEvent[]
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onDayClick: (date: Date) => void
  onEventClick: (event: CalEvent) => void
}

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function CalendarGrid({ year, month, events, onPrev, onNext, onToday, onDayClick, onEventClick }: Props) {
  const today = new Date()

  const { days } = useMemo(() => {
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)

    // Pad start: Sunday = 0
    const startPad = firstDay.getDay()
    const days: (Date | null)[] = []
    for (let i = 0; i < startPad; i++) days.push(null)
    for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d))
    // Pad end to complete the last row
    while (days.length % 7 !== 0) days.push(null)

    return { days }
  }, [year, month])

  // Index events by YYYY-MM-DD
  const byDay = useMemo(() => {
    const map = new Map<string, CalEvent[]>()
    for (const ev of events) {
      const d = ev.start_at.slice(0, 10)
      if (!map.has(d)) map.set(d, [])
      map.get(d)!.push(ev)
    }
    return map
  }, [events])

  const pad = (n: number) => String(n).padStart(2, '0')
  const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Weekday labels */}
      <div className="grid grid-cols-7 border-b border-border">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-2 text-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7">
        {days.map((day, i) => {
          if (!day) {
            return <div key={`pad-${i}`} className="min-h-[100px] border-b border-r border-border/50 bg-muted/20 last:border-r-0" />
          }

          const isToday = isSameDay(day, today)
          const isPast = day < today && !isToday
          const dayKey = key(day)
          const dayEvents = byDay.get(dayKey) ?? []
          const col = day.getDay() // 0=Sun, 6=Sat
          const isLastCol = col === 6

          return (
            <div
              key={dayKey}
              onClick={() => onDayClick(day)}
              className={cn(
                'min-h-[100px] cursor-pointer border-b border-r border-border/50 p-1.5 transition-colors hover:bg-accent/30',
                isLastCol && 'border-r-0',
                isPast && 'bg-muted/10',
              )}
            >
              <div className={cn(
                'mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium',
                isToday
                  ? 'bg-primary text-primary-foreground'
                  : 'text-foreground hover:bg-accent',
              )}>
                {day.getDate()}
              </div>

              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onEventClick(ev) }}
                    className={cn(
                      'w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium transition-opacity',
                      ev.status === 'cancelled'
                        ? 'line-through text-muted-foreground'
                        : 'bg-primary/15 text-primary hover:bg-primary/25',
                    )}
                    title={ev.title}
                  >
                    {ev.meet_link && <Video className="mr-0.5 inline size-2.5" />}
                    {formatTime(ev.start_at)} {ev.title}
                  </button>
                ))}
                {dayEvents.length > 3 && (
                  <p className="px-1 text-[10px] text-muted-foreground">+{dayEvents.length - 3} mais</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
