'use client'
import React, { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, Cliente, HealthScoreEntry, Projeto, FcaEntry } from '@/lib/supabase'
import CRMLayout from '../_components/CRMLayout'
import { R, WHITE, GRAY1, GRAY2, GRAY3, GRAY4, GRAY5, GREEN, BLUE, YELLOW, SEGMENTOS } from '@/lib/crm-constants'
import { Plus, Search, Building2, TrendingUp, Layers, Users, ArrowUp, ArrowDown, Minus, AlertTriangle, BarChart2, X } from 'lucide-react'
import { useUserRole } from '@/lib/useUserRole'
import { toast } from '@/lib/toast'
import { computeChurnRisk, DEFAULT_CHURN_CONFIG, type ChurnRiskConfig } from '@/lib/churn-risk-defaults'

type RiskLevel = 'baixo' | 'medio' | 'alto'

type ClienteEnriquecido = Cliente & {
  projetos: Projeto[]
  latestHealth: HealthScoreEntry | null
  prevHealth: HealthScoreEntry | null
  healthEntries: HealthScoreEntry[]
  hasFca: boolean
  risk: { level: RiskLevel; reasons: string[] }
}


function healthColor(score: number) {
  return score >= 7 ? GREEN : score >= 5 ? YELLOW : R
}

function fmt(v: number) { return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}` }

function ScoreCell({ value }: { value: number | null | undefined }) {
  if (value == null) return <span style={{ color: GRAY3, fontSize: 12 }}>—</span>
  const c = healthColor(value)
  return (
    <span style={{ fontSize: 12, fontWeight: 700, color: c }}>{Number(value).toFixed(1)}</span>
  )
}

function StatusBadge({ status }: { status: Cliente['status'] }) {
  const map = {
    ativo:   { label: 'Ativo',   bg: '#D1FAE5', color: '#065F46', border: '#A7F3D0' },
    pausado: { label: 'Pausado', bg: '#FEF3C7', color: '#92400E', border: '#FDE68A' },
    churned: { label: 'Churned', bg: '#FEE2E2', color: '#991B1B', border: '#FECACA' },
  }
  const s = map[status]
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color: s.color, background: s.bg, border: `1px solid ${s.border}`, borderRadius: 5, padding: '2px 7px' }}>
      {s.label.toUpperCase()}
    </span>
  )
}

export default function CockpitPage() {
  const router = useRouter()
  const { canEditCockpit } = useUserRole()
  const [clientes, setClientes] = useState<ClienteEnriquecido[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<'todos' | 'ativo' | 'pausado' | 'churned'>('ativo')
  const [filterTipo, setFilterTipo] = useState<'todos' | 'saber' | 'executar' | 'ter'>('todos')
  const [filterGestor,   setFilterGestor]   = useState('')
  const [filterAnalista, setFilterAnalista] = useState('')
  const [filterDesigner, setFilterDesigner] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [newEmpresa, setNewEmpresa] = useState('')
  const [newSegmento, setNewSegmento] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadClientes() }, [])

  async function loadClientes() {
    setLoading(true)
    const [{ data: cl }, { data: proj }, { data: hs }, { data: fca }, { data: cfgRow }] = await Promise.all([
      supabase.from('clientes').select('*').order('created_at', { ascending: false }),
      supabase.from('projetos').select('*'),
      supabase.from('health_score_entries').select('*').order('semana', { ascending: false }),
      supabase.from('fca_entries').select('id,cliente_id'),
      supabase.from('configuracoes_sistema').select('valor').eq('chave', 'churn_risk_config').single(),
    ])

    const churnCfg: ChurnRiskConfig = cfgRow?.valor
      ? (() => { try { return { ...DEFAULT_CHURN_CONFIG, ...JSON.parse(cfgRow.valor) } } catch { return DEFAULT_CHURN_CONFIG } })()
      : DEFAULT_CHURN_CONFIG

    const fcaClienteIds = new Set((fca || []).map((f: any) => f.cliente_id))

    const enriched: ClienteEnriquecido[] = (cl || []).map(c => {
      const clienteHs = (hs || []).filter(h => h.cliente_id === c.id)
      const clienteProj = (proj || []).filter(p => p.cliente_id === c.id)
      return {
        ...c,
        projetos:      clienteProj,
        latestHealth:  clienteHs[0] ?? null,
        prevHealth:    clienteHs[1] ?? null,
        healthEntries: clienteHs.slice(0, 4),
        hasFca:        fcaClienteIds.has(c.id),
        risk:          computeChurnRisk(clienteHs, clienteProj, churnCfg),
      }
    })
    setClientes(enriched)
    setLoading(false)
  }

  function toSlug(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  }

  async function generateUniqueSlug(base: string): Promise<string> {
    let slug = base
    let n = 1
    while (true) {
      const { data } = await supabase.from('clientes').select('id').eq('slug', slug).maybeSingle()
      if (!data) return slug
      n++
      slug = `${base}-${n}`
    }
  }

  async function createCliente() {
    if (!newEmpresa.trim()) return
    setSaving(true)
    const slug = await generateUniqueSlug(toSlug(newEmpresa.trim()))
    const { data, error } = await supabase.from('clientes').insert({ empresa: newEmpresa.trim(), segmento: newSegmento.trim() || null, slug }).select().single()
    if (error) { console.error(error); toast.error('Erro: ' + error.message); setSaving(false); return }
    if (data) router.push(`/cockpit/${data.slug}`)
    setSaving(false)
  }

  const gestores  = useMemo(() => Array.from(new Set(clientes.map(c => c.gestor_projetos).filter(Boolean) as string[])).sort(), [clientes])
  const analistas = useMemo(() => Array.from(new Set(clientes.map(c => c.analista_midia).filter(Boolean) as string[])).sort(), [clientes])
  const designers = useMemo(() => Array.from(new Set(clientes.map(c => c.designer).filter(Boolean) as string[])).sort(), [clientes])

  const filtered = useMemo(() => {
    let list = clientes
    if (filterStatus !== 'todos') list = list.filter(c => c.status === filterStatus)
    if (filterTipo !== 'todos') list = list.filter(c => c.projetos.some(p => p.tipo === filterTipo))
    if (filterGestor)   list = list.filter(c => c.gestor_projetos === filterGestor)
    if (filterAnalista) list = list.filter(c => c.analista_midia  === filterAnalista)
    if (filterDesigner) list = list.filter(c => c.designer        === filterDesigner)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(c => c.empresa.toLowerCase().includes(q) || (c.segmento || '').toLowerCase().includes(q))
    }
    return list
  }, [clientes, filterStatus, filterTipo, filterGestor, filterAnalista, filterDesigner, search])

  const stats = useMemo(() => ({
    total:       filtered.length,
    ativos:      filtered.filter(c => c.status === 'ativo').length,
    healthMedia: (() => {
      const scores = filtered.map(c => c.latestHealth?.score_total).filter(v => v != null) as number[]
      return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null
    })(),
    mrr: filtered.filter(c => c.status === 'ativo').reduce((acc, c) =>
      acc + c.projetos.filter(p => p.valor_tipo === 'mensalidade' && p.status === 'ativo').reduce((s, p) => s + p.valor, 0), 0),
    mrrRisco: filtered.filter(c => c.status === 'ativo' && c.risk.level === 'alto').reduce((acc, c) =>
      acc + c.projetos.filter(p => p.valor_tipo === 'mensalidade' && p.status === 'ativo').reduce((s, p) => s + p.valor, 0), 0),
    clientesAltoRisco: filtered.filter(c => c.status === 'ativo' && c.risk.level === 'alto').length,
  }), [filtered])

  const thStyle: React.CSSProperties = {
    padding: '10px 14px', fontSize: 11, fontWeight: 700, color: GRAY3,
    letterSpacing: '0.06em', textTransform: 'uppercase', textAlign: 'left',
    borderBottom: `1px solid ${GRAY5}`, whiteSpace: 'nowrap', background: GRAY4,
  }
  const tdStyle: React.CSSProperties = {
    padding: '12px 14px', fontSize: 13, color: GRAY1,
    borderBottom: `1px solid ${GRAY5}`, verticalAlign: 'middle',
  }

  return (
    <CRMLayout title="Cockpit de Clientes" subtitle={`${stats.ativos} cliente${stats.ativos !== 1 ? 's' : ''} ativo${stats.ativos !== 1 ? 's' : ''}`}>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total de Clientes',   value: stats.total, icon: Users,          color: BLUE },
          { label: 'Clientes Ativos',     value: stats.ativos, icon: Building2,     color: GREEN },
          { label: 'Health Score Médio',  value: stats.healthMedia !== null ? stats.healthMedia.toFixed(1) : '—', icon: TrendingUp, color: stats.healthMedia !== null ? healthColor(stats.healthMedia) : GRAY3 },
          { label: 'MRR Total',           value: stats.mrr > 0 ? fmt(stats.mrr) : '—', icon: Layers, color: GREEN },
          { label: 'MRR em Risco',        value: stats.mrrRisco > 0 ? fmt(stats.mrrRisco) : stats.clientesAltoRisco > 0 ? `${stats.clientesAltoRisco} cli.` : '—', icon: AlertTriangle, color: stats.mrrRisco > 0 ? R : GRAY3 },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} style={{ background: WHITE, border: `1px solid ${label === 'MRR em Risco' && stats.mrrRisco > 0 ? `${R}40` : GRAY5}`, borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: `${color}14`, border: `1px solid ${color}28`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon size={18} color={color} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: GRAY3, fontWeight: 500, marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: GRAY1, lineHeight: 1 }}>{value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ background: WHITE, border: `1px solid ${GRAY5}`, borderRadius: 12, padding: '12px 16px', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10, boxShadow: '0 1px 4px rgba(0,0,0,.04)' }}>

        {/* Linha 1: busca + ações */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={13} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: GRAY3, pointerEvents: 'none' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar empresa ou segmento..."
              style={{ width: '100%', padding: '8px 12px 8px 32px', background: GRAY4, border: `1px solid ${GRAY5}`, borderRadius: 8, color: GRAY1, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <button onClick={() => router.push('/cockpit/health-score')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: `1px solid ${GRAY5}`, background: WHITE, color: GRAY2, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <BarChart2 size={13} strokeWidth={2.5} /> Analytics
          </button>
          {canEditCockpit && (
            <button onClick={() => setShowNew(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: 'none', background: R, color: WHITE, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: `0 2px 6px ${R}40` }}>
              <Plus size={13} strokeWidth={2.5} /> Novo Cliente
            </button>
          )}
        </div>

        {/* Linha 2: filtros */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>

          {/* Status — segmented */}
          <div style={{ display: 'flex', background: GRAY4, borderRadius: 8, padding: 3, gap: 2, flexShrink: 0 }}>
            {([
              { v: 'todos',   l: 'Todos',   activeColor: GRAY1 },
              { v: 'ativo',   l: 'Ativo',   activeColor: '#15803D' },
              { v: 'pausado', l: 'Pausado', activeColor: '#B45309' },
              { v: 'churned', l: 'Churned', activeColor: R },
            ] as const).map(({ v, l, activeColor }) => {
              const on = filterStatus === v
              return (
                <button key={v} onClick={() => setFilterStatus(v)}
                  style={{ padding: '4px 12px', borderRadius: 6, border: 'none', background: on ? WHITE : 'transparent', color: on ? activeColor : GRAY3, fontSize: 12, fontWeight: on ? 700 : 500, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: on ? '0 1px 3px rgba(0,0,0,.1)' : 'none', transition: 'all .12s' }}>
                  {l}
                </button>
              )
            })}
          </div>

          <div style={{ width: 1, height: 18, background: GRAY5, flexShrink: 0 }} />

          {/* Tipo — segmented */}
          <div style={{ display: 'flex', background: GRAY4, borderRadius: 8, padding: 3, gap: 2, flexShrink: 0 }}>
            {([
              { v: 'todos',    l: 'Todos' },
              { v: 'saber',    l: 'Saber' },
              { v: 'executar', l: 'Executar' },
              { v: 'ter',      l: 'Ter' },
            ] as const).map(({ v, l }) => {
              const on = filterTipo === v
              return (
                <button key={v} onClick={() => setFilterTipo(v)}
                  style={{ padding: '4px 12px', borderRadius: 6, border: 'none', background: on ? WHITE : 'transparent', color: on ? BLUE : GRAY3, fontSize: 12, fontWeight: on ? 700 : 500, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: on ? '0 1px 3px rgba(0,0,0,.1)' : 'none', transition: 'all .12s' }}>
                  {l}
                </button>
              )
            })}
          </div>

          {(gestores.length > 0 || analistas.length > 0 || designers.length > 0) && (
            <div style={{ width: 1, height: 18, background: GRAY5, flexShrink: 0 }} />
          )}

          {/* Equipe — selects */}
          {gestores.length > 0 && (
            <select value={filterGestor} onChange={e => setFilterGestor(e.target.value)}
              style={{ padding: '4px 10px', height: 30, borderRadius: 7, border: `1px solid ${filterGestor ? R : GRAY5}`, background: filterGestor ? '#FEF2F2' : GRAY4, color: filterGestor ? R : GRAY2, fontSize: 12, fontWeight: filterGestor ? 700 : 500, outline: 'none', cursor: 'pointer' }}>
              <option value="">Gestor de Projetos</option>
              {gestores.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          )}
          {analistas.length > 0 && (
            <select value={filterAnalista} onChange={e => setFilterAnalista(e.target.value)}
              style={{ padding: '4px 10px', height: 30, borderRadius: 7, border: `1px solid ${filterAnalista ? R : GRAY5}`, background: filterAnalista ? '#FEF2F2' : GRAY4, color: filterAnalista ? R : GRAY2, fontSize: 12, fontWeight: filterAnalista ? 700 : 500, outline: 'none', cursor: 'pointer' }}>
              <option value="">Gestor de Tráfego</option>
              {analistas.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          )}
          {designers.length > 0 && (
            <select value={filterDesigner} onChange={e => setFilterDesigner(e.target.value)}
              style={{ padding: '4px 10px', height: 30, borderRadius: 7, border: `1px solid ${filterDesigner ? BLUE : GRAY5}`, background: filterDesigner ? '#F5F3FF' : GRAY4, color: filterDesigner ? BLUE : GRAY2, fontSize: 12, fontWeight: filterDesigner ? 700 : 500, outline: 'none', cursor: 'pointer' }}>
              <option value="">Designer</option>
              {designers.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          )}

          {/* Limpar filtros */}
          {(filterStatus !== 'ativo' || filterTipo !== 'todos' || filterGestor || filterAnalista || filterDesigner) && (
            <button onClick={() => { setFilterStatus('ativo'); setFilterTipo('todos'); setFilterGestor(''); setFilterAnalista(''); setFilterDesigner('') }}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', height: 30, borderRadius: 7, border: `1px solid ${GRAY5}`, background: WHITE, color: GRAY3, fontSize: 11, fontWeight: 600, cursor: 'pointer', marginLeft: 'auto' }}>
              <X size={11} /> Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* Tabela */}
      <div style={{ background: WHITE, border: `1px solid ${GRAY5}`, borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.04)' }}>
        {loading ? (
          <div style={{ padding: '48px 0', textAlign: 'center', color: GRAY3, fontSize: 13 }}>Carregando...</div>
        ) : filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '56px 0', gap: 12 }}>
            <Building2 size={36} color={GRAY3} />
            <div style={{ fontSize: 15, color: GRAY2, fontWeight: 600 }}>Nenhum cliente encontrado</div>
            {canEditCockpit && (
              <button onClick={() => setShowNew(true)} style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: R, color: WHITE, fontSize: 13, fontWeight: 700, cursor: 'pointer', marginTop: 4 }}>
                Criar primeiro cliente
              </button>
            )}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Cliente</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Risco</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Health Score</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Atualizado em</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Resultados</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Tráfego</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Entregas</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Qualidade</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Relacionamento</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>FCA</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => {
                  const score   = c.latestHealth?.score_total ?? null
                  const prev    = c.prevHealth?.score_total ?? null
                  const delta   = score !== null && prev !== null ? score - prev : null
                  const needsFca = score !== null && score < 7

                  const clientUrl = `/cockpit/${c.slug || c.id}`
                  return (
                    <tr
                      key={c.id}
                      onClick={e => { if (!(e.target as HTMLElement).closest('a,button')) router.push(clientUrl) }}
                      onAuxClick={e => { if (e.button === 1) window.open(clientUrl, '_blank') }}
                      style={{ cursor: 'pointer', transition: 'background .12s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = GRAY4)}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      {/* Cliente */}
                      <td style={tdStyle}>
                        <a href={clientUrl} onClick={e => { if (!e.metaKey && !e.ctrlKey && !e.shiftKey) { e.preventDefault(); router.push(clientUrl) } }} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit' }}>
                          <div style={{ width: 34, height: 34, borderRadius: 8, background: `${R}0F`, border: `1.5px solid ${R}28`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span style={{ fontSize: 13, fontWeight: 900, color: R }}>{c.empresa[0].toUpperCase()}</span>
                          </div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: GRAY1 }}>{c.empresa}</div>
                            {c.segmento && <div style={{ fontSize: 11, color: GRAY3 }}>{c.segmento}</div>}
                          </div>
                          <StatusBadge status={c.status} />
                        </a>
                      </td>

                      {/* Risco */}
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        {(() => {
                          const { level, reasons } = c.risk
                          const map = {
                            baixo: { label: 'Baixo', dot: GREEN, bg: '#D1FAE5', color: '#065F46', border: '#A7F3D0' },
                            medio: { label: 'Médio', dot: YELLOW, bg: '#FEF3C7', color: '#92400E', border: '#FDE68A' },
                            alto:  { label: 'Alto',  dot: R,      bg: '#FEE2E2', color: '#991B1B', border: '#FECACA' },
                          }[level]
                          return (
                            <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 3 }} title={reasons.join(' · ')}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 6, background: map.bg, border: `1px solid ${map.border}`, fontSize: 11, fontWeight: 700, color: map.color }}>
                                <span style={{ width: 7, height: 7, borderRadius: '50%', background: map.dot, flexShrink: 0 }} />
                                {map.label}
                              </span>
                            </div>
                          )
                        })()}
                      </td>

                      {/* Health Score */}
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        {score !== null ? (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontSize: 15, fontWeight: 800, color: healthColor(score) }}>{score.toFixed(1)}</span>
                            {delta !== null && (
                              <span style={{ fontSize: 10, fontWeight: 700, color: delta > 0 ? GREEN : delta < 0 ? R : GRAY3, display: 'flex', alignItems: 'center', gap: 1 }}>
                                ({delta > 0 ? <ArrowUp size={9} /> : delta < 0 ? <ArrowDown size={9} /> : <Minus size={9} />}
                                {Math.abs(delta).toFixed(1)})
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: GRAY3, fontSize: 12 }}>—</span>
                        )}
                      </td>

                      {/* Data última atualização */}
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        {c.latestHealth?.semana ? (
                          <span style={{ fontSize: 12, color: GRAY2 }}>
                            {(() => { const [y,m,d] = c.latestHealth.semana.split('-'); return `${d}/${m}/${y}` })()}
                          </span>
                        ) : (
                          <span style={{ color: GRAY3, fontSize: 12 }}>—</span>
                        )}
                      </td>

                      {/* Dimensões */}
                      <td style={{ ...tdStyle, textAlign: 'center' }}><ScoreCell value={c.latestHealth?.resultado} /></td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}><ScoreCell value={c.latestHealth?.trafego} /></td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}><ScoreCell value={c.latestHealth?.entregas_prazo} /></td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}><ScoreCell value={c.latestHealth?.qualidade_entregas} /></td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}><ScoreCell value={c.latestHealth?.relacionamento} /></td>

                      {/* FCA */}
                      <td style={{ ...tdStyle, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                        {needsFca ? (
                          c.hasFca ? (
                            <button
                              onClick={() => router.push(`/cockpit/${c.slug || c.id}?tab=fca`)}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: 6, border: `1px solid ${YELLOW}`, background: '#FEF3C7', color: '#92400E', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                            >
                              <AlertTriangle size={11} /> Ver
                            </button>
                          ) : (
                            <button
                              onClick={() => router.push(`/cockpit/${c.slug || c.id}?tab=fca`)}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: 6, border: `1px solid ${R}`, background: '#FEE2E2', color: '#991B1B', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                            >
                              <AlertTriangle size={11} /> Registrar
                            </button>
                          )
                        ) : (
                          <span style={{ color: GRAY3, fontSize: 12 }}>—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal novo cliente */}
      {showNew && canEditCockpit && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(3px)' }}>
          <div style={{ background: WHITE, border: `1px solid ${GRAY5}`, borderRadius: 16, padding: 28, width: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
            <h2 style={{ margin: '0 0 20px', fontSize: 17, fontWeight: 800, color: GRAY1 }}>Novo Cliente</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: GRAY2, display: 'block', marginBottom: 5, fontWeight: 600 }}>Empresa *</label>
                <input autoFocus value={newEmpresa} onChange={e => setNewEmpresa(e.target.value)} onKeyDown={e => e.key === 'Enter' && createCliente()} placeholder="Nome da empresa" style={{ width: '100%', padding: '10px 12px', background: GRAY4, border: `1px solid ${GRAY5}`, borderRadius: 8, color: GRAY1, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: GRAY2, display: 'block', marginBottom: 5, fontWeight: 600 }}>Segmento</label>
                <select value={newSegmento} onChange={e => setNewSegmento(e.target.value)} style={{ width: '100%', padding: '10px 12px', background: GRAY4, border: `1px solid ${GRAY5}`, borderRadius: 8, color: newSegmento ? GRAY1 : GRAY3, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}>
                  <option value="">Selecione um segmento...</option>
                  {SEGMENTOS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowNew(false); setNewEmpresa(''); setNewSegmento('') }} style={{ padding: '9px 18px', borderRadius: 8, border: `1px solid ${GRAY5}`, background: WHITE, color: GRAY2, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={createCliente} disabled={!newEmpresa.trim() || saving} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: newEmpresa.trim() ? R : GRAY3, color: WHITE, fontSize: 13, fontWeight: 700, cursor: newEmpresa.trim() ? 'pointer' : 'not-allowed' }}>
                {saving ? 'Criando...' : 'Criar e abrir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </CRMLayout>
  )
}
