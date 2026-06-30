'use client'

import { useState } from 'react'
import { CalendarPlus, Loader2, Video, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'

interface Props {
  open: boolean
  onClose: () => void
  onCreated?: (event: CalendarEvent) => void
  contactId?: string
  contactName?: string
  dealId?: string
}

export interface CalendarEvent {
  id: string
  title: string
  start_at: string
  end_at: string
  meet_link: string | null
  contact_id: string | null
  deal_id: string | null
}

function toLocalDatetimeValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function ScheduleEventModal({ open, onClose, onCreated, contactId, contactName, dealId }: Props) {
  const now = new Date()
  now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15, 0, 0)
  const endDefault = new Date(now.getTime() + 60 * 60 * 1000)

  const [title, setTitle] = useState(contactName ? `Reunião com ${contactName}` : '')
  const [description, setDescription] = useState('')
  const [startAt, setStartAt] = useState(toLocalDatetimeValue(now))
  const [endAt, setEndAt] = useState(toLocalDatetimeValue(endDefault))
  const [attendees, setAttendees] = useState('')
  const [addMeet, setAddMeet] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setTitle(contactName ? `Reunião com ${contactName}` : '')
    setDescription('')
    setStartAt(toLocalDatetimeValue(now))
    setEndAt(toLocalDatetimeValue(endDefault))
    setAttendees('')
    setAddMeet(true)
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!title.trim()) { setError('Informe o título do evento.'); return }
    if (new Date(startAt) >= new Date(endAt)) { setError('O término deve ser depois do início.'); return }

    setLoading(true)
    try {
      const res = await fetch('/api/calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          start_at: new Date(startAt).toISOString(),
          end_at: new Date(endAt).toISOString(),
          contact_id: contactId ?? null,
          deal_id: dealId ?? null,
          attendee_emails: attendees.split(',').map((e) => e.trim()).filter(Boolean),
          add_meet: addMeet,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Erro ao criar evento.'); return }
      onCreated?.(data.event)
      reset()
      onClose()
    } catch {
      setError('Erro de rede. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose() } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="size-4 text-primary" />
            Agendar evento
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-1">
          <div className="space-y-1.5">
            <Label htmlFor="ev-title">Título</Label>
            <Input id="ev-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ex: Reunião de acompanhamento" required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ev-start">Início</Label>
              <Input id="ev-start" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-end">Término</Label>
              <Input id="ev-end" type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} required />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ev-desc">Descrição <span className="text-muted-foreground text-xs">(opcional)</span></Label>
            <Textarea id="ev-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Pauta, link, notas..." />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ev-att">Convidados <span className="text-muted-foreground text-xs">(e-mails separados por vírgula)</span></Label>
            <Input id="ev-att" value={attendees} onChange={(e) => setAttendees(e.target.value)} placeholder="cliente@email.com, outro@email.com" />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
            <div className="flex items-center gap-2 text-sm">
              <Video className="size-4 text-blue-500" />
              <span>Criar link do Google Meet</span>
            </div>
            <Switch checked={addMeet} onCheckedChange={setAddMeet} />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <X className="size-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => { reset(); onClose() }} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="size-4 animate-spin" /> : <CalendarPlus className="size-4" />}
              Agendar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
