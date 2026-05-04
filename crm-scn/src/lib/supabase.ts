import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Lead = {
  id: string
  empresa: string
  nome_lead: string | null
  telefone: string | null
  situacao_pre_vendas: string | null
  bant_budget: boolean | null
  bant_authority: boolean | null
  bant_need: boolean | null
  bant_timing: boolean | null
  origem: string | null
  data_entrada: string | null
  mes_entrada: string | null
  broker: number | null
  tier: string | null
  faturamento: string | null
  cargo: string | null
  urgencia: string | null
  segmento: string | null
  conexao: string | null
  data_ra: string | null
  mes_ra: string | null
  situacao_bdr: string | null
  data_rr: string | null
  mes_rr: string | null
  bant: number | null
  budget: string | null
  autority: string | null
  need: string | null
  timing: string | null
  closer: string | null
  reuniao_agendada: string | null
  show: string | null
  temperatura: 'FRIO' | 'MORNO' | 'QUENTE' | 'FECHADO' | null
  recomendacoes: string | null
  situacao_closer: string | null
  proximos_passos: string | null
  data_fup: string | null
  tcv: number | null
  venda: string | null
  data_assinatura: string | null
  mes_assinatura: string | null
  data_ativacao: string | null
  inicio_projeto: string | null
  primeiro_pagamento: string | null
  produto_vendido: string | null
  handover: string | null
  email?: string | null
  anotacoes_pre_vendas?: string | null
  cadencia?: number | null
  contato_agendado?: boolean | null
  link_qualificacao?: string | null
  link_transcricao?: string | null
  link_proposta?: string | null
  link_contrato?: string | null
  historico_proximos_passos?: Array<{ data: string; texto: string }> | null
  historico_anotacoes_pre_vendas?: Array<{ data: string; texto: string }> | null
  motivo_perda_pre_vendas?: string | null
  motivo_perda_closer?: string | null
  custo_broker?: number | null
  created_at: string
  updated_at: string
}

export type UsuarioPermitido = {
  id: string
  nome: string
  email: string
  ativo: boolean
  created_at: string
}
