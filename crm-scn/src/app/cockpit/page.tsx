'use client'
import React, { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, Cliente, HealthScoreEntry, Projeto, FcaEntry } from '@/lib/supabase'
import CRMLayout from '../_components/CRMLayout'
import { R, WHITE, GRAY1, GRAY2, GRAY3, GRAY4, GRAY5, GREEN, BLUE, YELLOW } from '@/lib/crm-constants'
import { Plus, Search, Building2, TrendingUp, Layers, Users, ArrowUp, ArrowDown, Minus, AlertTriangle, BarChart2 } from 'lucide-react'
import { useUserRole } from '@/lib/useUserRole'

type ClienteEnriquecido = Cliente & {
  projetos: Projeto[]
  latestHealth: HealthScoreEntry | null
  prevHealth: HealthScoreEntry | null
  hasFca: boolean
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
  const [filterStatus, setFilterStatus] = useState<'todos' | 'ativo' | 'pausado' | 'churned'>('todos')
  const [showNew, setShowNew] = useState(false)
  const [newEmpresa, setNewEmpresa] = useState('')
  const [newSegmento, setNewSegmento] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadClientes() }, [])

  async function loadClientes() {
    setLoading(true)
    const [{ data: cl }, { data: proj }, { data: hs }, { data: fca }] = await Promise.all([
      supabase.from('clientes').select('*').order('created_at', { ascending: false }),
      supabase.from('projetos').select('*'),
      supabase.from('health_score_entries').select('*').order('semana', { ascending: false }),
      supabase.from('fca_entries').select('id,cliente_id'),
    ])

    const fcaClienteIds = new Set((fca || []).map((f: any) => f.cliente_id))

    const enriched: ClienteEnriquecido[] = (cl || []).map(c => {
      const clienteHs = (hs || []).filter(h => h.cliente_id === c.id)
      return {
        ...c,
        projetos: (proj || []).filter(p => p.cliente_id === c.id),
        latestHealth: clienteHs[0] ?? null,
        prevHealth:   clienteHs[1] ?? null,
        hasFca:       fcaClienteIds.has(c.id),
      }
    })
    setClientes(enriched)
    setLoading(false)
  }

  async function createCliente() {
    if (!newEmpresa.trim()) return
    setSaving(true)
    const { data, error } = await supabase.from('clientes').insert({ empresa: newEmpresa.trim(), segmento: newSegmento.trim() || null }).select().single()
    if (error) { console.error(error); alert('Erro: ' + error.message); setSaving(false); return }
    if (data) router.push(`/cockpit/${data.id}`)
    setSaving(false)
  }

  const filtered = useMemo(() => {
    let list = clientes
    if (filterStatus !== 'todos') list = list.filter(c => c.status === filterStatus)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(c => c.empresa.toLowerCase().includes(q) || (c.segmento || '').toLowerCase().includes(q))
    }
    return list
  }, [clientes, filterStatus, search])

  const stats = useMemo(() => ({
    total:       clientes.length,
    ativos:      clientes.filter(c => c.status === 'ativo').length,
    healthMedia: (() => {
      const scores = clientes.map(c => c.latestHealth?.score_total).filter(v => v != null) as number[]
      return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null
    })(),
    mrr: clientes.filter(c => c.status === 'ativo').reduce((acc, c) =>
      acc + c.projetos.filter(p => p.valor_tipo === 'mensalidade' && p.status === 'ativo').reduce((s, p) => s + p.valor, 0), 0),
  }), [clientes])

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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total de Clientes',   value: stats.total, icon: Users,      color: BLUE },
          { label: 'Clientes Ativos',     value: stats.ativos, icon: Building2, color: GREEN },
          { label: 'Health Score Médio',  value: stats.healthMedia !== null ? stats.healthMedia.toFixed(1) : '—', icon: TrendingUp, color: stats.healthMedia !== null ? healthColor(stats.healthMedia) : GRAY3 },
          { label: 'MRR Total',           value: stats.mrr > 0 ? fmt(stats.mrr) : '—', icon: Layers, color: GREEN },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} style={{ background: WHITE, border: `1px solid ${GRAY5}`, borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
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
      <div style={{ background: WHITE, border: `1px solid ${GRAY5}`, borderRadius: 12, padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 1px 4px rgba(0,0,0,.04)' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 300 }}>
          <Search size={13} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: GRAY3 }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar empresa ou segmento..."
            style={{ width: '100%', padding: '8px 12px 8px 32px', background: GRAY4, border: `1px solid ${GRAY5}`, borderRadius: 8, color: GRAY1, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['todos', 'ativo', 'pausado', 'churned'] as const).map(s => (
            <button key={s} onClick={() => setFilterStatus(s)} style={{ padding: '7px 14px', borderRadius: 7, border: `1px solid ${filterStatus === s ? R : GRAY5}`, background: filterStatus === s ? R : WHITE, color: filterStatus === s ? WHITE : GRAY2, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all .15s', textTransform: 'capitalize' }}>
              {s === 'todos' ? 'Todos' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <button onClick={() => router.push('/cockpit/health-score')} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 9, border: `1px solid ${GRAY5}`, background: WHITE, color: GRAY2, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <BarChart2 size={14} strokeWidth={2.5} /> Analytics
        </button>
        {canEditCockpit && (
          <button onClick={() => setShowNew(true)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 9, border: 'none', background: R, color: WHITE, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: `0 2px 8px ${R}40` }}>
            <Plus size={14} strokeWidth={2.5} /> Novo Cliente
          </button>
        )}
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

                  return (
                    <tr
                      key={c.id}
                      onClick={() => router.push(`/cockpit/${c.id}`)}
                      style={{ cursor: 'pointer', transition: 'background .12s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = GRAY4)}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      {/* Cliente */}
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 34, height: 34, borderRadius: 8, background: `${R}0F`, border: `1.5px solid ${R}28`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span style={{ fontSize: 13, fontWeight: 900, color: R }}>{c.empresa[0].toUpperCase()}</span>
                          </div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: GRAY1 }}>{c.empresa}</div>
                            {c.segmento && <div style={{ fontSize: 11, color: GRAY3 }}>{c.segmento}</div>}
                          </div>
                          <StatusBadge status={c.status} />
                        </div>
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
                              onClick={() => router.push(`/cockpit/${c.id}?tab=fca`)}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: 6, border: `1px solid ${YELLOW}`, background: '#FEF3C7', color: '#92400E', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                            >
                              <AlertTriangle size={11} /> Ver
                            </button>
                          ) : (
                            <button
                              onClick={() => router.push(`/cockpit/${c.id}?tab=fca`)}
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
                <input value={newSegmento} onChange={e => setNewSegmento(e.target.value)} onKeyDown={e => e.key === 'Enter' && createCliente()} placeholder="Ex: E-commerce, Saúde..." style={{ width: '100%', padding: '10px 12px', background: GRAY4, border: `1px solid ${GRAY5}`, borderRadius: 8, color: GRAY1, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
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
