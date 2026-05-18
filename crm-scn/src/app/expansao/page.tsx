'use client'
import React, { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Oportunidade, Cliente } from '@/lib/supabase'
import CRMLayout from '../_components/CRMLayout'
import { R, WHITE, GRAY1, GRAY2, GRAY3, GRAY4, GRAY5, GREEN, BLUE, YELLOW, PURPLE } from '@/lib/crm-constants'
import { Package, Search, TrendingUp, DollarSign, Layers, ChevronRight, Calendar, Building2, Plus, X, ChevronDown } from 'lucide-react'
import { useUserRole } from '@/lib/useUserRole'

// ── Tipos ─────────────────────────────────────────────────────────────────────
type OportunidadeEnriquecida = Oportunidade & { cliente_nome: string }

// ── Constantes ────────────────────────────────────────────────────────────────
const STAGES: { key: Oportunidade['etapa']; label: string; color: string; bg: string; border: string }[] = [
  { key: 'identificada',     label: 'Identificada',     color: GRAY2,     bg: '#F9FAFB', border: GRAY5 },
  { key: 'em_conversa',      label: 'Em Conversa',      color: BLUE,      bg: '#EFF6FF', border: '#BFDBFE' },
  { key: 'proposta_enviada', label: 'Proposta Enviada', color: '#92400E', bg: '#FEF3C7', border: '#FDE68A' },
  { key: 'fechada',          label: 'Fechada',          color: '#065F46', bg: '#ECFDF5', border: '#A7F3D0' },
]

function fmt(v: number) {
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`
}
function fmtDate(s: string | null) {
  if (!s) return null
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ExpansaoPage() {
  const router = useRouter()
  const { canEditCockpit } = useUserRole()
  const [oportunidades, setOps]   = useState<OportunidadeEnriquecida[]>([])
  const [clientes, setClientes]   = useState<Cliente[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [filterCliente, setFilter] = useState('')
  const [showNew, setShowNew]     = useState(false)
  const [newForm, setNewForm]     = useState({ cliente_id: '', titulo: '', descricao: '', etapa: 'identificada' as Oportunidade['etapa'], valor_estimado: '', data_estimada: '' })
  const [saving, setSaving]       = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: ops }, { data: cls }] = await Promise.all([
      supabase.from('oportunidades').select('*').order('created_at', { ascending: false }),
      supabase.from('clientes').select('id, empresa, status').order('empresa'),
    ])
    const cl = (cls || []) as Cliente[]
    setClientes(cl)
    const enriched: OportunidadeEnriquecida[] = (ops || []).map(o => ({
      ...o,
      cliente_nome: cl.find(c => c.id === o.cliente_id)?.empresa ?? '—',
    }))
    setOps(enriched)
    setLoading(false)
  }

  async function moveOp(id: string, etapa: Oportunidade['etapa']) {
    await supabase.from('oportunidades').update({ etapa }).eq('id', id)
    setOps(prev => prev.map(o => o.id === id ? { ...o, etapa } : o))
  }

  async function deleteOp(id: string) {
    await supabase.from('oportunidades').delete().eq('id', id)
    setOps(prev => prev.filter(o => o.id !== id))
  }

  async function createOp() {
    if (!newForm.cliente_id || !newForm.titulo.trim()) return
    setSaving(true)
    const { data, error } = await supabase.from('oportunidades').insert({
      cliente_id:     newForm.cliente_id,
      titulo:         newForm.titulo.trim(),
      descricao:      newForm.descricao,
      etapa:          newForm.etapa,
      valor_estimado: newForm.valor_estimado ? parseFloat(newForm.valor_estimado) : null,
      data_estimada:  newForm.data_estimada || null,
    }).select().single()
    if (data) {
      const clienteNome = clientes.find(c => c.id === newForm.cliente_id)?.empresa ?? '—'
      setOps(prev => [{ ...data, cliente_nome: clienteNome }, ...prev])
      setNewForm({ cliente_id: '', titulo: '', descricao: '', etapa: 'identificada', valor_estimado: '', data_estimada: '' })
      setShowNew(false)
    }
    setSaving(false)
  }

  // Filtragem
  const filtered = useMemo(() => {
    let list = oportunidades
    if (filterCliente) list = list.filter(o => o.cliente_id === filterCliente)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(o => o.titulo.toLowerCase().includes(q) || o.cliente_nome.toLowerCase().includes(q))
    }
    return list
  }, [oportunidades, filterCliente, search])

  // Métricas
  const stats = useMemo(() => {
    const abertas = filtered.filter(o => o.etapa !== 'fechada')
    const fechadas = filtered.filter(o => o.etapa === 'fechada')
    return {
      total:          filtered.length,
      pipeline:       abertas.reduce((s, o) => s + (o.valor_estimado || 0), 0),
      fechado:        fechadas.reduce((s, o) => s + (o.valor_estimado || 0), 0),
      clientes:       new Set(filtered.map(o => o.cliente_id)).size,
    }
  }, [filtered])

  return (
    <CRMLayout title="Pipeline de Expansão" subtitle="Oportunidades de upsell e novos contratos">

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total de Oportunidades', value: stats.total,                                              icon: Package,    color: BLUE },
          { label: 'Pipeline em Aberto',      value: stats.pipeline > 0 ? fmt(stats.pipeline) : '—',          icon: TrendingUp, color: '#92400E' },
          { label: 'Valor Fechado',           value: stats.fechado  > 0 ? fmt(stats.fechado)  : '—',          icon: DollarSign, color: '#065F46' },
          { label: 'Clientes com Oportunid.', value: stats.clientes,                                          icon: Building2,  color: PURPLE },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} style={{ background: WHITE, border: `1px solid ${GRAY5}`, borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: `${color}14`, border: `1px solid ${color}28`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon size={18} color={color} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: GRAY3, fontWeight: 500, marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: GRAY1, lineHeight: 1 }}>{value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ background: WHITE, border: `1px solid ${GRAY5}`, borderRadius: 12, padding: '14px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 1px 4px rgba(0,0,0,.04)' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 280 }}>
          <Search size={13} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: GRAY3 }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar oportunidade ou empresa..." style={{ width: '100%', padding: '8px 12px 8px 32px', background: GRAY4, border: `1px solid ${GRAY5}`, borderRadius: 8, color: GRAY1, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }} />
        </div>

        <select value={filterCliente} onChange={e => setFilter(e.target.value)} style={{ padding: '8px 12px', background: GRAY4, border: `1px solid ${GRAY5}`, borderRadius: 8, color: filterCliente ? GRAY1 : GRAY3, fontSize: 13, outline: 'none', maxWidth: 220 }}>
          <option value="">Todos os clientes</option>
          {clientes.filter(c => c.status === 'ativo').map(c => <option key={c.id} value={c.id}>{c.empresa}</option>)}
        </select>

        {(search || filterCliente) && (
          <button onClick={() => { setSearch(''); setFilter('') }} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 7, border: `1px solid ${GRAY5}`, background: WHITE, color: GRAY2, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <X size={12} /> Limpar
          </button>
        )}

        {canEditCockpit && (
          <div style={{ marginLeft: 'auto' }}>
            <button onClick={() => setShowNew(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 9, border: 'none', background: R, color: WHITE, fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: `0 2px 8px ${R}40` }}>
              <Plus size={14} strokeWidth={2.5} /> Nova Oportunidade
            </button>
          </div>
        )}
      </div>

      {/* Formulário nova oportunidade */}
      {showNew && canEditCockpit && (
        <div style={{ background: WHITE, border: `1px solid ${GRAY5}`, borderRadius: 12, padding: 22, marginBottom: 20, boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: GRAY1, marginBottom: 16 }}>Nova Oportunidade</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ fontSize: 11, color: GRAY3, display: 'block', marginBottom: 4, fontWeight: 600 }}>Cliente *</label>
              <select value={newForm.cliente_id} onChange={e => setNewForm(p => ({ ...p, cliente_id: e.target.value }))} style={{ width: '100%', padding: '9px 12px', background: GRAY4, border: `1px solid ${GRAY5}`, borderRadius: 8, color: newForm.cliente_id ? GRAY1 : GRAY3, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }}>
                <option value="">Selecione o cliente...</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.empresa}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ fontSize: 11, color: GRAY3, display: 'block', marginBottom: 4, fontWeight: 600 }}>Título *</label>
              <input value={newForm.titulo} onChange={e => setNewForm(p => ({ ...p, titulo: e.target.value }))} placeholder="Ex: Upgrade para Executar" style={{ width: '100%', padding: '9px 12px', background: GRAY4, border: `1px solid ${GRAY5}`, borderRadius: 8, color: GRAY1, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: GRAY3, display: 'block', marginBottom: 4, fontWeight: 600 }}>Etapa</label>
              <select value={newForm.etapa} onChange={e => setNewForm(p => ({ ...p, etapa: e.target.value as Oportunidade['etapa'] }))} style={{ width: '100%', padding: '9px 12px', background: GRAY4, border: `1px solid ${GRAY5}`, borderRadius: 8, color: GRAY1, fontSize: 13, outline: 'none' }}>
                {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: GRAY3, display: 'block', marginBottom: 4, fontWeight: 600 }}>Valor estimado (R$)</label>
              <input type="number" value={newForm.valor_estimado} onChange={e => setNewForm(p => ({ ...p, valor_estimado: e.target.value }))} placeholder="0" style={{ width: '100%', padding: '9px 12px', background: GRAY4, border: `1px solid ${GRAY5}`, borderRadius: 8, color: GRAY1, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: GRAY3, display: 'block', marginBottom: 4, fontWeight: 600 }}>Data estimada</label>
              <input type="date" value={newForm.data_estimada} onChange={e => setNewForm(p => ({ ...p, data_estimada: e.target.value }))} style={{ width: '100%', padding: '9px 12px', background: GRAY4, border: `1px solid ${GRAY5}`, borderRadius: 8, color: GRAY1, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: GRAY3, display: 'block', marginBottom: 4, fontWeight: 600 }}>Descrição</label>
              <input value={newForm.descricao} onChange={e => setNewForm(p => ({ ...p, descricao: e.target.value }))} placeholder="Descrição opcional..." style={{ width: '100%', padding: '9px 12px', background: GRAY4, border: `1px solid ${GRAY5}`, borderRadius: 8, color: GRAY1, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={createOp} disabled={!newForm.cliente_id || !newForm.titulo.trim() || saving} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: (newForm.cliente_id && newForm.titulo.trim()) ? R : GRAY3, color: WHITE, fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: (newForm.cliente_id && newForm.titulo.trim()) ? `0 2px 8px ${R}40` : 'none' }}>
              {saving ? 'Salvando...' : 'Criar Oportunidade'}
            </button>
            <button onClick={() => setShowNew(false)} style={{ padding: '9px 18px', borderRadius: 8, border: `1px solid ${GRAY5}`, background: WHITE, color: GRAY2, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Kanban */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          {[...Array(4)].map((_, i) => <div key={i} style={{ background: WHITE, border: `1px solid ${GRAY5}`, borderRadius: 10, height: 300, animation: 'pulse 1.5s infinite' }} />)}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          {STAGES.map(stage => {
            const items = filtered.filter(o => o.etapa === stage.key)
            const total = items.reduce((s, o) => s + (o.valor_estimado || 0), 0)

            return (
              <div key={stage.key} style={{ display: 'flex', flexDirection: 'column', background: stage.bg, border: `1px solid ${stage.border}`, borderRadius: 10, overflow: 'hidden', minHeight: 200 }}>

                {/* Header da coluna */}
                <div style={{ padding: '12px 14px', borderBottom: `1px solid ${stage.border}`, background: WHITE }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <div style={{ width: 9, height: 9, borderRadius: '50%', background: stage.color }} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: stage.color }}>{stage.label}</span>
                    </div>
                    <span style={{ fontSize: 11, color: GRAY3, background: GRAY4, border: `1px solid ${GRAY5}`, borderRadius: 10, padding: '1px 8px', fontWeight: 600 }}>{items.length}</span>
                  </div>
                  {total > 0 && (
                    <div style={{ fontSize: 13, fontWeight: 800, color: stage.color }}>{fmt(total)}</div>
                  )}
                </div>

                {/* Cards */}
                <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                  {items.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '20px 0', color: GRAY3, fontSize: 12 }}>Nenhuma oportunidade</div>
                  )}
                  {items.map(o => (
                    <OppCard
                      key={o.id}
                      op={o}
                      stages={STAGES}
                      currentStage={stage}
                      onMove={moveOp}
                      onDelete={deleteOp}
                      onOpenCliente={() => router.push(`/cockpit/${o.cliente_id}`)}
                      canEdit={canEditCockpit}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Total geral rodapé */}
      {!loading && filtered.length > 0 && (
        <div style={{ marginTop: 20, background: WHITE, border: `1px solid ${GRAY5}`, borderRadius: 12, padding: '14px 20px', display: 'flex', gap: 32, boxShadow: '0 1px 4px rgba(0,0,0,.04)' }}>
          <div>
            <div style={{ fontSize: 11, color: GRAY3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Total pipeline aberto</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#92400E' }}>{stats.pipeline > 0 ? fmt(stats.pipeline) : '—'}</div>
          </div>
          <div style={{ width: 1, background: GRAY5 }} />
          <div>
            <div style={{ fontSize: 11, color: GRAY3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Total fechado</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#065F46' }}>{stats.fechado > 0 ? fmt(stats.fechado) : '—'}</div>
          </div>
          <div style={{ width: 1, background: GRAY5 }} />
          <div>
            <div style={{ fontSize: 11, color: GRAY3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Total geral</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: GRAY1 }}>{(stats.pipeline + stats.fechado) > 0 ? fmt(stats.pipeline + stats.fechado) : '—'}</div>
          </div>
        </div>
      )}
    </CRMLayout>
  )
}

// ── Card de oportunidade ──────────────────────────────────────────────────────
function OppCard({ op, stages, currentStage, onMove, onDelete, onOpenCliente, canEdit }: {
  op: OportunidadeEnriquecida
  stages: typeof STAGES
  currentStage: typeof STAGES[0]
  onMove: (id: string, etapa: Oportunidade['etapa']) => void
  onDelete: (id: string) => void
  onOpenCliente: () => void
  canEdit: boolean
}) {
  const [hov, setHov] = useState(false)
  const [showMove, setShowMove] = useState(false)

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => { setHov(false); setShowMove(false) }}
      style={{ background: WHITE, border: `1px solid ${hov ? '#D1D5DB' : GRAY5}`, borderRadius: 10, padding: '12px 14px', boxShadow: hov ? '0 4px 14px rgba(0,0,0,.08)' : '0 1px 3px rgba(0,0,0,.04)', transition: 'all .15s ease', cursor: 'default' }}
    >
      {/* Cliente */}
      <button onClick={onOpenCliente} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
        <div style={{ width: 18, height: 18, borderRadius: 4, background: `${R}12`, border: `1px solid ${R}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 9, fontWeight: 900, color: R }}>{op.cliente_nome[0]?.toUpperCase()}</span>
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, color: GRAY2 }}>{op.cliente_nome}</span>
        <ChevronRight size={10} color={GRAY3} />
      </button>

      {/* Título */}
      <div style={{ fontSize: 13, fontWeight: 700, color: GRAY1, marginBottom: op.valor_estimado || op.data_estimada ? 8 : 10, lineHeight: 1.35 }}>{op.titulo}</div>

      {/* Valor + data */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        {op.valor_estimado ? (
          <span style={{ fontSize: 13, fontWeight: 800, color: currentStage.color }}>{fmt(op.valor_estimado)}</span>
        ) : null}
        {op.data_estimada ? (
          <span style={{ fontSize: 11, color: GRAY3, display: 'flex', alignItems: 'center', gap: 3 }}>
            <Calendar size={10} />{fmtDate(op.data_estimada)}
          </span>
        ) : null}
      </div>

      {/* Ações */}
      {canEdit && (
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <button
              onClick={() => setShowMove(o => !o)}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 9px', borderRadius: 6, border: `1px solid ${GRAY5}`, background: GRAY4, color: GRAY2, fontSize: 11, fontWeight: 600, cursor: 'pointer', width: '100%', justifyContent: 'space-between' }}
            >
              <span>Mover para...</span><ChevronDown size={10} />
            </button>
            {showMove && (
              <div style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 4, background: WHITE, border: `1px solid ${GRAY5}`, borderRadius: 9, padding: 4, zIndex: 50, minWidth: '100%', boxShadow: '0 8px 24px rgba(0,0,0,.12)' }}>
                {stages.filter(s => s.key !== currentStage.key).map(s => (
                  <button key={s.key} onClick={() => { onMove(op.id, s.key); setShowMove(false) }} style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', textAlign: 'left', padding: '7px 10px', borderRadius: 5, border: 'none', background: 'transparent', color: s.color, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = s.bg)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => onDelete(op.id)} style={{ padding: '4px 7px', borderRadius: 6, border: '1px solid #FECACA', background: '#FEF2F2', color: '#991B1B', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
            title="Excluir">✕</button>
        </div>
      )}
    </div>
  )
}
