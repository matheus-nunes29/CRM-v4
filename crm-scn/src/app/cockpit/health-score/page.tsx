'use client'
import React, { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import CRMLayout from '../../_components/CRMLayout'
import { R, WHITE, GRAY1, GRAY2, GRAY3, GRAY4, GRAY5, GREEN, BLUE, YELLOW, PURPLE } from '@/lib/crm-constants'
import {
  LineChart, Line, BarChart, Bar, ScatterChart, Scatter,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend, ResponsiveContainer, Cell,
} from 'recharts'
import { ArrowLeft, AlertTriangle, ArrowUp, ArrowDown, Minus } from 'lucide-react'

// ─── types ────────────────────────────────────────────────────────────────────
type HS = {
  id: string; cliente_id: string; semana: string
  resultado: number; trafego: number; entregas_prazo: number
  qualidade_entregas: number; relacionamento: number; score_total: number
}
type ClienteRow = {
  id: string; empresa: string; segmento: string | null; status: string
  gestor_projetos: string | null; designer: string | null; analista_midia: string | null
  entries: HS[]; latest: HS | null; prev: HS | null; delta: number | null
  mrr: number; servicos: string[]; hasFca: boolean; consecutiveLow: number; ltMonths: number
}

// ─── constants ────────────────────────────────────────────────────────────────
const DIMS = [
  { key: 'resultado'          as const, label: 'Resultados',     short: 'Res.' },
  { key: 'trafego'            as const, label: 'Tráfego',        short: 'Tráf.' },
  { key: 'entregas_prazo'     as const, label: 'Entregas',       short: 'Entr.' },
  { key: 'qualidade_entregas' as const, label: 'Qualidade',      short: 'Qual.' },
  { key: 'relacionamento'     as const, label: 'Relacionamento', short: 'Rel.' },
]
const SERVICOS_EX = [
  { key: 'marketplace',          label: 'MarketPlace' },
  { key: 'manutencao_crm',       label: 'Manutenção CRM' },
  { key: 'seo',                  label: 'SEO' },
  { key: 'manutencao_lp',        label: 'Manutenção LP' },
  { key: 'manutencao_bi',        label: 'Manutenção BI' },
  { key: 'manutencao_site',      label: 'Manutenção Site' },
  { key: 'webdesign',            label: 'WebDesign' },
  { key: 'sales_enablement',     label: 'Sales Enablement' },
  { key: 'bi',                   label: 'BI' },
  { key: 'social_media',         label: 'Social Media' },
  { key: 'midia_paga',           label: 'Mídia Paga' },
  { key: 'design_grafico',       label: 'Design Gráfico' },
  { key: 'redacao_publicitaria', label: 'Redação Publicitária' },
  { key: 'crm',                  label: 'CRM' },
]
const LINE_PALETTE = [GREEN, BLUE, PURPLE, '#F97316', '#06B6D4', '#8B5CF6', R, YELLOW, '#EC4899', '#14B8A6']
const card: React.CSSProperties = { background: WHITE, border: `1px solid ${GRAY5}`, borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,.04)' }

// ─── helpers ──────────────────────────────────────────────────────────────────
function healthColor(s: number) { return s >= 7 ? GREEN : s >= 5 ? YELLOW : R }
function fmtMRR(v: number) { return v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v}` }
function fmtDate(s: string) { const [, m, d] = s.split('-'); return `${d}/${m}` }

function pearsonR(xs: number[], ys: number[]): number {
  const n = xs.length
  if (n < 3) return 0
  const mx = xs.reduce((a, b) => a + b) / n
  const my = ys.reduce((a, b) => a + b) / n
  const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0)
  const den = Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0) * ys.reduce((s, y) => s + (y - my) ** 2, 0))
  return den === 0 ? 0 : +(num / den).toFixed(2)
}

function corrBg(r: number) {
  if (r >= 0.7) return '#059669'
  if (r >= 0.3) return '#6EE7B7'
  if (r > -0.3) return GRAY4
  if (r > -0.7) return '#FCA5A5'
  return '#DC2626'
}
function corrFg(r: number) {
  if (r >= 0.3) return '#065F46'
  if (r > -0.3) return GRAY2
  return '#7F1D1D'
}

function weekNAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n * 7)
  const day = d.getDay()
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1))
  d.setHours(0, 0, 0, 0)
  return d.toISOString().split('T')[0]
}
function startOfWeek() { return weekNAgo(0) }

// ─── page ─────────────────────────────────────────────────────────────────────
export default function HSAnalysisPage() {
  const router = useRouter()
  const [clientes, setClientes]     = useState<ClienteRow[]>([])
  const [loading, setLoading]       = useState(true)

  // filtros
  const [fGestor,   setFGestor]   = useState('todos')
  const [fScore,    setFScore]    = useState('todos')
  const [fStatus,   setFStatus]   = useState('todos')
  const [fSegmento, setFSegmento] = useState('todos')
  const [fMrr,      setFMrr]      = useState('todos')
  const [fServico,  setFServico]  = useState('todos')

  // line chart
  const [period,       setPeriod]       = useState(12)
  const [lineClients,  setLineClients]  = useState<Set<string>>(new Set())

  // tabela
  const [sortKey, setSortKey] = useState('score')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [{ data: cl }, { data: hs }, { data: pr }, { data: fc }] = await Promise.all([
      supabase.from('clientes').select('*').order('empresa'),
      supabase.from('health_score_entries').select('*').order('semana', { ascending: false }),
      supabase.from('projetos').select('id,cliente_id,valor,valor_tipo,status,tipo,servicos_executar,data_inicio'),
      supabase.from('fca_entries').select('id,cliente_id'),
    ])
    const fcaSet = new Set((fc || []).map((f: any) => f.cliente_id as string))
    const rows: ClienteRow[] = (cl || []).map((c: any) => {
      const entries: HS[] = (hs || []).filter((h: any) => h.cliente_id === c.id)
      const projs          = (pr || []).filter((p: any) => p.cliente_id === c.id)
      const latest         = entries[0] ?? null
      const prev           = entries[1] ?? null
      const delta          = latest && prev ? +(latest.score_total - prev.score_total).toFixed(2) : null
      const mrr            = projs.filter((p: any) => p.valor_tipo === 'mensalidade' && p.status === 'ativo').reduce((s: number, p: any) => s + p.valor, 0)
      const servicos       = Array.from(new Set(projs.filter((p: any) => p.tipo === 'executar').flatMap((p: any) => (p.servicos_executar || []).map((s: any) => s.key as string))))
      let consecutiveLow   = 0
      for (const e of entries) { if (e.score_total < 7) consecutiveLow++; else break }
      const dates          = projs.map((p: any) => p.data_inicio as string | null).filter(Boolean) as string[]
      const ltMonths       = dates.length ? Math.floor((Date.now() - new Date(dates.sort()[0]).getTime()) / (1000 * 60 * 60 * 24 * 30.44)) : 0
      return { ...c, entries, latest, prev, delta, mrr, servicos, hasFca: fcaSet.has(c.id), consecutiveLow, ltMonths }
    })
    setClientes(rows)
    setLineClients(new Set(rows.filter(r => r.latest).slice(0, 8).map(r => r.id)))
    setLoading(false)
  }

  // ── filtrado ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => clientes.filter(c => {
    if (fGestor   !== 'todos' && c.gestor_projetos !== fGestor)    return false
    if (fStatus   !== 'todos' && c.status          !== fStatus)    return false
    if (fSegmento !== 'todos' && c.segmento        !== fSegmento)  return false
    if (fServico  !== 'todos' && !c.servicos.includes(fServico))   return false
    if (fMrr === 'low'  && !(c.mrr > 0    && c.mrr < 3000))       return false
    if (fMrr === 'mid'  && !(c.mrr >= 3000 && c.mrr < 8000))      return false
    if (fMrr === 'high' && c.mrr < 8000)                           return false
    if (!c.latest) return fScore === 'todos'
    const s = c.latest.score_total
    if (fScore === 'saudavel' && s < 7)          return false
    if (fScore === 'atencao'  && (s < 5 || s >= 7)) return false
    if (fScore === 'risco'    && s >= 5)          return false
    return true
  }), [clientes, fGestor, fScore, fStatus, fSegmento, fMrr, fServico])

  const gestores  = useMemo(() => Array.from(new Set(clientes.map(c => c.gestor_projetos).filter(Boolean))) as string[], [clientes])
  const segmentos = useMemo(() => Array.from(new Set(clientes.map(c => c.segmento).filter(Boolean))) as string[], [clientes])
  const hasFilter = fGestor !== 'todos' || fScore !== 'todos' || fStatus !== 'todos' || fSegmento !== 'todos' || fMrr !== 'todos' || fServico !== 'todos'

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const ws = filtered.filter(c => c.latest)
    const avg = ws.length ? ws.reduce((s, c) => s + c.latest!.score_total, 0) / ws.length : null
    return {
      avg, total: filtered.length,
      saudaveis:  ws.filter(c => c.latest!.score_total >= 7).length,
      risco:      ws.filter(c => c.latest!.score_total < 5).length,
      semReg:     filtered.filter(c => !c.entries.some(e => e.semana === startOfWeek())).length,
      semFca:     filtered.filter(c => c.latest && c.latest.score_total < 7 && !c.hasFca).length,
    }
  }, [filtered])

  // ── alertas ───────────────────────────────────────────────────────────────
  const alertas = useMemo(() => ({
    queda:  filtered.filter(c => c.consecutiveLow >= 3),
    semFca: filtered.filter(c => c.latest && c.latest.score_total < 7 && !c.hasFca),
    semReg: filtered.filter(c => !c.entries.some(e => e.semana === startOfWeek())),
  }), [filtered])

  // ── line chart ────────────────────────────────────────────────────────────
  const lineData = useMemo(() => {
    const since  = weekNAgo(period)
    const weeks  = Array.from(new Set(clientes.flatMap(c => c.entries.map(e => e.semana)).filter(s => s >= since))).sort()
    const sel    = filtered.filter(c => lineClients.has(c.id))
    return weeks.map(w => {
      const row: Record<string, any> = { semana: fmtDate(w) }
      sel.forEach(c => { const e = c.entries.find(x => x.semana === w); if (e) row[c.empresa] = +e.score_total.toFixed(1) })
      return row
    })
  }, [filtered, clientes, period, lineClients])

  const lineClientsList = useMemo(() => filtered.filter(c => c.latest), [filtered])

  // ── heatmap ───────────────────────────────────────────────────────────────
  const heatmapRows = useMemo(() =>
    filtered.filter(c => c.latest).map(c => ({
      id: c.id, empresa: c.empresa,
      scores: DIMS.map(d => c.latest![d.key] as number),
      total: c.latest!.score_total,
    })).sort((a, b) => b.total - a.total),
  [filtered])

  // ── scatter ───────────────────────────────────────────────────────────────
  const scatterMRR = useMemo(() =>
    filtered.filter(c => c.latest && c.mrr > 0).map(c => ({ mrr: c.mrr, score: +c.latest!.score_total.toFixed(1), empresa: c.empresa, fill: healthColor(c.latest!.score_total) })),
  [filtered])

  const scatterLT = useMemo(() =>
    filtered.filter(c => c.latest && c.ltMonths > 0).map(c => ({ lt: c.ltMonths, score: +c.latest!.score_total.toFixed(1), empresa: c.empresa, fill: healthColor(c.latest!.score_total) })),
  [filtered])

  // ── radar médio ───────────────────────────────────────────────────────────
  const radarData = useMemo(() => {
    const ws = filtered.filter(c => c.latest)
    if (!ws.length) return []
    return DIMS.map(d => ({ subject: d.short, value: +(ws.reduce((s, c) => s + c.latest![d.key], 0) / ws.length).toFixed(1) }))
  }, [filtered])

  // ── barras: gestor / designer / analista ──────────────────────────────────
  function barByRole(field: keyof ClienteRow) {
    const map = new Map<string, number[]>()
    filtered.filter(c => c.latest && c[field]).forEach(c => {
      const k = c[field] as string
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(c.latest!.score_total)
    })
    return Array.from(map.entries())
      .map(([nome, scores]) => ({ nome: nome.split(' ')[0], avg: +(scores.reduce((a, b) => a + b) / scores.length).toFixed(1), count: scores.length }))
      .sort((a, b) => b.avg - a.avg)
  }
  const byGestor   = useMemo(() => barByRole('gestor_projetos'), [filtered])
  const byDesigner = useMemo(() => barByRole('designer'),        [filtered])
  const byAnalista = useMemo(() => barByRole('analista_midia'),  [filtered])

  // ── barras: segmento ──────────────────────────────────────────────────────
  const bySegmento = useMemo(() => {
    const map = new Map<string, number[]>()
    filtered.filter(c => c.latest && c.segmento).forEach(c => {
      const k = c.segmento!
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(c.latest!.score_total)
    })
    return Array.from(map.entries())
      .map(([seg, scores]) => ({ seg, avg: +(scores.reduce((a, b) => a + b) / scores.length).toFixed(1), count: scores.length }))
      .sort((a, b) => b.avg - a.avg)
  }, [filtered])

  // ── barras: por serviço ───────────────────────────────────────────────────
  const byServico = useMemo(() =>
    SERVICOS_EX.map(s => {
      const cs = filtered.filter(c => c.latest && c.servicos.includes(s.key))
      if (!cs.length) return null
      return { label: s.label, avg: +(cs.reduce((acc, c) => acc + c.latest!.score_total, 0) / cs.length).toFixed(1), count: cs.length }
    }).filter(Boolean).sort((a, b) => b!.avg - a!.avg) as { label: string; avg: number; count: number }[],
  [filtered])

  // ── correlação ────────────────────────────────────────────────────────────
  const correlacoes = useMemo(() => {
    const ws = filtered.filter(c => c.latest)
    return DIMS.map(da => DIMS.map(db => {
      if (da.key === db.key) return 1
      return pearsonR(ws.map(c => c.latest![da.key]), ws.map(c => c.latest![db.key]))
    }))
  }, [filtered])

  // ── tabela ranking ────────────────────────────────────────────────────────
  const sortedTable = useMemo(() => {
    const rows = filtered.filter(c => c.latest).map(c => ({
      id: c.id, empresa: c.empresa, gestor: c.gestor_projetos,
      score: c.latest!.score_total, delta: c.delta,
      resultado: c.latest!.resultado, trafego: c.latest!.trafego,
      entregas_prazo: c.latest!.entregas_prazo, qualidade_entregas: c.latest!.qualidade_entregas,
      relacionamento: c.latest!.relacionamento,
      mrr: c.mrr, ltMonths: c.ltMonths, consecutiveLow: c.consecutiveLow,
    }))
    return rows.sort((a, b) => {
      const av = (a as any)[sortKey] ?? 0, bv = (b as any)[sortKey] ?? 0
      return sortDir === 'desc' ? bv - av : av - bv
    })
  }, [filtered, sortKey, sortDir])

  function onSort(k: string) {
    if (sortKey === k) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(k); setSortDir('desc') }
  }

  const selStyle: React.CSSProperties = { padding: '6px 10px', background: WHITE, border: `1px solid ${GRAY5}`, borderRadius: 7, color: GRAY1, fontSize: 12, outline: 'none', cursor: 'pointer' }
  const thS: React.CSSProperties     = { padding: '9px 12px', fontSize: 10, fontWeight: 700, color: GRAY3, letterSpacing: '0.06em', textTransform: 'uppercase', borderBottom: `1px solid ${GRAY5}`, background: GRAY4, cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none' }
  const tdS: React.CSSProperties     = { padding: '10px 12px', fontSize: 12, color: GRAY1, borderBottom: `1px solid ${GRAY5}`, verticalAlign: 'middle' }

  function SortArrow({ k }: { k: string }) {
    if (sortKey !== k) return null
    return sortDir === 'desc' ? <ArrowDown size={9} style={{ display: 'inline' }} /> : <ArrowUp size={9} style={{ display: 'inline' }} />
  }

  function HBar({ data, nameKey }: { data: { avg: number; count: number; [k: string]: any }[]; nameKey: string }) {
    if (!data.length) return <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: GRAY3, fontSize: 12 }}>Sem dados</div>
    return (
      <ResponsiveContainer width="100%" height={Math.max(180, data.length * 36)}>
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 36 }}>
          <CartesianGrid horizontal={false} stroke={GRAY5} strokeDasharray="3 3" />
          <XAxis type="number" domain={[0, 10]} tick={{ fontSize: 10, fill: GRAY3 }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey={nameKey} tick={{ fontSize: 11, fill: GRAY1 }} axisLine={false} tickLine={false} width={90} />
          <Tooltip contentStyle={{ background: WHITE, border: `1px solid ${GRAY5}`, borderRadius: 8, fontSize: 11 }} formatter={(v: any, _: any, p: any) => [`${v} · ${p.payload.count} cliente${p.payload.count !== 1 ? 's' : ''}`, 'HS Médio']} />
          <Bar dataKey="avg" radius={[0, 6, 6, 0]} label={{ position: 'right', fontSize: 11, fontWeight: 700, fill: GRAY2 }}>
            {data.map((d, i) => <Cell key={i} fill={healthColor(d.avg)} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    )
  }

  if (loading) return <CRMLayout title="Health Score — Análise" subtitle="Carregando..."><div style={{ padding: 56, textAlign: 'center', color: GRAY3 }}>Carregando dados...</div></CRMLayout>

  return (
    <CRMLayout title="Health Score — Análise" subtitle={`${filtered.length} cliente${filtered.length !== 1 ? 's' : ''} exibido${filtered.length !== 1 ? 's' : ''}`}>

      {/* back */}
      <button onClick={() => router.push('/cockpit')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, border: `1px solid ${GRAY5}`, background: WHITE, color: GRAY2, fontSize: 12, fontWeight: 600, cursor: 'pointer', marginBottom: 20 }}>
        <ArrowLeft size={13} /> Voltar ao Cockpit
      </button>

      {/* ── KPIs ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'HS Médio',       value: kpis.avg !== null ? kpis.avg.toFixed(1) : '—', color: kpis.avg !== null ? healthColor(kpis.avg) : GRAY3, sub: `de ${kpis.total} clientes` },
          { label: 'Saudáveis ≥ 7',  value: kpis.saudaveis, color: GREEN,  sub: `${kpis.total ? Math.round(kpis.saudaveis / kpis.total * 100) : 0}% do portfólio` },
          { label: 'Em Risco < 5',   value: kpis.risco,     color: R,      sub: `${kpis.total ? Math.round(kpis.risco     / kpis.total * 100) : 0}% do portfólio` },
          { label: 'Sem Registro',   value: kpis.semReg,    color: YELLOW, sub: 'esta semana' },
          { label: 'FCA Pendente',   value: kpis.semFca,    color: R,      sub: 'HS<7 sem FCA' },
        ].map(({ label, value, color, sub }) => (
          <div key={label} style={{ ...card, padding: '16px 18px' }}>
            <div style={{ fontSize: 11, color: GRAY3, fontWeight: 600, marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 30, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: 11, color: GRAY3, marginTop: 5 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* ── Filtros ── */}
      <div style={{ ...card, padding: '14px 18px', marginBottom: 20, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: GRAY3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Filtros</span>
        <select value={fGestor}   onChange={e => setFGestor(e.target.value)}   style={selStyle}>
          <option value="todos">Todos os Gestores</option>
          {gestores.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <select value={fScore}    onChange={e => setFScore(e.target.value)}    style={selStyle}>
          <option value="todos">Todos os Scores</option>
          <option value="saudavel">Saudável (≥7)</option>
          <option value="atencao">Atenção (5–7)</option>
          <option value="risco">Em Risco (&lt;5)</option>
        </select>
        <select value={fStatus}   onChange={e => setFStatus(e.target.value)}   style={selStyle}>
          <option value="todos">Todos os Status</option>
          <option value="ativo">Ativo</option>
          <option value="pausado">Pausado</option>
          <option value="churned">Churned</option>
        </select>
        <select value={fSegmento} onChange={e => setFSegmento(e.target.value)} style={selStyle}>
          <option value="todos">Todos os Segmentos</option>
          {segmentos.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={fMrr}      onChange={e => setFMrr(e.target.value)}      style={selStyle}>
          <option value="todos">Todos os MRRs</option>
          <option value="low">MRR &lt; R$3k</option>
          <option value="mid">MRR R$3–8k</option>
          <option value="high">MRR &gt; R$8k</option>
        </select>
        <select value={fServico}  onChange={e => setFServico(e.target.value)}  style={selStyle}>
          <option value="todos">Todos os Serviços</option>
          {SERVICOS_EX.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        {hasFilter && (
          <button onClick={() => { setFGestor('todos'); setFScore('todos'); setFStatus('todos'); setFSegmento('todos'); setFMrr('todos'); setFServico('todos') }}
            style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${R}`, background: '#FEE2E2', color: '#991B1B', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            Limpar filtros
          </button>
        )}
      </div>

      {/* ── Alertas ── */}
      {(alertas.queda.length > 0 || alertas.semFca.length > 0 || alertas.semReg.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
          {alertas.queda.length > 0 && (
            <div style={{ ...card, padding: 16, borderLeft: `4px solid ${R}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <AlertTriangle size={13} color={R} />
                <span style={{ fontSize: 12, fontWeight: 700, color: R }}>Queda consecutiva (≥ 3 semanas)</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {alertas.queda.map(c => (
                  <div key={c.id} onClick={() => router.push(`/cockpit/${c.id}`)} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: `1px solid ${GRAY5}`, cursor: 'pointer' }}>
                    <span style={{ fontSize: 12, color: GRAY1 }}>{c.empresa}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: R }}>{c.consecutiveLow} sem.</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {alertas.semFca.length > 0 && (
            <div style={{ ...card, padding: 16, borderLeft: `4px solid ${YELLOW}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <AlertTriangle size={13} color={YELLOW} />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#92400E' }}>HS &lt; 7 sem FCA registrado</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {alertas.semFca.map(c => (
                  <div key={c.id} onClick={() => router.push(`/cockpit/${c.id}?tab=fca`)} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: `1px solid ${GRAY5}`, cursor: 'pointer' }}>
                    <span style={{ fontSize: 12, color: GRAY1 }}>{c.empresa}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: healthColor(c.latest!.score_total) }}>{c.latest!.score_total.toFixed(1)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {alertas.semReg.length > 0 && (
            <div style={{ ...card, padding: 16, borderLeft: `4px solid ${GRAY3}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <AlertTriangle size={13} color={GRAY3} />
                <span style={{ fontSize: 12, fontWeight: 700, color: GRAY2 }}>Sem registro esta semana</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {alertas.semReg.map(c => (
                  <div key={c.id} onClick={() => router.push(`/cockpit/${c.id}?tab=health-score`)} style={{ padding: '5px 0', borderBottom: `1px solid ${GRAY5}`, cursor: 'pointer', fontSize: 12, color: GRAY1 }}>
                    {c.empresa}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Evolução — gráfico de linha ── */}
      <div style={{ ...card, padding: 22, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: GRAY1 }}>Evolução do Health Score</div>
            <div style={{ fontSize: 11, color: GRAY3, marginTop: 2 }}>Selecione os clientes à direita</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[4, 8, 12].map(p => (
              <button key={p} onClick={() => setPeriod(p)} style={{ padding: '5px 12px', borderRadius: 7, border: `1px solid ${period === p ? R : GRAY5}`, background: period === p ? R : WHITE, color: period === p ? WHITE : GRAY2, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                {p} sem.
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 190px', gap: 16 }}>
          <ResponsiveContainer width="100%" height={270}>
            <LineChart data={lineData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={GRAY5} strokeDasharray="3 3" />
              <XAxis dataKey="semana" tick={{ fontSize: 10, fill: GRAY3 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 10]} tick={{ fontSize: 10, fill: GRAY3 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: WHITE, border: `1px solid ${GRAY5}`, borderRadius: 8, fontSize: 11 }} />
              {lineClientsList.filter(c => lineClients.has(c.id)).map((c, i) => (
                <Line key={c.id} type="monotone" dataKey={c.empresa} stroke={LINE_PALETTE[i % LINE_PALETTE.length]} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, overflowY: 'auto', maxHeight: 270, paddingRight: 4 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: GRAY3, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, flexShrink: 0 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="checkbox"
                  checked={lineClientsList.every(c => lineClients.has(c.id))}
                  onChange={() => {
                    const allSelected = lineClientsList.every(c => lineClients.has(c.id))
                    setLineClients(allSelected ? new Set() : new Set(lineClientsList.map(c => c.id)))
                  }}
                  style={{ cursor: 'pointer' }} />
                Todos
              </label>
            </div>
            {lineClientsList.map((c, i) => (
              <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '2px 0' }}>
                <input type="checkbox" checked={lineClients.has(c.id)}
                  onChange={() => setLineClients(prev => { const n = new Set(prev); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n })}
                  style={{ accentColor: LINE_PALETTE[i % LINE_PALETTE.length], cursor: 'pointer', flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: GRAY1, lineHeight: 1.3 }}>{c.empresa}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* ── Heatmap ── */}
      {heatmapRows.length > 0 && (
        <div style={{ ...card, padding: 22, marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: GRAY1, marginBottom: 4 }}>Mapa de Calor — Dimensões por Cliente</div>
          <div style={{ fontSize: 11, color: GRAY3, marginBottom: 14 }}>Verde = saudável · Amarelo = atenção · Vermelho = risco</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
              <thead>
                <tr>
                  <th style={{ ...thS, textAlign: 'left', width: 160 }}>Cliente</th>
                  {DIMS.map(d => <th key={d.key} style={{ ...thS, textAlign: 'center', width: 80 }}>{d.short}</th>)}
                  <th style={{ ...thS, textAlign: 'center', width: 70 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {heatmapRows.map(row => (
                  <tr key={row.id} onClick={() => router.push(`/cockpit/${row.id}`)} style={{ cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = GRAY4)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ ...tdS, fontWeight: 600, fontSize: 12 }}>{row.empresa}</td>
                    {row.scores.map((s, i) => (
                      <td key={i} style={{ ...tdS, textAlign: 'center', background: `${healthColor(s)}20` }}>
                        <span style={{ fontWeight: 700, color: healthColor(s), fontSize: 13 }}>{s.toFixed(1)}</span>
                      </td>
                    ))}
                    <td style={{ ...tdS, textAlign: 'center' }}>
                      <span style={{ fontWeight: 800, fontSize: 14, color: healthColor(row.total) }}>{row.total.toFixed(1)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Ranking ── */}
      {sortedTable.length > 0 && (
        <div style={{ ...card, marginBottom: 20, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${GRAY5}`, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: GRAY1 }}>Ranking de Clientes</div>
            <div style={{ fontSize: 11, color: GRAY3 }}>— clique nas colunas para ordenar</div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {[
                    { k: 'empresa', l: 'Cliente' }, { k: 'score', l: 'HS' }, { k: 'delta', l: 'Δ' },
                    { k: 'resultado', l: 'Res.' }, { k: 'trafego', l: 'Tráf.' },
                    { k: 'entregas_prazo', l: 'Entr.' }, { k: 'qualidade_entregas', l: 'Qual.' }, { k: 'relacionamento', l: 'Rel.' },
                    { k: 'mrr', l: 'MRR' }, { k: 'ltMonths', l: 'LT' }, { k: 'consecutiveLow', l: '⚠ Sem' },
                  ].map(col => (
                    <th key={col.k} onClick={() => onSort(col.k)} style={thS}>
                      {col.l} <SortArrow k={col.k} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedTable.map(row => (
                  <tr key={row.id} onClick={() => router.push(`/cockpit/${row.id}`)} style={{ cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = GRAY4)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ ...tdS, fontWeight: 600 }}>{row.empresa}</td>
                    <td style={{ ...tdS, textAlign: 'center' }}>
                      <span style={{ fontWeight: 800, color: healthColor(row.score) }}>{row.score.toFixed(1)}</span>
                    </td>
                    <td style={{ ...tdS, textAlign: 'center' }}>
                      {row.delta !== null ? (
                        <span style={{ fontSize: 11, fontWeight: 700, color: row.delta > 0 ? GREEN : row.delta < 0 ? R : GRAY3, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                          {row.delta > 0 ? <ArrowUp size={9} /> : row.delta < 0 ? <ArrowDown size={9} /> : <Minus size={9} />}
                          {Math.abs(row.delta).toFixed(1)}
                        </span>
                      ) : <span style={{ color: GRAY3, fontSize: 12 }}>—</span>}
                    </td>
                    {(['resultado','trafego','entregas_prazo','qualidade_entregas','relacionamento'] as const).map(k => (
                      <td key={k} style={{ ...tdS, textAlign: 'center' }}>
                        <span style={{ fontWeight: 700, color: healthColor((row as any)[k]) }}>{((row as any)[k] ?? 0).toFixed(1)}</span>
                      </td>
                    ))}
                    <td style={{ ...tdS, textAlign: 'center', fontSize: 11 }}>{row.mrr > 0 ? fmtMRR(row.mrr) : '—'}</td>
                    <td style={{ ...tdS, textAlign: 'center', fontSize: 11 }}>{row.ltMonths > 0 ? `${row.ltMonths}m` : '—'}</td>
                    <td style={{ ...tdS, textAlign: 'center' }}>
                      {row.consecutiveLow >= 3 ? <span style={{ fontSize: 11, fontWeight: 700, color: R }}>{row.consecutiveLow}×</span>
                      : row.consecutiveLow > 0  ? <span style={{ fontSize: 11, color: YELLOW }}>{row.consecutiveLow}×</span>
                      : <span style={{ color: GRAY3 }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Scatter: MRR × HS e Lifetime × HS ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        {[
          { title: 'MRR × Health Score', sub: 'Clientes que pagam mais têm HS melhor?', data: scatterMRR, xKey: 'mrr', xLabel: 'MRR', xFmt: (v: number) => fmtMRR(v), unit: '' },
          { title: 'Lifetime × Health Score', sub: 'HS melhora com o tempo de relacionamento?', data: scatterLT, xKey: 'lt', xLabel: 'Meses', xFmt: (v: number) => `${v}m`, unit: 'm' },
        ].map(({ title, sub, data, xKey, xFmt }) => (
          <div key={title} style={{ ...card, padding: 22 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: GRAY1, marginBottom: 2 }}>{title}</div>
            <div style={{ fontSize: 11, color: GRAY3, marginBottom: 14 }}>{sub}</div>
            {data.length > 1 ? (
              <ResponsiveContainer width="100%" height={220}>
                <ScatterChart margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke={GRAY5} strokeDasharray="3 3" />
                  <XAxis type="number" dataKey={xKey} tickFormatter={xFmt} tick={{ fontSize: 10, fill: GRAY3 }} axisLine={false} tickLine={false} />
                  <YAxis type="number" dataKey="score" domain={[0, 10]} tick={{ fontSize: 10, fill: GRAY3 }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ payload }) => {
                    if (!payload?.length) return null
                    const d = payload[0].payload
                    return (
                      <div style={{ background: WHITE, border: `1px solid ${GRAY5}`, borderRadius: 8, padding: '8px 12px', fontSize: 11 }}>
                        <div style={{ fontWeight: 700, marginBottom: 2 }}>{d.empresa}</div>
                        <div>{xKey === 'mrr' ? `MRR: ${fmtMRR(d.mrr)}` : `LT: ${d.lt} meses`}</div>
                        <div>HS: <strong style={{ color: healthColor(d.score) }}>{d.score}</strong></div>
                      </div>
                    )
                  }} />
                  <Scatter data={data}>
                    {data.map((d: any, i: number) => <Cell key={i} fill={d.fill} />)}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: GRAY3, fontSize: 12 }}>Dados insuficientes (mínimo 2 clientes)</div>
            )}
          </div>
        ))}
      </div>

      {/* ── Radar + HS por Gestor ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16, marginBottom: 20 }}>
        <div style={{ ...card, padding: 22 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: GRAY1, marginBottom: 2 }}>Radar Médio do Portfólio</div>
          <div style={{ fontSize: 11, color: GRAY3, marginBottom: 8 }}>Média de todas as dimensões</div>
          {radarData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={radarData}>
                <PolarGrid stroke={GRAY5} />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: GRAY3 }} />
                <Radar dataKey="value" stroke={BLUE} fill={BLUE} fillOpacity={0.15} strokeWidth={2} />
                <Tooltip contentStyle={{ background: WHITE, border: `1px solid ${GRAY5}`, borderRadius: 8, fontSize: 11 }} />
              </RadarChart>
            </ResponsiveContainer>
          ) : <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: GRAY3, fontSize: 12 }}>Sem dados</div>}
        </div>

        <div style={{ ...card, padding: 22 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: GRAY1, marginBottom: 14 }}>HS Médio por Gestor de Projetos</div>
          <HBar data={byGestor} nameKey="nome" />
        </div>
      </div>

      {/* ── HS por Designer + Analista ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div style={{ ...card, padding: 22 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: GRAY1, marginBottom: 14 }}>HS Médio por Designer</div>
          <HBar data={byDesigner} nameKey="nome" />
        </div>
        <div style={{ ...card, padding: 22 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: GRAY1, marginBottom: 14 }}>HS Médio por Analista de Mídia</div>
          <HBar data={byAnalista} nameKey="nome" />
        </div>
      </div>

      {/* ── HS por Segmento + Serviço ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div style={{ ...card, padding: 22 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: GRAY1, marginBottom: 14 }}>HS Médio por Segmento</div>
          <HBar data={bySegmento} nameKey="seg" />
        </div>
        <div style={{ ...card, padding: 22 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: GRAY1, marginBottom: 4 }}>HS Médio por Serviço Executar</div>
          <div style={{ fontSize: 11, color: GRAY3, marginBottom: 10 }}>Clientes que contratam cada serviço</div>
          <HBar data={byServico} nameKey="label" />
        </div>
      </div>

      {/* ── Correlação entre dimensões ── */}
      <div style={{ ...card, padding: 22, marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: GRAY1, marginBottom: 2 }}>Correlação entre Dimensões</div>
        <div style={{ fontSize: 11, color: GRAY3, marginBottom: 16 }}>
          Verde = quando uma sobe, a outra tende a subir · Vermelho = relação inversa · Neutro = sem padrão
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'separate', borderSpacing: 3 }}>
            <thead>
              <tr>
                <th style={{ padding: '6px 10px', fontSize: 10, color: GRAY3, fontWeight: 600 }}></th>
                {DIMS.map(d => (
                  <th key={d.key} style={{ padding: '6px 10px', fontSize: 10, color: GRAY3, fontWeight: 700, textAlign: 'center', whiteSpace: 'nowrap' }}>{d.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DIMS.map((da, ai) => (
                <tr key={da.key}>
                  <td style={{ padding: '6px 10px', fontSize: 11, color: GRAY2, fontWeight: 600, whiteSpace: 'nowrap' }}>{da.label}</td>
                  {DIMS.map((db, bi) => {
                    const r = correlacoes[ai]?.[bi] ?? 0
                    return (
                      <td key={db.key} style={{ padding: '10px 14px', textAlign: 'center', background: corrBg(r), borderRadius: 8, minWidth: 70 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: corrFg(r) }}>
                          {ai === bi ? '—' : r.toFixed(2)}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </CRMLayout>
  )
}
