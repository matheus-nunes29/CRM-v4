'use client'
import React, { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, Cliente, Projeto, HealthScoreEntry, Reuniao, FcaEntry, NpsCsat, ProximoPasso, Oportunidade, RegistroEntrega, ServicoProjeto } from '@/lib/supabase'
import CRMLayout from '../../_components/CRMLayout'
import { R, WHITE, GRAY1, GRAY2, GRAY3, GRAY4, GRAY5, GREEN, BLUE, YELLOW } from '@/lib/crm-constants'
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts'
import {
  AlertTriangle, TrendingUp, TrendingDown, Users, Layers,
  Video, CheckSquare, Package, Star, Clock, Calendar,
  ArrowUp, ArrowDown, Minus, ChevronRight, BarChart2, ExternalLink,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────
type RiskLevel = 'baixo' | 'medio' | 'alto'
type ClienteData = Cliente & {
  projetos: Projeto[]
  healthEntries: HealthScoreEntry[]
  latestHs: HealthScoreEntry | null
  prevHs: HealthScoreEntry | null
  reunioes: Reuniao[]
  fcas: FcaEntry[]
  npsCsat: NpsCsat[]
  acoesPendentes: ProximoPasso[]
  risk: { level: RiskLevel; reasons: string[] }
  mrr: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function computeRisk(entries: HealthScoreEntry[], projetos: Projeto[]): { level: RiskLevel; reasons: string[] } {
  let score = 0
  const reasons: string[] = []
  const scores = entries.slice(0, 4).map(e => Number(e.score_total))
  if (scores.length >= 3 && scores[0] < scores[1] && scores[1] < scores[2]) { score += 2; reasons.push('HS em queda por 3 semanas') }
  else if (scores.length >= 2 && scores[0] < scores[1]) { score += 1; reasons.push('HS em queda') }
  if (scores.length > 0 && scores[0] < 5) { score += 2; reasons.push('HS crítico') }
  else if (scores.length > 0 && scores[0] < 7) { score += 1; reasons.push('HS abaixo de 7.0') }
  if (entries.length === 0) { score += 2; reasons.push('Sem health score') }
  else {
    const days = Math.floor((Date.now() - new Date(entries[0].semana).getTime()) / 86400000)
    if (days > 30) { score += 2; reasons.push(`Sem atualização há ${days}d`) }
    else if (days > 14) { score += 1; reasons.push(`Sem atualização há ${days}d`) }
  }
  const activeProjects = projetos.filter(p => p.status === 'ativo')
  if (projetos.length > 0 && activeProjects.length === 0) { score += 1; reasons.push('Sem projetos ativos') }
  return { level: score >= 4 ? 'alto' : score >= 2 ? 'medio' : 'baixo', reasons }
}

function healthColor(s: number) { return s >= 7 ? GREEN : s >= 5 ? YELLOW : R }
function fmtMRR(v: number) { return v >= 1000 ? `R$ ${(v / 1000).toFixed(0)}k` : `R$ ${v}` }
function fmtFull(v: number) { return `R$ ${v.toLocaleString('pt-BR')}` }
function fmtDate(s: string) { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}` }
function daysSince(s: string) { return Math.floor((Date.now() - new Date(s).getTime()) / 86400000) }
function daysUntil(s: string) { return Math.ceil((new Date(s).setHours(23, 59, 59) - Date.now()) / 86400000) }

const card: React.CSSProperties = { background: WHITE, border: `1px solid ${GRAY5}`, borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,.04)' }

const RISK_MAP = {
  baixo: { label: 'Baixo', dot: GREEN, bg: '#D1FAE5', color: '#065F46', border: '#A7F3D0' },
  medio: { label: 'Médio', dot: YELLOW, bg: '#FEF3C7', color: '#92400E', border: '#FDE68A' },
  alto:  { label: 'Alto',  dot: R,      bg: '#FEE2E2', color: '#991B1B', border: '#FECACA' },
}

const ETAPA_LABEL: Record<string, string> = {
  identificada: 'Identificada', em_conversa: 'Em Conversa',
  proposta_enviada: 'Proposta', fechada: 'Fechada',
}
const ETAPA_COLOR: Record<string, string> = {
  identificada: GRAY3, em_conversa: BLUE, proposta_enviada: YELLOW, fechada: GREEN,
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function CSDashboard() {
  const router = useRouter()
  const [clientes, setClientes]           = useState<ClienteData[]>([])
  const [allHs, setAllHs]                 = useState<HealthScoreEntry[]>([])
  const [oportunidades, setOportunidades]  = useState<Oportunidade[]>([])
  const [registros, setRegistros]          = useState<RegistroEntrega[]>([])
  const [servicosProjeto, setServicosProjeto] = useState<ServicoProjeto[]>([])
  const [loading, setLoading]             = useState(true)

  const hoje    = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const mesAtual = useMemo(() => hoje.slice(0, 7), [hoje])
  const cutoff90 = useMemo(() => { const d = new Date(); d.setDate(d.getDate() - 90); return d.toISOString().slice(0, 10) }, [])
  const cutoff30 = useMemo(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10) }, [])

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const curMes = new Date().toISOString().slice(0, 7)
    const [{ data: cl }, { data: pr }, { data: hs }, { data: re }, { data: fc }, { data: nps }, { data: pp }, { data: op }, { data: reg }, { data: svc }] = await Promise.all([
      supabase.from('clientes').select('*'),
      supabase.from('projetos').select('*'),
      supabase.from('health_score_entries').select('*').order('semana', { ascending: false }),
      supabase.from('reunioes').select('*').order('data', { ascending: false }),
      supabase.from('fca_entries').select('*').order('data', { ascending: false }),
      supabase.from('nps_csat').select('*').order('created_at', { ascending: false }),
      supabase.from('proximos_passos').select('*').eq('concluido', false),
      supabase.from('oportunidades').select('*').order('created_at', { ascending: false }),
      supabase.from('registros_entrega').select('*').eq('mes', curMes),
      supabase.from('servicos_projeto').select('*'),
    ])

    setAllHs(hs || [])
    setOportunidades(op || [])
    setRegistros(reg || [])
    setServicosProjeto(svc || [])

    const enriched: ClienteData[] = (cl || []).map(c => {
      const cPr  = (pr  || []).filter(p => p.cliente_id === c.id)
      const cHs  = (hs  || []).filter(h => h.cliente_id === c.id)
      const cRe  = (re  || []).filter(r => r.cliente_id === c.id)
      const cFc  = (fc  || []).filter(f => f.cliente_id === c.id)
      const cNps = (nps || []).filter(n => n.cliente_id === c.id)
      const cPp  = (pp  || []).filter(p => p.cliente_id === c.id)
      const mrr  = cPr.filter(p => p.valor_tipo === 'mensalidade' && p.status === 'ativo').reduce((s, p) => s + p.valor, 0)
      return {
        ...c, projetos: cPr, healthEntries: cHs,
        latestHs: cHs[0] ?? null, prevHs: cHs[1] ?? null,
        reunioes: cRe, fcas: cFc, npsCsat: cNps, acoesPendentes: cPp,
        risk: computeRisk(cHs, cPr), mrr,
      }
    })
    setClientes(enriched)
    setLoading(false)
  }

  const ativos = useMemo(() => clientes.filter(c => c.status === 'ativo'), [clientes])

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const mrrTotal   = ativos.reduce((s, c) => s + c.mrr, 0)
    const mrrRisco   = ativos.filter(c => c.risk.level === 'alto').reduce((s, c) => s + c.mrr, 0)
    const hsScores   = ativos.filter(c => c.latestHs).map(c => Number(c.latestHs!.score_total))
    const hsMedio    = hsScores.length ? hsScores.reduce((a, b) => a + b, 0) / hsScores.length : null
    const npsRec     = clientes.flatMap(c => c.npsCsat.filter(n => n.tipo === 'nps' && n.created_at >= cutoff90))
    const npsMedio   = npsRec.length ? npsRec.reduce((s, n) => s + n.pontuacao, 0) / npsRec.length : null
    const acoesVenc  = clientes.flatMap(c => c.acoesPendentes.filter(p => p.data_vencimento && p.data_vencimento < hoje)).length
    const fcaAbertos = ativos.reduce((s, c) => s + c.fcas.filter(f => !f.resolvido).length, 0)
    const churned90  = clientes.filter(c => c.status === 'churned').length
    return { mrrTotal, mrrRisco, hsMedio, npsMedio, acoesVenc, fcaAbertos, churned90 }
  }, [ativos, clientes, hoje, cutoff90])

  // ── Projetos por tipo ─────────────────────────────────────────────────────
  const projetosPorTipo = useMemo(() => {
    const all = ativos.flatMap(c => c.projetos.filter(p => p.status === 'ativo'))
    const byTipo = (tipo: string) => all.filter(p => p.tipo === tipo)
    const totalValor = (list: Projeto[]) => list.reduce((s, p) => s + p.valor, 0)
    const executar = byTipo('executar')
    const saber    = byTipo('saber')
    const ter      = byTipo('ter')
    return {
      executar: { count: executar.length, valor: executar.filter(p => p.valor_tipo === 'mensalidade').reduce((s, p) => s + p.valor, 0), labelValor: '/mês' },
      saber:    { count: saber.length,    valor: totalValor(saber),    labelValor: ' total' },
      ter:      { count: ter.length,      valor: totalValor(ter),      labelValor: ' total' },
      total:    all.length,
    }
  }, [ativos])

  // ── Volume contratado vs entregue (Executar) ─────────────────────────────
  const volumeComparison = useMemo(() => {
    const executarProjetos = ativos.flatMap(c =>
      c.projetos.filter(p => p.tipo === 'executar' && p.status === 'ativo')
    )
    const executarIds = new Set(executarProjetos.map(p => p.id))

    // Contratado: lê servicos_executar de cada projeto ativo
    let cCampanhas = 0, cEstaticos = 0, cVideos = 0, cPosts = 0
    executarProjetos.forEach(p => {
      ;(p.servicos_executar ?? []).forEach(se => {
        cCampanhas += se.campanhas ?? 0
        cEstaticos += se.estaticos ?? 0
        cVideos    += se.videos    ?? 0
        cPosts     += se.posts     ?? 0
      })
    })

    // Entregue: soma registros do mês atual para esses projetos
    const regs = registros.filter(r => executarIds.has(r.projeto_id))
    let eCampanhas = 0, eEstaticos = 0, eVideos = 0, ePosts = 0
    regs.forEach(r => {
      eCampanhas += r.campanhas ?? 0
      eEstaticos += r.estaticos ?? 0
      eVideos    += r.videos    ?? 0
      ePosts     += r.posts     ?? 0
    })

    const items = [
      { nome: 'Campanhas', contratado: cCampanhas, entregue: eCampanhas, unidade: 'camp.' },
      { nome: 'Estáticos', contratado: cEstaticos, entregue: eEstaticos, unidade: 'peças' },
      { nome: 'Vídeos',    contratado: cVideos,    entregue: eVideos,    unidade: 'vídeos' },
      { nome: 'Posts',     contratado: cPosts,     entregue: ePosts,     unidade: 'posts' },
    ].filter(i => i.contratado > 0 || i.entregue > 0)

    return { items, regsCount: regs.length }
  }, [registros, ativos])

  // ── Distribuição de risco ─────────────────────────────────────────────────
  const riskDist = useMemo(() => ({
    baixo: ativos.filter(c => c.risk.level === 'baixo'),
    medio: ativos.filter(c => c.risk.level === 'medio'),
    alto:  ativos.filter(c => c.risk.level === 'alto'),
  }), [ativos])

  // ── HS trend (média semanal do portfólio) ─────────────────────────────────
  const hsTrend = useMemo(() => {
    const ativoIds = new Set(ativos.map(c => c.id))
    const weeks = Array.from(new Set(allHs.filter(e => ativoIds.has(e.cliente_id)).map(e => e.semana))).sort().slice(-12)
    return weeks.map(w => {
      const wEntries = allHs.filter(e => e.semana === w && ativoIds.has(e.cliente_id))
      if (!wEntries.length) return null
      const avg = wEntries.reduce((s, e) => s + Number(e.score_total), 0) / wEntries.length
      return { semana: w.slice(5).replace('-', '/'), avg: +avg.toFixed(1) }
    }).filter(Boolean) as { semana: string; avg: number }[]
  }, [allHs, ativos])

  // ── Alertas ───────────────────────────────────────────────────────────────
  const alertas = useMemo(() => {
    const fcaAbertos = ativos
      .map(c => ({ ...c, fcaCount: c.fcas.filter(f => !f.resolvido).length }))
      .filter(c => c.fcaCount > 0)
      .sort((a, b) => { const r = { alto: 0, medio: 1, baixo: 2 }; return r[a.risk.level] - r[b.risk.level] || b.fcaCount - a.fcaCount })

    const semReuniao = ativos
      .filter(c => { const u = c.reunioes[0]; return !u || u.data < cutoff30 })
      .sort((a, b) => { const r = { alto: 0, medio: 1, baixo: 2 }; return r[a.risk.level] - r[b.risk.level] })

    const acoesVencidas = ativos
      .map(c => ({ ...c, vencidas: c.acoesPendentes.filter(p => p.data_vencimento && p.data_vencimento < hoje) }))
      .filter(c => c.vencidas.length > 0)
      .sort((a, b) => { const r = { alto: 0, medio: 1, baixo: 2 }; return r[a.risk.level] - r[b.risk.level] || b.vencidas.length - a.vencidas.length })

    const proxRenovacao = ativos
      .flatMap(c => c.projetos.filter(p => p.status === 'ativo' && p.data_fim && p.data_fim >= hoje && daysUntil(p.data_fim) <= 30)
        .map(p => ({ cliente: c, projeto: p, dias: daysUntil(p.data_fim!) })))
      .sort((a, b) => a.dias - b.dias)

    return { fcaAbertos, semReuniao, acoesVencidas, proxRenovacao }
  }, [ativos, cutoff30, hoje])

  // ── Reuniões do mês ───────────────────────────────────────────────────────
  const reunioesMes = useMemo(() => {
    const todas = clientes.flatMap(c => c.reunioes.filter(r => r.data.startsWith(mesAtual)))
    return {
      total:       todas.length,
      operacionais: todas.filter(r => r.tipo !== 'qbr').length,
      qbrs:        todas.filter(r => r.tipo === 'qbr').length,
      semReuniao:  ativos.filter(c => !c.reunioes.some(r => r.data.startsWith(mesAtual))),
    }
  }, [clientes, ativos, mesAtual])

  // ── NPS/CSAT ──────────────────────────────────────────────────────────────
  const npsOv = useMemo(() => {
    const recs      = clientes.flatMap(c => c.npsCsat.filter(n => n.tipo === 'nps' && n.created_at >= cutoff90))
    const promotores = recs.filter(n => n.pontuacao >= 9).length
    const neutros    = recs.filter(n => n.pontuacao >= 7 && n.pontuacao <= 8).length
    const detratores = recs.filter(n => n.pontuacao <= 6).length
    const nps        = recs.length ? Math.round(((promotores - detratores) / recs.length) * 100) : null
    const csatRecs   = clientes.flatMap(c => c.npsCsat.filter(n => n.tipo === 'csat' && n.mes === mesAtual))
    const csatMedio  = csatRecs.length ? csatRecs.reduce((s, n) => s + n.pontuacao, 0) / csatRecs.length : null
    const ultimos    = [...recs].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5).map(n => ({
      ...n, empresa: clientes.find(c => c.id === n.cliente_id)?.empresa || '',
    }))
    return { promotores, neutros, detratores, total: recs.length, nps, csatMedio, ultimos }
  }, [clientes, cutoff90, mesAtual])

  // ── Pipeline de expansão ──────────────────────────────────────────────────
  const pipeline = useMemo(() => {
    return (['identificada', 'em_conversa', 'proposta_enviada', 'fechada'] as const).map(etapa => {
      const ops = oportunidades.filter(o => o.etapa === etapa)
      return { etapa, label: ETAPA_LABEL[etapa], count: ops.length, valor: ops.reduce((s, o) => s + (o.valor_estimado || 0), 0), color: ETAPA_COLOR[etapa] }
    })
  }, [oportunidades])

  // ── Mapa de atividade ─────────────────────────────────────────────────────
  const mapaAtividade = useMemo(() =>
    ativos.map(c => ({
      id: c.id, slug: c.slug, empresa: c.empresa, risk: c.risk,
      hs: c.latestHs ? Number(c.latestHs.score_total) : null,
      hsDelta: c.latestHs && c.prevHs ? Number(c.latestHs.score_total) - Number(c.prevHs.score_total) : null,
      ultimaReuniao: c.reunioes[0]?.data ?? null,
      fcasAbertos: c.fcas.filter(f => !f.resolvido).length,
      acoesVencidas: c.acoesPendentes.filter(p => p.data_vencimento && p.data_vencimento < hoje).length,
      mrr: c.mrr,
    })).sort((a, b) => {
      const r = { alto: 0, medio: 1, baixo: 2 }
      return r[a.risk.level] - r[b.risk.level]
    }),
  [ativos, hoje])

  const thS: React.CSSProperties = { padding: '9px 14px', fontSize: 10, fontWeight: 700, color: GRAY3, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1px solid ${GRAY5}`, background: GRAY4, textAlign: 'left', whiteSpace: 'nowrap' }
  const tdS: React.CSSProperties = { padding: '10px 14px', fontSize: 12, color: GRAY1, borderBottom: `1px solid ${GRAY5}`, verticalAlign: 'middle' }

  if (loading) return (
    <CRMLayout title="CS Dashboard">
      <div style={{ padding: 80, textAlign: 'center', color: GRAY3 }}>Carregando...</div>
    </CRMLayout>
  )

  const MN = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  const [yy, mm] = mesAtual.split('-')
  const mesLabel = `${MN[parseInt(mm) - 1]} ${yy}`

  return (
    <CRMLayout title="CS Dashboard" subtitle={`Portfólio · ${ativos.length} clientes ativos`}>

      {/* ── KPIs ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          {
            label: 'MRR Total', icon: Layers, color: GREEN,
            value: kpis.mrrTotal > 0 ? fmtFull(kpis.mrrTotal) : '—',
            sub: `${ativos.length} clientes ativos`,
          },
          {
            label: 'MRR em Risco', icon: AlertTriangle, color: kpis.mrrRisco > 0 ? R : GRAY3,
            value: kpis.mrrRisco > 0 ? fmtMRR(kpis.mrrRisco) : '—',
            sub: `${riskDist.alto.length} clientes risco alto`,
            highlight: kpis.mrrRisco > 0,
          },
          {
            label: 'HS Médio', icon: TrendingUp, color: kpis.hsMedio !== null ? healthColor(kpis.hsMedio) : GRAY3,
            value: kpis.hsMedio !== null ? kpis.hsMedio.toFixed(1) : '—',
            sub: `${ativos.filter(c => c.latestHs).length} com registro`,
          },
          {
            label: 'NPS (90d)', icon: Star, color: kpis.npsMedio !== null ? (kpis.npsMedio >= 9 ? GREEN : kpis.npsMedio >= 7 ? YELLOW : R) : GRAY3,
            value: kpis.npsMedio !== null ? kpis.npsMedio.toFixed(1) : '—',
            sub: `${npsOv.total} respostas`,
          },
          {
            label: 'FCAs em Aberto', icon: AlertTriangle, color: kpis.fcaAbertos > 0 ? R : GRAY3,
            value: String(kpis.fcaAbertos),
            sub: 'aguardando resolução',
            highlight: kpis.fcaAbertos > 0,
          },
          {
            label: 'Ações Vencidas', icon: CheckSquare, color: kpis.acoesVenc > 0 ? R : GRAY3,
            value: String(kpis.acoesVenc),
            sub: 'próx. passos atrasados',
            highlight: kpis.acoesVenc > 0,
          },
        ].map(({ label, icon: Icon, color, value, sub, highlight }) => (
          <div key={label} style={{ ...card, padding: '16px 18px', borderColor: highlight ? `${R}40` : undefined }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: `${color}14`, border: `1px solid ${color}28`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={15} color={color} />
              </div>
              <span style={{ fontSize: 11, color: GRAY3, fontWeight: 500 }}>{label}</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 900, color: GRAY1, lineHeight: 1, marginBottom: 4 }}>{value}</div>
            <div style={{ fontSize: 11, color: GRAY3 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* ── Portfólio por tipo + Volume de Entregas ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>

        {/* Projetos por tipo */}
        <div style={{ ...card, padding: 22 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: GRAY1, marginBottom: 2 }}>Portfólio de Projetos</div>
          <div style={{ fontSize: 11, color: GRAY3, marginBottom: 18 }}>Projetos ativos por tipo de produto</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 14 }}>
            {([
              { label: 'Executar', data: projetosPorTipo.executar, color: BLUE,   bg: '#EFF6FF', border: '#BFDBFE' } as const,
              { label: 'Saber',    data: projetosPorTipo.saber,    color: GREEN,  bg: '#ECFDF5', border: '#A7F3D0' } as const,
              { label: 'Ter',      data: projetosPorTipo.ter,      color: YELLOW, bg: '#FFFBEB', border: '#FDE68A' } as const,
            ] as const).map(({ label, data, color, bg, border }) => (
              <div key={label} style={{ padding: '14px 16px', background: bg, borderRadius: 10, border: `1px solid ${border}`, textAlign: 'center' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>{label}</div>
                <div style={{ fontSize: 34, fontWeight: 900, color, lineHeight: 1, marginBottom: 3 }}>{data.count}</div>
                <div style={{ fontSize: 10, color: GRAY3, marginBottom: data.valor > 0 ? 4 : 0 }}>
                  {data.count === 1 ? 'projeto ativo' : 'projetos ativos'}
                </div>
                {data.valor > 0 && (
                  <div style={{ fontSize: 11, fontWeight: 700, color }}>{fmtMRR(data.valor)}{data.labelValor}</div>
                )}
              </div>
            ))}
          </div>
          <div style={{ padding: '10px 14px', background: GRAY4, borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: GRAY2, fontWeight: 600 }}>Total de projetos ativos</span>
            <span style={{ fontSize: 16, fontWeight: 900, color: GRAY1 }}>{projetosPorTipo.total}</span>
          </div>
        </div>

        {/* Volume Contratado vs Entregue */}
        <div style={{ ...card, padding: 22 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: GRAY1, marginBottom: 2 }}>Entregas — {mesLabel}</div>
          <div style={{ fontSize: 11, color: GRAY3, marginBottom: 20 }}>
            Contratado vs entregue em projetos Executar ativos · {volumeComparison.regsCount} registro{volumeComparison.regsCount !== 1 ? 's' : ''} no mês
          </div>
          {volumeComparison.items.length === 0 ? (
            <div style={{ padding: '28px 0', textAlign: 'center', color: GRAY3, fontSize: 13, fontStyle: 'italic' }}>
              Nenhum contrato ou entrega encontrado
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {/* Cabeçalho */}
              <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 72px 72px 44px', gap: 10, alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: GRAY3, textTransform: 'uppercase', letterSpacing: '0.06em' }} />
                <span />
                <span style={{ fontSize: 10, fontWeight: 700, color: GRAY3, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right' }}>Contrat.</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: GRAY3, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right' }}>Entregue</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: GRAY3, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right' }}>%</span>
              </div>
              {volumeComparison.items.map(({ nome, contratado, entregue, unidade }) => {
                const rawPct  = contratado > 0 ? (entregue / contratado) * 100 : 0
                const barPct  = Math.min(100, rawPct)
                const dispPct = Math.round(rawPct)
                const color   = rawPct >= 90 ? GREEN : rawPct >= 60 ? YELLOW : R
                return (
                  <div key={nome} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 72px 72px 44px', gap: 10, alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${GRAY5}` }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: GRAY1 }}>{nome}</span>
                    <div style={{ height: 8, background: GRAY5, borderRadius: 4, position: 'relative' }}>
                      {contratado > 0 && (
                        <div style={{ position: 'absolute', inset: 0, width: `${barPct}%`, background: color, borderRadius: 4, transition: 'width .4s' }} />
                      )}
                    </div>
                    <span style={{ fontSize: 12, color: GRAY3, textAlign: 'right' }}>{contratado > 0 ? `${contratado} ${unidade}` : '—'}</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: GRAY1, textAlign: 'right' }}>{entregue > 0 ? `${entregue} ${unidade}` : '—'}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: contratado > 0 ? color : GRAY3, textAlign: 'right' }}>
                      {contratado > 0 ? `${dispPct}%` : '—'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Risco + HS Trend ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 16, marginBottom: 20 }}>

        {/* Distribuição de risco */}
        <div style={{ ...card, padding: 22 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: GRAY1, marginBottom: 4 }}>Distribuição de Risco</div>
          <div style={{ fontSize: 11, color: GRAY3, marginBottom: 18 }}>Clientes ativos por nível de churn risk</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(['alto', 'medio', 'baixo'] as const).map(level => {
              const rm = RISK_MAP[level]
              const list = riskDist[level]
              const pct = ativos.length ? Math.round((list.length / ativos.length) * 100) : 0
              return (
                <div key={level}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: rm.dot, display: 'inline-block' }} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: GRAY1 }}>{rm.label}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, color: GRAY3 }}>{pct}%</span>
                      <span style={{ fontSize: 14, fontWeight: 800, color: rm.color }}>{list.length}</span>
                    </div>
                  </div>
                  <div style={{ height: 6, background: GRAY5, borderRadius: 4 }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: rm.dot, borderRadius: 4, transition: 'width .4s' }} />
                  </div>
                  {level === 'alto' && list.length > 0 && (
                    <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {list.slice(0, 4).map(c => (
                        <div key={c.id} onClick={() => router.push(`/cockpit/${c.slug || c.id}`)}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', borderRadius: 6, background: '#FFF5F5', cursor: 'pointer' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#FEE2E2')}
                          onMouseLeave={e => (e.currentTarget.style.background = '#FFF5F5')}>
                          <span style={{ fontSize: 11, color: GRAY1, fontWeight: 500 }}>{c.empresa}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            {c.latestHs && <span style={{ fontSize: 10, fontWeight: 700, color: healthColor(Number(c.latestHs.score_total)) }}>{Number(c.latestHs.score_total).toFixed(1)}</span>}
                            <ChevronRight size={10} color={GRAY3} />
                          </div>
                        </div>
                      ))}
                      {list.length > 4 && <div style={{ fontSize: 10, color: GRAY3, paddingLeft: 8 }}>+{list.length - 4} mais</div>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* HS Trend */}
        <div style={{ ...card, padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: GRAY1 }}>Tendência de Health Score</div>
              <div style={{ fontSize: 11, color: GRAY3, marginTop: 2 }}>Média semanal do portfólio ativo — últimas 12 semanas</div>
            </div>
            <button onClick={() => router.push('/cockpit/health-score')}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, border: `1px solid ${GRAY5}`, background: WHITE, color: GRAY2, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
              <BarChart2 size={11} /> Análise completa
            </button>
          </div>
          {hsTrend.length >= 2 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={hsTrend} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid stroke={GRAY5} strokeDasharray="3 3" />
                <XAxis dataKey="semana" tick={{ fontSize: 10, fill: GRAY3 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 10]} tick={{ fontSize: 10, fill: GRAY3 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: WHITE, border: `1px solid ${GRAY5}`, borderRadius: 8, fontSize: 11 }}
                  formatter={(v: number) => [v.toFixed(1), 'HS Médio']}
                />
                <Line type="monotone" dataKey="avg" stroke={BLUE} strokeWidth={2.5} dot={{ r: 3, fill: BLUE }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: GRAY3, fontSize: 13 }}>
              Dados insuficientes (mínimo 2 semanas)
            </div>
          )}
        </div>
      </div>

      {/* ── Alertas Operacionais ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14, marginBottom: 20 }}>

        {/* FCAs em aberto */}
        <div style={{ ...card, padding: 18, borderLeft: `4px solid ${R}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <AlertTriangle size={13} color={R} />
            <span style={{ fontSize: 12, fontWeight: 700, color: R }}>FCAs em Aberto</span>
            <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 800, color: R }}>{alertas.fcaAbertos.length}</span>
          </div>
          {alertas.fcaAbertos.length === 0 ? (
            <div style={{ fontSize: 12, color: GRAY3, fontStyle: 'italic' }}>Nenhum FCA em aberto</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {alertas.fcaAbertos.slice(0, 5).map(c => (
                <div key={c.id} onClick={() => router.push(`/cockpit/${c.slug || c.id}?tab=fca`)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: `1px solid ${GRAY5}`, cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: RISK_MAP[c.risk.level].dot, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: GRAY1 }}>{c.empresa}</span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: R }}>{c.fcaCount} FCA{c.fcaCount !== 1 ? 's' : ''}</span>
                </div>
              ))}
              {alertas.fcaAbertos.length > 5 && <div style={{ fontSize: 10, color: GRAY3, marginTop: 2 }}>+{alertas.fcaAbertos.length - 5} mais</div>}
            </div>
          )}
        </div>

        {/* Sem reunião há +30 dias */}
        <div style={{ ...card, padding: 18, borderLeft: `4px solid ${YELLOW}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <Video size={13} color={YELLOW} />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#92400E' }}>Sem reunião +30d</span>
            <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 800, color: '#92400E' }}>{alertas.semReuniao.length}</span>
          </div>
          {alertas.semReuniao.length === 0 ? (
            <div style={{ fontSize: 12, color: GRAY3, fontStyle: 'italic' }}>Todos reunidos recentemente</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {alertas.semReuniao.slice(0, 5).map(c => {
                const u = c.reunioes[0]
                return (
                  <div key={c.id} onClick={() => router.push(`/cockpit/${c.slug || c.id}?tab=reunioes`)}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: `1px solid ${GRAY5}`, cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: RISK_MAP[c.risk.level].dot, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: GRAY1 }}>{c.empresa}</span>
                    </div>
                    <span style={{ fontSize: 10, color: GRAY3 }}>{u ? `${daysSince(u.data)}d` : 'nunca'}</span>
                  </div>
                )
              })}
              {alertas.semReuniao.length > 5 && <div style={{ fontSize: 10, color: GRAY3, marginTop: 2 }}>+{alertas.semReuniao.length - 5} mais</div>}
            </div>
          )}
        </div>

        {/* Ações vencidas */}
        <div style={{ ...card, padding: 18, borderLeft: `4px solid ${R}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <CheckSquare size={13} color={R} />
            <span style={{ fontSize: 12, fontWeight: 700, color: R }}>Ações Vencidas</span>
            <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 800, color: R }}>{alertas.acoesVencidas.length}</span>
          </div>
          {alertas.acoesVencidas.length === 0 ? (
            <div style={{ fontSize: 12, color: GRAY3, fontStyle: 'italic' }}>Nenhuma ação atrasada</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {alertas.acoesVencidas.slice(0, 5).map(c => (
                <div key={c.id} onClick={() => router.push(`/cockpit/${c.slug || c.id}?tab=acoes`)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: `1px solid ${GRAY5}`, cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: RISK_MAP[c.risk.level].dot, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: GRAY1 }}>{c.empresa}</span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: R }}>{c.vencidas.length} ação{c.vencidas.length !== 1 ? 'ões' : ''}</span>
                </div>
              ))}
              {alertas.acoesVencidas.length > 5 && <div style={{ fontSize: 10, color: GRAY3, marginTop: 2 }}>+{alertas.acoesVencidas.length - 5} mais</div>}
            </div>
          )}
        </div>

        {/* Renovações próximas */}
        <div style={{ ...card, padding: 18, borderLeft: `4px solid ${BLUE}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <Calendar size={13} color={BLUE} />
            <span style={{ fontSize: 12, fontWeight: 700, color: BLUE }}>Renovação em 30d</span>
            <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 800, color: BLUE }}>{alertas.proxRenovacao.length}</span>
          </div>
          {alertas.proxRenovacao.length === 0 ? (
            <div style={{ fontSize: 12, color: GRAY3, fontStyle: 'italic' }}>Nenhum vencimento próximo</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {alertas.proxRenovacao.slice(0, 5).map(({ cliente: c, projeto: p, dias }) => (
                <div key={p.id} onClick={() => router.push(`/cockpit/${c.slug || c.id}?tab=projetos`)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: `1px solid ${GRAY5}`, cursor: 'pointer' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: GRAY1, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.empresa}</div>
                    <div style={{ fontSize: 10, color: GRAY3 }}>{p.nome}</div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: dias <= 7 ? R : BLUE, flexShrink: 0, marginLeft: 6 }}>{dias}d</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Reuniões do mês + Pipeline ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>

        {/* Reuniões */}
        <div style={{ ...card, padding: 22 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: GRAY1, marginBottom: 2 }}>Reuniões — {mesLabel}</div>
          <div style={{ fontSize: 11, color: GRAY3, marginBottom: 18 }}>Realizadas no mês atual</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
            {[
              { label: 'Total', value: reunioesMes.total, color: BLUE },
              { label: 'Operacionais', value: reunioesMes.operacionais, color: GRAY2 },
              { label: 'QBRs', value: reunioesMes.qbrs, color: YELLOW },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ padding: '12px 14px', background: GRAY4, borderRadius: 10, textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 900, color }}>{value}</div>
                <div style={{ fontSize: 11, color: GRAY3, marginTop: 3 }}>{label}</div>
              </div>
            ))}
          </div>
          {reunioesMes.semReuniao.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: GRAY2, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Sem reunião este mês ({reunioesMes.semReuniao.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {reunioesMes.semReuniao.slice(0, 5).map(c => (
                  <div key={c.id} onClick={() => router.push(`/cockpit/${c.slug || c.id}?tab=reunioes`)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 6, cursor: 'pointer', background: GRAY4 }}
                    onMouseEnter={e => (e.currentTarget.style.background = GRAY5)}
                    onMouseLeave={e => (e.currentTarget.style.background = GRAY4)}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: RISK_MAP[c.risk.level].dot, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: GRAY1, flex: 1 }}>{c.empresa}</span>
                    <ChevronRight size={11} color={GRAY3} />
                  </div>
                ))}
                {reunioesMes.semReuniao.length > 5 && <div style={{ fontSize: 11, color: GRAY3, paddingLeft: 8 }}>+{reunioesMes.semReuniao.length - 5} mais</div>}
              </div>
            </>
          )}
        </div>

        {/* Pipeline de expansão */}
        <div style={{ ...card, padding: 22 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: GRAY1, marginBottom: 2 }}>Pipeline de Expansão</div>
          <div style={{ fontSize: 11, color: GRAY3, marginBottom: 18 }}>Oportunidades em aberto por estágio</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pipeline.map(({ etapa, label, count, valor, color }) => (
              <div key={etapa} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: GRAY1, width: 110, flexShrink: 0 }}>{label}</span>
                <div style={{ flex: 1, height: 8, background: GRAY5, borderRadius: 4 }}>
                  {count > 0 && (
                    <div style={{ height: '100%', width: `${Math.min(100, (count / Math.max(...pipeline.map(p => p.count), 1)) * 100)}%`, background: color, borderRadius: 4, opacity: 0.7 }} />
                  )}
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: GRAY1, width: 28, textAlign: 'right', flexShrink: 0 }}>{count}</span>
                <span style={{ fontSize: 11, color: GRAY3, width: 70, textAlign: 'right', flexShrink: 0 }}>{valor > 0 ? fmtMRR(valor) : '—'}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 18, padding: '12px 14px', background: GRAY4, borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: GRAY2, fontWeight: 600 }}>Total em pipeline</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: GRAY1 }}>
              {fmtFull(oportunidades.filter(o => o.etapa !== 'fechada').reduce((s, o) => s + (o.valor_estimado || 0), 0))}
            </span>
          </div>
        </div>
      </div>

      {/* ── NPS/CSAT ── */}
      <div style={{ ...card, padding: 22, marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: GRAY1, marginBottom: 2 }}>NPS & CSAT</div>
        <div style={{ fontSize: 11, color: GRAY3, marginBottom: 18 }}>NPS últimos 90 dias · CSAT mês atual</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 2fr', gap: 16, alignItems: 'start' }}>
          {/* NPS score */}
          <div style={{ padding: '16px 18px', background: GRAY4, borderRadius: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: GRAY3, marginBottom: 6, fontWeight: 600 }}>NPS Score</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: npsOv.nps !== null ? (npsOv.nps >= 50 ? GREEN : npsOv.nps >= 0 ? YELLOW : R) : GRAY3, lineHeight: 1 }}>
              {npsOv.nps !== null ? (npsOv.nps > 0 ? `+${npsOv.nps}` : String(npsOv.nps)) : '—'}
            </div>
            <div style={{ fontSize: 10, color: GRAY3, marginTop: 4 }}>{npsOv.total} respostas</div>
          </div>
          {/* Promotores */}
          <div style={{ padding: '16px 18px', background: '#ECFDF5', borderRadius: 12, textAlign: 'center', border: `1px solid #A7F3D0` }}>
            <div style={{ fontSize: 11, color: '#065F46', marginBottom: 6, fontWeight: 600 }}>Promotores</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: GREEN, lineHeight: 1 }}>{npsOv.promotores}</div>
            <div style={{ fontSize: 10, color: '#065F46', marginTop: 4 }}>9–10</div>
          </div>
          {/* Neutros */}
          <div style={{ padding: '16px 18px', background: '#FFFBEB', borderRadius: 12, textAlign: 'center', border: `1px solid #FDE68A` }}>
            <div style={{ fontSize: 11, color: '#92400E', marginBottom: 6, fontWeight: 600 }}>Neutros</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: YELLOW, lineHeight: 1 }}>{npsOv.neutros}</div>
            <div style={{ fontSize: 10, color: '#92400E', marginTop: 4 }}>7–8</div>
          </div>
          {/* Detratores */}
          <div style={{ padding: '16px 18px', background: '#FEF2F2', borderRadius: 12, textAlign: 'center', border: `1px solid #FECACA` }}>
            <div style={{ fontSize: 11, color: '#991B1B', marginBottom: 6, fontWeight: 600 }}>Detratores</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: R, lineHeight: 1 }}>{npsOv.detratores}</div>
            <div style={{ fontSize: 10, color: '#991B1B', marginTop: 4 }}>0–6</div>
          </div>
          {/* Últimos registros */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Últimos Registros</div>
            {npsOv.ultimos.length === 0 ? (
              <div style={{ fontSize: 12, color: GRAY3, fontStyle: 'italic' }}>Nenhum NPS registrado</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {npsOv.ultimos.map(n => {
                  const c = n.pontuacao >= 9 ? GREEN : n.pontuacao >= 7 ? YELLOW : R
                  return (
                    <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', background: GRAY4, borderRadius: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 900, color: c, width: 28, textAlign: 'center' }}>{n.pontuacao}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: GRAY1, fontWeight: 500 }}>{n.empresa}</div>
                        {n.comentario && <div style={{ fontSize: 10, color: GRAY3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.comentario}</div>}
                      </div>
                      <div style={{ fontSize: 10, color: GRAY3, flexShrink: 0 }}>{fmtDate(n.created_at.slice(0, 10))}</div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Mapa de Atividade ── */}
      <div style={{ ...card, overflow: 'hidden', marginBottom: 8 }}>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${GRAY5}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: GRAY1 }}>Mapa de Atividade</div>
            <div style={{ fontSize: 11, color: GRAY3, marginTop: 2 }}>Clientes ativos ordenados por prioridade de atenção</div>
          </div>
          <button onClick={() => router.push('/cockpit')}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, border: `1px solid ${GRAY5}`, background: WHITE, color: GRAY2, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
            <ExternalLink size={11} /> Ver todos
          </button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thS}>Cliente</th>
                <th style={{ ...thS, textAlign: 'center' }}>Risco</th>
                <th style={{ ...thS, textAlign: 'center' }}>HS</th>
                <th style={{ ...thS, textAlign: 'center' }}>Última Reunião</th>
                <th style={{ ...thS, textAlign: 'center' }}>FCAs</th>
                <th style={{ ...thS, textAlign: 'center' }}>Ações Venc.</th>
                <th style={{ ...thS, textAlign: 'right' }}>MRR</th>
              </tr>
            </thead>
            <tbody>
              {mapaAtividade.map(c => {
                const rm = RISK_MAP[c.risk.level]
                const reuniaoDays = c.ultimaReuniao ? daysSince(c.ultimaReuniao) : null
                const reuniaoColor = reuniaoDays === null ? R : reuniaoDays > 30 ? (c.risk.level === 'alto' ? R : YELLOW) : GRAY2
                const clientUrl = `/cockpit/${c.slug || c.id}`
                return (
                  <tr key={c.id} onClick={() => router.push(clientUrl)} style={{ cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = GRAY4)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={tdS}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 7, background: `${R}10`, border: `1px solid ${R}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span style={{ fontSize: 11, fontWeight: 900, color: R }}>{c.empresa[0]}</span>
                        </div>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{c.empresa}</span>
                      </div>
                    </td>
                    <td style={{ ...tdS, textAlign: 'center' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 5, background: rm.bg, border: `1px solid ${rm.border}`, fontSize: 10, fontWeight: 700, color: rm.color }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: rm.dot }} />
                        {rm.label}
                      </span>
                    </td>
                    <td style={{ ...tdS, textAlign: 'center' }}>
                      {c.hs !== null ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontSize: 14, fontWeight: 800, color: healthColor(c.hs) }}>{c.hs.toFixed(1)}</span>
                          {c.hsDelta !== null && (
                            <span style={{ fontSize: 10, color: c.hsDelta > 0 ? GREEN : c.hsDelta < 0 ? R : GRAY3, display: 'flex', alignItems: 'center' }}>
                              {c.hsDelta > 0 ? <ArrowUp size={9} /> : c.hsDelta < 0 ? <ArrowDown size={9} /> : <Minus size={9} />}
                            </span>
                          )}
                        </div>
                      ) : <span style={{ color: GRAY3, fontSize: 12 }}>—</span>}
                    </td>
                    <td style={{ ...tdS, textAlign: 'center' }}>
                      <span style={{ fontSize: 12, color: reuniaoColor, fontWeight: reuniaoDays !== null && reuniaoDays > 30 ? 700 : 400 }}>
                        {reuniaoDays === null ? 'Nunca' : reuniaoDays === 0 ? 'Hoje' : `${reuniaoDays}d atrás`}
                      </span>
                    </td>
                    <td style={{ ...tdS, textAlign: 'center' }}>
                      {c.fcasAbertos > 0
                        ? <span style={{ fontSize: 12, fontWeight: 700, color: R }}>{c.fcasAbertos}</span>
                        : <span style={{ color: GRAY3, fontSize: 12 }}>—</span>}
                    </td>
                    <td style={{ ...tdS, textAlign: 'center' }}>
                      {c.acoesVencidas > 0
                        ? <span style={{ fontSize: 12, fontWeight: 700, color: R }}>{c.acoesVencidas}</span>
                        : <span style={{ color: GRAY3, fontSize: 12 }}>—</span>}
                    </td>
                    <td style={{ ...tdS, textAlign: 'right', fontWeight: 600 }}>
                      {c.mrr > 0 ? fmtMRR(c.mrr) : <span style={{ color: GRAY3 }}>—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

    </CRMLayout>
  )
}
