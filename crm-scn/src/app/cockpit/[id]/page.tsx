'use client'
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase, Cliente, Contato, Projeto, HealthScoreEntry, MetaSemanal, Oportunidade, FcaEntry } from '@/lib/supabase'
import Sidebar from '../../Sidebar'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import {
  ArrowLeft, Plus, Edit2, Check, X, ChevronDown,
  Link2, Layers, TrendingUp, Target, AlertTriangle, Users,
  Calendar, Package, Clock, Trash2, Save, MoreVertical,
  Building2, Phone, Mail, ExternalLink, Globe, Info,
} from 'lucide-react'

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG      = '#0A0A0A'
const SURFACE = '#111110'
const CARD    = '#161614'
const CARD2   = '#1a1a18'
const BORDER  = '#222220'
const TEXT    = '#EDE8E1'
const MUTED   = 'rgba(237,232,225,0.42)'
const MUTED2  = 'rgba(237,232,225,0.65)'
const R       = '#E8001C'
const GREEN   = '#10B981'
const YELLOW  = '#F59E0B'
const BLUE    = '#3B82F6'
const PURPLE  = '#8B5CF6'

const TABS = [
  { id: 'visao-geral',   label: 'Visão Geral',   icon: Info },
  { id: 'projetos',      label: 'Projetos',       icon: Layers },
  { id: 'health-score',  label: 'Health Score',   icon: TrendingUp },
  { id: 'metas',         label: 'Metas',          icon: Target },
  { id: 'oportunidades', label: 'Oportunidades',  icon: Package },
  { id: 'fca',           label: 'FCA',            icon: AlertTriangle },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(v: number) { return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}` }
function fmtDate(s: string | null) {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}
function startOfWeek(d = new Date()): string {
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const mon = new Date(d); mon.setDate(diff); mon.setHours(0,0,0,0)
  return mon.toISOString().split('T')[0]
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

// ── Inline editable field ─────────────────────────────────────────────────────
function EditableField({ label, value, onSave, multiline = false }: { label: string; value: string; onSave: (v: string) => void; multiline?: boolean }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const commit = () => { onSave(draft); setEditing(false) }
  const cancel = () => { setDraft(value); setEditing(false) }

  return (
    <div>
      <div style={{ fontSize: 11, color: MUTED, fontWeight: 500, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      {editing ? (
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          {multiline
            ? <textarea value={draft} onChange={e => setDraft(e.target.value)} autoFocus rows={3} style={{ flex: 1, padding: '7px 10px', background: CARD2, border: `1px solid ${BORDER}`, borderRadius: 7, color: TEXT, fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }} />
            : <input value={draft} onChange={e => setDraft(e.target.value)} autoFocus onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel() }} style={{ flex: 1, padding: '7px 10px', background: CARD2, border: `1px solid ${BORDER}`, borderRadius: 7, color: TEXT, fontSize: 13, outline: 'none' }} />
          }
          <button onClick={commit} style={{ padding: 7, borderRadius: 6, border: 'none', background: GREEN, cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Check size={13} color="#fff" /></button>
          <button onClick={cancel} style={{ padding: 7, borderRadius: 6, border: `1px solid ${BORDER}`, background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><X size={13} color={MUTED} /></button>
        </div>
      ) : (
        <div onClick={() => { setDraft(value); setEditing(true) }} style={{ fontSize: 13, color: value ? TEXT : MUTED, cursor: 'text', padding: '6px 0', borderBottom: `1px dashed ${BORDER}`, minHeight: 28, display: 'flex', alignItems: 'center', gap: 6, transition: 'border-color .15s' }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = '#444')}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = BORDER)}
        >
          {value || <span style={{ fontSize: 12, color: MUTED, fontStyle: 'italic' }}>Clique para editar...</span>}
          <Edit2 size={11} color={MUTED} style={{ flexShrink: 0, marginLeft: 'auto' }} />
        </div>
      )}
    </div>
  )
}

// ── Score display ─────────────────────────────────────────────────────────────
function ScoreBar({ label, value, onChange }: { label: string; value: number; onChange?: (v: number) => void }) {
  const color = value >= 7 ? GREEN : value >= 5 ? YELLOW : R
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ fontSize: 12, color: MUTED, width: 130, flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, height: 6, background: BORDER, borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${value * 10}%`, height: '100%', background: color, borderRadius: 3, transition: 'width .3s ease' }} />
      </div>
      {onChange ? (
        <select value={value} onChange={e => onChange(Number(e.target.value))} style={{ width: 50, padding: '3px 4px', background: CARD2, border: `1px solid ${BORDER}`, borderRadius: 5, color, fontSize: 13, fontWeight: 700, outline: 'none', cursor: 'pointer' }}>
          {[0,1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      ) : (
        <span style={{ fontSize: 14, fontWeight: 800, color, width: 24, textAlign: 'right' }}>{value}</span>
      )}
    </div>
  )
}

// ── OPORTUNIDADES KANBAN ──────────────────────────────────────────────────────
const OPP_STAGES: { key: Oportunidade['etapa']; label: string; color: string }[] = [
  { key: 'identificada',      label: 'Identificada',      color: MUTED2 },
  { key: 'em_conversa',       label: 'Em Conversa',       color: BLUE },
  { key: 'proposta_enviada',  label: 'Proposta Enviada',  color: YELLOW },
  { key: 'fechada',           label: 'Fechada',           color: GREEN },
]

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────
export default function ClienteCockpitPage() {
  const router = useRouter()
  const params = useParams()
  const clienteId = params.id as string

  const [tab, setTab] = useState('visao-geral')
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [contatos, setContatos] = useState<Contato[]>([])
  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [healthEntries, setHealthEntries] = useState<HealthScoreEntry[]>([])
  const [metas, setMetas] = useState<MetaSemanal[]>([])
  const [oportunidades, setOportunidades] = useState<Oportunidade[]>([])
  const [fcaEntries, setFcaEntries] = useState<FcaEntry[]>([])
  const [loading, setLoading] = useState(true)

  const loadAll = useCallback(async () => {
    setLoading(true)
    const [cl, ct, pr, hs, mt, op, fc] = await Promise.all([
      supabase.from('clientes').select('*').eq('id', clienteId).single(),
      supabase.from('contatos').select('*').eq('cliente_id', clienteId).order('is_primary', { ascending: false }),
      supabase.from('projetos').select('*').eq('cliente_id', clienteId).order('created_at'),
      supabase.from('health_score_entries').select('*').eq('cliente_id', clienteId).order('semana', { ascending: false }).limit(20),
      supabase.from('metas_semanais').select('*').eq('cliente_id', clienteId).order('semana', { ascending: false }),
      supabase.from('oportunidades').select('*').eq('cliente_id', clienteId).order('created_at', { ascending: false }),
      supabase.from('fca_entries').select('*').eq('cliente_id', clienteId).order('data', { ascending: false }),
    ])
    if (cl.data) setCliente(cl.data)
    setContatos(ct.data || [])
    setProjetos(pr.data || [])
    setHealthEntries(hs.data || [])
    setMetas(mt.data || [])
    setOportunidades(op.data || [])
    setFcaEntries(fc.data || [])
    setLoading(false)
  }, [clienteId])

  useEffect(() => { loadAll() }, [loadAll])

  async function saveCliente(fields: Partial<Cliente>) {
    await supabase.from('clientes').update(fields).eq('id', clienteId)
    setCliente(prev => prev ? { ...prev, ...fields } : prev)
  }

  const lt = calcLT(projetos)
  const latestHealth = healthEntries[0] ?? null
  const mrr = projetos.filter(p => p.valor_tipo === 'mensalidade' && p.status === 'ativo').reduce((s, p) => s + p.valor, 0)
  const totalAtivos = projetos.filter(p => p.status === 'ativo').length

  if (loading) return (
    <div style={{ display: 'flex', height: '100vh', background: BG, color: TEXT }}>
      <Sidebar activeView="cockpit" onNavigate={v => router.push(v === 'dashboard' ? '/' : `/${v}`)} />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUTED, fontSize: 14 }}>Carregando...</div>
    </div>
  )

  if (!cliente) return (
    <div style={{ display: 'flex', height: '100vh', background: BG, color: TEXT }}>
      <Sidebar activeView="cockpit" onNavigate={v => router.push(v === 'dashboard' ? '/' : `/${v}`)} />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 15, color: MUTED }}>Cliente não encontrado</div>
        <button onClick={() => router.push('/cockpit')} style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${BORDER}`, background: 'transparent', color: TEXT, fontSize: 13, cursor: 'pointer' }}>Voltar</button>
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', height: '100vh', background: BG, color: TEXT, fontFamily: 'Inter, sans-serif', overflow: 'hidden' }}>
      <Sidebar activeView="cockpit" onNavigate={v => router.push(v === 'dashboard' ? '/' : `/${v}`)} />

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '18px 32px 0', background: SURFACE, borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <button onClick={() => router.push('/cockpit')} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 7, border: `1px solid ${BORDER}`, background: 'transparent', color: MUTED, fontSize: 12, cursor: 'pointer', fontWeight: 500 }}>
              <ArrowLeft size={13} /> Clientes
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: `linear-gradient(135deg, ${R}44, ${R}18)`, border: `1px solid ${R}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: R }}>{cliente.empresa[0].toUpperCase()}</span>
              </div>
              <div>
                <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: '-0.01em' }}>{cliente.empresa}</h1>
                <div style={{ display: 'flex', gap: 10, marginTop: 3 }}>
                  {cliente.segmento && <span style={{ fontSize: 11, color: MUTED }}>{cliente.segmento}</span>}
                  <span style={{ fontSize: 11, color: MUTED }}>·</span>
                  <StatusPill status={cliente.status} onChange={s => saveCliente({ status: s })} />
                </div>
              </div>
            </div>

            {/* KPIs rápidos */}
            <div style={{ display: 'flex', gap: 16 }}>
              {[
                { label: 'Health', value: latestHealth ? latestHealth.score_total.toFixed(1) : '—', color: latestHealth ? (latestHealth.score_total >= 7 ? GREEN : latestHealth.score_total >= 5 ? YELLOW : R) : MUTED },
                { label: 'LT', value: lt, color: TEXT },
                { label: 'MRR', value: mrr > 0 ? fmt(mrr) : '—', color: mrr > 0 ? GREEN : MUTED },
                { label: 'Projetos', value: `${totalAtivos} ativo${totalAtivos !== 1 ? 's' : ''}`, color: TEXT },
              ].map(k => (
                <div key={k.label} style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, color: MUTED, fontWeight: 500, letterSpacing: '0.06em' }}>{k.label.toUpperCase()}</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: k.color }}>{k.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 2 }}>
            {TABS.map(t => {
              const active = tab === t.id
              const Icon = t.icon
              return (
                <button key={t.id} onClick={() => setTab(t.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: '8px 8px 0 0', border: `1px solid ${active ? BORDER : 'transparent'}`, borderBottom: active ? `1px solid ${SURFACE}` : `1px solid transparent`, background: active ? BG : 'transparent', color: active ? TEXT : MUTED, fontSize: 12, fontWeight: active ? 700 : 500, cursor: 'pointer', transition: 'all .15s', marginBottom: -1 }}>
                  <Icon size={13} />
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
          {tab === 'visao-geral' && (
            <TabVisaoGeral
              cliente={cliente}
              contatos={contatos}
              projetos={projetos}
              lt={lt}
              onSaveCliente={saveCliente}
              onReload={loadAll}
              clienteId={clienteId}
            />
          )}
          {tab === 'projetos' && (
            <TabProjetos projetos={projetos} clienteId={clienteId} onReload={loadAll} />
          )}
          {tab === 'health-score' && (
            <TabHealthScore entries={healthEntries} clienteId={clienteId} onReload={loadAll} />
          )}
          {tab === 'metas' && (
            <TabMetas metas={metas} projetos={projetos} clienteId={clienteId} onReload={loadAll} />
          )}
          {tab === 'oportunidades' && (
            <TabOportunidades oportunidades={oportunidades} clienteId={clienteId} onReload={loadAll} />
          )}
          {tab === 'fca' && (
            <TabFCA entries={fcaEntries} clienteId={clienteId} onReload={loadAll} />
          )}
        </div>
      </main>
    </div>
  )
}

// ── Status pill ───────────────────────────────────────────────────────────────
function StatusPill({ status, onChange }: { status: Cliente['status']; onChange: (s: Cliente['status']) => void }) {
  const [open, setOpen] = useState(false)
  const map = { ativo: { color: GREEN, label: 'Ativo' }, pausado: { color: YELLOW, label: 'Pausado' }, churned: { color: R, label: 'Churned' } }
  const { color, label } = map[status]
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 5, border: `1px solid ${color}40`, background: `${color}18`, color, fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.05em' }}>
        {label.toUpperCase()} <ChevronDown size={10} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 4, zIndex: 50, minWidth: 110, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
          {(['ativo', 'pausado', 'churned'] as const).map(s => (
            <button key={s} onClick={() => { onChange(s); setOpen(false) }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', borderRadius: 5, border: 'none', background: s === status ? `${map[s].color}18` : 'transparent', color: map[s].color, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              {map[s].label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: VISÃO GERAL
// ══════════════════════════════════════════════════════════════════════════════
function TabVisaoGeral({ cliente, contatos, projetos, lt, onSaveCliente, onReload, clienteId }: {
  cliente: Cliente; contatos: Contato[]; projetos: Projeto[]; lt: string
  onSaveCliente: (f: Partial<Cliente>) => void; onReload: () => void; clienteId: string
}) {
  const [newStack, setNewStack] = useState('')
  const [newLink, setNewLink] = useState({ label: '', url: '' })
  const [showAddContact, setShowAddContact] = useState(false)
  const [newContact, setNewContact] = useState({ nome: '', cargo: '', email: '', telefone: '', is_primary: false })
  const [saving, setSaving] = useState(false)

  async function addStack() {
    if (!newStack.trim()) return
    const updated = [...(cliente.stack || []), newStack.trim()]
    await onSaveCliente({ stack: updated })
    setNewStack('')
  }
  async function removeStack(s: string) {
    await onSaveCliente({ stack: (cliente.stack || []).filter(x => x !== s) })
  }
  async function addLink() {
    if (!newLink.label.trim() || !newLink.url.trim()) return
    const updated = { ...(cliente.links || {}), [newLink.label.trim()]: newLink.url.trim() }
    await onSaveCliente({ links: updated })
    setNewLink({ label: '', url: '' })
  }
  async function removeLink(k: string) {
    const updated = { ...(cliente.links || {}) }
    delete updated[k]
    await onSaveCliente({ links: updated })
  }
  async function addContato() {
    if (!newContact.nome.trim()) return
    setSaving(true)
    await supabase.from('contatos').insert({ ...newContact, cliente_id: clienteId })
    setShowAddContact(false)
    setNewContact({ nome: '', cargo: '', email: '', telefone: '', is_primary: false })
    await onReload()
    setSaving(false)
  }
  async function deleteContato(id: string) {
    await supabase.from('contatos').delete().eq('id', id)
    await onReload()
  }

  const links = Object.entries(cliente.links || {})

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      {/* Dados gerais */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 22 }}>
        <SectionTitle icon={Building2} label="Dados Gerais" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
          <EditableField label="Empresa" value={cliente.empresa} onSave={v => onSaveCliente({ empresa: v })} />
          <EditableField label="Segmento" value={cliente.segmento || ''} onSave={v => onSaveCliente({ segmento: v || null })} />
          <EditableField label="Anotações" value={cliente.anotacoes || ''} onSave={v => onSaveCliente({ anotacoes: v })} multiline />
          <div style={{ display: 'flex', gap: 20 }}>
            <div>
              <div style={{ fontSize: 11, color: MUTED, fontWeight: 500, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Lifetime</div>
              <div style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}><Clock size={13} color={MUTED} /> {lt}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: MUTED, fontWeight: 500, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Projetos ativos</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{projetos.filter(p => p.status === 'ativo').length}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Contatos */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <SectionTitle icon={Users} label="Contatos" />
          <button onClick={() => setShowAddContact(true)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7, border: `1px solid ${BORDER}`, background: 'transparent', color: MUTED2, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
            <Plus size={11} /> Adicionar
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {contatos.length === 0 && <div style={{ fontSize: 13, color: MUTED, textAlign: 'center', padding: '16px 0' }}>Nenhum contato cadastrado</div>}
          {contatos.map(c => (
            <div key={c.id} style={{ padding: '10px 12px', background: CARD2, borderRadius: 9, border: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: `${BLUE}22`, border: `1px solid ${BLUE}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: BLUE }}>{c.nome[0].toUpperCase()}</span>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {c.nome}
                    {c.is_primary && <span style={{ fontSize: 9, fontWeight: 700, color: YELLOW, background: `${YELLOW}18`, border: `1px solid ${YELLOW}30`, borderRadius: 4, padding: '1px 5px' }}>PRINCIPAL</span>}
                  </div>
                  <div style={{ fontSize: 11, color: MUTED, marginTop: 2, display: 'flex', gap: 10 }}>
                    {c.cargo && <span>{c.cargo}</span>}
                    {c.telefone && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Phone size={9} />{c.telefone}</span>}
                    {c.email && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Mail size={9} />{c.email}</span>}
                  </div>
                </div>
              </div>
              <button onClick={() => deleteContato(c.id)} style={{ padding: 5, borderRadius: 5, border: 'none', background: 'transparent', cursor: 'pointer', color: MUTED, opacity: 0.5 }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '1')} onMouseLeave={e => (e.currentTarget.style.opacity = '0.5')}>
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>

        {showAddContact && (
          <div style={{ marginTop: 12, padding: 14, background: CARD2, borderRadius: 9, border: `1px solid ${BORDER}` }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              {[
                { key: 'nome', placeholder: 'Nome *' },
                { key: 'cargo', placeholder: 'Cargo' },
                { key: 'email', placeholder: 'Email' },
                { key: 'telefone', placeholder: 'Telefone' },
              ].map(f => (
                <input key={f.key} value={(newContact as any)[f.key]} onChange={e => setNewContact(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} style={{ padding: '7px 10px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 7, color: TEXT, fontSize: 12, outline: 'none' }} />
              ))}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: MUTED, cursor: 'pointer', marginBottom: 10 }}>
              <input type="checkbox" checked={newContact.is_primary} onChange={e => setNewContact(p => ({ ...p, is_primary: e.target.checked }))} /> Contato principal
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={addContato} disabled={!newContact.nome.trim() || saving} style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: GREEN, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Salvar</button>
              <button onClick={() => setShowAddContact(false)} style={{ padding: '7px 14px', borderRadius: 7, border: `1px solid ${BORDER}`, background: 'transparent', color: MUTED, fontSize: 12, cursor: 'pointer' }}>Cancelar</button>
            </div>
          </div>
        )}
      </div>

      {/* Stack */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 22 }}>
        <SectionTitle icon={Layers} label="Stack do Cliente" />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
          {(cliente.stack || []).map(s => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: `${PURPLE}18`, border: `1px solid ${PURPLE}30`, borderRadius: 20, fontSize: 12, fontWeight: 500, color: PURPLE }}>
              {s}
              <button onClick={() => removeStack(s)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: PURPLE, padding: 0, display: 'flex', alignItems: 'center', opacity: 0.6 }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '1')} onMouseLeave={e => (e.currentTarget.style.opacity = '0.6')}>
                <X size={11} />
              </button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={newStack} onChange={e => setNewStack(e.target.value)} onKeyDown={e => e.key === 'Enter' && addStack()} placeholder="Adicionar ferramenta..." style={{ padding: '5px 10px', background: CARD2, border: `1px solid ${BORDER}`, borderRadius: 20, color: TEXT, fontSize: 12, outline: 'none', width: 160 }} />
            <button onClick={addStack} disabled={!newStack.trim()} style={{ padding: '5px 10px', borderRadius: 20, border: 'none', background: newStack.trim() ? PURPLE : '#333', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>+</button>
          </div>
        </div>
      </div>

      {/* Links */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 22 }}>
        <SectionTitle icon={Link2} label="Links e Recursos" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
          {links.map(([label, url]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: CARD2, borderRadius: 8, border: `1px solid ${BORDER}` }}>
              <Globe size={12} color={MUTED} />
              <span style={{ fontSize: 12, fontWeight: 600, color: MUTED2, minWidth: 80 }}>{label}</span>
              <a href={url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, fontSize: 12, color: BLUE, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                {url}
              </a>
              <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: MUTED, display: 'flex' }} onClick={e => e.stopPropagation()}><ExternalLink size={11} /></a>
              <button onClick={() => removeLink(label)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: MUTED, padding: 0, opacity: 0.5, display: 'flex', alignItems: 'center' }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '1')} onMouseLeave={e => (e.currentTarget.style.opacity = '0.5')}>
                <Trash2 size={11} />
              </button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={newLink.label} onChange={e => setNewLink(p => ({ ...p, label: e.target.value }))} placeholder="Label (ex: Drive)" style={{ padding: '7px 10px', background: CARD2, border: `1px solid ${BORDER}`, borderRadius: 7, color: TEXT, fontSize: 12, outline: 'none', width: 110 }} />
            <input value={newLink.url} onChange={e => setNewLink(p => ({ ...p, url: e.target.value }))} onKeyDown={e => e.key === 'Enter' && addLink()} placeholder="URL" style={{ flex: 1, padding: '7px 10px', background: CARD2, border: `1px solid ${BORDER}`, borderRadius: 7, color: TEXT, fontSize: 12, outline: 'none' }} />
            <button onClick={addLink} disabled={!newLink.label.trim() || !newLink.url.trim()} style={{ padding: '7px 12px', borderRadius: 7, border: 'none', background: BLUE, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: (!newLink.label.trim() || !newLink.url.trim()) ? 0.4 : 1 }}>+</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: PROJETOS
// ══════════════════════════════════════════════════════════════════════════════
function TabProjetos({ projetos, clienteId, onReload }: { projetos: Projeto[]; clienteId: string; onReload: () => void }) {
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ nome: '', tipo: 'saber' as Projeto['tipo'], valor_tipo: 'mensalidade' as Projeto['valor_tipo'], valor: '', data_inicio: '', data_fim: '', escopo: '' })
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)

  const TIPO_COLOR: Record<Projeto['tipo'], string> = { saber: BLUE, ter: PURPLE, executar: GREEN }
  const TIPO_LABEL: Record<Projeto['tipo'], string> = { saber: 'Saber', ter: 'Ter', executar: 'Executar' }
  const STATUS_COLOR: Record<Projeto['status'], string> = { ativo: GREEN, pausado: YELLOW, encerrado: MUTED2 }

  async function save() {
    if (!form.nome.trim()) return
    setSaving(true)
    await supabase.from('projetos').insert({ ...form, valor: parseFloat(form.valor) || 0, cliente_id: clienteId })
    setShowNew(false)
    setForm({ nome: '', tipo: 'saber', valor_tipo: 'mensalidade', valor: '', data_inicio: '', data_fim: '', escopo: '' })
    await onReload()
    setSaving(false)
  }
  async function toggleStatus(p: Projeto) {
    const next = p.status === 'ativo' ? 'pausado' : p.status === 'pausado' ? 'encerrado' : 'ativo'
    await supabase.from('projetos').update({ status: next }).eq('id', p.id)
    await onReload()
  }
  async function deleteProj(id: string) {
    await supabase.from('projetos').delete().eq('id', id)
    await onReload()
  }

  const totalMRR = projetos.filter(p => p.valor_tipo === 'mensalidade' && p.status === 'ativo').reduce((s, p) => s + p.valor, 0)
  const totalPontual = projetos.filter(p => p.valor_tipo === 'pontual' && p.status === 'ativo').reduce((s, p) => s + p.valor, 0)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 16 }}>
          {totalMRR > 0 && <div style={{ padding: '8px 14px', background: `${GREEN}12`, border: `1px solid ${GREEN}25`, borderRadius: 9 }}><span style={{ fontSize: 11, color: MUTED }}>MRR </span><span style={{ fontSize: 15, fontWeight: 800, color: GREEN }}>{fmt(totalMRR)}/mês</span></div>}
          {totalPontual > 0 && <div style={{ padding: '8px 14px', background: `${BLUE}12`, border: `1px solid ${BLUE}25`, borderRadius: 9 }}><span style={{ fontSize: 11, color: MUTED }}>Pontual </span><span style={{ fontSize: 15, fontWeight: 800, color: BLUE }}>{fmt(totalPontual)}</span></div>}
        </div>
        <button onClick={() => setShowNew(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: `1px solid ${BORDER}`, background: CARD, color: MUTED2, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          <Plus size={13} /> Novo Projeto
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
        {projetos.map(p => {
          const tc = TIPO_COLOR[p.tipo]
          return (
            <div key={p.id} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ height: 3, background: `linear-gradient(90deg, ${tc}, ${tc}66)` }} />
              <div style={{ padding: '16px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: tc, background: `${tc}18`, border: `1px solid ${tc}30`, borderRadius: 4, padding: '2px 7px', letterSpacing: '0.05em' }}>{TIPO_LABEL[p.tipo].toUpperCase()}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: STATUS_COLOR[p.status], background: `${STATUS_COLOR[p.status]}18`, border: `1px solid ${STATUS_COLOR[p.status]}30`, borderRadius: 4, padding: '2px 7px', letterSpacing: '0.05em' }}>{p.status.toUpperCase()}</span>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{p.nome}</div>
                  </div>
                  <button onClick={() => toggleStatus(p)} style={{ padding: '4px 8px', borderRadius: 6, border: `1px solid ${BORDER}`, background: 'transparent', color: MUTED, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>
                    {p.status === 'ativo' ? 'Pausar' : p.status === 'pausado' ? 'Encerrar' : 'Reativar'}
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 10, color: MUTED, fontWeight: 500, marginBottom: 2 }}>VALOR</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: tc }}>{fmt(p.valor)}{p.valor_tipo === 'mensalidade' ? <span style={{ fontSize: 11, color: MUTED, fontWeight: 400 }}>/mês</span> : <span style={{ fontSize: 11, color: MUTED, fontWeight: 400 }}> pontual</span>}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: MUTED, fontWeight: 500, marginBottom: 2 }}>INÍCIO</div>
                    <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}><Calendar size={11} color={MUTED} />{fmtDate(p.data_inicio)}</div>
                  </div>
                </div>
                {p.escopo && <div style={{ fontSize: 12, color: MUTED2, lineHeight: 1.5, padding: '8px 0', borderTop: `1px solid ${BORDER}` }}>{p.escopo}</div>}
                <button onClick={() => deleteProj(p.id)} style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6, border: 'none', background: 'transparent', color: MUTED, fontSize: 11, cursor: 'pointer', opacity: 0.5 }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '1')} onMouseLeave={e => (e.currentTarget.style.opacity = '0.5')}>
                  <Trash2 size={11} /> Excluir
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {projetos.length === 0 && !showNew && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: MUTED }}>
          <Layers size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
          <div style={{ fontSize: 14, fontWeight: 500 }}>Nenhum projeto cadastrado</div>
        </div>
      )}

      {showNew && (
        <div style={{ marginTop: 16, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 22 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Novo Projeto</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 4 }}>Nome do projeto *</label>
              <input value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} placeholder="Ex: Saber Q2 2025" style={{ width: '100%', padding: '9px 12px', background: CARD2, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 4 }}>Tipo</label>
              <select value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value as Projeto['tipo'] }))} style={{ width: '100%', padding: '9px 12px', background: CARD2, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 13, outline: 'none' }}>
                <option value="saber">Saber</option>
                <option value="ter">Ter</option>
                <option value="executar">Executar</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 4 }}>Cobrança</label>
              <select value={form.valor_tipo} onChange={e => setForm(p => ({ ...p, valor_tipo: e.target.value as Projeto['valor_tipo'] }))} style={{ width: '100%', padding: '9px 12px', background: CARD2, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 13, outline: 'none' }}>
                <option value="mensalidade">Mensalidade</option>
                <option value="pontual">Pontual</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 4 }}>Valor (R$)</label>
              <input type="number" value={form.valor} onChange={e => setForm(p => ({ ...p, valor: e.target.value }))} placeholder="0" style={{ width: '100%', padding: '9px 12px', background: CARD2, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 4 }}>Data de início</label>
              <input type="date" value={form.data_inicio} onChange={e => setForm(p => ({ ...p, data_inicio: e.target.value }))} style={{ width: '100%', padding: '9px 12px', background: CARD2, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 4 }}>Data de fim (opcional)</label>
              <input type="date" value={form.data_fim} onChange={e => setForm(p => ({ ...p, data_fim: e.target.value }))} style={{ width: '100%', padding: '9px 12px', background: CARD2, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 4 }}>Escopo / Descrição</label>
              <textarea value={form.escopo} onChange={e => setForm(p => ({ ...p, escopo: e.target.value }))} rows={3} placeholder="Descreva o escopo do projeto..." style={{ width: '100%', padding: '9px 12px', background: CARD2, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={save} disabled={!form.nome.trim() || saving} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: form.nome.trim() ? GREEN : '#333', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{saving ? 'Salvando...' : 'Salvar Projeto'}</button>
            <button onClick={() => setShowNew(false)} style={{ padding: '9px 18px', borderRadius: 8, border: `1px solid ${BORDER}`, background: 'transparent', color: MUTED, fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: HEALTH SCORE
// ══════════════════════════════════════════════════════════════════════════════
function TabHealthScore({ entries, clienteId, onReload }: { entries: HealthScoreEntry[]; clienteId: string; onReload: () => void }) {
  const semanaAtual = startOfWeek()
  const jaTemEssaSemana = entries.some(e => e.semana === semanaAtual)
  const [form, setForm] = useState({ resultado: 5, trafego: 5, entregas_prazo: 5, qualidade_entregas: 5, relacionamento: 5, observacoes: '' })
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)

  const DIMS = [
    { key: 'resultado' as const, label: 'Resultado' },
    { key: 'trafego' as const, label: 'Tráfego' },
    { key: 'entregas_prazo' as const, label: 'Entregas no Prazo' },
    { key: 'qualidade_entregas' as const, label: 'Qualidade das Entregas' },
    { key: 'relacionamento' as const, label: 'Relacionamento' },
  ]

  async function saveHealth() {
    setSaving(true)
    await supabase.from('health_score_entries').upsert({ ...form, cliente_id: clienteId, semana: semanaAtual }, { onConflict: 'cliente_id,semana' })
    setShowForm(false)
    await onReload()
    setSaving(false)
  }

  const latest = entries[0]
  const radarData = DIMS.map(d => ({ subject: d.label.split(' ')[0], value: latest ? (latest as any)[d.key] : 0, fullMark: 10 }))

  const chartData = [...entries].reverse().slice(-12).map(e => ({
    semana: e.semana.slice(5).replace('-', '/'),
    score: Number(e.score_total.toFixed(1)),
  }))

  const score = latest?.score_total ?? null
  const scoreColor = score === null ? MUTED : score >= 7 ? GREEN : score >= 5 ? YELLOW : R

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, marginBottom: 20 }}>
        {/* Score atual + radar */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 22 }}>
          <div style={{ textAlign: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: MUTED, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>Health Score Atual</div>
            <div style={{ fontSize: 52, fontWeight: 900, color: scoreColor, lineHeight: 1 }}>{score !== null ? score.toFixed(1) : '—'}</div>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>de 10.0 · semana atual</div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <RadarChart data={radarData}>
              <PolarGrid stroke={BORDER} />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: MUTED }} />
              <Radar name="Score" dataKey="value" stroke={scoreColor} fill={scoreColor} fillOpacity={0.18} strokeWidth={2} />
            </RadarChart>
          </ResponsiveContainer>
          {latest && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              {DIMS.map(d => (
                <ScoreBar key={d.key} label={d.label} value={(latest as any)[d.key]} />
              ))}
            </div>
          )}
        </div>

        {/* Evolução */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 22 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>Evolução — últimas 12 semanas</div>
          {chartData.length > 1 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid stroke={BORDER} strokeDasharray="3 3" />
                <XAxis dataKey="semana" tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 10]} tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12 }} labelStyle={{ color: MUTED }} itemStyle={{ color: TEXT }} />
                <Line type="monotone" dataKey="score" stroke={GREEN} strokeWidth={2.5} dot={{ fill: GREEN, r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 220, color: MUTED, fontSize: 13 }}>Registre pelo menos 2 semanas para ver a evolução</div>
          )}

          {/* Histórico tabela */}
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 10 }}>HISTÓRICO</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {entries.slice(0, 8).map(e => {
                const c = e.score_total >= 7 ? GREEN : e.score_total >= 5 ? YELLOW : R
                return (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: CARD2, borderRadius: 7 }}>
                    <span style={{ fontSize: 11, color: MUTED, width: 80, flexShrink: 0 }}>{fmtDate(e.semana)}</span>
                    <div style={{ flex: 1, height: 4, background: BORDER, borderRadius: 2 }}>
                      <div style={{ width: `${e.score_total * 10}%`, height: '100%', background: c, borderRadius: 2 }} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 800, color: c, width: 30, textAlign: 'right' }}>{Number(e.score_total).toFixed(1)}</span>
                    {e.observacoes && <span title={e.observacoes} style={{ cursor: 'help' }}><Info size={11} color={MUTED} /></span>}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Novo registro */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showForm ? 16 : 0 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Registrar Health Score — Semana atual</div>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
              {jaTemEssaSemana ? 'Você já registrou esta semana. Registrar novamente irá sobrescrever.' : `Semana de ${fmtDate(semanaAtual)}`}
            </div>
          </div>
          <button onClick={() => setShowForm(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: `1px solid ${BORDER}`, background: showForm ? CARD2 : 'transparent', color: TEXT, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <Plus size={13} /> {showForm ? 'Fechar' : jaTemEssaSemana ? 'Atualizar' : 'Registrar'}
          </button>
        </div>
        {showForm && (
          <div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
              {DIMS.map(d => <ScoreBar key={d.key} label={d.label} value={form[d.key]} onChange={v => setForm(p => ({ ...p, [d.key]: v }))} />)}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderTop: `1px solid ${BORDER}`, marginBottom: 12 }}>
              <span style={{ fontSize: 13, color: MUTED }}>Score total estimado</span>
              <span style={{ fontSize: 22, fontWeight: 900, color: (() => { const s = (form.resultado + form.trafego + form.entregas_prazo + form.qualidade_entregas + form.relacionamento) / 5; return s >= 7 ? GREEN : s >= 5 ? YELLOW : R })() }}>
                {((form.resultado + form.trafego + form.entregas_prazo + form.qualidade_entregas + form.relacionamento) / 5).toFixed(1)}
              </span>
            </div>
            <textarea value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} placeholder="Observações da semana (opcional)..." rows={2} style={{ width: '100%', padding: '9px 12px', background: CARD2, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 13, outline: 'none', resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 12 }} />
            <button onClick={saveHealth} disabled={saving} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: GREEN, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              {saving ? 'Salvando...' : 'Salvar Registro'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: METAS SEMANAIS
// ══════════════════════════════════════════════════════════════════════════════
function TabMetas({ metas, projetos, clienteId, onReload }: { metas: MetaSemanal[]; projetos: Projeto[]; clienteId: string; onReload: () => void }) {
  const semanaAtual = startOfWeek()
  const [selectedWeek, setSelectedWeek] = useState(semanaAtual)
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ descricao: '', valor_meta: '', unidade: '', projeto_id: '' })
  const [saving, setSaving] = useState(false)

  const metasSemana = metas.filter(m => m.semana === selectedWeek)

  const semanas = useMemo(() => {
    const all = [semanaAtual, ...metas.map(m => m.semana)]
    return all.filter((s, i) => all.indexOf(s) === i).sort().reverse()
  }, [metas, semanaAtual])

  async function addMeta() {
    if (!form.descricao.trim()) return
    setSaving(true)
    await supabase.from('metas_semanais').insert({
      cliente_id: clienteId,
      semana: selectedWeek,
      descricao: form.descricao,
      valor_meta: form.valor_meta ? parseFloat(form.valor_meta) : null,
      unidade: form.unidade,
      projeto_id: form.projeto_id || null,
    })
    setShowNew(false)
    setForm({ descricao: '', valor_meta: '', unidade: '', projeto_id: '' })
    await onReload()
    setSaving(false)
  }

  async function updateMeta(id: string, fields: Partial<MetaSemanal>) {
    await supabase.from('metas_semanais').update(fields).eq('id', id)
    await onReload()
  }

  async function deleteMeta(id: string) {
    await supabase.from('metas_semanais').delete().eq('id', id)
    await onReload()
  }

  const STATUS_MAP = {
    pendente: { label: 'Pendente', color: MUTED2 },
    atingida: { label: 'Atingida', color: GREEN },
    parcial: { label: 'Parcial', color: YELLOW },
    nao_atingida: { label: 'Não atingida', color: R },
  }

  return (
    <div>
      {/* Week selector */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {semanas.slice(0, 8).map(s => (
          <button key={s} onClick={() => setSelectedWeek(s)} style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${selectedWeek === s ? R : BORDER}`, background: selectedWeek === s ? `${R}18` : 'transparent', color: selectedWeek === s ? TEXT : MUTED, fontSize: 12, fontWeight: selectedWeek === s ? 700 : 400, cursor: 'pointer' }}>
            {s === semanaAtual ? 'Esta semana' : fmtDate(s)}
          </button>
        ))}
      </div>

      {/* Metas da semana */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        {metasSemana.length === 0 && !showNew && (
          <div style={{ textAlign: 'center', padding: '32px 0', color: MUTED }}>
            <Target size={28} style={{ marginBottom: 10, opacity: 0.4 }} />
            <div style={{ fontSize: 14 }}>Nenhuma meta para esta semana</div>
          </div>
        )}
        {metasSemana.map(m => {
          const st = STATUS_MAP[m.status]
          const pct = m.valor_meta && m.valor_realizado !== null ? Math.min(100, (m.valor_realizado / m.valor_meta) * 100) : null
          return (
            <div key={m.id} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{m.descricao}</div>
                  {m.valor_meta !== null && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <div style={{ flex: 1, height: 6, background: BORDER, borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${pct ?? 0}%`, height: '100%', background: st.color, borderRadius: 3, transition: 'width .3s' }} />
                      </div>
                      <span style={{ fontSize: 12, color: MUTED, whiteSpace: 'nowrap' }}>
                        {m.valor_realizado ?? '—'} / {m.valor_meta} {m.unidade}
                      </span>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <select value={m.status} onChange={e => updateMeta(m.id, { status: e.target.value as MetaSemanal['status'] })} style={{ padding: '4px 8px', background: `${st.color}18`, border: `1px solid ${st.color}40`, borderRadius: 6, color: st.color, fontSize: 11, fontWeight: 700, outline: 'none', cursor: 'pointer' }}>
                    {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                  <button onClick={() => deleteMeta(m.id)} style={{ padding: 5, border: 'none', background: 'transparent', cursor: 'pointer', color: MUTED, opacity: 0.5, display: 'flex' }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = '1')} onMouseLeave={e => (e.currentTarget.style.opacity = '0.5')}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              {m.status !== 'pendente' && m.valor_meta && (
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <input type="number" value={m.valor_realizado ?? ''} onChange={e => updateMeta(m.id, { valor_realizado: e.target.value ? parseFloat(e.target.value) : null })} placeholder="Realizado" style={{ width: 110, padding: '5px 8px', background: CARD2, border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, fontSize: 12, outline: 'none' }} />
                  <span style={{ fontSize: 12, color: MUTED, alignSelf: 'center' }}>{m.unidade}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <button onClick={() => setShowNew(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 9, border: `1px solid ${BORDER}`, background: showNew ? CARD2 : 'transparent', color: MUTED2, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
        <Plus size={13} /> Adicionar meta
      </button>

      {showNew && (
        <div style={{ marginTop: 14, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, marginBottom: 10 }}>
            <input value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} placeholder="Descrição da meta *" style={{ padding: '8px 12px', background: CARD2, border: `1px solid ${BORDER}`, borderRadius: 7, color: TEXT, fontSize: 13, outline: 'none' }} />
            <input type="number" value={form.valor_meta} onChange={e => setForm(p => ({ ...p, valor_meta: e.target.value }))} placeholder="Meta" style={{ width: 90, padding: '8px 12px', background: CARD2, border: `1px solid ${BORDER}`, borderRadius: 7, color: TEXT, fontSize: 13, outline: 'none' }} />
            <input value={form.unidade} onChange={e => setForm(p => ({ ...p, unidade: e.target.value }))} placeholder="Unidade" style={{ width: 90, padding: '8px 12px', background: CARD2, border: `1px solid ${BORDER}`, borderRadius: 7, color: TEXT, fontSize: 13, outline: 'none' }} />
          </div>
          {projetos.length > 0 && (
            <select value={form.projeto_id} onChange={e => setForm(p => ({ ...p, projeto_id: e.target.value }))} style={{ marginBottom: 10, padding: '8px 12px', background: CARD2, border: `1px solid ${BORDER}`, borderRadius: 7, color: TEXT, fontSize: 13, outline: 'none', width: '100%' }}>
              <option value="">Projeto (opcional)</option>
              {projetos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={addMeta} disabled={!form.descricao.trim() || saving} style={{ padding: '8px 16px', borderRadius: 7, border: 'none', background: form.descricao.trim() ? GREEN : '#333', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{saving ? 'Salvando...' : 'Adicionar'}</button>
            <button onClick={() => setShowNew(false)} style={{ padding: '8px 16px', borderRadius: 7, border: `1px solid ${BORDER}`, background: 'transparent', color: MUTED, fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: OPORTUNIDADES
// ══════════════════════════════════════════════════════════════════════════════
function TabOportunidades({ oportunidades, clienteId, onReload }: { oportunidades: Oportunidade[]; clienteId: string; onReload: () => void }) {
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ titulo: '', descricao: '', etapa: 'identificada' as Oportunidade['etapa'], valor_estimado: '', data_estimada: '' })
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!form.titulo.trim()) return
    setSaving(true)
    await supabase.from('oportunidades').insert({ ...form, valor_estimado: form.valor_estimado ? parseFloat(form.valor_estimado) : null, data_estimada: form.data_estimada || null, cliente_id: clienteId })
    setShowNew(false)
    setForm({ titulo: '', descricao: '', etapa: 'identificada', valor_estimado: '', data_estimada: '' })
    await onReload()
    setSaving(false)
  }

  async function moveOpp(id: string, etapa: Oportunidade['etapa']) {
    await supabase.from('oportunidades').update({ etapa }).eq('id', id)
    await onReload()
  }

  async function deleteOpp(id: string) {
    await supabase.from('oportunidades').delete().eq('id', id)
    await onReload()
  }

  const totalEstimado = oportunidades.filter(o => o.etapa !== 'fechada').reduce((s, o) => s + (o.valor_estimado || 0), 0)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        {totalEstimado > 0 && (
          <div style={{ padding: '8px 14px', background: `${YELLOW}12`, border: `1px solid ${YELLOW}25`, borderRadius: 9 }}>
            <span style={{ fontSize: 11, color: MUTED }}>Pipeline estimado </span>
            <span style={{ fontSize: 15, fontWeight: 800, color: YELLOW }}>{fmt(totalEstimado)}</span>
          </div>
        )}
        <div style={{ marginLeft: 'auto' }}>
          <button onClick={() => setShowNew(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: `1px solid ${BORDER}`, background: showNew ? CARD2 : 'transparent', color: MUTED2, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <Plus size={13} /> Nova Oportunidade
          </button>
        </div>
      </div>

      {showNew && (
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div style={{ gridColumn: '1/-1' }}>
              <input value={form.titulo} onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))} placeholder="Título da oportunidade *" style={{ width: '100%', padding: '9px 12px', background: CARD2, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <select value={form.etapa} onChange={e => setForm(p => ({ ...p, etapa: e.target.value as Oportunidade['etapa'] }))} style={{ padding: '9px 12px', background: CARD2, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 13, outline: 'none' }}>
              {OPP_STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <input type="number" value={form.valor_estimado} onChange={e => setForm(p => ({ ...p, valor_estimado: e.target.value }))} placeholder="Valor estimado (R$)" style={{ padding: '9px 12px', background: CARD2, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 13, outline: 'none' }} />
            <input type="date" value={form.data_estimada} onChange={e => setForm(p => ({ ...p, data_estimada: e.target.value }))} style={{ padding: '9px 12px', background: CARD2, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 13, outline: 'none' }} />
            <textarea value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} placeholder="Descrição..." rows={2} style={{ gridColumn: '1/-1', padding: '9px 12px', background: CARD2, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 13, outline: 'none', resize: 'none', fontFamily: 'inherit' }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={save} disabled={!form.titulo.trim() || saving} style={{ padding: '8px 16px', borderRadius: 7, border: 'none', background: form.titulo.trim() ? GREEN : '#333', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{saving ? 'Salvando...' : 'Salvar'}</button>
            <button onClick={() => setShowNew(false)} style={{ padding: '8px 16px', borderRadius: 7, border: `1px solid ${BORDER}`, background: 'transparent', color: MUTED, fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Kanban */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        {OPP_STAGES.map(stage => {
          const items = oportunidades.filter(o => o.etapa === stage.key)
          return (
            <div key={stage.key} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '12px 14px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: stage.color }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: stage.color }}>{stage.label}</span>
                </div>
                <span style={{ fontSize: 11, color: MUTED, background: CARD2, borderRadius: 10, padding: '1px 7px' }}>{items.length}</span>
              </div>
              <div style={{ padding: '10px 10px', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 80 }}>
                {items.map(o => (
                  <div key={o.id} style={{ background: CARD2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{o.titulo}</div>
                    {o.valor_estimado && <div style={{ fontSize: 12, color: YELLOW, fontWeight: 700, marginBottom: 4 }}>{fmt(o.valor_estimado)}</div>}
                    {o.data_estimada && <div style={{ fontSize: 11, color: MUTED, display: 'flex', alignItems: 'center', gap: 3, marginBottom: 6 }}><Calendar size={10} />{fmtDate(o.data_estimada)}</div>}
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {OPP_STAGES.filter(s => s.key !== stage.key).map(s => (
                        <button key={s.key} onClick={() => moveOpp(o.id, s.key)} style={{ padding: '2px 7px', borderRadius: 4, border: `1px solid ${s.color}40`, background: `${s.color}12`, color: s.color, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>→ {s.label}</button>
                      ))}
                      <button onClick={() => deleteOpp(o.id)} style={{ padding: '2px 7px', borderRadius: 4, border: `1px solid ${R}40`, background: `${R}12`, color: R, fontSize: 10, fontWeight: 600, cursor: 'pointer', marginLeft: 'auto' }}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: FCA
// ══════════════════════════════════════════════════════════════════════════════
function TabFCA({ entries, clienteId, onReload }: { entries: FcaEntry[]; clienteId: string; onReload: () => void }) {
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ data: new Date().toISOString().split('T')[0], fato: '', causa: '', acao: '' })
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!form.fato.trim() || !form.causa.trim() || !form.acao.trim()) return
    setSaving(true)
    await supabase.from('fca_entries').insert({ ...form, cliente_id: clienteId })
    setShowNew(false)
    setForm({ data: new Date().toISOString().split('T')[0], fato: '', causa: '', acao: '' })
    await onReload()
    setSaving(false)
  }

  async function deleteEntry(id: string) {
    await supabase.from('fca_entries').delete().eq('id', id)
    await onReload()
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Registro de FCA</div>
          <div style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>Fato · Causa · Ação — documentação de momentos críticos</div>
        </div>
        <button onClick={() => setShowNew(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 9, border: `1px solid ${R}50`, background: showNew ? `${R}22` : `${R}12`, color: TEXT, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          <AlertTriangle size={13} /> Registrar FCA
        </button>
      </div>

      {showNew && (
        <div style={{ background: CARD, border: `1px solid ${R}40`, borderRadius: 12, padding: 22, marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 7, color: R }}>
            <AlertTriangle size={16} /> Novo Registro FCA
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 4 }}>Data</label>
              <input type="date" value={form.data} onChange={e => setForm(p => ({ ...p, data: e.target.value }))} style={{ padding: '8px 12px', background: CARD2, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 13, outline: 'none' }} />
            </div>
            {[
              { key: 'fato', label: 'Fato', placeholder: 'O que aconteceu? Descreva o evento crítico...' },
              { key: 'causa', label: 'Causa', placeholder: 'Por que aconteceu? Qual a causa raiz identificada...' },
              { key: 'acao', label: 'Ação', placeholder: 'O que foi / será feito? Qual a ação tomada...' },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 4, fontWeight: 700, letterSpacing: '0.05em' }}>{f.label.toUpperCase()}</label>
                <textarea value={(form as any)[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} rows={3} style={{ width: '100%', padding: '9px 12px', background: CARD2, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={save} disabled={!form.fato.trim() || !form.causa.trim() || !form.acao.trim() || saving} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: R, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: (!form.fato.trim() || !form.causa.trim() || !form.acao.trim()) ? 0.5 : 1 }}>
              {saving ? 'Salvando...' : 'Registrar FCA'}
            </button>
            <button onClick={() => setShowNew(false)} style={{ padding: '9px 18px', borderRadius: 8, border: `1px solid ${BORDER}`, background: 'transparent', color: MUTED, fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
          </div>
        </div>
      )}

      {entries.length === 0 && !showNew ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: MUTED }}>
          <AlertTriangle size={32} style={{ marginBottom: 12, opacity: 0.3 }} />
          <div style={{ fontSize: 14 }}>Nenhum FCA registrado — ótimo sinal!</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {entries.map((e, i) => (
            <div key={e.id} style={{ display: 'flex', gap: 16 }}>
              {/* Timeline */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: `${R}22`, border: `2px solid ${R}60`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <AlertTriangle size={13} color={R} />
                </div>
                {i < entries.length - 1 && <div style={{ width: 2, flex: 1, background: BORDER, marginTop: 6 }} />}
              </div>
              <div style={{ flex: 1, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 18px', marginBottom: i < entries.length - 1 ? 0 : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ fontSize: 12, color: MUTED, fontWeight: 500 }}>{fmtDate(e.data)}</span>
                  <button onClick={() => deleteEntry(e.id)} style={{ padding: 4, border: 'none', background: 'transparent', cursor: 'pointer', color: MUTED, opacity: 0.4, display: 'flex' }}
                    onMouseEnter={ev => (ev.currentTarget.style.opacity = '1')} onMouseLeave={ev => (ev.currentTarget.style.opacity = '0.4')}>
                    <Trash2 size={13} />
                  </button>
                </div>
                {[
                  { label: 'FATO', value: e.fato, color: R },
                  { label: 'CAUSA', value: e.causa, color: YELLOW },
                  { label: 'AÇÃO', value: e.acao, color: GREEN },
                ].map(item => (
                  <div key={item.label} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: item.color, letterSpacing: '0.08em', marginBottom: 3 }}>{item.label}</div>
                    <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.55 }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Section title helper ──────────────────────────────────────────────────────
function SectionTitle({ icon: Icon, label }: { icon: React.ComponentType<any>; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Icon size={14} color={MUTED} />
      <span style={{ fontSize: 13, fontWeight: 700, color: MUTED2 }}>{label}</span>
    </div>
  )
}
