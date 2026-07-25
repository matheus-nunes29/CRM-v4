'use client'

import { useEffect, useRef, useState } from 'react'
import { CalendarPlus, ChevronDown, Loader2, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/client'

interface ProfileOption { id: string; full_name: string | null; email: string }

export interface CalendarEvent {
  id: string
  title: string
  start_at: string
  end_at: string
  meet_link: string | null
  contact_id: string | null
  deal_id: string | null
  description?: string | null
  assigned_to?: string | null
  contact?: { id: string; name: string | null; phone: string } | null
  deal?: { id: string; title: string } | null
}

interface Props {
  open: boolean
  onClose: () => void
  onCreated?: (event: CalendarEvent) => void
  /** Editing an existing event instead of creating one — pre-fills every
   *  field from it and PUTs on submit instead of POSTing. */
  editEvent?: CalendarEvent | null
  onUpdated?: (event: CalendarEvent) => void
  /** Pre-filled from a contact's detail page */
  contactId?: string
  contactName?: string
  dealId?: string
  defaultDate?: Date
}

interface ContactOption { id: string; name: string | null; phone: string }
interface DealOption    { id: string; title: string }

function toLocalDatetimeValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function computeDefaults(base?: Date) {
  const now = base ? new Date(base) : new Date()
  // No base date (opened without clicking a slot) — round up to the next
  // quarter hour. A base date already carries the exact day/hour/minute
  // the user clicked, so it's used as-is.
  if (!base) now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15, 0, 0)
  return { start: now, end: new Date(now.getTime() + 60 * 60 * 1000) }
}

function useSearch<T>(
  query: string,
  fetcher: (q: string) => Promise<T[]>,
  minLength = 1,
) {
  const [results, setResults] = useState<T[]>([])
  const [loading, setLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (query.length < minLength) { setResults([]); return }
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      setLoading(true)
      try { setResults(await fetcher(query)) } finally { setLoading(false) }
    }, 200)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [query, fetcher, minLength])

  return { results, loading }
}

export function ScheduleEventModal({
  open, onClose, onCreated,
  editEvent, onUpdated,
  contactId: initContactId, contactName: initContactName,
  dealId: initDealId,
  defaultDate,
}: Props) {
  const supabase = createClient()

  const [title, setTitle]       = useState('')
  const [description, setDesc]  = useState('')
  const [startAt, setStartAt]   = useState('')
  const [endAt, setEndAt]       = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [profiles, setProfiles] = useState<ProfileOption[]>([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  // Contact picker
  const [contactQuery, setContactQuery]   = useState('')
  const [selectedContact, setContact]     = useState<ContactOption | null>(null)
  const [showContactDrop, setContactDrop] = useState(false)

  // Deal picker
  const [dealQuery, setDealQuery]   = useState('')
  const [selectedDeal, setDeal]     = useState<DealOption | null>(null)
  const [showDealDrop, setDealDrop] = useState(false)

  useEffect(() => {
    if (!open) return
    supabase
      .from('profiles')
      .select('id, full_name, email')
      .order('full_name')
      .then(({ data }) => setProfiles((data as ProfileOption[]) ?? []))
  }, [open, supabase])

  // Populate the form every time the dialog opens — from the event being
  // edited, or fresh defaults for a new one. The modal stays mounted
  // across opens (callers just flip `open`), so this can't be plain
  // initial state.
  useEffect(() => {
    if (!open) return
    if (editEvent) {
      setTitle(editEvent.title)
      setDesc(editEvent.description ?? '')
      setStartAt(toLocalDatetimeValue(new Date(editEvent.start_at)))
      setEndAt(toLocalDatetimeValue(new Date(editEvent.end_at)))
      setAssignedTo(editEvent.assigned_to ?? '')
      setContact(
        editEvent.contact
          ? { id: editEvent.contact.id, name: editEvent.contact.name, phone: editEvent.contact.phone }
          : editEvent.contact_id
          ? { id: editEvent.contact_id, name: null, phone: '' }
          : null,
      )
      setContactQuery(editEvent.contact?.name ?? editEvent.contact?.phone ?? '')
      setDeal(
        editEvent.deal
          ? { id: editEvent.deal.id, title: editEvent.deal.title }
          : editEvent.deal_id
          ? { id: editEvent.deal_id, title: '' }
          : null,
      )
      setDealQuery(editEvent.deal?.title ?? '')
      setError(null)
    } else {
      const { start, end } = computeDefaults(defaultDate)
      setTitle(initContactName ? `Reunião com ${initContactName}` : '')
      setDesc('')
      setStartAt(toLocalDatetimeValue(start))
      setEndAt(toLocalDatetimeValue(end))
      setAssignedTo('')
      setContact(initContactId ? { id: initContactId, name: initContactName ?? null, phone: '' } : null)
      setContactQuery(initContactName ?? '')
      setDeal(initDealId ? { id: initDealId, title: '' } : null)
      setDealQuery('')
      setError(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editEvent, defaultDate])

  const fetchContacts = async (q: string): Promise<ContactOption[]> => {
    const { data: profile } = await supabase.from('profiles').select('account_id').maybeSingle()
    if (!profile?.account_id) return []
    const { data } = await supabase
      .from('contacts')
      .select('id, name, phone')
      .eq('account_id', profile.account_id)
      .or(`name.ilike.%${q}%,phone.ilike.%${q}%`)
      .limit(8)
    return (data as ContactOption[]) ?? []
  }

  const fetchDeals = async (q: string): Promise<DealOption[]> => {
    const { data: profile } = await supabase.from('profiles').select('account_id').maybeSingle()
    if (!profile?.account_id) return []
    const { data } = await supabase
      .from('deals')
      .select('id, title')
      .eq('account_id', profile.account_id)
      .ilike('title', `%${q}%`)
      .limit(8)
    return (data as DealOption[]) ?? []
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableContacts = useRef(fetchContacts).current
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableDeals = useRef(fetchDeals).current

  const { results: contactResults, loading: contactLoading } = useSearch(
    selectedContact ? '' : contactQuery,
    stableContacts,
  )
  const { results: dealResults, loading: dealLoading } = useSearch(
    selectedDeal ? '' : dealQuery,
    stableDeals,
  )

  const reset = () => {
    const { start, end } = computeDefaults(defaultDate)
    setTitle(initContactName ? `Reunião com ${initContactName}` : '')
    setDesc('')
    setStartAt(toLocalDatetimeValue(start))
    setEndAt(toLocalDatetimeValue(end))
    setAssignedTo('')
    setContact(initContactId ? { id: initContactId, name: initContactName ?? null, phone: '' } : null)
    setContactQuery(initContactName ?? '')
    setDeal(initDealId ? { id: initDealId, title: '' } : null)
    setDealQuery('')
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!title.trim()) { setError('Informe o título do agendamento.'); return }
    if (!assignedTo) { setError('Selecione o membro responsável.'); return }
    if (!selectedContact) { setError('Selecione um contato.'); return }
    if (!selectedDeal) { setError('Selecione um negócio.'); return }
    if (new Date(startAt) >= new Date(endAt)) { setError('O término deve ser depois do início.'); return }

    setLoading(true)
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || undefined,
        start_at: new Date(startAt).toISOString(),
        end_at: new Date(endAt).toISOString(),
        contact_id: selectedContact?.id ?? null,
        deal_id: selectedDeal?.id ?? null,
        assigned_to: assignedTo,
      }
      const res = editEvent
        ? await fetch(`/api/calendar/events/${editEvent.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/calendar/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? (editEvent ? 'Erro ao salvar evento.' : 'Erro ao criar evento.')); return }
      if (editEvent) onUpdated?.(data.event)
      else onCreated?.(data.event)
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
            {editEvent ? 'Editar agendamento' : 'Agendamento'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-1">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="ev-title">Título <span className="text-primary">*</span></Label>
            <Input
              id="ev-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título do agendamento obrigatório"
              required
            />
          </div>

          {/* Date range */}
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

          {/* Responsible member — required */}
          <div className="space-y-1.5">
            <Label htmlFor="ev-assigned">
              Responsável <span className="text-primary">*</span>
            </Label>
            <div className="relative">
              <select
                id="ev-assigned"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                required
                className="h-9 w-full appearance-none rounded-lg border border-border bg-muted/60 px-3 pr-8 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                <option value="">Selecionar membro…</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name || p.email}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>

          {/* Contact picker */}
          <div className="space-y-1.5">
            <Label>Contato <span className="text-primary">*</span></Label>
            {selectedContact ? (
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                <span className="truncate">{selectedContact.name ?? selectedContact.phone}</span>
                <button type="button" onClick={() => { setContact(null); setContactQuery('') }} className="ml-2 text-muted-foreground hover:text-foreground">
                  <X className="size-3.5" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={contactQuery}
                  onChange={(e) => { setContactQuery(e.target.value); setContactDrop(true) }}
                  onFocus={() => setContactDrop(true)}
                  onBlur={() => setTimeout(() => setContactDrop(false), 150)}
                  placeholder="Buscar por nome ou telefone…"
                  className="pl-8"
                />
                {showContactDrop && (contactLoading || contactResults.length > 0) && (
                  <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-md">
                    {contactLoading && <p className="px-3 py-2 text-xs text-muted-foreground">Buscando…</p>}
                    {contactResults.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onMouseDown={() => { setContact(c); setContactQuery(c.name ?? c.phone); setContactDrop(false) }}
                        className="flex w-full flex-col px-3 py-2 text-left hover:bg-accent"
                      >
                        <span className="text-sm font-medium">{c.name ?? '(sem nome)'}</span>
                        <span className="text-xs text-muted-foreground">{c.phone}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Deal picker */}
          <div className="space-y-1.5">
            <Label>Negócio <span className="text-primary">*</span></Label>
            {selectedDeal ? (
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                <span className="truncate">{selectedDeal.title}</span>
                <button type="button" onClick={() => { setDeal(null); setDealQuery('') }} className="ml-2 text-muted-foreground hover:text-foreground">
                  <X className="size-3.5" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={dealQuery}
                  onChange={(e) => { setDealQuery(e.target.value); setDealDrop(true) }}
                  onFocus={() => setDealDrop(true)}
                  onBlur={() => setTimeout(() => setDealDrop(false), 150)}
                  placeholder="Buscar negócio…"
                  className="pl-8"
                />
                {showDealDrop && (dealLoading || dealResults.length > 0) && (
                  <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-md">
                    {dealLoading && <p className="px-3 py-2 text-xs text-muted-foreground">Buscando…</p>}
                    {dealResults.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onMouseDown={() => { setDeal(d); setDealQuery(d.title); setDealDrop(false) }}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                      >
                        {d.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="ev-desc">Descrição <span className="text-muted-foreground text-xs">(opcional)</span></Label>
            <Textarea
              id="ev-desc"
              value={description}
              onChange={(e) => setDesc(e.target.value)}
              rows={2}
              placeholder="Pauta, notas…"
            />
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
              {editEvent ? 'Salvar' : 'Agendar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
