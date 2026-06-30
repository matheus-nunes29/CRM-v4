'use client'

import { use, useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { formatCurrency } from '@/lib/currency'
import { ArrowLeft, Briefcase, Loader2, Pencil, User, Tag, CalendarDays, TrendingUp, TrendingDown } from 'lucide-react'
import type { Deal, Pipeline, PipelineStage } from '@/types'
import { Button } from '@/components/ui/button'
import { DealForm } from '@/components/pipelines/deal-form'
import { cn } from '@/lib/utils'

interface Props {
  params: Promise<{ id: string }>
}

interface DealDetail extends Omit<Deal, 'contact' | 'stage' | 'assignee'> {
  contact?: { id: string; name: string | null; phone: string | null } | null
  stage?: { id: string; name: string } | null
  assignee?: { id: string; full_name: string | null } | null
  pipeline?: { id: string; name: string } | null
}

const STATUS_META = {
  open: { label: 'Em andamento', className: 'bg-primary/10 text-primary' },
  won: { label: 'Ganho', className: 'bg-emerald-600/10 text-emerald-600' },
  lost: { label: 'Perdido', className: 'bg-rose-500/10 text-rose-500' },
} as const

export default function DealDetailPage({ params }: Props) {
  const { id } = use(params)
  const router = useRouter()
  const supabase = createClient()
  const { defaultCurrency } = useAuth()

  const [deal, setDeal] = useState<DealDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [stages, setStages] = useState<PipelineStage[]>([])
  const [formOpen, setFormOpen] = useState(false)

  const fetchDeal = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('deals')
      .select(`
        *,
        contact:contacts(id, name, phone),
        stage:pipeline_stages(id, name),
        assignee:profiles!deals_assigned_to_fkey(id, full_name),
        pipeline:pipelines(id, name)
      `)
      .eq('id', id)
      .single()

    if (data) {
      setDeal(data as DealDetail)

      // Load stages for this pipeline so DealForm can be opened
      if (data.pipeline_id) {
        const { data: stagesData } = await supabase
          .from('pipeline_stages')
          .select('*')
          .eq('pipeline_id', data.pipeline_id)
          .order('position', { ascending: true })
        setStages((stagesData as PipelineStage[]) ?? [])
      }
    }
    setLoading(false)
  }, [id, supabase])

  useEffect(() => { fetchDeal() }, [fetchDeal])

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!deal) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-muted-foreground">
        <Briefcase className="h-10 w-10 opacity-30" />
        <p className="text-sm">Negócio não encontrado.</p>
        <Button variant="ghost" size="sm" onClick={() => router.push('/negocios')}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Voltar para Negócios
        </Button>
      </div>
    )
  }

  const statusMeta = STATUS_META[deal.status as keyof typeof STATUS_META] ?? STATUS_META.open

  return (
    <div className="mx-auto max-w-2xl space-y-5 animate-in fade-in-50 duration-200">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
          className="gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>

        <Button size="sm" onClick={() => setFormOpen(true)} className="gap-1.5">
          <Pencil className="h-4 w-4" />
          Editar
        </Button>
      </div>

      {/* Header card */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Briefcase className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">{deal.title ?? 'Negócio'}</h1>
              {deal.pipeline?.name && (
                <p className="text-sm text-muted-foreground">{deal.pipeline.name}</p>
              )}
            </div>
          </div>
          <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', statusMeta.className)}>
            {statusMeta.label}
          </span>
        </div>

        {deal.value != null && deal.value > 0 && (
          <p className="text-2xl font-bold text-foreground">
            {formatCurrency(deal.value, deal.currency ?? defaultCurrency)}
          </p>
        )}
      </div>

      {/* Info grid */}
      <div className="grid gap-3 sm:grid-cols-2">
        {deal.contact && (
          <InfoCard
            icon={<User className="h-4 w-4" />}
            label="Contato"
            value={deal.contact.name ?? deal.contact.phone ?? '—'}
            onClick={() => router.push(`/contacts/${deal.contact!.id}`)}
          />
        )}
        {deal.stage && (
          <InfoCard icon={<Tag className="h-4 w-4" />} label="Etapa" value={deal.stage.name} />
        )}
        {deal.assignee && (
          <InfoCard
            icon={<User className="h-4 w-4" />}
            label="Responsável"
            value={deal.assignee.full_name ?? '—'}
          />
        )}
        {deal.created_at && (
          <InfoCard
            icon={<CalendarDays className="h-4 w-4" />}
            label="Criado em"
            value={new Date(deal.created_at).toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}
          />
        )}
        {deal.expected_close_date && (
          <InfoCard
            icon={<CalendarDays className="h-4 w-4" />}
            label="Previsão de fechamento"
            value={new Date(deal.expected_close_date).toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}
          />
        )}
      </div>

      {deal.notes && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Observações
          </p>
          <p className="whitespace-pre-wrap text-sm text-foreground">{deal.notes}</p>
        </div>
      )}

      {deal.pipeline_id && (
        <DealForm
          open={formOpen}
          onOpenChange={setFormOpen}
          deal={deal as unknown as Deal}
          pipelineId={deal.pipeline_id}
          stages={stages}
          onSaved={() => { setFormOpen(false); fetchDeal() }}
        />
      )}
    </div>
  )
}

function InfoCard({
  icon,
  label,
  value,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  value: string
  onClick?: () => void
}) {
  const Wrapper = onClick ? 'button' : 'div'
  return (
    <Wrapper
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 rounded-xl border border-border bg-card p-3.5 text-left',
        onClick && 'cursor-pointer transition-colors hover:bg-accent',
      )}
    >
      <span className="text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium text-foreground">{value}</p>
      </div>
    </Wrapper>
  )
}
