import React from 'react'

// colors
export const R = '#E8001C'
export const WHITE = '#FFFFFF'
export const GRAY1 = '#1A1A1A'
export const GRAY2 = '#6B7280'
export const GRAY3 = '#D1D5DB'
export const GRAY4 = '#F3F4F6'
export const GREEN = '#16A34A'
export const BLUE = '#0D9488'
export const YELLOW = '#D97706'
export const PURPLE = '#7C3AED'
export const CONTENT_BG = '#F2F1EE'

// data arrays
export const CLOSERS = ['VITOR', 'MATHEUS']
export const SITUACOES = ['EM FOLLOW UP', 'REUNIAO EXTRA AGENDADA', 'AGENDA FUTURA', 'PERDIDO CLOSER', 'FECHADO']
export const SITUACOES_PRE_VENDAS = ['TENTANDO CONTATO', 'EM QUALIFICAÇÃO', 'REUNIÃO AGENDADA', 'REUNIÃO REALIZADA', 'PERDIDO SDR', 'NO SHOW/REMARCANDO', 'REEMBOLSO', 'AGENDA FUTURA']
export const TEMPERATURAS = ['FRIO', 'MORNO', 'QUENTE', 'FECHADO']
export const ORIGENS = ['Lead Broker', 'Recomendação', 'Eventos', 'Prospecção Ativa (BDR/Hunter)', 'Indicação', 'Recovery']
export const SEGMENTOS = ['Varejo', 'Serviço', 'Indústria', 'Food Service', 'Educação', 'SAAS', 'Imobiliária', 'Outro']
export const CARGOS_OPTIONS = ['Não identificado', 'Sócio', 'Diretor', 'Gerente', 'Coordenador', 'Analista', 'Assistente', 'Outro']
export const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
export const CANAIS_METAS = ['Recovery', 'Lead Broker', 'Recomendação', 'Eventos', 'Indicação']
export const CANAIS = ['Canal', ...CANAIS_METAS]
export const TIERS = ['TINY', 'SMALL', 'MEDIUM', 'LARGE', 'ENTERPRISE']
export const TEMP_COLORS: Record<string,string> = { FRIO: BLUE, MORNO: YELLOW, QUENTE: R, FECHADO: GREEN }
export const SPV_COLORS: Record<string,string> = {
  'TENTANDO CONTATO': '#E8001C', 'EM QUALIFICAÇÃO': '#F97316',
  'REUNIÃO AGENDADA': '#0D9488', 'REUNIÃO REALIZADA': '#8B5CF6',
  'PERDIDO SDR': '#6B7280', 'NO SHOW/REMARCANDO': '#92400E',
  'REEMBOLSO': '#1E40AF', 'AGENDA FUTURA': '#065F46',
}
export const FATURAMENTO_TIER = [
  { faturamento: '50-70k', tier: 'TINY' }, { faturamento: '70-100k', tier: 'TINY' },
  { faturamento: '100-200k', tier: 'SMALL' }, { faturamento: '200-400k', tier: 'SMALL' },
  { faturamento: '400k-1M', tier: 'MEDIUM' }, { faturamento: '1M-4M', tier: 'MEDIUM' },
  { faturamento: '4M-16M', tier: 'LARGE' }, { faturamento: '+16M', tier: 'ENTERPRISE' },
]
export const FATURAMENTOS = FATURAMENTO_TIER.map(f => f.faturamento)
export const fatToTier = (fat: string) => FATURAMENTO_TIER.find(f => f.faturamento === fat)?.tier || ''

// helpers
export const fmt = (n: number | null | undefined) => n == null ? '—' : 'R$ ' + n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
export const fmtDate = (d: string | null | undefined) => d ? new Date(d).toLocaleDateString('pt-BR') : '—'
export const mesAno = (d: string | null | undefined): string | null => {
  if (!d) return null
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return null
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
}
export const mesFmt = (m: string) => {
  if (!m) return ''
  const [y, mo] = m.split('-')
  return `${MESES[parseInt(mo) - 1]} ${y}`
}

// styles
export const inputCls: React.CSSProperties = {
  width: '100%', border: '1px solid #D1D5DB', borderRadius: 8,
  padding: '9px 12px', fontSize: 13, color: GRAY1, outline: 'none',
  boxSizing: 'border-box', background: WHITE,
}
export const labelCls: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 600, color: GRAY2,
  marginBottom: 5, textTransform: 'uppercase' as const, letterSpacing: '0.05em',
}
