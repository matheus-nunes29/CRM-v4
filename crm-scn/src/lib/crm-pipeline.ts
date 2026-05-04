import { BLUE, YELLOW, PURPLE, GREEN, GRAY2, R, SITUACOES_PRE_VENDAS, SITUACOES, CLOSERS, SEGMENTOS, FATURAMENTOS, CARGOS_OPTIONS, TEMPERATURAS, MOTIVOS_PERDA_PRE_VENDAS, MOTIVOS_PERDA_CLOSER } from './crm-constants'

export type StageField = { key: string; label: string; type: 'date' | 'select' | 'bant' | 'number' | 'text' | 'file'; options?: string[] }
export type StageReq = { label: string; fields: StageField[]; extraFields?: (lead: any) => StageField[] }

export const STAGE_REQUIREMENTS: Record<string, StageReq> = {
  'TENTANDO CONTATO': { label: 'Tentando Contato', fields: [
    { key: 'situacao_pre_vendas', label: 'Situação Pré-Vendas', type: 'select', options: SITUACOES_PRE_VENDAS },
  ]},
  'EM QUALIFICAÇÃO': { label: 'Em Qualificação', fields: [
    { key: 'situacao_pre_vendas', label: 'Situação Pré-Vendas', type: 'select', options: SITUACOES_PRE_VENDAS },
  ]},
  'REUNIÃO AGENDADA': { label: 'Reunião Agendada', fields: [
    { key: 'data_ra', label: 'Data da Reunião Agendada', type: 'date' },
    { key: 'closer', label: 'Closer Responsável', type: 'select', options: CLOSERS },
    { key: 'situacao_pre_vendas', label: 'Situação Pré-Vendas', type: 'select', options: SITUACOES_PRE_VENDAS },
    { key: 'bant', label: 'Nota BANT (mín. 3)', type: 'bant' },
    { key: 'segmento', label: 'Segmento', type: 'select', options: SEGMENTOS },
    { key: 'faturamento', label: 'Faturamento', type: 'select', options: FATURAMENTOS },
    { key: 'cargo', label: 'Cargo do Lead', type: 'select', options: CARGOS_OPTIONS },
    { key: 'urgencia', label: 'Urgência', type: 'text' },
  ],
  extraFields: (lead: any) => lead.origem === 'Lead Broker' ? [
    { key: 'custo_broker', label: 'Custo de Broker (R$)', type: 'number' as const },
  ] : [],
  },
  'NO-SHOW/REMARCANDO': { label: 'No-Show/Remarcando', fields: [
    { key: 'situacao_pre_vendas', label: 'Situação Pré-Vendas', type: 'select', options: SITUACOES_PRE_VENDAS },
  ]},
  'REUNIÃO REALIZADA': { label: 'Reunião Realizada', fields: [
    { key: 'data_rr', label: 'Data da Reunião Realizada', type: 'date' },
    { key: 'closer', label: 'Closer Responsável', type: 'select', options: CLOSERS },
    { key: 'situacao_pre_vendas', label: 'Situação Pré-Vendas', type: 'select', options: SITUACOES_PRE_VENDAS },
    { key: 'data_fup', label: 'Data do FUP', type: 'date' },
    { key: 'link_transcricao', label: 'Link da Transcrição', type: 'text' },
    { key: 'temperatura', label: 'Temperatura', type: 'select', options: TEMPERATURAS },
    { key: 'tcv', label: 'TCV (R$)', type: 'number' },
  ]},
  'FOLLOW UP': { label: 'Follow Up', fields: [
    { key: 'situacao_closer', label: 'Situação Closer', type: 'select', options: SITUACOES },
    { key: 'data_fup', label: 'Data do FUP', type: 'date' },
    { key: 'data_rr', label: 'Data da Reunião Realizada', type: 'date' },
    { key: 'link_transcricao', label: 'Link da Transcrição', type: 'text' },
    { key: 'link_proposta', label: 'Link da Proposta', type: 'text' },
    { key: 'temperatura', label: 'Temperatura', type: 'select', options: TEMPERATURAS },
    { key: 'tcv', label: 'TCV (R$)', type: 'number' },
  ]},
  'VENDA': { label: 'Venda', fields: [
    { key: 'data_assinatura', label: 'Data da Venda', type: 'date' },
    { key: 'tcv', label: 'TCV (R$)', type: 'number' },
    { key: 'data_rr', label: 'Data da Reunião Realizada', type: 'date' },
    { key: 'link_transcricao', label: 'Link da Transcrição', type: 'text' },
    { key: 'temperatura', label: 'Temperatura', type: 'select', options: TEMPERATURAS },
    { key: 'link_contrato', label: 'Upload do Contrato', type: 'file' },
  ]},
  'ATIVADO': { label: 'Ativado', fields: [
    { key: 'data_ativacao', label: 'Data de Ativação', type: 'date' },
  ]},
  'PERDIDO': { label: 'Perdido', fields: [],
    extraFields: (lead: any) => lead.data_rr
      ? [{ key: 'motivo_perda_closer', label: 'Motivo de Perda — Closer', type: 'select' as const, options: MOTIVOS_PERDA_CLOSER }]
      : [{ key: 'motivo_perda_pre_vendas', label: 'Motivo de Perda — Pré-Vendas', type: 'select' as const, options: MOTIVOS_PERDA_PRE_VENDAS }],
  },
}

export const PIPELINE_STAGES = [
  { label: 'Entrada',              key: 'ENTRADA',              color: BLUE },
  { label: 'Tentando Contato',     key: 'TENTANDO CONTATO',     color: '#F97316' },
  { label: 'Em Qualificação',      key: 'EM QUALIFICAÇÃO',      color: YELLOW },
  { label: 'Reunião Agendada',     key: 'REUNIÃO AGENDADA',     color: '#0D9488' },
  { label: 'No-Show/Remarcando',   key: 'NO-SHOW/REMARCANDO',   color: '#92400E' },
  { label: 'Reunião Realizada',    key: 'REUNIÃO REALIZADA',    color: PURPLE },
  { label: 'Follow Up',            key: 'FOLLOW UP',            color: '#8B5CF6' },
  { label: 'Venda',                key: 'VENDA',                color: GREEN },
  { label: 'Ativado',              key: 'ATIVADO',              color: '#0EA5E9' },
  { label: 'Perdido',              key: 'PERDIDO',              color: GRAY2 },
]

export const getPipelineStage = (l: any): string => {
  const spv = l.situacao_pre_vendas || ''
  const sc = l.situacao_closer || ''
  // PERDIDO tem prioridade máxima — mesmo que tenha data_assinatura
  if (sc === 'PERDIDO CLOSER') return 'PERDIDO'
  if (spv === 'PERDIDO SDR' || spv === 'REEMBOLSO') return 'PERDIDO'
  // Venda / Ativado
  if (sc === 'VENDA' || l.data_assinatura) return l.data_ativacao ? 'ATIVADO' : 'VENDA'
  // Follow Up
  if (sc === 'EM FOLLOW UP' || sc === 'REUNIAO EXTRA AGENDADA' || sc === 'AGENDA FUTURA') return 'FOLLOW UP'
  // Pré-Vendas
  if (spv === 'REUNIÃO REALIZADA') return 'REUNIÃO REALIZADA'
  if (spv === 'NO SHOW/REMARCANDO') return 'NO-SHOW/REMARCANDO'
  if (spv === 'REUNIÃO AGENDADA') return 'REUNIÃO AGENDADA'
  if (spv === 'EM QUALIFICAÇÃO' || spv === 'AGENDA FUTURA') return 'EM QUALIFICAÇÃO'
  if (spv === 'TENTANDO CONTATO') return 'TENTANDO CONTATO'
  return 'ENTRADA'
}
