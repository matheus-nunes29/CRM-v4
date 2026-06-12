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
  tcv_saber: number | null
  tcv_ter: number | null
  tcv_executar: number | null
  tcv_executar_meses: number | null
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
  papel?: string | null
  avatar_url?: string | null
  created_at: string
}

export type Cliente = {
  id: string
  slug: string
  lead_id: string | null
  empresa: string
  segmento: string | null
  status: 'ativo' | 'pausado' | 'churned'
  stack: string[]
  links: Record<string, string>
  anotacoes: string
  logo_url: string | null
  gestor_projetos: string | null
  designer: string | null
  analista_midia: string | null
  link_contrato: string | null
  created_at: string
  updated_at: string
}

export type Contato = {
  id: string
  cliente_id: string
  nome: string
  cargo: string | null
  email: string | null
  telefone: string | null
  is_primary: boolean
  created_at: string
}

export type Projeto = {
  id: string
  cliente_id: string
  nome: string
  tipo: 'saber' | 'ter' | 'executar'
  status: 'ativo' | 'pausado' | 'encerrado' | 'entregue'
  motivo_pausa: string | null
  valor_tipo: 'pontual' | 'mensalidade'
  valor: number
  data_inicio: string | null
  data_fim: string | null
  escopo: string
  responsaveis: string[]
  servico: string | null
  etapa_atual: string | null
  servicos_executar: { key: string; volume?: string; campanhas?: number; posts?: number; estaticos?: number; videos?: number }[] | null
  investimento_midia: number | null
  created_at: string
  updated_at: string
}

export type HealthScoreEntry = {
  id: string
  cliente_id: string
  semana: string
  resultado: number
  trafego: number
  entregas_prazo: number
  qualidade_entregas: number
  relacionamento: number
  score_total: number
  observacoes: string
  trafego_checklist: boolean[] | null
  entregas_checklist: boolean[] | null
  qualidade_checklist: boolean[] | null
  relacionamento_checklist: boolean[] | null
  created_by: string | null
  created_at: string
}

export type MetaSemanal = {
  id: string
  cliente_id: string
  projeto_id: string | null
  semana: string
  descricao: string
  valor_meta: number | null
  valor_realizado: number | null
  unidade: string
  status: 'pendente' | 'atingida' | 'nao_atingida' | 'parcial'
  observacoes: string
  created_at: string
  updated_at: string
}

export type ObjetivoMensal = {
  id: string
  cliente_id: string
  projeto_id: string | null
  mes: string           // YYYY-MM
  descricao: string
  valor_meta: number
  unidade: string
  observacoes: string
  created_at: string
  updated_at: string
}

export type ResultadoSemanal = {
  id: string
  objetivo_id: string
  cliente_id: string
  semana: string        // YYYY-MM-DD (Monday)
  valor_realizado: number | null
  observacoes: string
  created_at: string
  updated_at: string
}

export type Oportunidade = {
  id: string
  cliente_id: string
  titulo: string
  descricao: string
  etapa: 'identificada' | 'em_conversa' | 'proposta_enviada' | 'fechada'
  valor_estimado: number | null
  responsavel: string | null
  data_estimada: string | null
  link_contrato: string | null
  created_at: string
  updated_at: string
}

export type RegistroEntrega = {
  id: string
  projeto_id: string
  cliente_id: string
  mes: string
  data: string
  campanhas: number | null
  estaticos: number | null
  videos: number | null
  posts: number | null
  observacao: string | null
  servico_id: string | null
  quantidade: number | null
  created_by: string | null
  created_at: string
}

export type ServicoProjeto = {
  id: string
  projeto_id: string
  cliente_id: string
  nome: string
  quantidade_prevista: number
  unidade: string
  created_at: string
}

export type CatalogoServico = {
  id: string
  tipo: 'saber' | 'ter' | 'executar'
  nome: string
  etapas: string[]
  ativo: boolean
  ordem: number
  tem_volume: boolean
  volume_type: 'campanhas' | 'posts' | 'design' | 'generic' | null
  chave: string | null
  created_at: string
}

export type FcaEntry = {
  id: string
  cliente_id: string
  data: string
  fato: string
  causa: string
  acao: string
  resolvido: boolean
  resolvido_at: string | null
  created_by: string | null
  created_at: string
}

export type Reuniao = {
  id: string
  cliente_id: string
  data: string
  titulo: string | null
  tipo: 'operacional' | 'qbr' | null
  link_apresentacao: string | null
  link_transcricao: string | null
  observacoes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type EntregaMensal = {
  id: string
  projeto_id: string
  cliente_id: string
  mes: string
  design_estaticos: number | null
  design_videos: number | null
  midia_campanhas: number | null
  social_posts: number | null
  notas: string | null
  created_at: string
  updated_at: string
}

export type NpsCsat = {
  id: string
  cliente_id: string
  projeto_id: string | null
  tipo: 'nps' | 'csat'
  pontuacao: number
  comentario: string | null
  mes: string | null
  created_by: string | null
  created_at: string
}

export type ProximoPasso = {
  id: string
  cliente_id: string
  descricao: string
  responsavel: string | null
  data_vencimento: string | null
  concluido: boolean
  concluido_at: string | null
  origem_tipo: string | null
  origem_id: string | null
  created_by: string | null
  created_at: string
}
