'use client'
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { supabase, Cliente, Contato, Projeto, HealthScoreEntry, MetaSemanal, Oportunidade, FcaEntry, Reuniao } from '@/lib/supabase'
import CRMLayout from '../../_components/CRMLayout'
import { R, WHITE, GRAY1, GRAY2, GRAY3, GRAY4, GRAY5, GREEN, BLUE, YELLOW, PURPLE } from '@/lib/crm-constants'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts'
import {
  ArrowLeft, Plus, Edit2, Check, X, ChevronDown,
  Link2, Layers, TrendingUp, Target, AlertTriangle, Users,
  Calendar, Package, Clock, Trash2, Globe, Info,
  Building2, Phone, Mail, ExternalLink, Video,
} from 'lucide-react'
import { useUserRole } from '@/lib/useUserRole'

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
  const mon = new Date(d); mon.setDate(diff); mon.setHours(0, 0, 0, 0)
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
function healthColor(s: number) { return s >= 7 ? GREEN : s >= 5 ? YELLOW : R }

// ── Shared styles ─────────────────────────────────────────────────────────────
const card = { background: WHITE, border: `1px solid ${GRAY5}`, borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,.04)' } as const
const input14 = { padding: '9px 12px', background: GRAY4, border: `1px solid ${GRAY5}`, borderRadius: 8, color: GRAY1, fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const }
const btnPrimary = (disabled = false) => ({ padding: '9px 18px', borderRadius: 8, border: 'none', background: disabled ? GRAY3 : R, color: WHITE, fontSize: 13, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer', boxShadow: disabled ? 'none' : `0 2px 8px ${R}40` })
const btnGhost = { padding: '8px 16px', borderRadius: 8, border: `1px solid ${GRAY5}`, background: WHITE, color: GRAY2, fontSize: 13, fontWeight: 600, cursor: 'pointer' }

const TABS = [
  { id: 'visao-geral',   label: 'Visão Geral',   icon: Info },
  { id: 'projetos',      label: 'Projetos',       icon: Layers },
  { id: 'health-score',  label: 'Health Score',   icon: TrendingUp },
  { id: 'metas',         label: 'Metas',          icon: Target },
  { id: 'reunioes',      label: 'Reuniões',       icon: Video },
  { id: 'oportunidades', label: 'Oportunidades',  icon: Package },
  { id: 'fca',           label: 'FCA',            icon: AlertTriangle },
]

const OPP_STAGES: { key: Oportunidade['etapa']; label: string; color: string; bg: string }[] = [
  { key: 'identificada',      label: 'Identificada',      color: GRAY2,   bg: GRAY4 },
  { key: 'em_conversa',       label: 'Em Conversa',       color: BLUE,    bg: '#EFF6FF' },
  { key: 'proposta_enviada',  label: 'Proposta Enviada',  color: '#92400E', bg: '#FEF3C7' },
  { key: 'fechada',           label: 'Fechada',           color: '#065F46', bg: '#ECFDF5' },
]

// ── Inline editable field ─────────────────────────────────────────────────────
function EditableField({ label, value, onSave, multiline = false }: { label: string; value: string; onSave?: (v: string) => void; multiline?: boolean }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const commit = () => { onSave!(draft); setEditing(false) }
  const cancel = () => { setDraft(value); setEditing(false) }

  return (
    <div>
      <div style={{ fontSize: 11, color: GRAY3, fontWeight: 600, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</div>
      {editing ? (
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          {multiline
            ? <textarea value={draft} onChange={e => setDraft(e.target.value)} autoFocus rows={3} style={{ flex: 1, padding: '8px 10px', background: GRAY4, border: `1px solid ${GRAY5}`, borderRadius: 7, color: GRAY1, fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }} />
            : <input value={draft} onChange={e => setDraft(e.target.value)} autoFocus onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel() }} style={{ flex: 1, padding: '8px 10px', background: GRAY4, border: `1px solid ${GRAY5}`, borderRadius: 7, color: GRAY1, fontSize: 13, outline: 'none' }} />
          }
          <button onClick={commit} style={{ padding: '7px', borderRadius: 6, border: 'none', background: GREEN, cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Check size={13} color={WHITE} /></button>
          <button onClick={cancel} style={{ padding: '7px', borderRadius: 6, border: `1px solid ${GRAY5}`, background: WHITE, cursor: 'pointer', display: 'flex', alignItems: 'center' }}><X size={13} color={GRAY3} /></button>
        </div>
      ) : (
        <div
          onClick={onSave ? () => { setDraft(value); setEditing(true) } : undefined}
          style={{ fontSize: 13, color: value ? GRAY1 : GRAY3, cursor: onSave ? 'text' : 'default', padding: '7px 0', borderBottom: `1px ${onSave ? 'dashed' : 'solid'} ${GRAY5}`, minHeight: 30, display: 'flex', alignItems: 'center', gap: 6, transition: 'border-color .15s' }}
          onMouseEnter={onSave ? e => ((e.currentTarget as HTMLElement).style.borderColor = '#9CA3AF') : undefined}
          onMouseLeave={onSave ? e => ((e.currentTarget as HTMLElement).style.borderColor = GRAY5) : undefined}
        >
          {value || <span style={{ fontSize: 12, color: GRAY3, fontStyle: 'italic' }}>{onSave ? 'Clique para editar...' : '—'}</span>}
          {onSave && <Edit2 size={11} color={GRAY3} style={{ flexShrink: 0, marginLeft: 'auto' }} />}
        </div>
      )}
    </div>
  )
}

// ── Role select ──────────────────────────────────────────────────────────────
function RoleSelect({ label, value, papel, usuarios, onSave, canEdit }: {
  label: string
  value: string | null
  papel: string
  usuarios: { nome: string; papel: string }[]
  onSave?: (v: string | null) => void
  canEdit: boolean
}) {
  const options = usuarios.filter(u => u.papel === papel)
  return (
    <div>
      <div style={{ fontSize: 11, color: GRAY3, fontWeight: 600, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</div>
      {canEdit ? (
        <select
          value={value ?? ''}
          onChange={e => onSave?.(e.target.value || null)}
          style={{ width: '100%', padding: '8px 10px', background: GRAY4, border: `1px solid ${GRAY5}`, borderRadius: 7, color: value ? GRAY1 : GRAY3, fontSize: 13, outline: 'none', cursor: 'pointer' }}
        >
          <option value="">— Não definido —</option>
          {options.map(u => <option key={u.nome} value={u.nome}>{u.nome}</option>)}
        </select>
      ) : (
        <div style={{ fontSize: 13, color: value ? GRAY1 : GRAY3, padding: '7px 0', borderBottom: `1px solid ${GRAY5}`, minHeight: 30 }}>
          {value || <span style={{ fontStyle: 'italic', color: GRAY3 }}>—</span>}
        </div>
      )}
    </div>
  )
}

// ── Score bar ─────────────────────────────────────────────────────────────────
function ScoreBar({ label, value, onChange }: { label: string; value: number; onChange?: (v: number) => void }) {
  const color = healthColor(value)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ fontSize: 12, color: GRAY2, width: 140, flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, height: 6, background: GRAY5, borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${value * 10}%`, height: '100%', background: color, borderRadius: 3, transition: 'width .3s ease' }} />
      </div>
      {onChange ? (
        <select value={value} onChange={e => onChange(Number(e.target.value))} style={{ width: 52, padding: '3px 4px', background: WHITE, border: `1px solid ${GRAY5}`, borderRadius: 5, color, fontSize: 13, fontWeight: 700, outline: 'none', cursor: 'pointer' }}>
          {[0,1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      ) : (
        <span style={{ fontSize: 14, fontWeight: 800, color, width: 24, textAlign: 'right' }}>{value}</span>
      )}
    </div>
  )
}

// ── Section title ─────────────────────────────────────────────────────────────
function SectionTitle({ icon: Icon, label }: { icon: React.ComponentType<any>; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
      <div style={{ width: 28, height: 28, borderRadius: 7, background: GRAY4, border: `1px solid ${GRAY5}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={13} color={GRAY2} />
      </div>
      <span style={{ fontSize: 13, fontWeight: 700, color: GRAY1 }}>{label}</span>
    </div>
  )
}

// ── Status pill ───────────────────────────────────────────────────────────────
function StatusPill({ status, onChange }: { status: Cliente['status']; onChange?: (s: Cliente['status']) => void }) {
  const [open, setOpen] = useState(false)
  const map = {
    ativo:   { color: '#065F46', bg: '#D1FAE5', border: '#A7F3D0', label: 'Ativo' },
    pausado: { color: '#92400E', bg: '#FEF3C7', border: '#FDE68A', label: 'Pausado' },
    churned: { color: '#991B1B', bg: '#FEE2E2', border: '#FECACA', label: 'Churned' },
  }
  const s = map[status]
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button onClick={() => onChange && setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 5, border: `1px solid ${s.border}`, background: s.bg, color: s.color, fontSize: 11, fontWeight: 700, cursor: onChange ? 'pointer' : 'default', letterSpacing: '0.04em' }}>
        {s.label.toUpperCase()} {onChange && <ChevronDown size={10} />}
      </button>
      {open && onChange && (
        <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: WHITE, border: `1px solid ${GRAY5}`, borderRadius: 9, padding: 4, zIndex: 50, minWidth: 120, boxShadow: '0 8px 24px rgba(0,0,0,.12)' }}>
          {(['ativo', 'pausado', 'churned'] as const).map(k => (
            <button key={k} onClick={() => { onChange(k); setOpen(false) }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', borderRadius: 5, border: 'none', background: k === status ? map[k].bg : 'transparent', color: map[k].color, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              {map[k].label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════
export default function ClienteCockpitPage() {
  const router   = useRouter()
  const params   = useParams()
  const slugOrId = params.id as string
  const { canEditCockpit } = useUserRole()
  const searchParams = useSearchParams()

  const [tab, setTab]                 = useState(() => searchParams.get('tab') ?? 'visao-geral')
  const [cliente, setCliente]         = useState<Cliente | null>(null)
  const [clienteRealId, setClienteRealId] = useState<string>('')
  const [contatos, setContatos]       = useState<Contato[]>([])
  const [projetos, setProjetos]       = useState<Projeto[]>([])
  const [healthEntries, setHealth]    = useState<HealthScoreEntry[]>([])
  const [metas, setMetas]             = useState<MetaSemanal[]>([])
  const [oportunidades, setOps]       = useState<Oportunidade[]>([])
  const [fcaEntries, setFCA]          = useState<FcaEntry[]>([])
  const [reunioes, setReunioes]       = useState<Reuniao[]>([])
  const [loading, setLoading]         = useState(true)

  const loadAll = useCallback(async () => {
    setLoading(true)
    // Resolve slug or UUID to the client record
    let clienteData: Cliente | null = null
    const { data: bySlug } = await supabase.from('clientes').select('*').eq('slug', slugOrId).maybeSingle()
    if (bySlug) {
      clienteData = bySlug
    } else {
      const { data: byId } = await supabase.from('clientes').select('*').eq('id', slugOrId).maybeSingle()
      clienteData = byId
    }
    if (!clienteData) { setLoading(false); return }
    const actualId = clienteData.id
    setCliente(clienteData)
    setClienteRealId(actualId)

    const [ct, pr, hs, mt, op, fc, re] = await Promise.all([
      supabase.from('contatos').select('*').eq('cliente_id', actualId).order('is_primary', { ascending: false }),
      supabase.from('projetos').select('*').eq('cliente_id', actualId).order('created_at'),
      supabase.from('health_score_entries').select('*').eq('cliente_id', actualId).order('semana', { ascending: false }).limit(20),
      supabase.from('metas_semanais').select('*').eq('cliente_id', actualId).order('semana', { ascending: false }),
      supabase.from('oportunidades').select('*').eq('cliente_id', actualId).order('created_at', { ascending: false }),
      supabase.from('fca_entries').select('*').eq('cliente_id', actualId).order('data', { ascending: false }),
      supabase.from('reunioes').select('*').eq('cliente_id', actualId).order('data', { ascending: false }),
    ])
    setContatos(ct.data || [])
    setProjetos(pr.data || [])
    setHealth(hs.data || [])
    setMetas(mt.data || [])
    setOps(op.data || [])
    setFCA(fc.data || [])
    setReunioes(re.data || [])
    setLoading(false)
  }, [slugOrId])

  useEffect(() => { loadAll() }, [loadAll])

  async function saveCliente(fields: Partial<Cliente>) {
    await supabase.from('clientes').update(fields).eq('id', cliente?.id ?? clienteRealId)
    setCliente(prev => prev ? { ...prev, ...fields } : prev)
  }

  const lt      = calcLT(projetos)
  const latest  = healthEntries[0] ?? null
  const mrr     = projetos.filter(p => p.valor_tipo === 'mensalidade' && p.status === 'ativo').reduce((s, p) => s + p.valor, 0)
  const ativos  = projetos.filter(p => p.status === 'ativo').length
  const score   = latest?.score_total ?? null
  const sc      = score !== null ? healthColor(score) : GRAY3

  if (loading) return (
    <CRMLayout title="Cockpit">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: GRAY3, fontSize: 14 }}>Carregando...</div>
    </CRMLayout>
  )

  if (!cliente) return (
    <CRMLayout title="Cockpit">
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 300, gap: 12 }}>
        <div style={{ fontSize: 15, color: GRAY2 }}>Cliente não encontrado</div>
        <button onClick={() => router.push('/cockpit')} style={btnGhost}>Voltar</button>
      </div>
    </CRMLayout>
  )

  return (
    <CRMLayout title={cliente.empresa} subtitle="Cockpit de Cliente">

      {/* ── Client header ── */}
      <div style={{ ...card, padding: '18px 24px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Back + avatar */}
          <button onClick={() => router.push('/cockpit')} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 7, border: `1px solid ${GRAY5}`, background: WHITE, color: GRAY2, fontSize: 12, cursor: 'pointer', fontWeight: 500, flexShrink: 0 }}>
            <ArrowLeft size={13} /> Clientes
          </button>
          <div style={{ width: 44, height: 44, borderRadius: 11, background: `${R}0F`, border: `1.5px solid ${R}2A`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 20, fontWeight: 900, color: R }}>{cliente.empresa[0].toUpperCase()}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: GRAY1, letterSpacing: '-0.01em' }}>{cliente.empresa}</h1>
              <StatusPill status={cliente.status} onChange={canEditCockpit ? s => saveCliente({ status: s }) : undefined} />
            </div>
            {cliente.segmento && <div style={{ fontSize: 12, color: GRAY3, marginTop: 3 }}>{cliente.segmento}</div>}
          </div>

          {/* KPIs */}
          <div style={{ display: 'flex', gap: 1, borderLeft: `1px solid ${GRAY5}`, paddingLeft: 20 }}>
            {[
              { label: 'Health Score', value: score !== null ? score.toFixed(1) : '—', color: sc },
              { label: 'Lifetime', value: lt, color: GRAY1 },
              { label: 'MRR', value: mrr > 0 ? fmt(mrr) : '—', color: mrr > 0 ? '#065F46' : GRAY3 },
              { label: 'Projetos', value: `${ativos} ativo${ativos !== 1 ? 's' : ''}`, color: GRAY1 },
            ].map((k, i) => (
              <div key={k.label} style={{ textAlign: 'center', padding: '0 18px', borderRight: i < 3 ? `1px solid ${GRAY5}` : 'none' }}>
                <div style={{ fontSize: 10, color: GRAY3, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>{k.label}</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: k.color }}>{k.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, marginTop: 18, borderTop: `1px solid ${GRAY5}`, paddingTop: 2, marginLeft: -24, marginRight: -24, paddingLeft: 24 }}>
          {TABS.map(t => {
            const active = tab === t.id
            const Icon   = t.icon
            return (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '11px 16px', border: 'none', background: 'transparent', color: active ? R : GRAY2, fontSize: 13, fontWeight: active ? 700 : 500, cursor: 'pointer', borderBottom: `2px solid ${active ? R : 'transparent'}`, marginBottom: -1, transition: 'all .15s' }}>
                <Icon size={13} />
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Tab content ── */}
      <div>
        {tab === 'visao-geral'   && <TabVisaoGeral   cliente={cliente} contatos={contatos} projetos={projetos} lt={lt} onSaveCliente={saveCliente} onReload={loadAll} clienteId={clienteRealId} canEdit={canEditCockpit} />}
        {tab === 'projetos'      && <TabProjetos      projetos={projetos} clienteId={clienteRealId} onReload={loadAll} canEdit={canEditCockpit} />}
        {tab === 'health-score'  && <TabHealthScore   entries={healthEntries} metas={metas} clienteId={clienteRealId} onReload={loadAll} canEdit={canEditCockpit} />}
        {tab === 'metas'         && <TabMetas         metas={metas} projetos={projetos} clienteId={clienteRealId} onReload={loadAll} canEdit={canEditCockpit} />}
        {tab === 'reunioes'      && <TabReunioes      reunioes={reunioes} clienteId={clienteRealId} onReload={loadAll} canEdit={canEditCockpit} />}
        {tab === 'oportunidades' && <TabOportunidades oportunidades={oportunidades} clienteId={clienteRealId} onReload={loadAll} canEdit={canEditCockpit} />}
        {tab === 'fca'           && <TabFCA           entries={fcaEntries} clienteId={clienteRealId} onReload={loadAll} canEdit={canEditCockpit} />}
      </div>
    </CRMLayout>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: VISÃO GERAL
// ══════════════════════════════════════════════════════════════════════════════
function TabVisaoGeral({ cliente, contatos, projetos, lt, onSaveCliente, onReload, clienteId, canEdit }: {
  cliente: Cliente; contatos: Contato[]; projetos: Projeto[]; lt: string
  onSaveCliente: (f: Partial<Cliente>) => void; onReload: () => void; clienteId: string; canEdit: boolean
}) {
  const [newStack, setNewStack]       = useState('')
  const [newLink, setNewLink]         = useState({ label: '', url: '' })
  const [showAddContact, setShowAdd]  = useState(false)
  const [newContact, setNewC]         = useState({ nome: '', cargo: '', email: '', telefone: '', is_primary: false })
  const [saving, setSaving]           = useState(false)
  const [usuarios, setUsuarios]       = useState<{ nome: string; papel: string }[]>([])

  useEffect(() => {
    supabase.from('usuarios_permitidos').select('nome, papel')
      .in('papel', ['gestor_projetos', 'designer', 'analista_midia', 'admin'])
      .order('nome')
      .then(({ data }) => setUsuarios(data || []))
  }, [])

  async function addStack() {
    if (!newStack.trim()) return
    await onSaveCliente({ stack: [...(cliente.stack || []), newStack.trim()] })
    setNewStack('')
  }
  async function removeStack(s: string) { await onSaveCliente({ stack: (cliente.stack || []).filter(x => x !== s) }) }
  async function addLink() {
    if (!newLink.label.trim() || !newLink.url.trim()) return
    const updated = { ...(cliente.links || {}), [newLink.label.trim()]: newLink.url.trim() }
    await onSaveCliente({ links: updated }); setNewLink({ label: '', url: '' })
  }
  async function removeLink(k: string) {
    const updated = { ...(cliente.links || {}) }; delete updated[k]; await onSaveCliente({ links: updated })
  }
  async function addContato() {
    if (!newContact.nome.trim()) return; setSaving(true)
    await supabase.from('contatos').insert({ ...newContact, cliente_id: clienteId })
    setShowAdd(false); setNewC({ nome: '', cargo: '', email: '', telefone: '', is_primary: false })
    await onReload(); setSaving(false)
  }
  async function deleteContato(id: string) { await supabase.from('contatos').delete().eq('id', id); await onReload() }

  const links = Object.entries(cliente.links || {})

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

      {/* Dados gerais */}
      <div style={{ ...card, padding: 22 }}>
        <SectionTitle icon={Building2} label="Dados Gerais" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <EditableField label="Empresa" value={cliente.empresa} onSave={canEdit ? v => onSaveCliente({ empresa: v }) : undefined} />
          <EditableField label="Segmento" value={cliente.segmento || ''} onSave={canEdit ? v => onSaveCliente({ segmento: v || null }) : undefined} />
          <EditableField label="Anotações" value={cliente.anotacoes || ''} onSave={canEdit ? v => onSaveCliente({ anotacoes: v }) : undefined} multiline />
          <div style={{ display: 'flex', gap: 28, paddingTop: 8, borderTop: `1px solid ${GRAY5}` }}>
            <div>
              <div style={{ fontSize: 11, color: GRAY3, fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Lifetime</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: GRAY1, display: 'flex', alignItems: 'center', gap: 6 }}><Clock size={13} color={GRAY3} />{lt}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: GRAY3, fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Projetos ativos</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: GRAY1 }}>{projetos.filter(p => p.status === 'ativo').length}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Equipe interna */}
      <div style={{ ...card, padding: 22 }}>
        <SectionTitle icon={Users} label="Equipe" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <RoleSelect label="Gestor de Projetos" value={cliente.gestor_projetos} papel="gestor_projetos" usuarios={usuarios} canEdit={canEdit} onSave={v => onSaveCliente({ gestor_projetos: v })} />
          <RoleSelect label="Designer"           value={cliente.designer}        papel="designer"        usuarios={usuarios} canEdit={canEdit} onSave={v => onSaveCliente({ designer: v })} />
          <RoleSelect label="Analista de Mídia"  value={cliente.analista_midia}  papel="analista_midia"  usuarios={usuarios} canEdit={canEdit} onSave={v => onSaveCliente({ analista_midia: v })} />
        </div>
      </div>

      {/* Contatos */}
      <div style={{ ...card, padding: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: GRAY4, border: `1px solid ${GRAY5}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users size={13} color={GRAY2} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: GRAY1 }}>Contatos</span>
          </div>
          {canEdit && (
            <button onClick={() => setShowAdd(true)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 7, border: `1px solid ${GRAY5}`, background: WHITE, color: GRAY2, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
              <Plus size={11} /> Adicionar
            </button>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {contatos.length === 0 && <div style={{ fontSize: 13, color: GRAY3, textAlign: 'center', padding: '16px 0' }}>Nenhum contato cadastrado</div>}
          {contatos.map(c => (
            <div key={c.id} style={{ padding: '10px 12px', background: GRAY4, borderRadius: 9, border: `1px solid ${GRAY5}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#EFF6FF', border: `1px solid #BFDBFE`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: BLUE }}>{c.nome[0].toUpperCase()}</span>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: GRAY1, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {c.nome}
                    {c.is_primary && <span style={{ fontSize: 9, fontWeight: 700, color: '#92400E', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 4, padding: '1px 5px' }}>PRINCIPAL</span>}
                  </div>
                  <div style={{ fontSize: 11, color: GRAY3, marginTop: 2, display: 'flex', gap: 10 }}>
                    {c.cargo && <span>{c.cargo}</span>}
                    {c.telefone && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Phone size={9} />{c.telefone}</span>}
                    {c.email && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Mail size={9} />{c.email}</span>}
                  </div>
                </div>
              </div>
              {canEdit && (
                <button onClick={() => deleteContato(c.id)} style={{ padding: 5, border: 'none', background: 'transparent', cursor: 'pointer', color: GRAY3 }}
                  onMouseEnter={e => (e.currentTarget.style.color = R)} onMouseLeave={e => (e.currentTarget.style.color = GRAY3)}>
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
        {showAddContact && (
          <div style={{ marginTop: 12, padding: 14, background: GRAY4, borderRadius: 9, border: `1px solid ${GRAY5}` }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              {[{ k: 'nome', p: 'Nome *' }, { k: 'cargo', p: 'Cargo' }, { k: 'email', p: 'Email' }, { k: 'telefone', p: 'Telefone' }].map(f => (
                <input key={f.k} value={(newContact as any)[f.k]} onChange={e => setNewC(p => ({ ...p, [f.k]: e.target.value }))} placeholder={f.p} style={{ padding: '7px 10px', background: WHITE, border: `1px solid ${GRAY5}`, borderRadius: 7, color: GRAY1, fontSize: 12, outline: 'none' }} />
              ))}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: GRAY2, cursor: 'pointer', marginBottom: 10 }}>
              <input type="checkbox" checked={newContact.is_primary} onChange={e => setNewC(p => ({ ...p, is_primary: e.target.checked }))} /> Contato principal
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={addContato} disabled={!newContact.nome.trim()} style={btnPrimary(!newContact.nome.trim())}>Salvar</button>
              <button onClick={() => setShowAdd(false)} style={btnGhost}>Cancelar</button>
            </div>
          </div>
        )}
      </div>

      {/* Stack */}
      <div style={{ ...card, padding: 22 }}>
        <SectionTitle icon={Layers} label="Stack do Cliente" />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {(cliente.stack || []).map(s => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 20, fontSize: 12, fontWeight: 500, color: PURPLE }}>
              {s}
              {canEdit && (
                <button onClick={() => removeStack(s)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: PURPLE, padding: 0, display: 'flex' }}>
                  <X size={11} />
                </button>
              )}
            </div>
          ))}
          {canEdit && (
            <div style={{ display: 'flex', gap: 6 }}>
              <input value={newStack} onChange={e => setNewStack(e.target.value)} onKeyDown={e => e.key === 'Enter' && addStack()} placeholder="Adicionar ferramenta..." style={{ padding: '5px 12px', background: GRAY4, border: `1px solid ${GRAY5}`, borderRadius: 20, color: GRAY1, fontSize: 12, outline: 'none', width: 165 }} />
              <button onClick={addStack} disabled={!newStack.trim()} style={{ padding: '5px 12px', borderRadius: 20, border: 'none', background: newStack.trim() ? PURPLE : GRAY5, color: newStack.trim() ? WHITE : GRAY3, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>+</button>
            </div>
          )}
        </div>
      </div>

      {/* Links */}
      <div style={{ ...card, padding: 22 }}>
        <SectionTitle icon={Link2} label="Links e Recursos" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {links.map(([label, url]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: GRAY4, borderRadius: 8, border: `1px solid ${GRAY5}` }}>
              <Globe size={12} color={GRAY3} />
              <span style={{ fontSize: 12, fontWeight: 600, color: GRAY2, minWidth: 80 }}>{label}</span>
              <a href={url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, fontSize: 12, color: BLUE, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>{url}</a>
              <a href={url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}><ExternalLink size={11} color={GRAY3} /></a>
              {canEdit && (
                <button onClick={() => removeLink(label)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: GRAY3, display: 'flex', padding: 2 }}
                  onMouseEnter={e => (e.currentTarget.style.color = R)} onMouseLeave={e => (e.currentTarget.style.color = GRAY3)}>
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          ))}
          {canEdit && (
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <input value={newLink.label} onChange={e => setNewLink(p => ({ ...p, label: e.target.value }))} placeholder="Label (ex: Drive)" style={{ width: 110, padding: '7px 10px', background: GRAY4, border: `1px solid ${GRAY5}`, borderRadius: 7, color: GRAY1, fontSize: 12, outline: 'none' }} />
              <input value={newLink.url} onChange={e => setNewLink(p => ({ ...p, url: e.target.value }))} onKeyDown={e => e.key === 'Enter' && addLink()} placeholder="URL" style={{ flex: 1, padding: '7px 10px', background: GRAY4, border: `1px solid ${GRAY5}`, borderRadius: 7, color: GRAY1, fontSize: 12, outline: 'none' }} />
              <button onClick={addLink} disabled={!newLink.label.trim() || !newLink.url.trim()} style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: BLUE, color: WHITE, fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: (!newLink.label.trim() || !newLink.url.trim()) ? 0.4 : 1 }}>+</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Catálogo de serviços por tipo ─────────────────────────────────────────────
const CATALOGO: Record<Projeto['tipo'], { key: string; label: string; etapas: string[] }[]> = {
  saber: [
    {
      key: 'diagnostico_planejamento',
      label: 'Diagnóstico e Planejamento de Marketing e Vendas',
      etapas: [
        'Formulário de Kickoff',
        'Assessment e Onboarding',
        'Pesquisa de Mercado',
        'Diagnóstico de Marketing',
        'Diagnóstico de Vendas',
        'Estratégias de Marketing',
      ],
    },
  ],
  ter: [],
  executar: [],
}

// Serviços disponíveis para projetos Executar
const SERVICOS_EXECUTAR: { key: string; label: string; temVolume: boolean }[] = [
  { key: 'marketplace',         label: 'MarketPlace',             temVolume: true  },
  { key: 'manutencao_crm',      label: 'Manutenção CRM',          temVolume: false },
  { key: 'seo',                 label: 'SEO',                     temVolume: false },
  { key: 'manutencao_lp',       label: 'Manutenção LP',           temVolume: false },
  { key: 'manutencao_bi',       label: 'Manutenção BI',           temVolume: false },
  { key: 'manutencao_site',     label: 'Manutenção Site',         temVolume: false },
  { key: 'webdesign',           label: 'WebDesign',               temVolume: false },
  { key: 'sales_enablement',    label: 'Sales Enablement',        temVolume: false },
  { key: 'bi',                  label: 'BI',                      temVolume: false },
  { key: 'social_media',        label: 'Social Media',            temVolume: true  },
  { key: 'midia_paga',          label: 'Mídia Paga',              temVolume: true  },
  { key: 'design_grafico',      label: 'Design Gráfico',          temVolume: true  },
  { key: 'redacao_publicitaria',label: 'Redação Publicitária',    temVolume: true  },
  { key: 'crm',                 label: 'CRM',                     temVolume: true  },
]

function getEtapas(tipo: Projeto['tipo'], servico: string | null): string[] {
  if (!servico) return []
  return CATALOGO[tipo]?.find(s => s.key === servico)?.etapas ?? []
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: PROJETOS
// ══════════════════════════════════════════════════════════════════════════════
function fmtBRL(val: string): string {
  if (!val) return ''
  const n = parseFloat(val)
  if (isNaN(n)) return ''
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function parseCurrInput(raw: string): string {
  return raw.replace(/[^\d,]/g, '').replace(',', '.')
}

function TabProjetos({ projetos, clienteId, onReload, canEdit }: { projetos: Projeto[]; clienteId: string; onReload: () => void; canEdit: boolean }) {
  const emptyForm = { nome: '', tipo: 'saber' as Projeto['tipo'], servico: '', valor_tipo: 'mensalidade' as Projeto['valor_tipo'], valor: '', investimento_midia: '', data_inicio: '', data_fim: '', escopo: '' }
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [servicosSel, setServicosSel] = useState<{ key: string; volume?: string }[]>([])
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState(emptyForm)
  const [editServicosSel, setEditServicosSel] = useState<{ key: string; volume?: string }[]>([])
  const [currFocus, setCurrFocus] = useState<string | null>(null)

  function toggleServico(key: string) {
    setServicosSel(prev =>
      prev.find(s => s.key === key) ? prev.filter(s => s.key !== key) : [...prev, { key }]
    )
  }
  function setVolume(key: string, volume: string) {
    setServicosSel(prev => prev.map(s => s.key === key ? { ...s, volume: volume || undefined } : s))
  }
  function toggleEditServico(key: string) {
    setEditServicosSel(prev =>
      prev.find(s => s.key === key) ? prev.filter(s => s.key !== key) : [...prev, { key }]
    )
  }
  function setEditVolume(key: string, volume: string) {
    setEditServicosSel(prev => prev.map(s => s.key === key ? { ...s, volume: volume || undefined } : s))
  }
  function startEdit(p: Projeto) {
    setEditForm({
      nome: p.nome, tipo: p.tipo, servico: p.servico || '',
      valor_tipo: p.valor_tipo, valor: String(p.valor),
      investimento_midia: p.investimento_midia != null ? String(p.investimento_midia) : '',
      data_inicio: p.data_inicio || '', data_fim: p.data_fim || '', escopo: p.escopo || '',
    })
    setEditServicosSel(p.servicos_executar || [])
    setEditId(p.id)
  }

  const TIPO: Record<Projeto['tipo'], { color: string; bg: string; border: string; label: string }> = {
    saber:    { color: BLUE,   bg: '#EFF6FF', border: '#BFDBFE', label: 'Saber' },
    ter:      { color: PURPLE, bg: '#F5F3FF', border: '#DDD6FE', label: 'Ter' },
    executar: { color: '#065F46', bg: '#ECFDF5', border: '#A7F3D0', label: 'Executar' },
  }
  const STATUS: Record<Projeto['status'], { color: string; bg: string; border: string; label: string }> = {
    ativo:     { color: '#065F46', bg: '#D1FAE5', border: '#A7F3D0', label: 'Ativo' },
    pausado:   { color: '#92400E', bg: '#FEF3C7', border: '#FDE68A', label: 'Pausado' },
    encerrado: { color: '#6B7280', bg: GRAY4,     border: GRAY5,     label: 'Encerrado' },
  }

  async function save() {
    if (!form.nome.trim()) return; setSaving(true)
    const etapas = getEtapas(form.tipo, form.servico || null)
    await supabase.from('projetos').insert({
      nome: form.nome, tipo: form.tipo, valor_tipo: form.valor_tipo,
      valor: parseFloat(form.valor) || 0, cliente_id: clienteId,
      data_inicio: form.data_inicio || null, data_fim: form.data_fim || null,
      escopo: form.escopo,
      servico: form.servico || null,
      etapa_atual: etapas[0] ?? null,
      servicos_executar: form.tipo === 'executar' && servicosSel.length > 0 ? servicosSel : null,
      investimento_midia: form.tipo === 'executar' && form.investimento_midia ? parseFloat(form.investimento_midia) : null,
    })
    setShowNew(false)
    setForm({ nome: '', tipo: 'saber', servico: '', valor_tipo: 'mensalidade', valor: '', investimento_midia: '', data_inicio: '', data_fim: '', escopo: '' })
    setServicosSel([])
    await onReload(); setSaving(false)
  }
  async function updateProj() {
    if (!editForm.nome.trim() || !editId) return
    setSaving(true)
    await supabase.from('projetos').update({
      nome: editForm.nome, tipo: editForm.tipo, valor_tipo: editForm.valor_tipo,
      valor: parseFloat(editForm.valor) || 0,
      data_inicio: editForm.data_inicio || null, data_fim: editForm.data_fim || null,
      escopo: editForm.escopo,
      servico: editForm.servico || null,
      servicos_executar: editForm.tipo === 'executar' && editServicosSel.length > 0 ? editServicosSel : null,
      investimento_midia: editForm.tipo === 'executar' && editForm.investimento_midia ? parseFloat(editForm.investimento_midia) : null,
      updated_at: new Date().toISOString(),
    }).eq('id', editId)
    setEditId(null)
    await onReload(); setSaving(false)
  }
  async function toggleStatus(p: Projeto) {
    const next = p.status === 'ativo' ? 'pausado' : p.status === 'pausado' ? 'encerrado' : 'ativo'
    await supabase.from('projetos').update({ status: next }).eq('id', p.id); await onReload()
  }
  async function deleteProj(id: string) { await supabase.from('projetos').delete().eq('id', id); await onReload() }
  async function setEtapa(id: string, etapa: string) {
    await supabase.from('projetos').update({ etapa_atual: etapa }).eq('id', id); await onReload()
  }

  const totalMRR     = projetos.filter(p => p.valor_tipo === 'mensalidade' && p.status === 'ativo').reduce((s, p) => s + p.valor, 0)
  const totalPontual = projetos.filter(p => p.valor_tipo === 'pontual' && p.status === 'ativo').reduce((s, p) => s + p.valor, 0)
  const servicosDoTipo = CATALOGO[form.tipo] ?? []

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          {totalMRR > 0 && (
            <div style={{ padding: '8px 16px', background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 9 }}>
              <span style={{ fontSize: 11, color: GRAY3 }}>MRR </span>
              <span style={{ fontSize: 15, fontWeight: 800, color: '#065F46' }}>{fmt(totalMRR)}/mês</span>
            </div>
          )}
          {totalPontual > 0 && (
            <div style={{ padding: '8px 16px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 9 }}>
              <span style={{ fontSize: 11, color: GRAY3 }}>Pontual </span>
              <span style={{ fontSize: 15, fontWeight: 800, color: BLUE }}>{fmt(totalPontual)}</span>
            </div>
          )}
        </div>
        {canEdit && (
          <button onClick={() => setShowNew(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 9, border: 'none', background: R, color: WHITE, fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: `0 2px 8px ${R}40` }}>
            <Plus size={13} /> Novo Projeto
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
        {projetos.map(p => {
          const t = TIPO[p.tipo], st = STATUS[p.status]
          const etapas = getEtapas(p.tipo, p.servico)
          const etapaIdx = etapas.indexOf(p.etapa_atual ?? '')
          const servicoLabel = CATALOGO[p.tipo]?.find(s => s.key === p.servico)?.label
          const isEditing = editId === p.id
          return (
            <div key={p.id} style={{ ...card, overflow: 'hidden' }}>
              <div style={{ height: 3, background: `linear-gradient(90deg, ${t.color}, ${t.color}66)` }} />
              <div style={{ padding: '16px 18px' }}>
                {isEditing ? (
                  /* ── Edit form ── */
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: GRAY1, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Edit2 size={13} color={GRAY2} /> Editar Projeto
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div style={{ gridColumn: '1/-1' }}>
                        <label style={{ fontSize: 11, color: GRAY3, display: 'block', marginBottom: 4, fontWeight: 600 }}>Nome do projeto *</label>
                        <input value={editForm.nome} onChange={e => setEditForm(f => ({ ...f, nome: e.target.value }))} style={input14} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: GRAY3, display: 'block', marginBottom: 4, fontWeight: 600 }}>Tipo</label>
                        <select value={editForm.tipo} onChange={e => setEditForm(f => ({ ...f, tipo: e.target.value as Projeto['tipo'], servico: '' }))} style={{ ...input14 }}>
                          <option value="saber">Saber</option><option value="ter">Ter</option><option value="executar">Executar</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: GRAY3, display: 'block', marginBottom: 4, fontWeight: 600 }}>Cobrança</label>
                        <select value={editForm.valor_tipo} onChange={e => setEditForm(f => ({ ...f, valor_tipo: e.target.value as Projeto['valor_tipo'] }))} style={{ ...input14 }}>
                          <option value="mensalidade">Mensalidade</option><option value="pontual">Pontual</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: GRAY3, display: 'block', marginBottom: 4, fontWeight: 600 }}>Valor (R$)</label>
                        <input type="text" inputMode="numeric"
                          value={currFocus === 'edit_valor' ? editForm.valor : fmtBRL(editForm.valor)}
                          onChange={e => setEditForm(f => ({ ...f, valor: parseCurrInput(e.target.value) }))}
                          onFocus={() => setCurrFocus('edit_valor')}
                          onBlur={() => setCurrFocus(null)}
                          placeholder="0,00" style={input14} />
                      </div>
                      {editForm.tipo === 'executar' && (
                        <div>
                          <label style={{ fontSize: 11, color: GRAY3, display: 'block', marginBottom: 4, fontWeight: 600 }}>Verba Google/Meta Ads (R$/mês)</label>
                          <input type="text" inputMode="numeric"
                            value={currFocus === 'edit_midia' ? editForm.investimento_midia : fmtBRL(editForm.investimento_midia)}
                            onChange={e => setEditForm(f => ({ ...f, investimento_midia: parseCurrInput(e.target.value) }))}
                            onFocus={() => setCurrFocus('edit_midia')}
                            onBlur={() => setCurrFocus(null)}
                            placeholder="0,00" style={input14} />
                        </div>
                      )}
                      <div>
                        <label style={{ fontSize: 11, color: GRAY3, display: 'block', marginBottom: 4, fontWeight: 600 }}>Data de início</label>
                        <input type="date" value={editForm.data_inicio} onChange={e => setEditForm(f => ({ ...f, data_inicio: e.target.value }))} style={input14} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: GRAY3, display: 'block', marginBottom: 4, fontWeight: 600 }}>Data de fim (opcional)</label>
                        <input type="date" value={editForm.data_fim} onChange={e => setEditForm(f => ({ ...f, data_fim: e.target.value }))} style={input14} />
                      </div>
                      {editForm.tipo === 'executar' && (
                        <div style={{ gridColumn: '1/-1' }}>
                          <label style={{ fontSize: 11, color: GRAY3, display: 'block', marginBottom: 8, fontWeight: 600 }}>
                            Serviços contratados {editServicosSel.length > 0 && <span style={{ color: '#065F46', background: '#D1FAE5', padding: '1px 7px', borderRadius: 10, marginLeft: 6 }}>{editServicosSel.length} selecionado{editServicosSel.length !== 1 ? 's' : ''}</span>}
                          </label>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                            {SERVICOS_EXECUTAR.map(s => {
                              const sel = editServicosSel.find(x => x.key === s.key)
                              const checked = !!sel
                              return (
                                <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, border: `1px solid ${checked ? '#A7F3D0' : GRAY5}`, background: checked ? '#F0FDF4' : GRAY4, transition: 'all .15s' }}>
                                  <input type="checkbox" checked={checked} onChange={() => toggleEditServico(s.key)} style={{ width: 15, height: 15, accentColor: '#065F46', cursor: 'pointer', flexShrink: 0 }} />
                                  <span style={{ fontSize: 12, color: checked ? '#065F46' : GRAY1, fontWeight: checked ? 600 : 400, flex: 1 }}>{s.label}{s.temVolume && <span style={{ color: GRAY3 }}> *</span>}</span>
                                  {checked && s.temVolume && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} onClick={e => e.stopPropagation()}>
                                      <input type="text" placeholder="Volume" value={sel?.volume ?? ''} onChange={e => setEditVolume(s.key, e.target.value)} style={{ width: 80, padding: '4px 8px', borderRadius: 5, border: `1px solid #A7F3D0`, background: WHITE, fontSize: 12, color: GRAY1, outline: 'none' }} />
                                      <span style={{ fontSize: 11, color: GRAY3, whiteSpace: 'nowrap' }}>/mês</span>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                      <div style={{ gridColumn: '1/-1' }}>
                        <label style={{ fontSize: 11, color: GRAY3, display: 'block', marginBottom: 4, fontWeight: 600 }}>Escopo / Descrição</label>
                        <textarea value={editForm.escopo} onChange={e => setEditForm(f => ({ ...f, escopo: e.target.value }))} rows={2} style={{ ...input14, resize: 'vertical', fontFamily: 'inherit' }} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                      <button onClick={updateProj} disabled={!editForm.nome.trim() || saving} style={btnPrimary(!editForm.nome.trim() || saving)}>{saving ? 'Salvando...' : 'Salvar'}</button>
                      <button onClick={() => setEditId(null)} style={btnGhost}>Cancelar</button>
                    </div>
                  </div>
                ) : (
                  /* ── View mode ── */
                  <>
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 5 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: t.color, background: t.bg, border: `1px solid ${t.border}`, borderRadius: 5, padding: '2px 8px' }}>{t.label.toUpperCase()}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, color: st.color, background: st.bg, border: `1px solid ${st.border}`, borderRadius: 5, padding: '2px 8px' }}>{st.label.toUpperCase()}</span>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: GRAY1 }}>{p.nome}</div>
                        {servicoLabel && <div style={{ fontSize: 11, color: GRAY2, marginTop: 3 }}>{servicoLabel}</div>}
                        {p.tipo === 'executar' && p.servicos_executar && p.servicos_executar.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                            {p.servicos_executar.map(s => {
                              const def = SERVICOS_EXECUTAR.find(x => x.key === s.key)
                              if (!def) return null
                              return (
                                <span key={s.key} style={{ fontSize: 10, fontWeight: 600, color: '#065F46', background: '#D1FAE5', border: '1px solid #A7F3D0', borderRadius: 5, padding: '2px 7px', whiteSpace: 'nowrap' }}>
                                  {def.label}{s.volume ? ` · ${s.volume}/mês` : ''}
                                </span>
                              )
                            })}
                          </div>
                        )}
                      </div>
                      {canEdit && (
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <button onClick={() => toggleStatus(p)} style={{ padding: '4px 9px', borderRadius: 6, border: `1px solid ${GRAY5}`, background: WHITE, color: GRAY2, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>
                            {p.status === 'ativo' ? 'Pausar' : p.status === 'pausado' ? 'Encerrar' : 'Reativar'}
                          </button>
                          <button onClick={() => startEdit(p)} style={{ padding: '5px 7px', borderRadius: 6, border: `1px solid ${GRAY5}`, background: WHITE, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                            <Edit2 size={12} color={GRAY3} />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Valor + data */}
                    <div style={{ display: 'grid', gridTemplateColumns: p.tipo === 'executar' && p.investimento_midia ? '1fr 1fr 1fr' : '1fr 1fr', gap: 10, marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: 10, color: GRAY3, fontWeight: 600, marginBottom: 2 }}>VALOR</div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: t.color }}>
                          {fmt(p.valor)}{p.valor_tipo === 'mensalidade' ? <span style={{ fontSize: 11, color: GRAY3, fontWeight: 400 }}>/mês</span> : <span style={{ fontSize: 11, color: GRAY3, fontWeight: 400 }}> pontual</span>}
                        </div>
                      </div>
                      {p.tipo === 'executar' && p.investimento_midia != null && (
                        <div>
                          <div style={{ fontSize: 10, color: GRAY3, fontWeight: 600, marginBottom: 2 }}>VERBA GOOGLE/META</div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: BLUE }}>
                            {fmt(p.investimento_midia)}<span style={{ fontSize: 11, color: GRAY3, fontWeight: 400 }}> /mês</span>
                          </div>
                        </div>
                      )}
                      <div>
                        <div style={{ fontSize: 10, color: GRAY3, fontWeight: 600, marginBottom: 2 }}>INÍCIO</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: GRAY1, display: 'flex', alignItems: 'center', gap: 4 }}><Calendar size={11} color={GRAY3} />{fmtDate(p.data_inicio)}</div>
                      </div>
                    </div>

                    {/* Kanban de etapas */}
                    {etapas.length > 0 && (
                      <div style={{ paddingTop: 12, borderTop: `1px solid ${GRAY5}` }}>
                        <div style={{ fontSize: 10, color: GRAY3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Etapa atual</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {etapas.map((etapa, idx) => {
                            const isDone    = idx < etapaIdx
                            const isCurrent = idx === etapaIdx
                            const color     = isCurrent ? t.color : isDone ? '#10B981' : GRAY3
                            const bg        = isCurrent ? `${t.color}12` : isDone ? '#F0FDF4' : GRAY4
                            const border    = isCurrent ? `${t.color}40` : isDone ? '#BBF7D0' : GRAY5
                            return (
                              <button key={etapa} onClick={canEdit ? () => setEtapa(p.id, etapa) : undefined}
                                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 7, border: `1px solid ${border}`, background: bg, cursor: canEdit ? 'pointer' : 'default', textAlign: 'left', width: '100%', transition: 'all .15s' }}
                                onMouseEnter={canEdit ? e => { if (!isCurrent) (e.currentTarget as HTMLElement).style.borderColor = t.color } : undefined}
                                onMouseLeave={canEdit ? e => { (e.currentTarget as HTMLElement).style.borderColor = border } : undefined}
                              >
                                <div style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, background: isCurrent ? t.color : isDone ? '#10B981' : GRAY5, border: `2px solid ${isCurrent ? t.color : isDone ? '#10B981' : GRAY3}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  {isDone && <Check size={9} color={WHITE} strokeWidth={3} />}
                                  {isCurrent && <div style={{ width: 6, height: 6, borderRadius: '50%', background: WHITE }} />}
                                </div>
                                <span style={{ fontSize: 12, fontWeight: isCurrent ? 700 : 500, color }}>{etapa}</span>
                                {isCurrent && <span style={{ marginLeft: 'auto', fontSize: 10, color: t.color, fontWeight: 700 }}>EM ANDAMENTO</span>}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {p.escopo && <div style={{ fontSize: 12, color: GRAY2, lineHeight: 1.55, padding: '10px 0', borderTop: `1px solid ${GRAY5}`, marginTop: etapas.length > 0 ? 12 : 0 }}>{p.escopo}</div>}
                    {canEdit && (
                      <button onClick={() => deleteProj(p.id)} style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 4, padding: '4px 0', border: 'none', background: 'transparent', color: GRAY3, fontSize: 11, cursor: 'pointer' }}
                        onMouseEnter={e => (e.currentTarget.style.color = R)} onMouseLeave={e => (e.currentTarget.style.color = GRAY3)}>
                        <Trash2 size={11} /> Excluir projeto
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {projetos.length === 0 && !showNew && (
        <div style={{ ...card, padding: '48px 0', textAlign: 'center' }}>
          <Layers size={32} color={GRAY3} style={{ marginBottom: 12, opacity: 0.5 }} />
          <div style={{ fontSize: 14, color: GRAY2 }}>Nenhum projeto cadastrado</div>
        </div>
      )}

      {showNew && canEdit && (
        <div style={{ ...card, padding: 22, marginTop: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: GRAY1, marginBottom: 16 }}>Novo Projeto</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ fontSize: 11, color: GRAY3, display: 'block', marginBottom: 4, fontWeight: 600 }}>Nome do projeto *</label>
              <input value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} placeholder="Ex: Saber Q2 2025" style={input14} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: GRAY3, display: 'block', marginBottom: 4, fontWeight: 600 }}>Tipo</label>
              <select value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value as Projeto['tipo'], servico: '' }))} style={{ ...input14 }}>
                <option value="saber">Saber</option><option value="ter">Ter</option><option value="executar">Executar</option>
              </select>
            </div>
            {servicosDoTipo.length > 0 && (
              <div>
                <label style={{ fontSize: 11, color: GRAY3, display: 'block', marginBottom: 4, fontWeight: 600 }}>Serviço</label>
                <select value={form.servico} onChange={e => setForm(p => ({ ...p, servico: e.target.value }))} style={{ ...input14 }}>
                  <option value="">Selecione um serviço...</option>
                  {servicosDoTipo.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
            )}
            {form.tipo === 'executar' && (
              <div style={{ gridColumn: '1/-1' }}>
                <label style={{ fontSize: 11, color: GRAY3, display: 'block', marginBottom: 8, fontWeight: 600 }}>
                  Serviços contratados {servicosSel.length > 0 && <span style={{ color: '#065F46', background: '#D1FAE5', padding: '1px 7px', borderRadius: 10, marginLeft: 6 }}>{servicosSel.length} selecionado{servicosSel.length !== 1 ? 's' : ''}</span>}
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {SERVICOS_EXECUTAR.map(s => {
                    const sel = servicosSel.find(x => x.key === s.key)
                    const checked = !!sel
                    return (
                      <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, border: `1px solid ${checked ? '#A7F3D0' : GRAY5}`, background: checked ? '#F0FDF4' : GRAY4, transition: 'all .15s' }}>
                        <input type="checkbox" checked={checked} onChange={() => toggleServico(s.key)}
                          style={{ width: 15, height: 15, accentColor: '#065F46', cursor: 'pointer', flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: checked ? '#065F46' : GRAY1, fontWeight: checked ? 600 : 400, flex: 1 }}>
                          {s.label}{s.temVolume && <span style={{ color: GRAY3 }}> *</span>}
                        </span>
                        {checked && s.temVolume && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} onClick={e => e.stopPropagation()}>
                            <input
                              type="text" placeholder="Volume"
                              value={sel?.volume ?? ''}
                              onChange={e => setVolume(s.key, e.target.value)}
                              style={{ width: 80, padding: '4px 8px', borderRadius: 5, border: `1px solid #A7F3D0`, background: WHITE, fontSize: 12, color: GRAY1, outline: 'none' }}
                            />
                            <span style={{ fontSize: 11, color: GRAY3, whiteSpace: 'nowrap' }}>/mês</span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                <div style={{ fontSize: 10, color: GRAY3, marginTop: 6 }}>* Informe o volume contratado para os serviços marcados</div>
              </div>
            )}
            <div>
              <label style={{ fontSize: 11, color: GRAY3, display: 'block', marginBottom: 4, fontWeight: 600 }}>Cobrança</label>
              <select value={form.valor_tipo} onChange={e => setForm(p => ({ ...p, valor_tipo: e.target.value as Projeto['valor_tipo'] }))} style={{ ...input14 }}>
                <option value="mensalidade">Mensalidade</option><option value="pontual">Pontual</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: GRAY3, display: 'block', marginBottom: 4, fontWeight: 600 }}>Valor (R$)</label>
              <input type="text" inputMode="numeric"
                value={currFocus === 'novo_valor' ? form.valor : fmtBRL(form.valor)}
                onChange={e => setForm(p => ({ ...p, valor: parseCurrInput(e.target.value) }))}
                onFocus={() => setCurrFocus('novo_valor')}
                onBlur={() => setCurrFocus(null)}
                placeholder="0,00" style={input14} />
            </div>
            {form.tipo === 'executar' && (
              <div>
                <label style={{ fontSize: 11, color: GRAY3, display: 'block', marginBottom: 4, fontWeight: 600 }}>Verba Google/Meta Ads (R$/mês)</label>
                <input type="text" inputMode="numeric"
                  value={currFocus === 'novo_midia' ? form.investimento_midia : fmtBRL(form.investimento_midia)}
                  onChange={e => setForm(p => ({ ...p, investimento_midia: parseCurrInput(e.target.value) }))}
                  onFocus={() => setCurrFocus('novo_midia')}
                  onBlur={() => setCurrFocus(null)}
                  placeholder="0,00" style={input14} />
              </div>
            )}
            <div>
              <label style={{ fontSize: 11, color: GRAY3, display: 'block', marginBottom: 4, fontWeight: 600 }}>Data de início</label>
              <input type="date" value={form.data_inicio} onChange={e => setForm(p => ({ ...p, data_inicio: e.target.value }))} style={input14} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: GRAY3, display: 'block', marginBottom: 4, fontWeight: 600 }}>Data de fim (opcional)</label>
              <input type="date" value={form.data_fim} onChange={e => setForm(p => ({ ...p, data_fim: e.target.value }))} style={input14} />
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ fontSize: 11, color: GRAY3, display: 'block', marginBottom: 4, fontWeight: 600 }}>Escopo / Descrição</label>
              <textarea value={form.escopo} onChange={e => setForm(p => ({ ...p, escopo: e.target.value }))} rows={3} placeholder="Descreva o escopo..." style={{ ...input14, resize: 'vertical', fontFamily: 'inherit' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={save} disabled={!form.nome.trim() || saving} style={btnPrimary(!form.nome.trim() || saving)}>{saving ? 'Salvando...' : 'Salvar Projeto'}</button>
            <button onClick={() => setShowNew(false)} style={btnGhost}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: HEALTH SCORE
// ══════════════════════════════════════════════════════════════════════════════
// ── Health Score checklist definitions ────────────────────────────────────────
const HS_TRAFEGO_ITEMS = [
  'Growthpack atualizado: indicadores (metas, funil, verba) preenchidos e revisados?',
  'Campanhas subiram corretamente: lançadas conforme o combinado na Sprint?',
  'Campanhas pausadas corretamente: ações especiais e temporárias pausadas no prazo?',
  'Verba de mídia controlada: gasto alinhado com o planejado, sem estouros?',
  'Público e criativos corretos: segmentações e anúncios conferem com a estratégia?',
  'UTMs mapeadas: campanhas têm rastreamento correto?',
  'Otimização e acompanhamento: houve acompanhamento ativo com ajustes relevantes?',
  'Regras de investimento: limites e parâmetros operacionais aplicados?',
]
const HS_ENTREGAS_ITEMS = [
  'Backlog (tarefas do mês) projetado, visível e atualizado?',
  'As entregas do mês foram concluídas dentro do SLA acordado?',
  'Itens planejados na Sprint/Sprint Planning executados conforme combinado?',
  'Solicitações do cliente feitas durante a semana atendidas no prazo?',
  'Não houve reclamações do cliente quanto ao prazo ou atrasos recorrentes?',
]
const HS_QUALIDADE_ITEMS = [
  'O CSAT mais recente está disponível e registrado?',
  'Houve solicitações de refação por parte do cliente na última semana?',
  'As refações foram ajustes mínimos (não estruturais)?',
  'UCM e DCC utilizados nas entregas?',
  'Coordenador validou se a entrega está aderente ao briefing e padrões?',
  'Cliente demonstrou satisfação nas interações sobre entregas recentes?',
]
const HS_RELACIONAMENTO_ITEMS = [
  'Houve reunião 1:1 ou contato direto do coordenador esta semana?',
  'O cliente demonstrou engajamento, alinhamento e otimismo?',
  'Não foram identificados sinais de insatisfação ou reclamações recorrentes?',
  'O time percebe que o stakeholder principal entende o que é entregue?',
  'Nenhuma demanda foi levada à ouvidoria ou liderança nesta semana?',
]

function calcWeightedScore(resultado: number, trafego: number, entregas: number, qualidade: number, relacionamento: number) {
  return (resultado * 10 + trafego * 7 + entregas * 5 + qualidade * 5 + relacionamento * 3) / 30
}
function checklistScore(checks: boolean[]) {
  if (!checks.length) return 0
  return (checks.filter(Boolean).length / checks.length) * 10
}

function ChecklistSection({ title, weight, items, checks, onToggle, expanded, onToggleExpand, score }: {
  title: string; weight: number; items: string[]; checks: boolean[]
  onToggle: (i: number) => void; expanded: boolean; onToggleExpand: () => void; score: number
}) {
  const sc = healthColor(score)
  const checked = checks.filter(Boolean).length
  return (
    <div style={{ border: `1px solid ${GRAY5}`, borderRadius: 10, overflow: 'hidden' }}>
      <button onClick={onToggleExpand} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: GRAY4, border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: GRAY1 }}>{title}</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: GRAY3, background: GRAY5, padding: '2px 7px', borderRadius: 20 }}>Peso {weight} pts</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: GRAY3 }}>{checked}/{items.length}</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: sc, minWidth: 32, textAlign: 'right' }}>{score.toFixed(1)}</span>
          <ChevronDown size={14} color={GRAY3} style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: '0.2s' }} />
        </div>
      </button>
      {expanded && (
        <div style={{ padding: '10px 16px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((item, i) => (
            <label key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '5px 0' }}>
              <input type="checkbox" checked={checks[i] ?? false} onChange={() => onToggle(i)}
                style={{ marginTop: 2, accentColor: GREEN, width: 15, height: 15, flexShrink: 0, cursor: 'pointer' }} />
              <span style={{ fontSize: 12, color: checks[i] ? GRAY2 : GRAY1, lineHeight: 1.4, textDecoration: checks[i] ? 'line-through' : 'none' }}>{item}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

function TabHealthScore({ entries, metas, clienteId, onReload, canEdit }: { entries: HealthScoreEntry[]; metas: MetaSemanal[]; clienteId: string; onReload: () => void; canEdit: boolean }) {
  const semanaAtual = startOfWeek()
  const jaTemSemana = entries.some(e => e.semana === semanaAtual)

  // Resultado calculado automaticamente a partir das metas da semana atual
  const metasSemana = metas.filter(m => m.semana === semanaAtual && m.valor_meta && m.valor_realizado !== null)
  const resultado = useMemo(() => {
    if (!metasSemana.length) return 0
    const avg = metasSemana.reduce((acc, m) => acc + (m.valor_realizado! / m.valor_meta!) * 100, 0) / metasSemana.length
    return Math.min(10, parseFloat((avg / 10).toFixed(2)))
  }, [metasSemana])

  const initChecks = (n: number) => Array(n).fill(false)
  const [trafegoChecks,      setTrafegoChecks]      = useState<boolean[]>(initChecks(HS_TRAFEGO_ITEMS.length))
  const [entregasChecks,     setEntregasChecks]     = useState<boolean[]>(initChecks(HS_ENTREGAS_ITEMS.length))
  const [qualidadeChecks,    setQualidadeChecks]    = useState<boolean[]>(initChecks(HS_QUALIDADE_ITEMS.length))
  const [relacionChecks,     setRelacionChecks]     = useState<boolean[]>(initChecks(HS_RELACIONAMENTO_ITEMS.length))
  const [observacoes,        setObservacoes]        = useState('')
  const [saving,             setSaving]             = useState(false)
  const [showForm,           setShowForm]           = useState(false)
  const [expandedSection,    setExpandedSection]    = useState<string | null>('trafego')

  const trafegoScore      = checklistScore(trafegoChecks)
  const entregasScore     = checklistScore(entregasChecks)
  const qualidadeScore    = checklistScore(qualidadeChecks)
  const relacionScore     = checklistScore(relacionChecks)
  const estScore          = calcWeightedScore(resultado, trafegoScore, entregasScore, qualidadeScore, relacionScore)

  function toggleCheck(setter: React.Dispatch<React.SetStateAction<boolean[]>>, i: number) {
    setter(prev => { const n = [...prev]; n[i] = !n[i]; return n })
  }

  async function saveHealth() {
    setSaving(true)
    const payload = {
      cliente_id: clienteId,
      semana: semanaAtual,
      // colunas smallint — arredondar para evitar erro de tipo
      resultado:          Math.round(resultado),
      trafego:            Math.round(trafegoScore),
      entregas_prazo:     Math.round(entregasScore),
      qualidade_entregas: Math.round(qualidadeScore),
      relacionamento:     Math.round(relacionScore),
      // score_total é GENERATED ALWAYS no banco — não enviar
      trafego_checklist:        trafegoChecks,
      entregas_checklist:       entregasChecks,
      qualidade_checklist:      qualidadeChecks,
      relacionamento_checklist: relacionChecks,
      observacoes,
    }
    const { error } = await supabase.from('health_score_entries').upsert(payload, { onConflict: 'cliente_id,semana' })
    if (error) {
      alert('Erro ao salvar health score: ' + error.message)
      setSaving(false)
      return
    }
    setShowForm(false); await onReload(); setSaving(false)
  }

  const latest    = entries[0]
  const score     = latest?.score_total ?? null
  const sc        = score !== null ? healthColor(score) : GRAY3
  const DIMS = [
    { key: 'resultado'          as const, label: 'Resultados' },
    { key: 'trafego'            as const, label: 'Tráfego' },
    { key: 'entregas_prazo'     as const, label: 'Entregas' },
    { key: 'qualidade_entregas' as const, label: 'Qualidade' },
    { key: 'relacionamento'     as const, label: 'Relacionamento' },
  ]
  const radarData = DIMS.map(d => ({ subject: d.label.split(' ')[0], value: latest ? (latest as any)[d.key] : 0, fullMark: 10 }))
  const chartData = [...entries].reverse().slice(-12).map(e => ({ semana: e.semana.slice(5).replace('-', '/'), score: Number(e.score_total.toFixed(1)) }))

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16, marginBottom: 16 }}>

        {/* Radar + score atual */}
        <div style={{ ...card, padding: 22 }}>
          <div style={{ textAlign: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: GRAY3, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 6 }}>Health Score Atual</div>
            <div style={{ fontSize: 56, fontWeight: 900, color: sc, lineHeight: 1 }}>{score !== null ? score.toFixed(1) : '—'}</div>
            <div style={{ fontSize: 12, color: GRAY3, marginTop: 4 }}>de 10.0</div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <RadarChart data={radarData}>
              <PolarGrid stroke={GRAY5} />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: GRAY3 }} />
              <Radar name="Score" dataKey="value" stroke={sc} fill={sc} fillOpacity={0.14} strokeWidth={2} />
            </RadarChart>
          </ResponsiveContainer>
          {latest && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8, paddingTop: 12, borderTop: `1px solid ${GRAY5}` }}>
              {DIMS.map(d => <ScoreBar key={d.key} label={d.label} value={(latest as any)[d.key]} />)}
            </div>
          )}
        </div>

        {/* Evolução */}
        <div style={{ ...card, padding: 22 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: GRAY1, marginBottom: 16 }}>Evolução — últimas 12 semanas</div>
          {chartData.length > 1 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid stroke={GRAY5} strokeDasharray="3 3" />
                <XAxis dataKey="semana" tick={{ fontSize: 10, fill: GRAY3 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 10]} tick={{ fontSize: 10, fill: GRAY3 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: WHITE, border: `1px solid ${GRAY5}`, borderRadius: 8, fontSize: 12, boxShadow: '0 4px 16px rgba(0,0,0,.1)' }} labelStyle={{ color: GRAY2 }} />
                <Line type="monotone" dataKey="score" stroke={GREEN} strokeWidth={2.5} dot={{ fill: GREEN, r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 220, color: GRAY3, fontSize: 13 }}>Registre pelo menos 2 semanas para ver a evolução</div>
          )}
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${GRAY5}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: GRAY3, letterSpacing: '0.07em', marginBottom: 10 }}>HISTÓRICO</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {entries.slice(0, 8).map(e => {
                const c = healthColor(e.score_total)
                return (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: GRAY4, borderRadius: 7 }}>
                    <span style={{ fontSize: 11, color: GRAY3, width: 80, flexShrink: 0 }}>{fmtDate(e.semana)}</span>
                    <div style={{ flex: 1, height: 5, background: GRAY5, borderRadius: 3 }}>
                      <div style={{ width: `${e.score_total * 10}%`, height: '100%', background: c, borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 800, color: c, width: 30, textAlign: 'right' }}>{Number(e.score_total).toFixed(1)}</span>
                    {e.observacoes && <span title={e.observacoes} style={{ cursor: 'help' }}><Info size={11} color={GRAY3} /></span>}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Registro semanal */}
      {canEdit && (
        <div style={{ ...card, padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showForm ? 20 : 0 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: GRAY1 }}>Registrar Health Score — Semana atual</div>
              <div style={{ fontSize: 12, color: GRAY3, marginTop: 2 }}>{jaTemSemana ? 'Já registrado. Registrar novamente irá sobrescrever.' : `Semana de ${fmtDate(semanaAtual)}`}</div>
            </div>
            <button onClick={() => setShowForm(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: `1px solid ${GRAY5}`, background: showForm ? GRAY4 : WHITE, color: GRAY1, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              <Plus size={13} /> {showForm ? 'Fechar' : jaTemSemana ? 'Atualizar' : 'Registrar'}
            </button>
          </div>

          {showForm && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Resultados — automático via metas */}
              <div style={{ border: `1px solid ${GRAY5}`, borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: GRAY4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: GRAY1, flex: 1 }}>Resultados</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: GRAY3, background: GRAY5, padding: '2px 7px', borderRadius: 20 }}>Peso 10 pts</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: metasSemana.length ? healthColor(resultado) : GRAY3, minWidth: 32, textAlign: 'right' }}>
                    {metasSemana.length ? resultado.toFixed(1) : '—'}
                  </span>
                </div>
                <div style={{ padding: '14px 16px' }}>
                  {metasSemana.length === 0 ? (
                    <div style={{ fontSize: 12, color: GRAY3, fontStyle: 'italic' }}>
                      Nenhuma meta com resultado registrado para esta semana. Preencha os resultados na aba <strong>Metas</strong> para calcular automaticamente.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {metasSemana.map(m => {
                        const pct = (m.valor_realizado! / m.valor_meta!) * 100
                        const c   = pct >= 100 ? GREEN : pct >= 50 ? YELLOW : R
                        return (
                          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 12, color: GRAY2, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.descricao}</span>
                            <div style={{ width: 80, height: 5, background: GRAY5, borderRadius: 3, flexShrink: 0 }}>
                              <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: c, borderRadius: 3 }} />
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 700, color: c, width: 38, textAlign: 'right', flexShrink: 0 }}>{pct.toFixed(0)}%</span>
                          </div>
                        )
                      })}
                      <div style={{ fontSize: 11, color: GRAY3, marginTop: 4 }}>
                        Média: {(metasSemana.reduce((a, m) => a + (m.valor_realizado! / m.valor_meta!) * 100, 0) / metasSemana.length).toFixed(1)}% → score {resultado.toFixed(1)}/10
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Tráfego */}
              <ChecklistSection
                title="Operação Tráfego" weight={7}
                items={HS_TRAFEGO_ITEMS} checks={trafegoChecks}
                onToggle={i => toggleCheck(setTrafegoChecks, i)}
                expanded={expandedSection === 'trafego'} onToggleExpand={() => setExpandedSection(p => p === 'trafego' ? null : 'trafego')}
                score={trafegoScore} />

              {/* Entregas no Prazo */}
              <ChecklistSection
                title="Entregas no Prazo" weight={5}
                items={HS_ENTREGAS_ITEMS} checks={entregasChecks}
                onToggle={i => toggleCheck(setEntregasChecks, i)}
                expanded={expandedSection === 'entregas'} onToggleExpand={() => setExpandedSection(p => p === 'entregas' ? null : 'entregas')}
                score={entregasScore} />

              {/* Qualidade */}
              <ChecklistSection
                title="Qualidade das Entregas" weight={5}
                items={HS_QUALIDADE_ITEMS} checks={qualidadeChecks}
                onToggle={i => toggleCheck(setQualidadeChecks, i)}
                expanded={expandedSection === 'qualidade'} onToggleExpand={() => setExpandedSection(p => p === 'qualidade' ? null : 'qualidade')}
                score={qualidadeScore} />

              {/* Relacionamento */}
              <ChecklistSection
                title="Relacionamento com o Cliente" weight={3}
                items={HS_RELACIONAMENTO_ITEMS} checks={relacionChecks}
                onToggle={i => toggleCheck(setRelacionChecks, i)}
                expanded={expandedSection === 'relacionamento'} onToggleExpand={() => setExpandedSection(p => p === 'relacionamento' ? null : 'relacionamento')}
                score={relacionScore} />

              {/* Score preview */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: GRAY4, borderRadius: 10, border: `1px solid ${GRAY5}` }}>
                <div>
                  <div style={{ fontSize: 13, color: GRAY2, fontWeight: 600 }}>Score total estimado</div>
                  <div style={{ fontSize: 11, color: GRAY3, marginTop: 2 }}>
                    Resultados×10 + Tráfego×7 + Entregas×5 + Qualidade×5 + Relacionamento×3 ÷ 30
                  </div>
                </div>
                <span style={{ fontSize: 32, fontWeight: 900, color: healthColor(estScore) }}>{estScore.toFixed(1)}</span>
              </div>

              <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)}
                placeholder="Observações da semana (opcional)..." rows={2}
                style={{ ...input14, resize: 'none', fontFamily: 'inherit' }} />
              <button onClick={saveHealth} disabled={saving} style={btnPrimary(saving)}>
                {saving ? 'Salvando...' : 'Salvar Registro'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: METAS SEMANAIS
// ══════════════════════════════════════════════════════════════════════════════
function TabMetas({ metas, projetos, clienteId, onReload, canEdit }: { metas: MetaSemanal[]; projetos: Projeto[]; clienteId: string; onReload: () => void; canEdit: boolean }) {
  const semanaAtual = startOfWeek()
  const [selectedWeek, setWeek] = useState(semanaAtual)
  const [showNew, setShowNew]   = useState(false)
  const [form, setForm]         = useState({ descricao: '', valor_meta: '', unidade: '', projeto_id: '' })
  const [saving, setSaving]     = useState(false)
  const [realizadoLocal, setRealizadoLocal] = useState<Record<string, string>>({})

  const semanas = useMemo(() => {
    const all = [semanaAtual, ...metas.map(m => m.semana)]
    return all.filter((s, i) => all.indexOf(s) === i).sort().reverse()
  }, [metas, semanaAtual])

  const metasSemana = metas.filter(m => m.semana === selectedWeek)

  const STATUS_MAP: Record<MetaSemanal['status'], { label: string; color: string; bg: string; border: string }> = {
    pendente:      { label: 'Pendente',      color: GRAY2,     bg: GRAY4,     border: GRAY5 },
    atingida:      { label: 'Atingida',      color: '#065F46', bg: '#D1FAE5', border: '#A7F3D0' },
    parcial:       { label: 'Parcial',       color: '#92400E', bg: '#FEF3C7', border: '#FDE68A' },
    nao_atingida:  { label: 'Não atingida',  color: '#991B1B', bg: '#FEE2E2', border: '#FECACA' },
  }

  function calcAutoStatus(realizado: number | null, meta: number | null): MetaSemanal['status'] {
    if (realizado === null || realizado === undefined || meta === null || !meta) return 'pendente'
    const pct = (realizado / meta) * 100
    if (pct >= 100) return 'atingida'
    if (pct >= 50)  return 'parcial'
    return 'nao_atingida'
  }

  async function addMeta() {
    if (!form.descricao.trim()) return; setSaving(true)
    await supabase.from('metas_semanais').insert({ cliente_id: clienteId, semana: selectedWeek, descricao: form.descricao, valor_meta: form.valor_meta ? parseFloat(form.valor_meta) : null, unidade: form.unidade, projeto_id: form.projeto_id || null })
    setShowNew(false); setForm({ descricao: '', valor_meta: '', unidade: '', projeto_id: '' }); await onReload(); setSaving(false)
  }
  async function updateMeta(id: string, fields: Partial<MetaSemanal>) { await supabase.from('metas_semanais').update(fields).eq('id', id); await onReload() }
  async function deleteMeta(id: string) { await supabase.from('metas_semanais').delete().eq('id', id); await onReload() }

  // Chart: one line per meta name (% alcance semana a semana)
  const LINE_COLORS = [BLUE, GREEN, PURPLE, '#F97316', '#06B6D4', '#8B5CF6', R, YELLOW]
  const metaNames = useMemo(() => {
    const names = metas.filter(m => m.valor_meta && m.valor_realizado !== null).map(m => m.descricao)
    return Array.from(new Set(names)).slice(0, 8)
  }, [metas])

  const chartData = useMemo(() => {
    const todasSemanas = Array.from(new Set(metas.map(m => m.semana))).sort()
    return todasSemanas.map(s => {
      const row: Record<string, any> = { semana: s.slice(5).replace('-', '/') }
      metaNames.forEach(name => {
        const m = metas.find(x => x.semana === s && x.descricao === name && x.valor_meta && x.valor_realizado !== null)
        if (m) row[name] = parseFloat(((m.valor_realizado! / m.valor_meta!) * 100).toFixed(1))
      })
      return row
    }).filter(r => metaNames.some(n => r[n] !== undefined))
  }, [metas, metaNames])

  return (
    <div>
      {/* Gráfico de evolução por meta */}
      {metaNames.length > 0 && (
        <div style={{ ...card, padding: 22, marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: GRAY1, marginBottom: 4 }}>Evolução por meta — % de alcance semanal</div>
          <div style={{ fontSize: 11, color: GRAY3, marginBottom: 16 }}>Linha de 100% = meta atingida</div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={GRAY5} strokeDasharray="3 3" />
              <XAxis dataKey="semana" tick={{ fontSize: 10, fill: GRAY3 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 'auto']} unit="%" tick={{ fontSize: 10, fill: GRAY3 }} axisLine={false} tickLine={false} />
              {/* linha de referência 100% */}
              <CartesianGrid horizontal={false} stroke="transparent" />
              <Tooltip
                formatter={(v: any, name: string) => [`${v}%`, name]}
                contentStyle={{ background: WHITE, border: `1px solid ${GRAY5}`, borderRadius: 8, fontSize: 12, boxShadow: '0 4px 16px rgba(0,0,0,.1)' }}
                labelStyle={{ color: GRAY2 }} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
              {metaNames.map((name, i) => (
                <Line key={name} type="monotone" dataKey={name} stroke={LINE_COLORS[i % LINE_COLORS.length]}
                  strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} connectNulls={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
          {/* linha 100% visual hint */}
          <div style={{ fontSize: 10, color: GRAY3, marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 20, height: 1, borderTop: `2px dashed ${GRAY3}` }} />
            100% = meta atingida · ≥50% = parcial · &lt;50% = não atingida
          </div>
        </div>
      )}

      {/* Week selector */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {semanas.slice(0, 10).map(s => (
          <button key={s} onClick={() => setWeek(s)} style={{ padding: '7px 14px', borderRadius: 7, border: `1px solid ${selectedWeek === s ? R : GRAY5}`, background: selectedWeek === s ? R : WHITE, color: selectedWeek === s ? WHITE : GRAY2, fontSize: 12, fontWeight: selectedWeek === s ? 700 : 400, cursor: 'pointer', transition: 'all .15s' }}>
            {s === semanaAtual ? 'Esta semana' : fmtDate(s)}
          </button>
        ))}
      </div>

      {/* Metas da semana selecionada */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        {metasSemana.length === 0 && !showNew && (
          <div style={{ ...card, padding: '40px 0', textAlign: 'center' }}>
            <Target size={28} color={GRAY3} style={{ marginBottom: 10, opacity: 0.5 }} />
            <div style={{ fontSize: 14, color: GRAY2 }}>Nenhuma meta para esta semana</div>
          </div>
        )}
        {metasSemana.map(m => {
          const st  = STATUS_MAP[m.status]
          const pct = m.valor_meta && m.valor_realizado !== null ? Math.min(100, ((m.valor_realizado ?? 0) / m.valor_meta) * 100) : null
          return (
            <div key={m.id} style={{ ...card, padding: '14px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: GRAY1, marginBottom: 8 }}>{m.descricao}</div>
                  {m.valor_meta !== null && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <div style={{ flex: 1, height: 6, background: GRAY5, borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${pct ?? 0}%`, height: '100%', background: st.color, borderRadius: 3, transition: 'width .3s' }} />
                      </div>
                      <span style={{ fontSize: 12, color: GRAY3, whiteSpace: 'nowrap' }}>{m.valor_realizado ?? '—'} / {m.valor_meta} {m.unidade}</span>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ padding: '5px 9px', background: st.bg, border: `1px solid ${st.border}`, borderRadius: 6, color: st.color, fontSize: 11, fontWeight: 700 }}>{st.label}</span>
                  {canEdit && (
                    <button onClick={() => deleteMeta(m.id)} style={{ padding: 5, border: 'none', background: 'transparent', cursor: 'pointer', color: GRAY3, display: 'flex' }}
                      onMouseEnter={e => (e.currentTarget.style.color = R)} onMouseLeave={e => (e.currentTarget.style.color = GRAY3)}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
              {canEdit && m.valor_meta && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                  <input
                    type="number"
                    value={realizadoLocal[m.id] !== undefined ? realizadoLocal[m.id] : (m.valor_realizado ?? '')}
                    onChange={e => setRealizadoLocal(prev => ({ ...prev, [m.id]: e.target.value }))}
                    onBlur={() => {
                      const raw = realizadoLocal[m.id]
                      if (raw === undefined) return
                      const realizado = raw !== '' ? parseFloat(raw) : null
                      const status = calcAutoStatus(realizado, m.valor_meta)
                      updateMeta(m.id, { valor_realizado: realizado, status })
                      setRealizadoLocal(prev => { const n = { ...prev }; delete n[m.id]; return n })
                    }}
                    placeholder="Resultado realizado"
                    style={{ width: 150, padding: '6px 10px', background: GRAY4, border: `1px solid ${GRAY5}`, borderRadius: 6, color: GRAY1, fontSize: 12, outline: 'none' }} />
                  <span style={{ fontSize: 12, color: GRAY3 }}>{m.unidade}</span>
                  <span style={{ fontSize: 11, color: GRAY3 }}>de {m.valor_meta} {m.unidade}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {canEdit && (
        <button onClick={() => setShowNew(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 9, border: `1px solid ${GRAY5}`, background: showNew ? GRAY4 : WHITE, color: GRAY2, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          <Plus size={13} /> Adicionar meta
        </button>
      )}

      {showNew && canEdit && (
        <div style={{ ...card, padding: 18, marginTop: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, marginBottom: 10 }}>
            <input value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} placeholder="Descrição da meta *" style={{ ...input14 }} />
            <input type="number" value={form.valor_meta} onChange={e => setForm(p => ({ ...p, valor_meta: e.target.value }))} placeholder="Meta" style={{ ...input14, width: 90 }} />
            <input value={form.unidade} onChange={e => setForm(p => ({ ...p, unidade: e.target.value }))} placeholder="Unidade" style={{ ...input14, width: 90 }} />
          </div>
          {projetos.length > 0 && (
            <select value={form.projeto_id} onChange={e => setForm(p => ({ ...p, projeto_id: e.target.value }))} style={{ ...input14, marginBottom: 10 }}>
              <option value="">Projeto (opcional)</option>
              {projetos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={addMeta} disabled={!form.descricao.trim() || saving} style={btnPrimary(!form.descricao.trim() || saving)}>{saving ? 'Salvando...' : 'Adicionar'}</button>
            <button onClick={() => setShowNew(false)} style={btnGhost}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: OPORTUNIDADES (Kanban)
// ══════════════════════════════════════════════════════════════════════════════
function TabOportunidades({ oportunidades, clienteId, onReload, canEdit }: { oportunidades: Oportunidade[]; clienteId: string; onReload: () => void; canEdit: boolean }) {
  const [showNew, setShowNew] = useState(false)
  const [form, setForm]       = useState({ titulo: '', descricao: '', etapa: 'identificada' as Oportunidade['etapa'], valor_estimado: '', data_estimada: '' })
  const [saving, setSaving]   = useState(false)

  async function save() {
    if (!form.titulo.trim()) return; setSaving(true)
    await supabase.from('oportunidades').insert({ ...form, valor_estimado: form.valor_estimado ? parseFloat(form.valor_estimado) : null, data_estimada: form.data_estimada || null, cliente_id: clienteId })
    setShowNew(false); setForm({ titulo: '', descricao: '', etapa: 'identificada', valor_estimado: '', data_estimada: '' }); await onReload(); setSaving(false)
  }
  async function moveOpp(id: string, etapa: Oportunidade['etapa']) { await supabase.from('oportunidades').update({ etapa }).eq('id', id); await onReload() }
  async function deleteOpp(id: string) { await supabase.from('oportunidades').delete().eq('id', id); await onReload() }

  const totalPipeline = oportunidades.filter(o => o.etapa !== 'fechada').reduce((s, o) => s + (o.valor_estimado || 0), 0)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        {totalPipeline > 0 && (
          <div style={{ padding: '8px 16px', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 9 }}>
            <span style={{ fontSize: 11, color: GRAY3 }}>Pipeline estimado </span>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#92400E' }}>{fmt(totalPipeline)}</span>
          </div>
        )}
        {canEdit && (
          <div style={{ marginLeft: 'auto' }}>
            <button onClick={() => setShowNew(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 9, border: 'none', background: R, color: WHITE, fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: `0 2px 8px ${R}40` }}>
              <Plus size={13} /> Nova Oportunidade
            </button>
          </div>
        )}
      </div>

      {showNew && canEdit && (
        <div style={{ ...card, padding: 20, marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div style={{ gridColumn: '1/-1' }}>
              <input value={form.titulo} onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))} placeholder="Título da oportunidade *" style={input14} />
            </div>
            <select value={form.etapa} onChange={e => setForm(p => ({ ...p, etapa: e.target.value as Oportunidade['etapa'] }))} style={input14}>
              {OPP_STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <input type="number" value={form.valor_estimado} onChange={e => setForm(p => ({ ...p, valor_estimado: e.target.value }))} placeholder="Valor estimado (R$)" style={input14} />
            <input type="date" value={form.data_estimada} onChange={e => setForm(p => ({ ...p, data_estimada: e.target.value }))} style={input14} />
            <textarea value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} placeholder="Descrição..." rows={2} style={{ ...input14, gridColumn: '1/-1', resize: 'none', fontFamily: 'inherit' }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={save} disabled={!form.titulo.trim() || saving} style={btnPrimary(!form.titulo.trim() || saving)}>{saving ? 'Salvando...' : 'Salvar'}</button>
            <button onClick={() => setShowNew(false)} style={btnGhost}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Kanban */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        {OPP_STAGES.map(stage => {
          const items = oportunidades.filter(o => o.etapa === stage.key)
          return (
            <div key={stage.key} style={{ background: stage.bg, border: `1px solid ${GRAY5}`, borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '11px 14px', borderBottom: `1px solid ${GRAY5}`, background: WHITE, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: stage.color }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: stage.color }}>{stage.label}</span>
                </div>
                <span style={{ fontSize: 11, color: GRAY3, background: GRAY4, borderRadius: 10, padding: '1px 7px', border: `1px solid ${GRAY5}` }}>{items.length}</span>
              </div>
              <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 80 }}>
                {items.map(o => (
                  <div key={o.id} style={{ background: WHITE, border: `1px solid ${GRAY5}`, borderRadius: 9, padding: '10px 12px', boxShadow: '0 1px 3px rgba(0,0,0,.05)' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: GRAY1, marginBottom: o.valor_estimado || o.data_estimada ? 6 : 0 }}>{o.titulo}</div>
                    {o.valor_estimado ? <div style={{ fontSize: 13, fontWeight: 800, color: '#92400E', marginBottom: 4 }}>{fmt(o.valor_estimado)}</div> : null}
                    {o.data_estimada ? <div style={{ fontSize: 11, color: GRAY3, display: 'flex', alignItems: 'center', gap: 3, marginBottom: 8 }}><Calendar size={10} />{fmtDate(o.data_estimada)}</div> : null}
                    {canEdit && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {OPP_STAGES.filter(s => s.key !== stage.key).map(s => (
                          <button key={s.key} onClick={() => moveOpp(o.id, s.key)} style={{ padding: '2px 7px', borderRadius: 4, border: `1px solid ${GRAY5}`, background: s.bg, color: s.color, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>→ {s.label}</button>
                        ))}
                        <button onClick={() => deleteOpp(o.id)} style={{ padding: '2px 7px', borderRadius: 4, border: '1px solid #FECACA', background: '#FEF2F2', color: '#991B1B', fontSize: 10, fontWeight: 600, cursor: 'pointer', marginLeft: 'auto' }}>✕</button>
                      </div>
                    )}
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
function TabFCA({ entries, clienteId, onReload, canEdit }: { entries: FcaEntry[]; clienteId: string; onReload: () => void; canEdit: boolean }) {
  const [showNew, setShowNew] = useState(false)
  const [form, setForm]       = useState({ data: new Date().toISOString().split('T')[0], fato: '', causa: '', acao: '' })
  const [saving, setSaving]   = useState(false)

  async function save() {
    if (!form.fato.trim() || !form.causa.trim() || !form.acao.trim()) return; setSaving(true)
    await supabase.from('fca_entries').insert({ ...form, cliente_id: clienteId })
    setShowNew(false); setForm({ data: new Date().toISOString().split('T')[0], fato: '', causa: '', acao: '' }); await onReload(); setSaving(false)
  }
  async function deleteEntry(id: string) { await supabase.from('fca_entries').delete().eq('id', id); await onReload() }

  const valid = form.fato.trim() && form.causa.trim() && form.acao.trim()

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: GRAY1 }}>Registro de FCA</div>
          <div style={{ fontSize: 13, color: GRAY3, marginTop: 2 }}>Fato · Causa · Ação — documentação de momentos críticos</div>
        </div>
        {canEdit && (
          <button onClick={() => setShowNew(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 9, border: `1px solid #FECACA`, background: showNew ? '#FEE2E2' : '#FEF2F2', color: '#991B1B', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <AlertTriangle size={13} /> Registrar FCA
          </button>
        )}
      </div>

      {showNew && canEdit && (
        <div style={{ background: WHITE, border: `1px solid #FECACA`, borderRadius: 12, padding: 22, marginBottom: 24, boxShadow: '0 1px 4px rgba(232,0,28,.08)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: R, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 7 }}>
            <AlertTriangle size={16} /> Novo Registro FCA
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: GRAY3, display: 'block', marginBottom: 4, fontWeight: 600 }}>Data</label>
              <input type="date" value={form.data} onChange={e => setForm(p => ({ ...p, data: e.target.value }))} style={{ ...input14, width: 'auto' }} />
            </div>
            {[
              { key: 'fato', label: 'Fato', placeholder: 'O que aconteceu?', accent: R },
              { key: 'causa', label: 'Causa', placeholder: 'Qual a causa raiz?', accent: YELLOW },
              { key: 'acao', label: 'Ação', placeholder: 'O que foi / será feito?', accent: GREEN },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: 11, fontWeight: 700, color: f.accent, display: 'block', marginBottom: 4, letterSpacing: '0.05em' }}>{f.label.toUpperCase()}</label>
                <textarea value={(form as any)[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} rows={3} style={{ ...input14, resize: 'vertical', fontFamily: 'inherit', borderColor: (form as any)[f.key] ? GRAY5 : GRAY5 }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={save} disabled={!valid || saving} style={{ ...btnPrimary(!valid || saving), background: valid ? R : GRAY3 }}>{saving ? 'Salvando...' : 'Registrar FCA'}</button>
            <button onClick={() => setShowNew(false)} style={btnGhost}>Cancelar</button>
          </div>
        </div>
      )}

      {entries.length === 0 && !showNew ? (
        <div style={{ ...card, padding: '48px 0', textAlign: 'center' }}>
          <AlertTriangle size={32} color={GRAY3} style={{ marginBottom: 12, opacity: 0.4 }} />
          <div style={{ fontSize: 14, color: GRAY2 }}>Nenhum FCA registrado — ótimo sinal!</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {entries.map((e, i) => (
            <div key={e.id} style={{ display: 'flex', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#FEE2E2', border: '2px solid #FECACA', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <AlertTriangle size={14} color={R} />
                </div>
                {i < entries.length - 1 && <div style={{ width: 2, flex: 1, background: GRAY5, marginTop: 6 }} />}
              </div>
              <div style={{ ...card, flex: 1, padding: '14px 18px', marginBottom: i < entries.length - 1 ? 16 : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ fontSize: 12, color: GRAY3, fontWeight: 500 }}>{fmtDate(e.data)}</span>
                  {canEdit && (
                    <button onClick={() => deleteEntry(e.id)} style={{ padding: 4, border: 'none', background: 'transparent', cursor: 'pointer', color: GRAY3, display: 'flex' }}
                      onMouseEnter={ev => (ev.currentTarget.style.color = R)} onMouseLeave={ev => (ev.currentTarget.style.color = GRAY3)}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
                {[
                  { label: 'FATO',  value: e.fato,  color: R },
                  { label: 'CAUSA', value: e.causa, color: '#92400E' },
                  { label: 'AÇÃO',  value: e.acao,  color: '#065F46' },
                ].map(item => (
                  <div key={item.label} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: item.color, letterSpacing: '0.08em', marginBottom: 4 }}>{item.label}</div>
                    <div style={{ fontSize: 13, color: GRAY1, lineHeight: 1.6 }}>{item.value}</div>
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

// ══════════════════════════════════════════════════════════════════════════════
// TAB: REUNIÕES
// ══════════════════════════════════════════════════════════════════════════════
function TabReunioes({ reunioes, clienteId, onReload, canEdit }: {
  reunioes: Reuniao[]; clienteId: string; onReload: () => void; canEdit: boolean
}) {
  const emptyForm = { data: new Date().toISOString().split('T')[0], titulo: '', link_apresentacao: '', link_transcricao: '', observacoes: '' }
  const [showNew, setShowNew]   = useState(false)
  const [form, setForm]         = useState(emptyForm)
  const [saving, setSaving]     = useState(false)
  const [editId, setEditId]     = useState<string | null>(null)
  const [editForm, setEditForm] = useState(emptyForm)

  const valid = !!form.data

  async function save() {
    if (!valid) return
    setSaving(true)
    await supabase.from('reunioes').insert({
      cliente_id: clienteId,
      data: form.data,
      titulo: form.titulo || null,
      link_apresentacao: form.link_apresentacao || null,
      link_transcricao: form.link_transcricao || null,
      observacoes: form.observacoes || null,
    })
    setForm(emptyForm); setShowNew(false); await onReload(); setSaving(false)
  }

  async function update(id: string) {
    await supabase.from('reunioes').update({
      data: editForm.data,
      titulo: editForm.titulo || null,
      link_apresentacao: editForm.link_apresentacao || null,
      link_transcricao: editForm.link_transcricao || null,
      observacoes: editForm.observacoes || null,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    setEditId(null); await onReload()
  }

  async function remove(id: string) {
    if (!confirm('Excluir esta reunião?')) return
    await supabase.from('reunioes').delete().eq('id', id)
    await onReload()
  }

  function startEdit(r: Reuniao) {
    setEditForm({ data: r.data, titulo: r.titulo || '', link_apresentacao: r.link_apresentacao || '', link_transcricao: r.link_transcricao || '', observacoes: r.observacoes || '' })
    setEditId(r.id)
  }

  const LinkButton = ({ href, label, icon: Icon, color }: { href: string; label: string; icon: React.ComponentType<any>; color: string }) => (
    <a href={href} target="_blank" rel="noopener noreferrer"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 7, border: `1px solid ${color}30`, background: `${color}08`, color, fontSize: 12, fontWeight: 600, textDecoration: 'none', transition: 'all .15s' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${color}18` }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = `${color}08` }}
    >
      <Icon size={13} /> {label}
    </a>
  )

  const FormFields = ({ f, setF }: { f: typeof emptyForm; setF: (v: typeof emptyForm) => void }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: GRAY3, display: 'block', marginBottom: 5, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Data *</label>
          <input type="date" value={f.data} onChange={e => setF({ ...f, data: e.target.value })} style={input14} />
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: GRAY3, display: 'block', marginBottom: 5, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Título / Pauta</label>
          <input type="text" value={f.titulo} onChange={e => setF({ ...f, titulo: e.target.value })} placeholder="Ex: Revisão mensal de resultados" style={input14} />
        </div>
      </div>
      <div>
        <label style={{ fontSize: 11, fontWeight: 700, color: GRAY3, display: 'block', marginBottom: 5, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Link da Apresentação</label>
        <input type="url" value={f.link_apresentacao} onChange={e => setF({ ...f, link_apresentacao: e.target.value })} placeholder="https://docs.google.com/presentation/..." style={input14} />
      </div>
      <div>
        <label style={{ fontSize: 11, fontWeight: 700, color: GRAY3, display: 'block', marginBottom: 5, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Link da Transcrição</label>
        <input type="url" value={f.link_transcricao} onChange={e => setF({ ...f, link_transcricao: e.target.value })} placeholder="https://docs.google.com/document/..." style={input14} />
      </div>
      <div>
        <label style={{ fontSize: 11, fontWeight: 700, color: GRAY3, display: 'block', marginBottom: 5, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Observações</label>
        <textarea value={f.observacoes} onChange={e => setF({ ...f, observacoes: e.target.value })} placeholder="Pontos discutidos, decisões tomadas..." rows={3} style={{ ...input14, resize: 'vertical', fontFamily: 'inherit' }} />
      </div>
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: GRAY1 }}>Reuniões Periódicas</div>
          <div style={{ fontSize: 12, color: GRAY3, marginTop: 2 }}>{reunioes.length} {reunioes.length === 1 ? 'reunião registrada' : 'reuniões registradas'}</div>
        </div>
        {canEdit && !showNew && (
          <button onClick={() => setShowNew(true)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 9, border: 'none', background: R, color: WHITE, fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: `0 2px 8px ${R}40` }}>
            <Plus size={14} strokeWidth={2.5} /> Nova Reunião
          </button>
        )}
      </div>

      {/* New form */}
      {showNew && (
        <div style={{ ...card, padding: 20, marginBottom: 20, borderLeft: `3px solid ${BLUE}` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: GRAY1, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Video size={14} color={BLUE} /> Nova Reunião
          </div>
          <FormFields f={form} setF={setForm} />
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={save} disabled={!valid || saving} style={btnPrimary(!valid || saving)}>{saving ? 'Salvando...' : 'Registrar Reunião'}</button>
            <button onClick={() => { setShowNew(false); setForm(emptyForm) }} style={btnGhost}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {reunioes.length === 0 && !showNew && (
        <div style={{ ...card, padding: '48px 24px', textAlign: 'center' }}>
          <Video size={36} color={GRAY3} style={{ margin: '0 auto 12px' }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: GRAY2, marginBottom: 6 }}>Nenhuma reunião registrada</div>
          <div style={{ fontSize: 13, color: GRAY3, marginBottom: 20 }}>Registre as reuniões periódicas para manter o histórico de apresentações e transcrições.</div>
          {canEdit && (
            <button onClick={() => setShowNew(true)} style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: R, color: WHITE, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              Registrar primeira reunião
            </button>
          )}
        </div>
      )}

      {/* List */}
      {reunioes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {reunioes.map(r => (
            <div key={r.id} style={{ ...card, padding: 20 }}>
              {editId === r.id ? (
                <div>
                  <FormFields f={editForm} setF={setEditForm} />
                  <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                    <button onClick={() => update(r.id)} style={btnPrimary(false)}>Salvar</button>
                    <button onClick={() => setEditId(null)} style={btnGhost}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <div>
                  {/* Row header */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: `${BLUE}0F`, border: `1px solid ${BLUE}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Video size={16} color={BLUE} />
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: GRAY1 }}>{r.titulo || 'Reunião Periódica'}</div>
                        <div style={{ fontSize: 12, color: GRAY3, marginTop: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
                          <Calendar size={11} /> {fmtDate(r.data)}
                        </div>
                      </div>
                    </div>
                    {canEdit && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => startEdit(r)} style={{ padding: '6px', borderRadius: 6, border: `1px solid ${GRAY5}`, background: WHITE, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                          <Edit2 size={13} color={GRAY3} />
                        </button>
                        <button onClick={() => remove(r.id)} style={{ padding: '6px', borderRadius: 6, border: `1px solid ${GRAY5}`, background: WHITE, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                          <Trash2 size={13} color={R} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Links */}
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: r.observacoes ? 14 : 0 }}>
                    {r.link_apresentacao
                      ? <LinkButton href={r.link_apresentacao} label="Apresentação" icon={ExternalLink} color={BLUE} />
                      : <span style={{ fontSize: 12, color: GRAY3, fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 5 }}><ExternalLink size={12} /> Sem link de apresentação</span>
                    }
                    {r.link_transcricao
                      ? <LinkButton href={r.link_transcricao} label="Transcrição" icon={Globe} color={GREEN} />
                      : <span style={{ fontSize: 12, color: GRAY3, fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 5 }}><Globe size={12} /> Sem transcrição</span>
                    }
                  </div>

                  {/* Observações */}
                  {r.observacoes && (
                    <div style={{ marginTop: 12, padding: '10px 14px', background: GRAY4, borderRadius: 8, borderLeft: `3px solid ${GRAY5}` }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: GRAY3, letterSpacing: '0.07em', marginBottom: 5 }}>OBSERVAÇÕES</div>
                      <div style={{ fontSize: 13, color: GRAY1, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{r.observacoes}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

