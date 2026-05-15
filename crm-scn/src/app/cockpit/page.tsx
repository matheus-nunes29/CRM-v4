'use client'
import React, { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, Cliente, HealthScoreEntry, Projeto } from '@/lib/supabase'
import Sidebar from '../Sidebar'
import { Plus, Search, Users, TrendingUp, Clock, ChevronRight, Building2, Layers } from 'lucide-react'

const BG      = '#0A0A0A'
const SURFACE = '#111110'
const CARD    = '#161614'
const BORDER  = '#222220'
const TEXT    = '#EDE8E1'
const MUTED   = 'rgba(237,232,225,0.42)'
const R       = '#E8001C'
const GREEN   = '#10B981'
const YELLOW  = '#F59E0B'
const GRAY    = '#374151'

type ClienteEnriquecido = Cliente & {
  projetos: Projeto[]
  latestHealth: HealthScoreEntry | null
}

function HealthBadge({ score }: { score: number | null }) {
  if (score === null) return <span style={{ fontSize: 11, color: MUTED }}>—</span>
  const color = score >= 7 ? GREEN : score >= 5 ? YELLOW : R
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}` }} />
      <span style={{ fontSize: 13, fontWeight: 700, color }}>{score.toFixed(1)}</span>
    </div>
  )
}

function StatusBadge({ status }: { status: Cliente['status'] }) {
  const map = { ativo: { label: 'Ativo', color: GREEN }, pausado: { label: 'Pausado', color: YELLOW }, churned: { label: 'Churned', color: R } }
  const { label, color } = map[status]
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color, background: `${color}18`, border: `1px solid ${color}30`, borderRadius: 5, padding: '2px 7px', letterSpacing: '0.05em' }}>
      {label.toUpperCase()}
    </span>
  )
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
    const ids = (cl || []).map(c => c.id)
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
    if (data) {
      setShowNew(false)
      setNewEmpresa('')
      setNewSegmento('')
      router.push(`/cockpit/${data.id}`)
    }
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
    total: clientes.length,
    ativos: clientes.filter(c => c.status === 'ativo').length,
    healthMedia: (() => {
      const scores = clientes.map(c => c.latestHealth?.score_total).filter(Boolean) as number[]
      return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null
    })(),
    mrr: clientes.filter(c => c.status === 'ativo').reduce((acc, c) => acc + c.projetos.filter(p => p.valor_tipo === 'mensalidade' && p.status === 'ativo').reduce((s, p) => s + p.valor, 0), 0),
  }), [clientes])

  return (
    <div style={{ display: 'flex', height: '100vh', background: BG, color: TEXT, fontFamily: 'Inter, sans-serif', overflow: 'hidden' }}>
      <Sidebar activeView="cockpit" onNavigate={v => router.push(v === 'dashboard' ? '/' : `/${v}`)} />

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '24px 32px 0', borderBottom: `1px solid ${BORDER}`, background: SURFACE }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>Cockpit de Clientes</h1>
              <p style={{ fontSize: 13, color: MUTED, margin: '4px 0 0' }}>Gestão e acompanhamento de todos os clientes ativos</p>
            </div>
            <button
              onClick={() => setShowNew(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 9, border: `1px solid ${R}55`, background: `${R}18`, color: TEXT, fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.03em', transition: 'background .15s' }}
              onMouseEnter={e => (e.currentTarget.style.background = R)}
              onMouseLeave={e => (e.currentTarget.style.background = `${R}18`)}
            >
              <Plus size={14} strokeWidth={2.5} /> Novo Cliente
            </button>
          </div>

          {/* Stats row */}
          <div style={{ display: 'flex', gap: 24, marginBottom: 20 }}>
            {[
              { label: 'Total de Clientes', value: stats.total, icon: Users },
              { label: 'Clientes Ativos', value: stats.ativos, icon: Building2 },
              { label: 'Health Score Médio', value: stats.healthMedia !== null ? stats.healthMedia.toFixed(1) : '—', icon: TrendingUp },
              { label: 'MRR Total', value: stats.mrr > 0 ? `R$ ${stats.mrr.toLocaleString('pt-BR')}` : '—', icon: Layers },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10 }}>
                <Icon size={16} color={MUTED} />
                <div>
                  <div style={{ fontSize: 11, color: MUTED, fontWeight: 500 }}>{label}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.2 }}>{value}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', paddingBottom: 16 }}>
            <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
              <Search size={13} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: MUTED }} />
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar empresa ou segmento..."
                style={{ width: '100%', padding: '8px 12px 8px 32px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            {(['todos', 'ativo', 'pausado', 'churned'] as const).map(s => (
              <button key={s} onClick={() => setFilterStatus(s)} style={{ padding: '7px 14px', borderRadius: 7, border: `1px solid ${filterStatus === s ? R : BORDER}`, background: filterStatus === s ? `${R}18` : 'transparent', color: filterStatus === s ? TEXT : MUTED, fontSize: 12, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize', transition: 'all .15s' }}>
                {s === 'todos' ? 'Todos' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Client grid */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200, color: MUTED, fontSize: 14 }}>Carregando clientes...</div>
          ) : filtered.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, gap: 12 }}>
              <Building2 size={36} color={MUTED} />
              <div style={{ fontSize: 15, color: MUTED, fontWeight: 500 }}>Nenhum cliente encontrado</div>
              <button onClick={() => setShowNew(true)} style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${R}55`, background: `${R}18`, color: TEXT, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Criar primeiro cliente
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
              {filtered.map(c => <ClienteCard key={c.id} cliente={c} onClick={() => router.push(`/cockpit/${c.id}`)} />)}
            </div>
          )}
        </div>
      </main>

      {/* New client modal */}
      {showNew && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(4px)' }}>
          <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 28, width: 400, boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}>
            <h2 style={{ margin: '0 0 20px', fontSize: 17, fontWeight: 700 }}>Novo Cliente</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: MUTED, display: 'block', marginBottom: 5 }}>Empresa *</label>
                <input autoFocus value={newEmpresa} onChange={e => setNewEmpresa(e.target.value)} onKeyDown={e => e.key === 'Enter' && createCliente()} placeholder="Nome da empresa" style={{ width: '100%', padding: '10px 12px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: MUTED, display: 'block', marginBottom: 5 }}>Segmento</label>
                <input value={newSegmento} onChange={e => setNewSegmento(e.target.value)} onKeyDown={e => e.key === 'Enter' && createCliente()} placeholder="Ex: E-commerce, Saúde..." style={{ width: '100%', padding: '10px 12px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowNew(false); setNewEmpresa(''); setNewSegmento('') }} style={{ padding: '9px 18px', borderRadius: 8, border: `1px solid ${BORDER}`, background: 'transparent', color: MUTED, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={createCliente} disabled={!newEmpresa.trim() || saving} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: newEmpresa.trim() ? R : GRAY, color: '#fff', fontSize: 13, fontWeight: 700, cursor: newEmpresa.trim() ? 'pointer' : 'not-allowed', transition: 'background .15s' }}>
                {saving ? 'Criando...' : 'Criar e abrir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ClienteCard({ cliente, onClick }: { cliente: ClienteEnriquecido; onClick: () => void }) {
  const [hov, setHov] = useState(false)
  const lt = calcLT(cliente.projetos)
  const ativos = cliente.projetos.filter(p => p.status === 'ativo').length
  const mrr = cliente.projetos.filter(p => p.valor_tipo === 'mensalidade' && p.status === 'ativo').reduce((s, p) => s + p.valor, 0)

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? '#1a1a18' : CARD,
        border: `1px solid ${hov ? '#333330' : BORDER}`,
        borderRadius: 12, padding: '18px 20px', cursor: 'pointer',
        transition: 'all .16s ease',
        boxShadow: hov ? '0 8px 28px rgba(0,0,0,0.35)' : 'none',
        transform: hov ? 'translateY(-2px)' : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <div style={{ width: 38, height: 38, borderRadius: 9, background: `linear-gradient(135deg, ${R}33, ${R}11)`, border: `1px solid ${R}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: R }}>{cliente.empresa[0].toUpperCase()}</span>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.2 }}>{cliente.empresa}</div>
            {cliente.segmento && <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{cliente.segmento}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <StatusBadge status={cliente.status} />
          <ChevronRight size={14} color={MUTED} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, padding: '12px 0', borderTop: `1px solid ${BORDER}` }}>
        <div>
          <div style={{ fontSize: 10, color: MUTED, fontWeight: 500, marginBottom: 3 }}>HEALTH</div>
          <HealthBadge score={cliente.latestHealth?.score_total ?? null} />
        </div>
        <div>
          <div style={{ fontSize: 10, color: MUTED, fontWeight: 500, marginBottom: 3 }}>LT</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Clock size={11} color={MUTED} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>{lt}</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: MUTED, fontWeight: 500, marginBottom: 3 }}>PROJETOS</div>
          <span style={{ fontSize: 13, fontWeight: 700 }}>{ativos} <span style={{ fontSize: 11, color: MUTED, fontWeight: 400 }}>ativo{ativos !== 1 ? 's' : ''}</span></span>
        </div>
      </div>

      {mrr > 0 && (
        <div style={{ marginTop: 8, padding: '8px 10px', background: `${GREEN}0D`, border: `1px solid ${GREEN}25`, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, color: MUTED, fontWeight: 500 }}>MRR mensal</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: GREEN }}>R$ {mrr.toLocaleString('pt-BR')}</span>
        </div>
      )}
    </div>
  )
}
