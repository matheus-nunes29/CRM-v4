'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Deal, DealStatus, Pipeline, PipelineStage, TrackingLink } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Briefcase,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Megaphone,
  Pencil,
  Search,
  Users,
} from 'lucide-react'
import { DealForm } from '@/components/pipelines/deal-form'
import { DealModal } from '@/components/pipelines/deal-modal'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 25

const STATUS_META: Record<DealStatus, { label: string; className: string }> = {
  open: { label: 'Em andamento', className: 'bg-primary/10 text-primary' },
  won: { label: 'Ganho', className: 'bg-emerald-600/10 text-emerald-600 dark:text-emerald-400' },
  lost: { label: 'Perdido', className: 'bg-rose-500/10 text-rose-500' },
}

interface DealRow extends Omit<Deal, 'contact' | 'stage' | 'assignee'> {
  contact?: { id: string; name: string; phone?: string | null; tracking_link_id?: string | null; utm_source?: string | null } | null
  stage?: { id: string; name: string } | null
  assignee?: { id: string; full_name: string | null } | null
}

interface PipelineWithStages extends Pipeline {
  stages: PipelineStage[]
}

interface Member { user_id: string; full_name: string }

export default function NegociosPage() {
  const supabase = createClient()
  const searchParams = useSearchParams()
  const router = useRouter()

  const [deals, setDeals] = useState<DealRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [statusFilter, setStatusFilter] = useState<DealStatus | 'all'>('all')
  const [ownerFilter, setOwnerFilter] = useState<string>('')
  const [members, setMembers] = useState<Member[]>([])

  const [pipelinesMap, setPipelinesMap] = useState<Record<string, PipelineWithStages>>({})
  const [trackingLinksMap, setTrackingLinksMap] = useState<Record<string, TrackingLink>>({})

  const [formOpen, setFormOpen] = useState(false)
  const [editDeal, setEditDeal] = useState<DealRow | null>(null)
  const [editDealStages, setEditDealStages] = useState<PipelineStage[] | null>(null)

  // Deal modal (view/inline edit)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalDealId, setModalDealId] = useState<string | null>(null)
  const [modalStages, setModalStages] = useState<PipelineStage[]>([])

  const fetchSeq = useRef(0)

  const fetchPipelines = useCallback(async () => {
    const { data: pipelinesData } = await supabase
      .from('pipelines')
      .select('*')
      .order('created_at', { ascending: true })

    if (!pipelinesData?.length) return

    const { data: stagesData } = await supabase
      .from('pipeline_stages')
      .select('*')
      .in('pipeline_id', pipelinesData.map((p) => p.id))
      .order('position', { ascending: true })

    const stagesByPipeline: Record<string, PipelineStage[]> = {}
    for (const s of stagesData ?? []) {
      if (!stagesByPipeline[s.pipeline_id]) stagesByPipeline[s.pipeline_id] = []
      stagesByPipeline[s.pipeline_id].push(s)
    }

    const map: Record<string, PipelineWithStages> = {}
    for (const p of pipelinesData) {
      map[p.id] = { ...p, stages: stagesByPipeline[p.id] ?? [] }
    }
    setPipelinesMap(map)
  }, [supabase])

  const fetchDeals = useCallback(async () => {
    const seq = ++fetchSeq.current
    setLoading(true)

    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    const term = search.trim()

    let query = supabase
      .from('deals')
      .select(
        '*, contact:contacts(id, name, phone, tracking_link_id, utm_source), stage:pipeline_stages(id, name), assignee:profiles!deals_assigned_to_fkey(id, full_name)',
        { count: 'exact' },
      )
      .order('created_at', { ascending: false })
      .range(from, to)

    if (term) query = query.ilike('title', `%${term}%`)
    if (statusFilter !== 'all') query = query.eq('status', statusFilter)
    if (ownerFilter) query = query.eq('assigned_to', ownerFilter)

    const { data, count, error } = await query

    if (seq !== fetchSeq.current) return
    if (error) {
      toast.error('Falha ao carregar negócios')
      setLoading(false)
      return
    }

    setDeals((data as DealRow[]) ?? [])
    setTotalCount(count ?? 0)
    setLoading(false)
  }, [supabase, page, search, statusFilter, ownerFilter])

  useEffect(() => {
    fetchPipelines()
    supabase.from('tracking_links').select('*').then(({ data }) => {
      const map: Record<string, TrackingLink> = {}
      for (const l of data ?? []) map[l.id] = l
      setTrackingLinksMap(map)
    })
    fetch('/api/account/members')
      .then(r => r.json())
      .then(j => setMembers((j.members ?? []) as Member[]))
      .catch(() => {})
  }, [fetchPipelines, supabase])

  useEffect(() => {
    setPage(0)
  }, [search, statusFilter, ownerFilter])

  useEffect(() => {
    fetchDeals()
  }, [fetchDeals])

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  // Open form from ?open=id (search results, external links).
  // The deal might not be on the current page, so fetch it by ID if needed.
  useEffect(() => {
    const id = searchParams.get('open')
    if (!id) return

    const inList = deals.find((d) => d.id === id)
    if (inList) {
      setEditDeal(inList)
      setFormOpen(true)
      return
    }

    // Not in current page — fetch deal + its pipeline stages directly
    supabase
      .from('deals')
      .select('*, contact:contacts(id, name, phone), stage:pipeline_stages(id, name), assignee:profiles!deals_assigned_to_fkey(id, full_name)')
      .eq('id', id)
      .single()
      .then(async ({ data }) => {
        if (!data) return
        const deal = data as DealRow
        const { data: stagesData } = await supabase
          .from('pipeline_stages')
          .select('*')
          .eq('pipeline_id', deal.pipeline_id)
          .order('position', { ascending: true })
        setEditDealStages((stagesData as PipelineStage[]) ?? [])
        setEditDeal(deal)
        setFormOpen(true)
      })
  }, [searchParams, deals, supabase])

  function formatValue(value: number, currency?: string) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: currency && currency !== 'USD' ? currency : 'BRL',
      maximumFractionDigits: 2,
    }).format(value ?? 0)
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('pt-BR')
  }

  function openEdit(deal: DealRow) {
    setEditDealStages(null)
    setEditDeal(deal)
    setFormOpen(true)
  }

  const currentFormPipeline = editDeal ? pipelinesMap[editDeal.pipeline_id] : null

  const statusLabel =
    statusFilter === 'all' ? 'Todos os status' : STATUS_META[statusFilter].label

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Negócios</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {loading
              ? 'Carregando...'
              : totalCount === 0
                ? 'Nenhum negócio cadastrado'
                : `${totalCount} negócio${totalCount === 1 ? '' : 's'}`}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por título..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" className="gap-2">
                {statusLabel}
                <ChevronDown className="h-4 w-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setStatusFilter('all')}>
              Todos os status
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setStatusFilter('open')}>
              Em andamento
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setStatusFilter('won')}>
              Ganho
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setStatusFilter('lost')}>
              Perdido
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {members.length > 0 && (
          <div className="relative flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm">
            <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
            <select
              value={ownerFilter}
              onChange={e => setOwnerFilter(e.target.value)}
              className="appearance-none bg-transparent pr-5 text-sm text-foreground focus:outline-none"
            >
              <option value="">Toda equipe</option>
              {members.map(m => (
                <option key={m.user_id} value={m.user_id}>{m.full_name || m.user_id}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Título</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Data de criação</TableHead>
              <TableHead>Etapa · Pipeline</TableHead>
              <TableHead>Contato</TableHead>
              <TableHead className="hidden xl:table-cell">Origem</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="py-16 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : deals.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Briefcase className="h-8 w-8 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">
                      {search || statusFilter !== 'all'
                        ? 'Nenhum negócio encontrado para os filtros aplicados'
                        : 'Nenhum negócio cadastrado ainda'}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              deals.map((deal) => {
                const status = deal.status ?? 'open'
                const meta = STATUS_META[status]
                const pipeline = pipelinesMap[deal.pipeline_id]
                return (
                  <TableRow
                    key={deal.id}
                    className="cursor-pointer"
                    onClick={() => {
                      setModalDealId(deal.id)
                      setModalStages(pipelinesMap[deal.pipeline_id]?.stages ?? [])
                      setModalOpen(true)
                    }}
                  >
                    <TableCell className="font-medium">{deal.title}</TableCell>
                    <TableCell className="tabular-nums text-foreground">
                      {formatValue(deal.value, deal.currency)}
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {formatDate(deal.created_at)}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{deal.stage?.name ?? '—'}</span>
                      {pipeline && (
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          · {pipeline.name}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {deal.contact?.name ?? '—'}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      {deal.contact?.tracking_link_id && trackingLinksMap[deal.contact.tracking_link_id] ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                          <Megaphone className="size-2.5" />
                          {trackingLinksMap[deal.contact.tracking_link_id].name}
                        </span>
                      ) : deal.contact?.utm_source ? (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                          {deal.contact.utm_source}
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {deal.assignee?.full_name ?? '—'}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'rounded-full px-2.5 py-0.5 text-xs font-medium',
                          meta.className,
                        )}
                      >
                        {meta.label}
                      </span>
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        aria-label="Editar negócio"
                        onClick={(e) => {
                          e.stopPropagation()
                          openEdit(deal)
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>

        {totalCount > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-border px-5 py-3 text-xs text-muted-foreground">
            <span className="tabular-nums">
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} de {totalCount}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="tabular-nums">
                {page + 1} / {totalPages}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <DealModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        dealId={modalDealId}
        initialStages={modalStages}
        members={members}
        onRefresh={fetchDeals}
      />

      {editDeal && (currentFormPipeline || editDealStages) && (
        <DealForm
          open={formOpen}
          onOpenChange={(o) => {
            setFormOpen(o)
            if (!o) {
              setEditDeal(null)
              setEditDealStages(null)
              if (searchParams.get('open')) {
                const params = new URLSearchParams(searchParams.toString())
                params.delete('open')
                router.replace(`/negocios${params.size ? `?${params}` : ''}`)
              }
            }
          }}
          deal={editDeal as Deal}
          pipelineId={editDeal.pipeline_id}
          stages={editDealStages ?? currentFormPipeline?.stages ?? []}
          onSaved={() => {
            setFormOpen(false)
            setEditDeal(null)
            fetchDeals()
          }}
        />
      )}
    </div>
  )
}
