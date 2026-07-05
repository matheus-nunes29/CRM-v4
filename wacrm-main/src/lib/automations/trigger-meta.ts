import type { AutomationTriggerType } from '@/types'

export interface TriggerMeta {
  label: string
  /** Tailwind classes for the Badge pill on the list row. */
  pillClass: string
}

export const TRIGGER_META: Record<AutomationTriggerType, TriggerMeta> = {
  new_message_received: {
    label: 'Nova Mensagem Recebida',
    pillClass: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
  },
  first_inbound_message: {
    label: 'Primeiro Contato',
    pillClass: 'border-teal-500/30 bg-teal-500/10 text-teal-300',
  },
  keyword_match: {
    label: 'Palavra-chave',
    pillClass: 'border-purple-500/30 bg-purple-500/10 text-purple-300',
  },
  new_contact_created: {
    label: 'Novo Contato',
    pillClass: 'border-primary/30 bg-primary/10 text-primary',
  },
  conversation_assigned: {
    label: 'Conversa Atribuída',
    pillClass: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300',
  },
  tag_added: {
    label: 'Tag Adicionada',
    pillClass: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  },
  tag_removed: {
    label: 'Tag Removida',
    pillClass: 'border-amber-600/30 bg-amber-600/10 text-amber-400',
  },
  time_based: {
    label: 'Agendado',
    pillClass: 'border-slate-500/30 bg-slate-500/10 text-muted-foreground',
  },
  deal_stage_entered: {
    label: 'Entrou na Etapa',
    pillClass: 'border-orange-500/30 bg-orange-500/10 text-orange-300',
  },
  deal_stage_left: {
    label: 'Saiu da Etapa',
    pillClass: 'border-orange-600/30 bg-orange-600/10 text-orange-400',
  },
  deal_created: {
    label: 'Negócio Criado',
    pillClass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  },
  deal_won: {
    label: 'Negócio Ganho',
    pillClass: 'border-green-500/30 bg-green-500/10 text-green-300',
  },
  deal_lost: {
    label: 'Negócio Perdido',
    pillClass: 'border-red-500/30 bg-red-500/10 text-red-400',
  },
  conversation_closed: {
    label: 'Conversa Encerrada',
    pillClass: 'border-slate-600/30 bg-slate-600/10 text-slate-400',
  },
  contact_field_changed: {
    label: 'Campo do Contato Alterado',
    pillClass: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
  },
  broadcast_reply: {
    label: 'Resposta ao Disparo',
    pillClass: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300',
  },
  conversation_idle: {
    label: 'Conversa Ociosa',
    pillClass: 'border-yellow-600/30 bg-yellow-600/10 text-yellow-400',
  },
  contact_inactive: {
    label: 'Contato Inativo',
    pillClass: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
  },
  deal_stagnant: {
    label: 'Negócio Parado',
    pillClass: 'border-orange-700/30 bg-orange-700/10 text-orange-500',
  },
}

export function triggerMeta(t: AutomationTriggerType | string): TriggerMeta {
  return (
    TRIGGER_META[t as AutomationTriggerType] ?? {
      label: t,
      pillClass: 'border-slate-500/30 bg-slate-500/10 text-muted-foreground',
    }
  )
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 'never'
  const diffSec = Math.round((Date.now() - then) / 1000)
  if (diffSec < 60) return 'just now'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  if (diffSec < 2_592_000) return `${Math.floor(diffSec / 86400)}d ago`
  return new Date(iso).toLocaleDateString()
}
