'use client'

import { useEffect, useRef, useState } from 'react'
import { Video } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CalEvent } from './calendar-grid'

const HOUR_START = 7
const HOUR_END = 22
const TOTAL_HOURS = HOUR_END - HOUR_START
const HOUR_PX = 68
const QUARTER_MINUTES = [0, 15, 30, 45] as const
const QUARTER_PX = HOUR_PX / QUARTER_MINUTES.length

const HOURS = Array.from({ length: TOTAL_HOURS }, (_, i) => HOUR_START + i)

function dayKey(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** Top offset in px for a given time */
function topPx(date: Date): number {
  const mins = date.getHours() * 60 + date.getMinutes() - HOUR_START * 60
  return Math.max(0, (mins / 60) * HOUR_PX)
}

/** Height in px for a duration */
function heightPx(start: Date, end: Date): number {
  const mins = Math.max(15, (end.getTime() - start.getTime()) / 60_000)
  return (mins / 60) * HOUR_PX
}

/**
 * Where the *top* of the dragged card should land, given the point on the
 * card the user originally grabbed (`grabOffsetY`, px from the card's own
 * top) — not just wherever the pointer happens to be. Snapped to the
 * nearest 15-minute mark.
 */
function computeDropSlot(
  e: { currentTarget: HTMLElement; clientY: number },
  grabOffsetY: number,
  totalGridHeight: number,
) {
  const rect = e.currentTarget.getBoundingClientRect()
  const rawTop = e.clientY - rect.top - grabOffsetY
  const clampedTop = Math.max(0, Math.min(rawTop, totalGridHeight - QUARTER_PX))
  const minutesFromStart = (clampedTop / HOUR_PX) * 60
  const snappedMinutes = Math.round(minutesFromStart / 15) * 15
  return {
    hour: HOUR_START + Math.floor(snappedMinutes / 60),
    minute: snappedMinutes % 60,
  }
}

/** Lay out overlapping events into columns so they don't cover each other */
function layoutEvents(events: CalEvent[]) {
  if (!events.length) return []

  const sorted = [...events].sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
  type Slot = { ev: CalEvent; col: number; cols: number }
  const placed: Slot[] = []
  const groups: Slot[][] = []

  for (const ev of sorted) {
    const start = new Date(ev.start_at).getTime()
    const end = new Date(ev.end_at).getTime()
    let group = groups.find((g) => g.some((s) => new Date(s.ev.end_at).getTime() > start))
    if (!group) { group = []; groups.push(group) }
    const usedCols = new Set(group.map((s) => s.col))
    let col = 0
    while (usedCols.has(col)) col++
    const slot: Slot = { ev, col, cols: 1 }
    group.push(slot)
    placed.push(slot)
    // widen all in this group
    const maxCol = Math.max(...group.map((s) => s.col)) + 1
    group.forEach((s) => { s.cols = maxCol })
  }

  return placed
}

interface Props {
  days: Date[]
  events: CalEvent[]
  onSlotClick: (date: Date, hour: number, minute: number) => void
  onEventClick: (event: CalEvent) => void
  /** Fired on dropping a dragged event card onto a 15-minute slot —
   *  reschedules it to that day/time, keeping its original duration. */
  onEventDrop?: (eventId: string, date: Date, hour: number, minute: number) => void
}

export function CalendarTimeGrid({ days, events, onSlotClick, onEventClick, onEventDrop }: Props) {
  const today = new Date()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)
  // Set on dragstart, read on dragover/drop — kept in a ref (not
  // dataTransfer) because browsers only let you read dataTransfer's
  // payload on the actual drop, not while dragging over targets, and we
  // need the grab offset continuously to preview where the card will land.
  const draggingRef = useRef<{ id: string; grabOffsetY: number } | null>(null)

  // Scroll to current time on mount
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const now = new Date()
    const scrollTo = topPx(now) - 80
    el.scrollTop = Math.max(0, scrollTo)
  }, [])

  // Group events by day
  const byDay = new Map<string, CalEvent[]>()
  for (const d of days) byDay.set(dayKey(d), [])
  for (const ev of events) {
    const k = ev.start_at.slice(0, 10)
    if (byDay.has(k)) byDay.get(k)!.push(ev)
  }

  const totalGridHeight = TOTAL_HOURS * HOUR_PX
  const isToday = (d: Date) => isSameDay(d, today)
  const nowTop = topPx(today)

  return (
    <div className="flex flex-col rounded-xl border border-border bg-card overflow-hidden">
      {/* Header and time grid share one scroll container (and therefore the
          exact same scrollbar-adjusted width) so their day columns always
          line up — a separate, non-scrolling header computes its column
          widths against the full width while the scrollable grid below it
          loses width to the vertical scrollbar, drifting the two out of
          alignment. */}
      <div ref={scrollRef} className="overflow-y-auto" style={{ maxHeight: 600 }}>
        {/* Day header */}
        <div
          className="sticky top-0 z-30 grid border-b border-border bg-card"
          style={{ gridTemplateColumns: `52px repeat(${days.length}, 1fr)` }}
        >
          <div className="border-r border-border" />
          {days.map((day) => (
            <div
              key={dayKey(day)}
              className={cn(
                'py-2.5 text-center border-r border-border/60 last:border-r-0',
                isToday(day) && 'bg-primary/5',
              )}
            >
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {day.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
              </p>
              <p className={cn(
                'mx-auto mt-1 flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold',
                isToday(day) ? 'bg-primary text-primary-foreground' : 'text-foreground',
              )}>
                {day.getDate()}
              </p>
            </div>
          ))}
        </div>

        <div
          className="relative grid"
          style={{ gridTemplateColumns: `52px repeat(${days.length}, 1fr)`, height: totalGridHeight }}
        >
          {/* Hour labels */}
          <div className="relative border-r border-border pointer-events-none">
            {HOURS.map((h) => (
              <div
                key={h}
                style={{ top: (h - HOUR_START) * HOUR_PX }}
                className="absolute right-2 -translate-y-2 text-[11px] tabular-nums text-muted-foreground select-none"
              >
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day) => {
            const k = dayKey(day)
            const dayEvents = byDay.get(k) ?? []
            const laid = layoutEvents(dayEvents)
            const todayCol = isToday(day)

            return (
              <div
                key={k}
                className={cn(
                  'relative border-r border-border/60 last:border-r-0',
                  todayCol && 'bg-primary/[0.02]',
                )}
                onDragOver={(e) => {
                  if (!onEventDrop || !draggingRef.current) return
                  e.preventDefault()
                  const { hour, minute } = computeDropSlot(e, draggingRef.current.grabOffsetY, totalGridHeight)
                  setDragOverKey(`${k}-${hour}-${minute}`)
                }}
                onDragLeave={(e) => {
                  // Only clear when actually leaving the column, not when
                  // moving between its children (which also fires this).
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverKey(null)
                }}
                onDrop={(e) => {
                  if (!onEventDrop || !draggingRef.current) return
                  e.preventDefault()
                  const { id, grabOffsetY } = draggingRef.current
                  const { hour, minute } = computeDropSlot(e, grabOffsetY, totalGridHeight)
                  setDragOverKey(null)
                  draggingRef.current = null
                  onEventDrop(id, day, hour, minute)
                }}
              >
                {/* Horizontal grid lines — clickable to create event.
                    Each hour is split into four 15-minute slots so a
                    click lands on the exact time under the cursor, not
                    just the hour. Drag-and-drop is handled by the column
                    above (continuous position, not per-slot) — these divs
                    only add the click and the highlight while dragging
                    over. */}
                {HOURS.map((h) => (
                  <div key={h}>
                    {QUARTER_MINUTES.map((m) => {
                      const slotKey = `${k}-${h}-${m}`
                      return (
                        <div
                          key={m}
                          style={{
                            top: (h - HOUR_START) * HOUR_PX + (m / 60) * HOUR_PX,
                            height: QUARTER_PX,
                          }}
                          className={cn(
                            'absolute left-0 right-0 cursor-pointer transition-colors',
                            m === 0 ? 'border-t border-border/40' : 'border-t border-border/10',
                            dragOverKey === slotKey ? 'bg-primary/20' : 'hover:bg-accent/20',
                          )}
                          onClick={() => onSlotClick(day, h, m)}
                        />
                      )
                    })}
                  </div>
                ))}

                {/* Current-time red line */}
                {todayCol && nowTop >= 0 && nowTop <= totalGridHeight && (
                  <div
                    style={{ top: nowTop }}
                    className="pointer-events-none absolute left-0 right-0 z-20 flex items-center"
                  >
                    <div className="size-2 shrink-0 rounded-full bg-red-500 -translate-x-1" />
                    <div className="h-px flex-1 bg-red-500" />
                  </div>
                )}

                {/* Events */}
                {laid.map(({ ev, col, cols }) => {
                  const start = new Date(ev.start_at)
                  const end = new Date(ev.end_at)
                  const top = topPx(start)
                  const height = heightPx(start, end)
                  if (top >= totalGridHeight) return null

                  const colW = `calc((100% - 4px) / ${cols})`
                  const colL = `calc((100% - 4px) / ${cols} * ${col} + 2px)`

                  return (
                    <button
                      key={ev.id}
                      type="button"
                      draggable={!!onEventDrop}
                      onDragStart={(e) => {
                        e.stopPropagation()
                        const rect = e.currentTarget.getBoundingClientRect()
                        draggingRef.current = { id: ev.id, grabOffsetY: e.clientY - rect.top }
                        e.dataTransfer.setData('text/plain', ev.id)
                        e.dataTransfer.effectAllowed = 'move'
                      }}
                      onDragEnd={() => { draggingRef.current = null; setDragOverKey(null) }}
                      onClick={(e) => { e.stopPropagation(); onEventClick(ev) }}
                      style={{ top: top + 1, height: height - 2, width: colW, left: colL }}
                      className={cn(
                        'absolute z-10 overflow-hidden rounded-md px-1.5 py-1 text-left ring-1 transition-opacity hover:opacity-90',
                        onEventDrop && 'cursor-grab active:cursor-grabbing',
                        ev.status === 'cancelled'
                          ? 'bg-muted/60 text-muted-foreground ring-border line-through'
                          : 'bg-primary/20 text-primary ring-primary/30 hover:bg-primary/30',
                      )}
                      title={ev.title}
                    >
                      <p className="truncate text-[11px] font-semibold leading-tight">
                        {ev.meet_link && <Video className="mr-0.5 inline size-2.5" />}
                        {ev.title}
                      </p>
                      {height >= 36 && (
                        <p className="mt-0.5 text-[10px] opacity-75 leading-tight">
                          {start.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          {' – '}
                          {end.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
