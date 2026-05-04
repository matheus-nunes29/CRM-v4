import React from 'react'

// ── Brand palette ──────────────────────────────────────────────────────────
export const R       = '#E8001C'
export const WHITE   = '#FFFFFF'
export const BLACK   = '#07050A'
export const CREAM   = '#F6F3EE'

// ── Grays ─────────────────────────────────────────────────────────────────
export const GRAY1   = '#111827'                       // primary text
export const GRAY2   = '#4B5563'                       // secondary text
export const GRAY3   = '#9CA3AF'                       // muted / disabled
export const GRAY4   = '#F9FAFB'                       // table row alt
export const GRAY5   = '#E5E7EB'                       // borders

// ── Semantic accents ──────────────────────────────────────────────────────
export const GREEN   = '#10B981'
export const BLUE    = '#3B82F6'
export const YELLOW  = '#D97706'
export const PURPLE  = '#8B5CF6'

// ── Glass design tokens (kept for compatibility) ──────────────────────────
export const GLASS_BG     = 'rgba(255,255,255,0.07)'
export const GLASS_BORDER = 'rgba(255,255,255,0.13)'
export const GLASS_SHADOW = '0 8px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.18)'

// ── Layout ────────────────────────────────────────────────────────────────
export const CONTENT_BG  = '#F6F3EE'
export const SIDEBAR_BG  = '#0E0D0B'

// ── Data arrays ───────────────────────────────────────────────────────────
export const CLOSERS            = ['VITOR', 'MATHEUS']
export const SITUACOES          = ['EM FOLLOW UP', 'REUNIAO EXTRA AGENDADA', 'AGENDA FUTURA', 'PERDIDO CLOSER', 'FECHADO']
export const SITUACOES_PRE_VENDAS = ['TENTANDO CONTATO', 'EM QUALIFICAÇÃO', 'REUNIÃO AGENDADA', 'REUNIÃO REALIZADA', 'PERDIDO SDR', 'NO SHOW/REMARCANDO', 'REEMBOLSO', 'AGENDA FUTURA']
export const TEMPERATURAS       = ['FRIO', 'MORNO', 'QUENTE', 'FECHADO']
export const ORIGENS            = ['Lead Broker', 'Recomendação', 'Eventos', 'Prospecção Ativa (BDR/Hunter)', 'Indicação', 'Recovery']
export const SEGMENTOS          = ['Varejo', 'Serviço', 'Indústria', 'Food Service', 'Educação', 'SAAS', 'Imobiliária', 'Outro']
export const CARGOS_OPTIONS     = ['Não identificado', 'Sócio', 'Diretor', 'Gerente', 'Coordenador', 'Analista', 'Assistente', 'Outro']
export const MESES              = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
export const CANAIS_METAS       = ['Recovery', 'Lead Broker', 'Recomendação', 'Eventos', 'Indicação']
export const CANAIS             = ['Canal', ...CANAIS_METAS]
export const TIERS              = ['TINY', 'SMALL', 'MEDIUM', 'LARGE', 'ENTERPRISE']

export const MOTIVOS_PERDA_PRE_VENDAS = [
  'Sem perfil (fora do ICP)',
  'Sem interesse',
  'Incontactável',
  'Já tem solução / concorrente',
  'Sem budget declarado',
  'Timing ruim',
  'Não chegou ao decisor',
  'No-show repetido',
  'Agenda futura sem data',
]

export const MOTIVOS_PERDA_CLOSER = [
  'Preço alto / sem budget aprovado',
  'Perdeu para concorrente',
  'Sem urgência',
  'Sócio/Diretor vetou',
  'Ghost / parou de responder',
  'Proposta não encaixou na necessidade',
  'Timing ruim',
  'Negociação travada',
  'Reembolso / cancelamento',
]

export const TEMP_COLORS: Record<string,string> = {
  FRIO: BLUE, MORNO: YELLOW, QUENTE: R, FECHADO: GREEN,
}
export const SPV_COLORS: Record<string,string> = {
  'TENTANDO CONTATO':  R,
  'EM QUALIFICAÇÃO':   '#C2570A',
  'REUNIÃO AGENDADA':  BLUE,
  'REUNIÃO REALIZADA': PURPLE,
  'PERDIDO SDR':       GRAY2,
  'NO SHOW/REMARCANDO':'#92400E',
  'REEMBOLSO':         '#1E40AF',
  'AGENDA FUTURA':     '#065F46',
}

export const FATURAMENTO_TIER = [
  { faturamento: '50-70k',    tier: 'TINY'       },
  { faturamento: '70-100k',   tier: 'TINY'       },
  { faturamento: '100-200k',  tier: 'SMALL'      },
  { faturamento: '200-400k',  tier: 'SMALL'      },
  { faturamento: '400k-1M',   tier: 'MEDIUM'     },
  { faturamento: '1M-4M',     tier: 'MEDIUM'     },
  { faturamento: '4M-16M',    tier: 'LARGE'      },
  { faturamento: '+16M',      tier: 'ENTERPRISE' },
]
export const FATURAMENTOS = FATURAMENTO_TIER.map(f => f.faturamento)
export const fatToTier = (fat: string) => FATURAMENTO_TIER.find(f => f.faturamento === fat)?.tier || ''

// ── Helpers ────────────────────────────────────────────────────────────────
export const fmt = (n: number | null | undefined) =>
  n == null ? '—' : 'R$ ' + n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })

export const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('pt-BR') : '—'

export const mesAno = (d: string | null | undefined): string | null => {
  if (!d) return null
  const s = String(d).substring(0, 7)
  return /^\d{4}-\d{2}$/.test(s) ? s : null
}

export const mesFmt = (m: string) => {
  if (!m) return ''
  const [y, mo] = m.split('-')
  return `${MESES[parseInt(mo) - 1]} ${y}`
}

// ── Shared form styles ─────────────────────────────────────────────────────
export const inputCls: React.CSSProperties = {
  width: '100%',
  border: '1px solid #D1D5DB',
  borderRadius: 8,
  padding: '9px 12px',
  fontSize: 13,
  color: '#111827',
  outline: 'none',
  boxSizing: 'border-box',
  background: '#FFFFFF',
  transition: 'border-color .15s',
}

export const labelCls: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: '#6B7280',
  marginBottom: 5,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.06em',
}
