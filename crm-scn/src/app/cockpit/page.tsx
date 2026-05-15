'use client'
import React, { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, Cliente, HealthScoreEntry, Projeto } from '@/lib/supabase'
import CRMLayout from '../_components/CRMLayout'
import { R, WHITE, GRAY1, GRAY2, GRAY3, GRAY4, GRAY5, GREEN, BLUE, YELLOW, PURPLE } from '@/lib/crm-constants'
import { Plus, Search, Building2, TrendingUp, Clock, ChevronRight, Layers, Users } from 'lucide-react'

type ClienteEnriquecido = Cliente & {
  projetos: Projeto[]
  latestHealth: HealthScoreEntry | null
}

function healthColor(score: number) {
  return score >= 7 ? GREEN : score >= 5 ? YELLOW : R
}

function calcLT(projetos: Projeto[]): string {
  const datas = projetos.map(p => p.data_inicio).filter(Boolean) as string[]
  if (!datas.length) return '—'
  const oldest = datas.sort()[0]
  const months = Math.floor((Date.now() - new Date(oldest).getTime()) / (1000 * 60 * 60 * 24 * 30.44))
  if (months < 1) return '< 1 mês'
  if (months < 12) return `${months} ${months === 1 ? 'mês' : 'meses'}`
  const y = Math.floor(months / 12), m = months % 12
  return m > 0 ? `${y}a ${m}m` : `${y} ${y === 1 ? 'ano' : 'anos'}`
}

function fmt(v: number) { return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}` }

function StatusBadge({ status }: { status: Cliente['status'] }) {
  const map = {
    ativo:   { label: 'Ativo',   bg: '#D1FAE5', color: '#065F46', border: '#A7F3D0' },
    pausado: { label: 'Pausado', bg: '#FEF3C7', color: '#92400E', border: '#FDE68A' },
    churned: { label: 'Churned', bg: '#FEE2E2', color: '#991B1B', border: '#FECACA' },
  }
  const s = map[status]
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color: s.color, background: s.bg, border: `1px solid ${s.border}`, borderRadius: 5, padding: '2px 7px', letterSpacing: '0.04em' }}>
      {s.label.toUpperCase()}
    </span>
  )
}

export default function CockpitPage() {
  const router = useRouter()
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
    const [{ data: cl }, { data: proj }, { data: hs }] = await Promise.all([
      supabase.from('clientes').select('*').order('created_at', { ascending: false }),
      supabase.from('projetos').select('*'),
      supabase.from('health_score_entries').select('*').order('semana', { ascending: false }),
    ])
    const enriched: ClienteEnriquecido[] = (cl || []).map(c => ({
      ...c,
      projetos: (proj || []).filter(p => p.cliente_id === c.id),
      latestHealth: (hs || []).find(h => h.cliente_id === c.id) ?? null,
    }))
    setClientes(enriched)
    setLoading(false)
  }

  async function createCliente() {
    if (!newEmpresa.trim()) return
    setSaving(true)
    const { data, error } = await supabase.from('clientes').insert({ empresa: newEmpresa.trim(), segmento: newSegmento.trim() || null }).select().single()
    if (error) { console.error('Erro ao criar cliente:', error); alert('Erro: ' + error.message); setSaving(false); return }
    if (data) { router.push(`/cockpit/${data.id}`) }
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

  return (
    <CRMLayout title="Cockpit de Clientes" subtitle={`${stats.ativos} cliente${stats.ativos !== 1 ? 's' : ''} ativo${stats.ativos !== 1 ? 's' : ''}`}>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total de Clientes', value: stats.total, icon: Users, color: BLUE },
          { label: 'Clientes Ativos', value: stats.ativos, icon: Building2, color: GREEN },
          { label: 'Health Score Médio', value: stats.healthMedia !== null ? stats.healthMedia.toFixed(1) : '—', icon: TrendingUp, color: stats.healthMedia !== null ? healthColor(stats.healthMedia) : GRAY3 },
          { label: 'MRR Total', value: stats.mrr > 0 ? fmt(stats.mrr) : '—', icon: Layers, color: GREEN },
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
      <div style={{ background: WHITE, border: `1px solid ${GRAY5}`, borderRadius: 12, padding: '14px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 1px 4px rgba(0,0,0,.04)' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 300 }}>
          <Search size={13} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: GRAY3 }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar empresa ou segmento..."
            style={{ width: '100%', padding: '8px 12px 8px 32px', background: GRAY4, border: `1px solid ${GRAY5}`, borderRadius: 8, color: GRAY1, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 6, flex: 1 }}>
          {(['todos', 'ativo', 'pausado', 'churned'] as const).map(s => (
            <button key={s} onClick={() => setFilterStatus(s)} style={{ padding: '7px 14px', borderRadius: 7, border: `1px solid ${filterStatus === s ? R : GRAY5}`, background: filterStatus === s ? R : WHITE, color: filterStatus === s ? WHITE : GRAY2, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all .15s', textTransform: 'capitalize' }}>
              {s === 'todos' ? 'Todos' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowNew(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 9, border: 'none', background: R, color: WHITE, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: `0 2px 8px ${R}40` }}
        >
          <Plus size={14} strokeWidth={2.5} /> Novo Cliente
        </button>
      </div>

      {/* Grid */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{ background: WHITE, border: `1px solid ${GRAY5}`, borderRadius: 12, padding: '18px 20px', height: 140, animation: 'pulse 1.5s infinite' }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ background: WHITE, border: `1px solid ${GRAY5}`, borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '56px 0', gap: 12 }}>
          <Building2 size={36} color={GRAY3} />
          <div style={{ fontSize: 15, color: GRAY2, fontWeight: 600 }}>Nenhum cliente encontrado</div>
          <button onClick={() => setShowNew(true)} style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: R, color: WHITE, fontSize: 13, fontWeight: 700, cursor: 'pointer', marginTop: 4 }}>
            Criar primeiro cliente
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
          {filtered.map(c => <ClienteCard key={c.id} cliente={c} onClick={() => router.push(`/cockpit/${c.id}`)} />)}
        </div>
      )}

      {/* Modal novo cliente */}
      {showNew && (
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
              <button onClick={createCliente} disabled={!newEmpresa.trim() || saving} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: newEmpresa.trim() ? R : GRAY3, color: WHITE, fontSize: 13, fontWeight: 700, cursor: newEmpresa.trim() ? 'pointer' : 'not-allowed', boxShadow: newEmpresa.trim() ? `0 2px 8px ${R}40` : 'none' }}>
                {saving ? 'Criando...' : 'Criar e abrir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </CRMLayout>
  )
}

// ── Card de cliente ───────────────────────────────────────────────────────────
function ClienteCard({ cliente, onClick }: { cliente: ClienteEnriquecido; onClick: () => void }) {
  const [hov, setHov] = useState(false)
  const lt   = calcLT(cliente.projetos)
  const ativos = cliente.projetos.filter(p => p.status === 'ativo').length
  const mrr  = cliente.projetos.filter(p => p.valor_tipo === 'mensalidade' && p.status === 'ativo').reduce((s, p) => s + p.valor, 0)
  const score = cliente.latestHealth?.score_total ?? null
  const sc = score !== null ? healthColor(score) : GRAY3

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: WHITE,
        border: `1px solid ${hov ? '#D1D5DB' : GRAY5}`,
        borderRadius: 12, padding: '18px 20px', cursor: 'pointer',
        transition: 'all .16s ease',
        boxShadow: hov ? '0 6px 24px rgba(0,0,0,.09)' : '0 1px 4px rgba(0,0,0,.04)',
        transform: hov ? 'translateY(-2px)' : 'none',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: `${R}0F`, border: `1.5px solid ${R}28`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 16, fontWeight: 900, color: R }}>{cliente.empresa[0].toUpperCase()}</span>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: GRAY1, lineHeight: 1.25 }}>{cliente.empresa}</div>
            {cliente.segmento && <div style={{ fontSize: 11, color: GRAY3, marginTop: 3 }}>{cliente.segmento}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <StatusBadge status={cliente.status} />
          <ChevronRight size={14} color={GRAY3} style={{ transition: 'transform .15s', transform: hov ? 'translateX(3px)' : 'none' }} />
        </div>
      </div>

      {/* Métricas */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, paddingTop: 14, borderTop: `1px solid ${GRAY5}` }}>
        <div>
          <div style={{ fontSize: 10, color: GRAY3, fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Health</div>
          {score !== null ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: sc, boxShadow: `0 0 5px ${sc}` }} />
              <span style={{ fontSize: 14, fontWeight: 800, color: sc }}>{score.toFixed(1)}</span>
            </div>
          ) : <span style={{ fontSize: 13, color: GRAY3 }}>—</span>}
        </div>
        <div>
          <div style={{ fontSize: 10, color: GRAY3, fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>LT</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Clock size={11} color={GRAY3} />
            <span style={{ fontSize: 13, fontWeight: 600, color: GRAY1 }}>{lt}</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: GRAY3, fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Projetos</div>
          <span style={{ fontSize: 13, fontWeight: 700, color: GRAY1 }}>{ativos}</span>
          <span style={{ fontSize: 11, color: GRAY3 }}> ativo{ativos !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* MRR */}
      {mrr > 0 && (
        <div style={{ marginTop: 12, padding: '8px 10px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, color: '#6B7280', fontWeight: 500 }}>MRR mensal</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: '#065F46' }}>{fmt(mrr)}</span>
        </div>
      )}
    </div>
  )
}
