'use client'
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { supabase, Cliente, Contato, Projeto, HealthScoreEntry, MetaSemanal, Oportunidade, FcaEntry, Reuniao, ObjetivoMensal, ResultadoSemanal, RegistroEntrega, ServicoProjeto, CatalogoServico } from '@/lib/supabase'
import CRMLayout from '../../_components/CRMLayout'
import { R, WHITE, GRAY1, GRAY2, GRAY3, GRAY4, GRAY5, GREEN, BLUE, YELLOW, PURPLE, SEGMENTOS } from '@/lib/crm-constants'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceLine,
} from 'recharts'
import {
  ArrowLeft, Plus, Edit2, Check, X, ChevronDown,
  Link2, Layers, TrendingUp, Target, AlertTriangle, Users,
  Calendar, Package, Clock, Trash2, Globe, Info,
  Building2, Phone, Mail, ExternalLink, Video, FileText, Upload, BarChart2,
} from 'lucide-react'
import { useUserRole } from '@/lib/useUserRole'
import { toast } from '@/lib/toast'

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
function getMondaysInMonth(mes: string): string[] {
  const [y, m] = mes.split('-').map(Number)
  const d = new Date(y, m - 1, 1)
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1)
  const mondays: string[] = []
  while (d.getMonth() === m - 1) {
    mondays.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
    d.setDate(d.getDate() + 7)
  }
  return mondays
}
function getFirstMondayOfMonth(mes: string): string { return getMondaysInMonth(mes)[0] }
// Retorna quantos dias o slot de resultado cobre dentro do mês
function getSlotDays(semana: string, mes: string): number {
  const mondays = getMondaysInMonth(mes)
  const [y, m] = mes.split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  const lastMonday = mondays[mondays.length - 1]
  // closing slot: 1ª segunda do mês seguinte
  const nextM = m === 12 ? 1 : m + 1
  const nextY = m === 12 ? y + 1 : y
  const closingSemana = getFirstMondayOfMonth(`${nextY}-${String(nextM).padStart(2, '0')}`)
  if (semana === closingSemana) return daysInMonth - parseInt(lastMonday.split('-')[2]) + 1
  // 1º slot de resultado: 2ª segunda do mês, cobre do dia 1 até o domingo anterior
  if (mondays.length >= 2 && semana === mondays[1]) return parseInt(mondays[1].split('-')[2]) - 1
  // slots regulares: sempre 7 dias
  return 7
}
function fmtMes(mes: string): string {
  const [y, m] = mes.split('-')
  const MN = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${MN[parseInt(m) - 1]} ${y}`
}

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
  { id: 'entregas',      label: 'Entregas',       icon: BarChart2 },
  { id: 'oportunidades', label: 'Oportunidades',  icon: Package },
  { id: 'fca',           label: 'FCA',            icon: AlertTriangle },
]

const OPP_STAGES: { key: Oportunidade['etapa']; label: string; color: string; bg: string }[] = [
  { key: 'identificada',      label: 'Identificada',      color: GRAY2,   bg: GRAY4 },
  { key: 'em_conversa',       label: 'Em Conversa',       color: BLUE,    bg: '#F5F3FF' },
  { key: 'proposta_enviada',  label: 'Proposta Enviada',  color: '#92400E', bg: '#FEF3C7' },
  { key: 'fechada',           label: 'Fechada',           color: '#065F46', bg: '#ECFDF5' },
]

// ── Inline editable field ─────────────────────────────────────────────────────
function EditableField({ label, value, onSave, multiline = false, options }: { label: string; value: string; onSave?: (v: string) => void; multiline?: boolean; options?: string[] }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const commit = (v = draft) => { onSave!(v); setEditing(false) }
  const cancel = () => { setDraft(value); setEditing(false) }

  return (
    <div>
      <div style={{ fontSize: 11, color: GRAY3, fontWeight: 600, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</div>
      {editing ? (
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          {options
            ? <select value={draft} autoFocus onChange={e => { setDraft(e.target.value); commit(e.target.value) }} style={{ flex: 1, padding: '8px 10px', background: GRAY4, border: `1px solid ${GRAY5}`, borderRadius: 7, color: GRAY1, fontSize: 13, outline: 'none' }}>
                <option value="">— Selecione —</option>
                {options.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            : multiline
              ? <textarea value={draft} onChange={e => setDraft(e.target.value)} autoFocus rows={3} style={{ flex: 1, padding: '8px 10px', background: GRAY4, border: `1px solid ${GRAY5}`, borderRadius: 7, color: GRAY1, fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }} />
              : <input value={draft} onChange={e => setDraft(e.target.value)} autoFocus onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel() }} style={{ flex: 1, padding: '8px 10px', background: GRAY4, border: `1px solid ${GRAY5}`, borderRadius: 7, color: GRAY1, fontSize: 13, outline: 'none' }} />
          }
          {!options && <button onClick={() => commit()} style={{ padding: '7px', borderRadius: 6, border: 'none', background: GREEN, cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Check size={13} color={WHITE} /></button>}
          <button onClick={cancel} style={{ padding: '7px', borderRadius: 6, border: `1px solid ${GRAY5}`, background: WHITE, cursor: 'pointer', display: 'flex', alignItems: 'center' }}><X size={13} color={GRAY3} /></button>
        </div>
      ) : (
        <div
          onClick={onSave ? () => { setDraft(value); setEditing(true) } : undefined}
          style={{ fontSize: 13, color: value ? GRAY1 : GRAY3, cursor: onSave ? 'pointer' : 'default', padding: '7px 0', borderBottom: `1px ${onSave ? 'dashed' : 'solid'} ${GRAY5}`, minHeight: 30, display: 'flex', alignItems: 'center', gap: 6, transition: 'border-color .15s' }}
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
  papel: string | string[]
  usuarios: { nome: string; papel: string }[]
  onSave?: (v: string | null) => void
  canEdit: boolean
}) {
  const roles = Array.isArray(papel) ? papel : [papel]
  const options = usuarios.filter(u => roles.includes(u.papel))
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
  const [objetivos, setObjetivos]     = useState<ObjetivoMensal[]>([])
  const [resultados, setResultados]   = useState<ResultadoSemanal[]>([])
  const [oportunidades, setOps]       = useState<Oportunidade[]>([])
  const [fcaEntries, setFCA]          = useState<FcaEntry[]>([])
  const [reunioes, setReunioes]       = useState<Reuniao[]>([])
  const [registrosEntrega, setRegistrosEntrega] = useState<RegistroEntrega[]>([])
  const [servicosProjeto, setServicosProjeto] = useState<ServicoProjeto[]>([])
  const [catalogoServicos, setCatalogoServicos] = useState<CatalogoServico[]>([])
  const [loading, setLoading]         = useState(true)
  const [leadContrato, setLeadContrato] = useState<string | null>(null)

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

    // Pull contract from originating lead if available
    if (clienteData.lead_id) {
      const { data: lead } = await supabase.from('leads').select('link_contrato').eq('id', clienteData.lead_id).maybeSingle()
      setLeadContrato(lead?.link_contrato ?? null)
    } else {
      setLeadContrato(null)
    }

    const [ct, pr, hs, mt, op, fc, re, obj, res, reg, svc, cat] = await Promise.all([
      supabase.from('contatos').select('*').eq('cliente_id', actualId).order('is_primary', { ascending: false }),
      supabase.from('projetos').select('*').eq('cliente_id', actualId).order('created_at'),
      supabase.from('health_score_entries').select('*').eq('cliente_id', actualId).order('semana', { ascending: false }).limit(20),
      supabase.from('metas_semanais').select('*').eq('cliente_id', actualId).order('semana', { ascending: false }),
      supabase.from('oportunidades').select('*').eq('cliente_id', actualId).order('created_at', { ascending: false }),
      supabase.from('fca_entries').select('*').eq('cliente_id', actualId).order('data', { ascending: false }),
      supabase.from('reunioes').select('*').eq('cliente_id', actualId).order('data', { ascending: false }),
      supabase.from('objetivos_mensais').select('*').eq('cliente_id', actualId).order('mes', { ascending: false }),
      supabase.from('resultados_semanais').select('*').eq('cliente_id', actualId).order('semana', { ascending: false }),
      supabase.from('registros_entrega').select('*').eq('cliente_id', actualId).order('data', { ascending: false }),
      supabase.from('servicos_projeto').select('*').eq('cliente_id', actualId).order('created_at', { ascending: true }),
      supabase.from('catalogo_servicos').select('*').eq('ativo', true).order('tipo').order('ordem').order('nome'),
    ])
    setContatos(ct.data || [])
    setProjetos(pr.data || [])
    setHealth(hs.data || [])
    setMetas(mt.data || [])
    setOps(op.data || [])
    setFCA(fc.data || [])
    setReunioes(re.data || [])
    setObjetivos(obj.data || [])
    setResultados(res.data || [])
    setRegistrosEntrega(reg.data || [])
    setServicosProjeto(svc.data || [])
    setCatalogoServicos(cat.data || [])
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
        {tab === 'visao-geral'   && <TabVisaoGeral   cliente={cliente} contatos={contatos} projetos={projetos} lt={lt} onSaveCliente={saveCliente} onReload={loadAll} clienteId={clienteRealId} canEdit={canEditCockpit} leadContrato={leadContrato} />}
        {tab === 'projetos'      && <TabProjetos      projetos={projetos} clienteId={clienteRealId} onReload={loadAll} canEdit={canEditCockpit} catalogoServicos={catalogoServicos} />}
        {tab === 'health-score'  && <TabHealthScore   entries={healthEntries} metas={metas} clienteId={clienteRealId} onReload={loadAll} canEdit={canEditCockpit} objetivos={objetivos} resultados={resultados} />}
        {tab === 'metas'         && <TabMetas         metas={metas} projetos={projetos} clienteId={clienteRealId} onReload={loadAll} canEdit={canEditCockpit} objetivos={objetivos} resultados={resultados} />}
        {tab === 'reunioes'      && <TabReunioes      reunioes={reunioes} clienteId={clienteRealId} onReload={loadAll} canEdit={canEditCockpit} />}
        {tab === 'entregas'      && <TabEntregas      registros={registrosEntrega} projetos={projetos} servicosProjeto={servicosProjeto} clienteId={clienteRealId} onReload={loadAll} canEdit={canEditCockpit} />}
        {tab === 'oportunidades' && <TabOportunidades oportunidades={oportunidades} clienteId={clienteRealId} onReload={loadAll} canEdit={canEditCockpit} />}
        {tab === 'fca'           && <TabFCA           entries={fcaEntries} clienteId={clienteRealId} onReload={loadAll} canEdit={canEditCockpit} />}
      </div>
    </CRMLayout>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: VISÃO GERAL
// ══════════════════════════════════════════════════════════════════════════════
function TabVisaoGeral({ cliente, contatos, projetos, lt, onSaveCliente, onReload, clienteId, canEdit, leadContrato }: {
  cliente: Cliente; contatos: Contato[]; projetos: Projeto[]; lt: string
  onSaveCliente: (f: Partial<Cliente>) => void; onReload: () => void; clienteId: string; canEdit: boolean
  leadContrato: string | null
}) {
  const [newStack, setNewStack]       = useState('')
  const [newLink, setNewLink]         = useState({ label: '', url: '' })
  const [showAddContact, setShowAdd]  = useState(false)
  const [newContact, setNewC]         = useState({ nome: '', cargo: '', email: '', telefone: '', is_primary: false })
  const [saving, setSaving]           = useState(false)
  const [usuarios, setUsuarios]       = useState<{ nome: string; papel: string }[]>([])
  const [uploadingContract, setUploadingContract] = useState(false)
  const contractInputRef              = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.from('usuarios_permitidos').select('nome, papel')
      .in('papel', ['gestor_projetos', 'designer', 'analista_midia', 'coordenador_peg', 'admin'])
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

  async function uploadContrato(file: File) {
    setUploadingContract(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `clientes/${clienteId}/${Date.now()}.${ext}`
      const { data: uploaded, error: uploadErr } = await supabase.storage
        .from('contratos')
        .upload(path, file, { contentType: file.type, upsert: false })
      if (uploadErr) throw uploadErr
      const { data: { publicUrl } } = supabase.storage.from('contratos').getPublicUrl(uploaded.path)
      await onSaveCliente({ link_contrato: publicUrl })
    } finally {
      setUploadingContract(false)
    }
  }

  const effectiveContrato = cliente.link_contrato || leadContrato
  const contratoFromLead  = !cliente.link_contrato && !!leadContrato

  const links = Object.entries(cliente.links || {})

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

      {/* Dados gerais */}
      <div style={{ ...card, padding: 22 }}>
        <SectionTitle icon={Building2} label="Dados Gerais" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <EditableField label="Empresa" value={cliente.empresa} onSave={canEdit ? v => onSaveCliente({ empresa: v }) : undefined} />
          <EditableField label="Segmento" value={cliente.segmento || ''} onSave={canEdit ? v => onSaveCliente({ segmento: v || null }) : undefined} options={SEGMENTOS} />
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
          <RoleSelect label="Gestor de Projetos" value={cliente.gestor_projetos} papel={['gestor_projetos', 'coordenador_peg']} usuarios={usuarios} canEdit={canEdit} onSave={v => onSaveCliente({ gestor_projetos: v })} />
          <RoleSelect label="Designer"           value={cliente.designer}        papel="designer"                               usuarios={usuarios} canEdit={canEdit} onSave={v => onSaveCliente({ designer: v })} />
          <RoleSelect label="Analista de Mídia"  value={cliente.analista_midia}  papel={['analista_midia', 'coordenador_peg']}  usuarios={usuarios} canEdit={canEdit} onSave={v => onSaveCliente({ analista_midia: v })} />
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
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#F5F3FF', border: `1px solid #DDD6FE`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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

      {/* Contrato */}
      <div style={{ ...card, padding: 22 }}>
        <input ref={contractInputRef} type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) uploadContrato(f); e.target.value = '' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <SectionTitle icon={FileText} label="Contrato" />
          {canEdit && (
            <button onClick={() => contractInputRef.current?.click()} disabled={uploadingContract}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 7, border: `1px solid ${GRAY5}`, background: WHITE, color: GRAY2, fontSize: 11, fontWeight: 600, cursor: 'pointer', opacity: uploadingContract ? 0.5 : 1 }}>
              <Upload size={11} /> {uploadingContract ? 'Enviando...' : effectiveContrato ? 'Substituir' : 'Enviar'}
            </button>
          )}
        </div>
        {effectiveContrato ? (
          <div style={{ padding: '14px 16px', background: GRAY4, borderRadius: 10, border: `1px solid ${GRAY5}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: `${R}10`, border: `1px solid ${R}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <FileText size={16} color={R} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: GRAY1 }}>Contrato</span>
                  {contratoFromLead && (
                    <span style={{ fontSize: 9, fontWeight: 700, color: '#065F46', background: '#D1FAE5', border: '1px solid #A7F3D0', borderRadius: 4, padding: '1px 6px', letterSpacing: '0.05em' }}>DO CRM</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: GRAY3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{decodeURIComponent(effectiveContrato.split('/').pop() || effectiveContrato)}</div>
              </div>
              <a href={effectiveContrato} target="_blank" rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 7, background: R, color: WHITE, fontSize: 12, fontWeight: 700, textDecoration: 'none', flexShrink: 0 }}>
                <ExternalLink size={12} /> Abrir
              </a>
            </div>
          </div>
        ) : (
          <div onClick={canEdit ? () => contractInputRef.current?.click() : undefined}
            style={{ padding: '28px 16px', textAlign: 'center', border: `2px dashed ${GRAY5}`, borderRadius: 10, cursor: canEdit ? 'pointer' : 'default', background: GRAY4, transition: 'border-color .15s' }}
            onMouseEnter={canEdit ? e => { (e.currentTarget as HTMLElement).style.borderColor = R } : undefined}
            onMouseLeave={canEdit ? e => { (e.currentTarget as HTMLElement).style.borderColor = GRAY5 } : undefined}>
            <FileText size={22} color={GRAY3} style={{ marginBottom: 8 }} />
            <div style={{ fontSize: 13, fontWeight: 600, color: GRAY2 }}>{canEdit ? 'Clique para enviar o contrato' : 'Nenhum contrato anexado'}</div>
            {canEdit && <div style={{ fontSize: 11, color: GRAY3, marginTop: 4 }}>PDF, DOC ou DOCX</div>}
          </div>
        )}
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

type ServicoSel = {
  key: string
  volume?: string
  campanhas?: number
  posts?: number
  estaticos?: number
  videos?: number
}

// volumeType: 'campanhas' | 'posts' | 'design' have required specific fields; 'generic' is optional free text
const SERVICOS_EXECUTAR: { key: string; label: string; temVolume: boolean; volumeType?: 'campanhas' | 'posts' | 'design' | 'generic' }[] = [
  { key: 'marketplace',         label: 'MarketPlace',             temVolume: true,  volumeType: 'generic'   },
  { key: 'manutencao_crm',      label: 'Manutenção CRM',          temVolume: false                          },
  { key: 'seo',                 label: 'SEO',                     temVolume: false                          },
  { key: 'manutencao_lp',       label: 'Manutenção LP',           temVolume: false                          },
  { key: 'manutencao_bi',       label: 'Manutenção BI',           temVolume: false                          },
  { key: 'manutencao_site',     label: 'Manutenção Site',         temVolume: false                          },
  { key: 'webdesign',           label: 'WebDesign',               temVolume: false                          },
  { key: 'sales_enablement',    label: 'Sales Enablement',        temVolume: false                          },
  { key: 'bi',                  label: 'BI',                      temVolume: false                          },
  { key: 'social_media',        label: 'Social Media',            temVolume: true,  volumeType: 'posts'     },
  { key: 'midia_paga',          label: 'Mídia Paga',              temVolume: true,  volumeType: 'campanhas' },
  { key: 'design_grafico',      label: 'Design Gráfico',          temVolume: true,  volumeType: 'design'    },
  { key: 'redacao_publicitaria',label: 'Redação Publicitária',    temVolume: true,  volumeType: 'generic'   },
  { key: 'crm',                 label: 'CRM',                     temVolume: true,  volumeType: 'generic'   },
]

function servicoChipLabel(s: ServicoSel, def: typeof SERVICOS_EXECUTAR[number]): string {
  if (def.volumeType === 'campanhas' && s.campanhas) return `${def.label} · ${s.campanhas} campanhas/mês`
  if (def.volumeType === 'posts'     && s.posts)     return `${def.label} · ${s.posts} posts/mês`
  if (def.volumeType === 'design') {
    const parts: string[] = []
    if (s.estaticos) parts.push(`${s.estaticos} estáticos`)
    if (s.videos)    parts.push(`${s.videos} vídeos`)
    return parts.length ? `${def.label} · ${parts.join(' + ')}/mês` : def.label
  }
  if (s.volume) return `${def.label} · ${s.volume}/mês`
  return def.label
}

function isMissingVolume(s: ServicoSel, list: typeof SERVICOS_EXECUTAR = SERVICOS_EXECUTAR): boolean {
  const def = list.find(x => x.key === s.key)
  if (!def?.temVolume) return false
  if (def.volumeType === 'campanhas') return s.campanhas == null
  if (def.volumeType === 'posts')     return s.posts == null
  if (def.volumeType === 'design')    return s.estaticos == null || s.videos == null
  return false
}

function getEtapas(tipo: Projeto['tipo'], servico: string | null): string[] {
  if (!servico) return []
  return CATALOGO[tipo]?.find(s => s.key === servico)?.etapas ?? []
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: PROJETOS
// ══════════════════════════════════════════════════════════════════════════════
// Converte valor numérico do banco (ex: 3500) para string de centavos ("350000")
function toCents(val: number | string | null | undefined): string {
  if (val === null || val === undefined || val === '') return ''
  const n = typeof val === 'string' ? parseFloat(val) : val
  if (isNaN(n)) return ''
  return String(Math.round(n * 100))
}
// Converte string de centavos para float (ex: "350000" → 3500)
function fromCents(cents: string): number {
  if (!cents) return 0
  return parseInt(cents, 10) / 100
}
// Formata string de centavos para exibição (ex: "350000" → "3.500,00")
function fmtCents(cents: string): string {
  if (!cents) return ''
  return (parseInt(cents, 10) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function TabProjetos({ projetos, clienteId, onReload, canEdit, catalogoServicos }: { projetos: Projeto[]; clienteId: string; onReload: () => void; canEdit: boolean; catalogoServicos: CatalogoServico[] }) {
  const emptyForm = { nome: '', tipo: 'saber' as Projeto['tipo'], servico: '', valor_tipo: 'mensalidade' as Projeto['valor_tipo'], valor: '', investimento_midia: '', data_inicio: '', data_fim: '', escopo: '' }

  // Serviços Executar dinâmicos (catálogo) com fallback para lista hardcoded
  const catExec = catalogoServicos.filter(s => s.tipo === 'executar' && s.ativo)
  const servicosExec: typeof SERVICOS_EXECUTAR = catExec.length > 0
    ? catExec.map(s => ({ key: s.chave || s.id, label: s.nome, temVolume: s.tem_volume, volumeType: (s.volume_type ?? undefined) as any }))
    : SERVICOS_EXECUTAR
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [servicosSel, setServicosSel] = useState<ServicoSel[]>([])
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState(emptyForm)
  const [editServicosSel, setEditServicosSel] = useState<ServicoSel[]>([])
  const [entregaProjetoId, setEntregaProjetoId] = useState<string | null>(null)
  const [entregaMes, setEntregaMes] = useState(() => new Date().toISOString().slice(0, 7))
  const [entregaForm, setEntregaForm] = useState({ campanhas: '', estaticos: '', videos: '', posts: '', data: new Date().toISOString().slice(0, 10), observacao: '' })
  const [savingEntrega, setSavingEntrega] = useState(false)
  const [editServicos, setEditServicos] = useState<{ id?: string; nome: string; quantidade_prevista: number; unidade: string }[]>([])
  const [newServicos, setNewServicos] = useState<{ nome: string; quantidade_prevista: number; unidade: string }[]>([])

  function toggleServico(key: string) {
    setServicosSel(prev =>
      prev.find(s => s.key === key) ? prev.filter(s => s.key !== key) : [...prev, { key }]
    )
  }
  function setServicoField(key: string, field: keyof ServicoSel, value: any) {
    setServicosSel(prev => prev.map(s => s.key === key ? { ...s, [field]: value === '' ? undefined : value } : s))
  }
  function toggleEditServico(key: string) {
    setEditServicosSel(prev =>
      prev.find(s => s.key === key) ? prev.filter(s => s.key !== key) : [...prev, { key }]
    )
  }
  function setEditServicoField(key: string, field: keyof ServicoSel, value: any) {
    setEditServicosSel(prev => prev.map(s => s.key === key ? { ...s, [field]: value === '' ? undefined : value } : s))
  }

  function migrateServicos(raw: Projeto['servicos_executar']): ServicoSel[] {
    return (raw || []).map(s => {
      if (s.key === 'midia_paga' && s.volume && !s.campanhas) {
        const n = parseInt(s.volume, 10)
        return { key: s.key, campanhas: isNaN(n) ? undefined : n }
      }
      if (s.key === 'social_media' && s.volume && !s.posts) {
        const n = parseInt(s.volume, 10)
        return { key: s.key, posts: isNaN(n) ? undefined : n }
      }
      if (s.key === 'design_grafico' && s.volume && !s.estaticos && !s.videos) {
        const nums = s.volume.match(/\d+/g) || []
        return {
          key: s.key,
          estaticos: nums[0] ? parseInt(nums[0], 10) : undefined,
          videos:    nums[1] ? parseInt(nums[1], 10) : undefined,
        }
      }
      return s
    })
  }

  function getEtapasDyn(tipo: Projeto['tipo'], servico: string | null): string[] {
    if (!servico) return []
    const cat = catalogoServicos.find(s => s.id === servico && s.tipo === tipo)
    if (cat) return cat.etapas
    return CATALOGO[tipo]?.find(s => s.key === servico)?.etapas ?? []
  }
  function getServicoLabel(tipo: Projeto['tipo'], servico: string | null): string | undefined {
    if (!servico) return undefined
    const cat = catalogoServicos.find(s => s.id === servico && s.tipo === tipo)
    if (cat) return cat.nome
    return CATALOGO[tipo]?.find(s => s.key === servico)?.label
  }

  function openEntrega(p: Projeto) {
    setEntregaProjetoId(p.id)
    setEntregaMes(new Date().toISOString().slice(0, 7))
    setEntregaForm({ campanhas: '', estaticos: '', videos: '', posts: '', data: new Date().toISOString().slice(0, 10), observacao: '' })
  }

  async function saveEntrega(projetoId: string) {
    setSavingEntrega(true)
    const p = projetos.find(x => x.id === projetoId)
    const servicos = (p?.servicos_executar || []).map(s => s.key)
    const vals: any = {
      projeto_id: projetoId,
      cliente_id: clienteId,
      mes: entregaMes,
      data: entregaForm.data || new Date().toISOString().slice(0, 10),
      observacao: entregaForm.observacao || null,
    }
    if (servicos.includes('midia_paga'))     vals.campanhas = entregaForm.campanhas  ? parseInt(entregaForm.campanhas, 10)  : null
    if (servicos.includes('design_grafico')) { vals.estaticos = entregaForm.estaticos ? parseInt(entregaForm.estaticos, 10) : null; vals.videos = entregaForm.videos ? parseInt(entregaForm.videos, 10) : null }
    if (servicos.includes('social_media'))   vals.posts     = entregaForm.posts      ? parseInt(entregaForm.posts, 10)      : null
    const { error } = await supabase.from('registros_entrega').insert(vals)
    setSavingEntrega(false)
    if (error) { toast.error('Erro ao salvar: ' + error.message); return }
    setEntregaProjetoId(null)
  }

  async function startEdit(p: Projeto) {
    setEditForm({
      nome: p.nome, tipo: p.tipo, servico: p.servico || '',
      valor_tipo: p.valor_tipo, valor: toCents(p.valor),
      investimento_midia: toCents(p.investimento_midia),
      data_inicio: p.data_inicio || '', data_fim: p.data_fim || '', escopo: p.escopo || '',
    })
    setEditServicosSel(migrateServicos(p.servicos_executar))
    if (p.tipo === 'saber' || p.tipo === 'ter') {
      const { data } = await supabase.from('servicos_projeto').select('*').eq('projeto_id', p.id).order('created_at', { ascending: true })
      setEditServicos((data || []).map((s: ServicoProjeto) => ({ id: s.id, nome: s.nome, quantidade_prevista: s.quantidade_prevista, unidade: s.unidade })))
    } else {
      setEditServicos([])
    }
    setEditId(p.id)
  }

  const TIPO: Record<Projeto['tipo'], { color: string; bg: string; border: string; label: string }> = {
    saber:    { color: BLUE,   bg: '#F5F3FF', border: '#DDD6FE', label: 'Saber' },
    ter:      { color: PURPLE, bg: '#F5F3FF', border: '#DDD6FE', label: 'Ter' },
    executar: { color: '#065F46', bg: '#ECFDF5', border: '#A7F3D0', label: 'Executar' },
  }
  const STATUS: Record<Projeto['status'], { color: string; bg: string; border: string; label: string }> = {
    ativo:     { color: '#065F46', bg: '#D1FAE5', border: '#A7F3D0', label: 'Ativo' },
    pausado:   { color: '#92400E', bg: '#FEF3C7', border: '#FDE68A', label: 'Pausado' },
    encerrado: { color: '#6B7280', bg: GRAY4,     border: GRAY5,     label: 'Encerrado' },
  }

  async function save() {
    if (!form.nome.trim()) return
    if (form.tipo === 'executar') {
      const missing = servicosSel.filter(s => isMissingVolume(s, servicosExec)).map(s => servicosExec.find(x => x.key === s.key)?.label)
      if (missing.length) { toast.warning(`Preencha os volumes obrigatórios: ${missing.join(', ')}`); return }
    }
    setSaving(true)
    const etapas = getEtapasDyn(form.tipo, form.servico || null)
    const { data: newProj } = await supabase.from('projetos').insert({
      nome: form.nome, tipo: form.tipo, valor_tipo: form.valor_tipo,
      valor: fromCents(form.valor), cliente_id: clienteId,
      data_inicio: form.data_inicio || null, data_fim: form.data_fim || null,
      escopo: form.escopo,
      servico: form.servico || null,
      etapa_atual: etapas[0] ?? null,
      servicos_executar: form.tipo === 'executar' && servicosSel.length > 0 ? servicosSel : null,
      investimento_midia: form.tipo === 'executar' && form.investimento_midia ? fromCents(form.investimento_midia) : null,
    }).select().single()
    if (newProj && (form.tipo === 'saber' || form.tipo === 'ter')) {
      const toInsert = newServicos.filter(s => s.nome.trim()).map(s => ({ projeto_id: newProj.id, cliente_id: clienteId, nome: s.nome, quantidade_prevista: s.quantidade_prevista, unidade: s.unidade }))
      if (toInsert.length) await supabase.from('servicos_projeto').insert(toInsert)
    }
    setShowNew(false)
    setForm({ nome: '', tipo: 'saber', servico: '', valor_tipo: 'mensalidade', valor: '', investimento_midia: '', data_inicio: '', data_fim: '', escopo: '' })
    setServicosSel([])
    setNewServicos([])
    await onReload(); setSaving(false)
  }
  async function updateProj() {
    if (!editForm.nome.trim() || !editId) return
    if (editForm.tipo === 'executar') {
      const missing = editServicosSel.filter(s => isMissingVolume(s, servicosExec)).map(s => servicosExec.find(x => x.key === s.key)?.label)
      if (missing.length) { toast.warning(`Preencha os volumes obrigatórios: ${missing.join(', ')}`); return }
    }
    setSaving(true)
    await supabase.from('projetos').update({
      nome: editForm.nome, tipo: editForm.tipo, valor_tipo: editForm.valor_tipo,
      valor: fromCents(editForm.valor),
      data_inicio: editForm.data_inicio || null, data_fim: editForm.data_fim || null,
      escopo: editForm.escopo,
      servico: editForm.servico || null,
      servicos_executar: editForm.tipo === 'executar' && editServicosSel.length > 0 ? editServicosSel : null,
      investimento_midia: editForm.tipo === 'executar' && editForm.investimento_midia ? fromCents(editForm.investimento_midia) : null,
      updated_at: new Date().toISOString(),
    }).eq('id', editId)
    if (editForm.tipo === 'saber' || editForm.tipo === 'ter') {
      const { data: existing } = await supabase.from('servicos_projeto').select('id').eq('projeto_id', editId)
      const existingIds = (existing || []).map((s: any) => s.id)
      const keptIds = editServicos.filter(s => s.id).map(s => s.id!)
      const toDelete = existingIds.filter((id: string) => !keptIds.includes(id))
      if (toDelete.length) await supabase.from('servicos_projeto').delete().in('id', toDelete)
      for (const s of editServicos.filter(s => s.id && s.nome.trim())) {
        await supabase.from('servicos_projeto').update({ nome: s.nome, quantidade_prevista: s.quantidade_prevista, unidade: s.unidade }).eq('id', s.id!)
      }
      const toInsert = editServicos.filter(s => !s.id && s.nome.trim()).map(s => ({ projeto_id: editId, cliente_id: clienteId, nome: s.nome, quantidade_prevista: s.quantidade_prevista, unidade: s.unidade }))
      if (toInsert.length) await supabase.from('servicos_projeto').insert(toInsert)
    }
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
  const servicosDoTipo = catalogoServicos.filter(s => s.tipo === form.tipo)

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
            <div style={{ padding: '8px 16px', background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 9 }}>
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
          const etapas = getEtapasDyn(p.tipo, p.servico)
          const etapaIdx = etapas.indexOf(p.etapa_atual ?? '')
          const servicoLabel = getServicoLabel(p.tipo, p.servico)
          const isEditing = editId === p.id
          return (
            <div key={p.id} style={{ ...card, overflow: 'hidden' }}>
              <div style={{ height: 3, background: `linear-gradient(90deg, ${t.color}, ${t.color}66)` }} />
              <div style={{ padding: '16px 18px' }}>
                {(
                  <>
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 5, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: t.color, background: t.bg, border: `1px solid ${t.border}`, borderRadius: 5, padding: '2px 8px' }}>{t.label.toUpperCase()}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, color: st.color, background: st.bg, border: `1px solid ${st.border}`, borderRadius: 5, padding: '2px 8px' }}>{st.label.toUpperCase()}</span>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: GRAY1 }}>{p.nome}</div>
                        {servicoLabel && <div style={{ fontSize: 11, color: GRAY2, marginTop: 3 }}>{servicoLabel}</div>}
                        {p.tipo === 'executar' && p.servicos_executar && p.servicos_executar.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                            {p.servicos_executar.map(s => {
                              const def = servicosExec.find(x => x.key === s.key)
                              if (!def) return null
                              return (
                                <span key={s.key} style={{ fontSize: 10, fontWeight: 600, color: '#065F46', background: '#D1FAE5', border: '1px solid #A7F3D0', borderRadius: 5, padding: '2px 7px', whiteSpace: 'nowrap' }}>
                                  {servicoChipLabel(s, def)}
                                </span>
                              )
                            })}
                          </div>
                        )}
                      </div>
                      {canEdit && (
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <button onClick={() => toggleStatus(p)} style={{ padding: '4px 9px', borderRadius: 6, border: `1px solid ${GRAY5}`, background: WHITE, color: GRAY2, fontSize: 10, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            {p.status === 'ativo' ? 'Pausar' : p.status === 'pausado' ? 'Encerrar' : 'Reativar'}
                          </button>
                          <button onClick={() => startEdit(p)} style={{ padding: '5px 9px', borderRadius: 6, border: `1px solid ${GRAY5}`, background: GRAY4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: GRAY2, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
                            <Edit2 size={12} /> Editar
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
                            const isGreen   = isDone || isCurrent
                            const color     = isGreen ? '#059669' : GRAY3
                            const bg        = isCurrent ? '#D1FAE5' : isDone ? '#F0FDF4' : GRAY4
                            const border    = isGreen ? '#6EE7B7' : GRAY5
                            return (
                              <button key={etapa} onClick={canEdit ? () => setEtapa(p.id, etapa) : undefined}
                                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 7, border: `1px solid ${border}`, background: bg, cursor: canEdit ? 'pointer' : 'default', textAlign: 'left', width: '100%', transition: 'all .15s' }}
                                onMouseEnter={canEdit ? e => { if (!isCurrent && !isDone) (e.currentTarget as HTMLElement).style.borderColor = '#10B981' } : undefined}
                                onMouseLeave={canEdit ? e => { (e.currentTarget as HTMLElement).style.borderColor = border } : undefined}
                              >
                                <div style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, background: isGreen ? '#10B981' : GRAY5, border: `2px solid ${isGreen ? '#10B981' : GRAY3}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  {isGreen && <Check size={9} color={WHITE} strokeWidth={3} />}
                                </div>
                                <span style={{ fontSize: 12, fontWeight: isCurrent ? 700 : 500, color }}>{etapa}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {p.escopo && <div style={{ fontSize: 12, color: GRAY2, lineHeight: 1.55, padding: '10px 0', borderTop: `1px solid ${GRAY5}`, marginTop: etapas.length > 0 ? 12 : 0 }}>{p.escopo}</div>}
                    {p.tipo === 'executar' && (
                      <button onClick={() => openEntrega(p)} style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, border: `1px solid ${BLUE}40`, background: `${BLUE}08`, color: BLUE, fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        <Package size={11} /> Lançar Entrega do Mês
                      </button>
                    )}
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

      {projetos.length === 0 && (
        <div style={{ ...card, padding: '48px 0', textAlign: 'center' }}>
          <Layers size={32} color={GRAY3} style={{ marginBottom: 12, opacity: 0.5 }} />
          <div style={{ fontSize: 14, color: GRAY2 }}>Nenhum projeto cadastrado</div>
        </div>
      )}

      {entregaProjetoId && (() => {
        const p = projetos.find(x => x.id === entregaProjetoId)
        if (!p) return null
        const servicos = (p.servicos_executar || []).map(s => s.key)
        const hasMidia  = servicos.includes('midia_paga')
        const hasDesign = servicos.includes('design_grafico')
        const hasSocial = servicos.includes('social_media')
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
            onClick={() => setEntregaProjetoId(null)}>
            <div style={{ background: WHITE, borderRadius: 16, padding: 28, width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}
              onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: GRAY1 }}>Lançar Entrega do Mês</div>
                  <div style={{ fontSize: 11, color: GRAY3, marginTop: 2 }}>{p.nome}</div>
                </div>
                <button onClick={() => setEntregaProjetoId(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: GRAY3, padding: 4, borderRadius: 6, display: 'flex' }}>
                  <X size={18} />
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, color: GRAY3, display: 'block', marginBottom: 4, fontWeight: 600 }}>Data do lançamento</label>
                    <input type="date" value={entregaForm.data} onChange={e => setEntregaForm(f => ({ ...f, data: e.target.value }))} style={{ width: '100%', padding: '8px 10px', border: `1px solid ${GRAY5}`, borderRadius: 8, fontSize: 13, color: GRAY1, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: GRAY3, display: 'block', marginBottom: 4, fontWeight: 600 }}>Mês de referência</label>
                    <input type="month" value={entregaMes} onChange={e => setEntregaMes(e.target.value)} style={{ width: '100%', padding: '8px 10px', border: `1px solid ${GRAY5}`, borderRadius: 8, fontSize: 13, color: GRAY1, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </div>
                {hasMidia && (
                  <div>
                    <label style={{ fontSize: 11, color: GRAY3, display: 'block', marginBottom: 4, fontWeight: 600 }}>Campanhas rodadas (Mídia Paga)</label>
                    <input type="number" min="0" value={entregaForm.campanhas} onChange={e => setEntregaForm(f => ({ ...f, campanhas: e.target.value }))} placeholder="0" style={{ width: '100%', padding: '8px 10px', border: `1px solid ${GRAY5}`, borderRadius: 8, fontSize: 13, color: GRAY1, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                )}
                {hasDesign && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, color: GRAY3, display: 'block', marginBottom: 4, fontWeight: 600 }}>Estáticos entregues</label>
                      <input type="number" min="0" value={entregaForm.estaticos} onChange={e => setEntregaForm(f => ({ ...f, estaticos: e.target.value }))} placeholder="0" style={{ width: '100%', padding: '8px 10px', border: `1px solid ${GRAY5}`, borderRadius: 8, fontSize: 13, color: GRAY1, outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: GRAY3, display: 'block', marginBottom: 4, fontWeight: 600 }}>Vídeos entregues</label>
                      <input type="number" min="0" value={entregaForm.videos} onChange={e => setEntregaForm(f => ({ ...f, videos: e.target.value }))} placeholder="0" style={{ width: '100%', padding: '8px 10px', border: `1px solid ${GRAY5}`, borderRadius: 8, fontSize: 13, color: GRAY1, outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                  </div>
                )}
                {hasSocial && (
                  <div>
                    <label style={{ fontSize: 11, color: GRAY3, display: 'block', marginBottom: 4, fontWeight: 600 }}>Posts publicados (Social Media)</label>
                    <input type="number" min="0" value={entregaForm.posts} onChange={e => setEntregaForm(f => ({ ...f, posts: e.target.value }))} placeholder="0" style={{ width: '100%', padding: '8px 10px', border: `1px solid ${GRAY5}`, borderRadius: 8, fontSize: 13, color: GRAY1, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                )}
                {!hasMidia && !hasDesign && !hasSocial && (
                  <div style={{ fontSize: 12, color: GRAY3, padding: '12px 0', textAlign: 'center' }}>Nenhum serviço com volume configurado neste projeto.</div>
                )}
                <div>
                  <label style={{ fontSize: 11, color: GRAY3, display: 'block', marginBottom: 4, fontWeight: 600 }}>Observação (opcional)</label>
                  <input type="text" value={entregaForm.observacao} onChange={e => setEntregaForm(f => ({ ...f, observacao: e.target.value }))} placeholder="Ex: Entrega parcial — arte aprovada na revisão" style={{ width: '100%', padding: '8px 10px', border: `1px solid ${GRAY5}`, borderRadius: 8, fontSize: 13, color: GRAY1, outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
                <button onClick={() => setEntregaProjetoId(null)} style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${GRAY5}`, background: WHITE, color: GRAY2, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
                <button onClick={() => saveEntrega(entregaProjetoId)} disabled={savingEntrega} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: BLUE, color: WHITE, fontSize: 13, fontWeight: 700, cursor: savingEntrega ? 'not-allowed' : 'pointer', opacity: savingEntrega ? 0.7 : 1 }}>
                  {savingEntrega ? 'Salvando...' : 'Salvar Entrega'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {editId && (() => {
        const p = projetos.find(x => x.id === editId)
        if (!p) return null
        const t = TIPO[editForm.tipo]
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,15,15,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(2px)' }}
            onClick={() => setEditId(null)}>
            <div style={{ background: WHITE, borderRadius: 20, width: '100%', maxWidth: 600, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 32px 80px rgba(0,0,0,0.28)', display: 'flex', flexDirection: 'column' }}
              onClick={e => e.stopPropagation()}>

              {/* Color bar */}
              <div style={{ height: 5, background: `linear-gradient(90deg, ${t.color}, ${t.color}99)`, borderRadius: '20px 20px 0 0', flexShrink: 0 }} />

              {/* Header */}
              <div style={{ padding: '22px 26px 0', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: t.bg, border: `1.5px solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Edit2 size={15} color={t.color} />
                    </div>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: GRAY1, letterSpacing: '-0.01em' }}>Editar Projeto</div>
                      <div style={{ fontSize: 11, color: GRAY3, marginTop: 2 }}>{p.nome}</div>
                    </div>
                  </div>
                  <button onClick={() => setEditId(null)} style={{ border: 'none', background: GRAY4, cursor: 'pointer', color: GRAY3, padding: 6, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = GRAY5 }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = GRAY4 }}>
                    <X size={15} />
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 22, marginBottom: 0 }}>
                  <div style={{ flex: 1, height: 1, background: GRAY5 }} />
                  <span style={{ fontSize: 10, color: GRAY3, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '0 4px' }}>Informações</span>
                  <div style={{ flex: 1, height: 1, background: GRAY5 }} />
                </div>
              </div>

              {/* Form body */}
              <div style={{ padding: '16px 26px', flex: 1, overflowY: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div style={{ gridColumn: '1/-1' }}>
                    <label style={{ fontSize: 10, color: GRAY3, display: 'block', marginBottom: 5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Nome do projeto *</label>
                    <input value={editForm.nome} onChange={e => setEditForm(f => ({ ...f, nome: e.target.value }))} style={{ padding: '10px 13px', background: WHITE, border: `1.5px solid ${GRAY5}`, borderRadius: 9, color: GRAY1, fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const, fontWeight: 500 }}
                      onFocus={e => (e.currentTarget.style.borderColor = BLUE)} onBlur={e => (e.currentTarget.style.borderColor = GRAY5)} />
                  </div>

                  <div>
                    <label style={{ fontSize: 10, color: GRAY3, display: 'block', marginBottom: 5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Tipo</label>
                    <select value={editForm.tipo} onChange={e => setEditForm(f => ({ ...f, tipo: e.target.value as Projeto['tipo'], servico: '' }))} style={{ padding: '10px 13px', background: WHITE, border: `1.5px solid ${GRAY5}`, borderRadius: 9, color: GRAY1, fontSize: 13, outline: 'none', width: '100%', cursor: 'pointer' }}>
                      <option value="saber">Saber</option>
                      <option value="ter">Ter</option>
                      <option value="executar">Executar</option>
                    </select>
                  </div>

                  {(editForm.tipo === 'saber' || editForm.tipo === 'ter') && (
                    <div>
                      <label style={{ fontSize: 10, color: GRAY3, display: 'block', marginBottom: 5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Serviço</label>
                      <select value={editForm.servico} onChange={e => setEditForm(f => ({ ...f, servico: e.target.value }))} style={{ padding: '10px 13px', background: WHITE, border: `1.5px solid ${GRAY5}`, borderRadius: 9, color: GRAY1, fontSize: 13, outline: 'none', width: '100%', cursor: 'pointer' }}>
                        <option value="">Selecione um serviço...</option>
                        {catalogoServicos.filter(s => s.tipo === editForm.tipo).map(s => (
                          <option key={s.id} value={s.id}>{s.nome}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label style={{ fontSize: 10, color: GRAY3, display: 'block', marginBottom: 5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Cobrança</label>
                    <select value={editForm.valor_tipo} onChange={e => setEditForm(f => ({ ...f, valor_tipo: e.target.value as Projeto['valor_tipo'] }))} style={{ padding: '10px 13px', background: WHITE, border: `1.5px solid ${GRAY5}`, borderRadius: 9, color: GRAY1, fontSize: 13, outline: 'none', width: '100%', cursor: 'pointer' }}>
                      <option value="mensalidade">Mensalidade</option>
                      <option value="pontual">Pontual</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: 10, color: GRAY3, display: 'block', marginBottom: 5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Valor (R$)</label>
                    <input type="text" inputMode="numeric" value={fmtCents(editForm.valor)} onChange={e => setEditForm(f => ({ ...f, valor: e.target.value.replace(/\D/g, '') }))} placeholder="0,00"
                      style={{ padding: '10px 13px', background: WHITE, border: `1.5px solid ${GRAY5}`, borderRadius: 9, color: GRAY1, fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const }}
                      onFocus={e => (e.currentTarget.style.borderColor = BLUE)} onBlur={e => (e.currentTarget.style.borderColor = GRAY5)} />
                  </div>

                  {editForm.tipo === 'executar' && (
                    <div>
                      <label style={{ fontSize: 10, color: GRAY3, display: 'block', marginBottom: 5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Verba Ads (R$/mês)</label>
                      <input type="text" inputMode="numeric" value={fmtCents(editForm.investimento_midia)} onChange={e => setEditForm(f => ({ ...f, investimento_midia: e.target.value.replace(/\D/g, '') }))} placeholder="0,00"
                        style={{ padding: '10px 13px', background: WHITE, border: `1.5px solid ${GRAY5}`, borderRadius: 9, color: GRAY1, fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const }}
                        onFocus={e => (e.currentTarget.style.borderColor = BLUE)} onBlur={e => (e.currentTarget.style.borderColor = GRAY5)} />
                    </div>
                  )}

                  <div>
                    <label style={{ fontSize: 10, color: GRAY3, display: 'block', marginBottom: 5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Data de início</label>
                    <input type="date" value={editForm.data_inicio} onChange={e => setEditForm(f => ({ ...f, data_inicio: e.target.value }))} style={{ padding: '10px 13px', background: WHITE, border: `1.5px solid ${GRAY5}`, borderRadius: 9, color: GRAY1, fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const }} />
                  </div>

                  <div>
                    <label style={{ fontSize: 10, color: GRAY3, display: 'block', marginBottom: 5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Data de fim</label>
                    <input type="date" value={editForm.data_fim} onChange={e => setEditForm(f => ({ ...f, data_fim: e.target.value }))} style={{ padding: '10px 13px', background: WHITE, border: `1.5px solid ${GRAY5}`, borderRadius: 9, color: GRAY1, fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const }} />
                  </div>

                  <div style={{ gridColumn: '1/-1' }}>
                    <label style={{ fontSize: 10, color: GRAY3, display: 'block', marginBottom: 5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Escopo / Descrição</label>
                    <textarea value={editForm.escopo} onChange={e => setEditForm(f => ({ ...f, escopo: e.target.value }))} rows={3}
                      style={{ padding: '10px 13px', background: WHITE, border: `1.5px solid ${GRAY5}`, borderRadius: 9, color: GRAY1, fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const, resize: 'vertical', fontFamily: 'inherit' }}
                      onFocus={e => (e.currentTarget.style.borderColor = BLUE)} onBlur={e => (e.currentTarget.style.borderColor = GRAY5)} />
                  </div>
                </div>

                {(editForm.tipo === 'saber' || editForm.tipo === 'ter') && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 22, marginBottom: 14 }}>
                      <div style={{ flex: 1, height: 1, background: GRAY5 }} />
                      <span style={{ fontSize: 10, color: GRAY3, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '0 4px' }}>
                        Serviços contratados{editServicos.length > 0 && <span style={{ marginLeft: 7, color: BLUE, background: '#EDE9FE', padding: '2px 8px', borderRadius: 10 }}>{editServicos.length}</span>}
                      </span>
                      <div style={{ flex: 1, height: 1, background: GRAY5 }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {editServicos.map((s, i) => (
                        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <input type="text" value={s.nome} onChange={e => setEditServicos(prev => prev.map((x, j) => j === i ? { ...x, nome: e.target.value } : x))} placeholder="Nome do serviço"
                            style={{ flex: 1, padding: '8px 10px', border: `1.5px solid ${GRAY5}`, borderRadius: 8, fontSize: 13, color: GRAY1, outline: 'none', background: WHITE }} />
                          <input type="number" min="1" value={s.quantidade_prevista} onChange={e => setEditServicos(prev => prev.map((x, j) => j === i ? { ...x, quantidade_prevista: parseInt(e.target.value) || 1 } : x))}
                            style={{ width: 60, padding: '8px 10px', border: `1.5px solid ${GRAY5}`, borderRadius: 8, fontSize: 13, color: GRAY1, outline: 'none', background: WHITE, textAlign: 'center' }} />
                          <input type="text" value={s.unidade} onChange={e => setEditServicos(prev => prev.map((x, j) => j === i ? { ...x, unidade: e.target.value } : x))} placeholder="entrega"
                            style={{ width: 90, padding: '8px 10px', border: `1.5px solid ${GRAY5}`, borderRadius: 8, fontSize: 13, color: GRAY1, outline: 'none', background: WHITE }} />
                          <button onClick={() => setEditServicos(prev => prev.filter((_, j) => j !== i))} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: GRAY3, display: 'flex', padding: 4, borderRadius: 6 }}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                      <div style={{ fontSize: 10, color: GRAY3, marginBottom: 2, display: editServicos.length > 0 ? 'block' : 'none' }}>Nome · Qtd prevista · Unidade</div>
                      <button onClick={() => setEditServicos(prev => [...prev, { nome: '', quantidade_prevista: 1, unidade: 'entrega' }])}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 8, border: `1.5px dashed ${GRAY5}`, background: GRAY4, color: GRAY2, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        <Plus size={13} /> Adicionar serviço
                      </button>
                    </div>
                  </>
                )}

                {editForm.tipo === 'executar' && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 22, marginBottom: 14 }}>
                      <div style={{ flex: 1, height: 1, background: GRAY5 }} />
                      <span style={{ fontSize: 10, color: GRAY3, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '0 4px' }}>
                        Serviços contratados{editServicosSel.length > 0 && <span style={{ marginLeft: 7, color: '#15803D', background: '#D1FAE5', padding: '2px 8px', borderRadius: 10 }}>{editServicosSel.length}</span>}
                      </span>
                      <div style={{ flex: 1, height: 1, background: GRAY5 }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {servicosExec.map(s => {
                        const sel = editServicosSel.find(x => x.key === s.key)
                        const checked = !!sel
                        const isDesign = s.key === 'design_grafico'
                        return (
                          <div key={s.key}
                            style={{ padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${checked ? '#86EFAC' : GRAY5}`, background: checked ? '#F0FDF4' : GRAY4, transition: 'all .2s', gridColumn: checked && isDesign ? '1/-1' : undefined, cursor: 'pointer' }}
                            onClick={() => toggleEditServico(s.key)}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${checked ? '#22C55E' : GRAY3}`, background: checked ? '#22C55E' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all .2s' }}>
                                {checked && <Check size={11} color={WHITE} strokeWidth={3} />}
                              </div>
                              <span style={{ fontSize: 12, color: checked ? '#15803D' : GRAY2, fontWeight: checked ? 700 : 500, flex: 1 }}>
                                {s.label}{s.volumeType && s.volumeType !== 'generic' && <span style={{ fontWeight: 400, color: checked ? '#16A34A' : GRAY3 }}> *</span>}
                              </span>
                            </div>
                            {checked && s.temVolume && (
                              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                                {s.volumeType === 'campanhas' && <>
                                  <input type="number" min="0" placeholder="0" value={sel?.campanhas ?? ''} onChange={e => setEditServicoField(s.key, 'campanhas', e.target.value ? Number(e.target.value) : '')} style={{ flex: 1, minWidth: 60, padding: '6px 10px', borderRadius: 7, border: '1.5px solid #86EFAC', background: WHITE, fontSize: 12, color: GRAY1, outline: 'none' }} />
                                  <span style={{ fontSize: 11, color: '#15803D', fontWeight: 600, whiteSpace: 'nowrap' }}>campanhas/mês</span>
                                </>}
                                {s.volumeType === 'posts' && <>
                                  <input type="number" min="0" placeholder="0" value={sel?.posts ?? ''} onChange={e => setEditServicoField(s.key, 'posts', e.target.value ? Number(e.target.value) : '')} style={{ flex: 1, minWidth: 60, padding: '6px 10px', borderRadius: 7, border: '1.5px solid #86EFAC', background: WHITE, fontSize: 12, color: GRAY1, outline: 'none' }} />
                                  <span style={{ fontSize: 11, color: '#15803D', fontWeight: 600, whiteSpace: 'nowrap' }}>posts/mês</span>
                                </>}
                                {s.volumeType === 'design' && <>
                                  <input type="number" min="0" placeholder="Estáticos" value={sel?.estaticos ?? ''} onChange={e => setEditServicoField(s.key, 'estaticos', e.target.value ? Number(e.target.value) : '')} style={{ flex: 1, minWidth: 70, padding: '6px 10px', borderRadius: 7, border: '1.5px solid #86EFAC', background: WHITE, fontSize: 12, color: GRAY1, outline: 'none' }} />
                                  <input type="number" min="0" placeholder="Vídeos" value={sel?.videos ?? ''} onChange={e => setEditServicoField(s.key, 'videos', e.target.value ? Number(e.target.value) : '')} style={{ flex: 1, minWidth: 60, padding: '6px 10px', borderRadius: 7, border: '1.5px solid #86EFAC', background: WHITE, fontSize: 12, color: GRAY1, outline: 'none' }} />
                                  <span style={{ fontSize: 11, color: '#15803D', fontWeight: 600, whiteSpace: 'nowrap' }}>est / vid/mês</span>
                                </>}
                                {s.volumeType === 'generic' && <>
                                  <input type="text" placeholder="Volume" value={sel?.volume ?? ''} onChange={e => setEditServicoField(s.key, 'volume', e.target.value)} style={{ flex: 1, padding: '6px 10px', borderRadius: 7, border: '1.5px solid #86EFAC', background: WHITE, fontSize: 12, color: GRAY1, outline: 'none' }} />
                                  <span style={{ fontSize: 11, color: '#15803D', fontWeight: 600, whiteSpace: 'nowrap' }}>/mês</span>
                                </>}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    <div style={{ fontSize: 10, color: GRAY3, marginTop: 8 }}>* Volume obrigatório para Mídia Paga, Design Gráfico e Social Media</div>
                  </>
                )}
              </div>

              {/* Footer */}
              <div style={{ padding: '14px 26px 22px', borderTop: `1px solid ${GRAY5}`, display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0, background: GRAY4, borderRadius: '0 0 20px 20px' }}>
                <button onClick={() => setEditId(null)} style={{ padding: '9px 20px', borderRadius: 9, border: `1.5px solid ${GRAY5}`, background: WHITE, color: GRAY2, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
                <button onClick={updateProj} disabled={!editForm.nome.trim() || saving}
                  style={{ padding: '9px 22px', borderRadius: 9, border: 'none', background: !editForm.nome.trim() || saving ? GRAY3 : R, color: WHITE, fontSize: 13, fontWeight: 700, cursor: !editForm.nome.trim() || saving ? 'not-allowed' : 'pointer', boxShadow: !editForm.nome.trim() || saving ? 'none' : `0 2px 10px ${R}40`, display: 'flex', alignItems: 'center', gap: 6, transition: 'all .15s' }}>
                  {saving ? 'Salvando...' : <><Check size={13} /> Salvar alterações</>}
                </button>
              </div>
            </div>
          </div>
        )
      })()}


      {showNew && canEdit && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => setShowNew(false)}>
          <div style={{ background: WHITE, borderRadius: 16, padding: 28, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}
            onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: GRAY1 }}>Novo Projeto</div>
            <button onClick={() => setShowNew(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: GRAY3, display: 'flex', padding: 4, borderRadius: 6 }}>
              <X size={18} />
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ fontSize: 11, color: GRAY3, display: 'block', marginBottom: 4, fontWeight: 600 }}>Nome do projeto *</label>
              <input value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} placeholder="Ex: Saber Q2 2025" style={input14} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: GRAY3, display: 'block', marginBottom: 4, fontWeight: 600 }}>Tipo</label>
              <select value={form.tipo} onChange={e => { setForm(p => ({ ...p, tipo: e.target.value as Projeto['tipo'], servico: '' })); setNewServicos([]) }} style={{ ...input14 }}>
                <option value="saber">Saber</option><option value="ter">Ter</option><option value="executar">Executar</option>
              </select>
            </div>
            {(form.tipo === 'saber' || form.tipo === 'ter') && (
              <div>
                <label style={{ fontSize: 11, color: GRAY3, display: 'block', marginBottom: 4, fontWeight: 600 }}>Serviço</label>
                <select value={form.servico} onChange={e => setForm(p => ({ ...p, servico: e.target.value }))} style={{ ...input14 }}>
                  <option value="">Selecione um serviço...</option>
                  {servicosDoTipo.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                </select>
                {servicosDoTipo.length === 0 && <div style={{ fontSize: 11, color: GRAY3, marginTop: 4 }}>Nenhum serviço cadastrado. Acesse <strong>Catálogo</strong> no menu para criar.</div>}
              </div>
            )}
            {form.tipo === 'executar' && (
              <div style={{ gridColumn: '1/-1' }}>
                <label style={{ fontSize: 11, color: GRAY3, display: 'block', marginBottom: 8, fontWeight: 600 }}>
                  Serviços contratados {servicosSel.length > 0 && <span style={{ color: '#065F46', background: '#D1FAE5', padding: '1px 7px', borderRadius: 10, marginLeft: 6 }}>{servicosSel.length} selecionado{servicosSel.length !== 1 ? 's' : ''}</span>}
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {servicosExec.map(s => {
                    const sel = servicosSel.find(x => x.key === s.key)
                    const checked = !!sel
                    const isDesign = s.key === 'design_grafico'
                    return (
                      <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, border: `1px solid ${checked ? '#A7F3D0' : GRAY5}`, background: checked ? '#F0FDF4' : GRAY4, transition: 'all .15s', gridColumn: checked && isDesign ? '1/-1' : undefined }}>
                        <input type="checkbox" checked={checked} onChange={() => toggleServico(s.key)}
                          style={{ width: 15, height: 15, accentColor: '#065F46', cursor: 'pointer', flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: checked ? '#065F46' : GRAY1, fontWeight: checked ? 600 : 400, flex: 1 }}>
                          {s.label}{s.volumeType && s.volumeType !== 'generic' && <span style={{ color: GRAY3 }}> *</span>}
                        </span>
                        {checked && s.temVolume && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={e => e.stopPropagation()}>
                            {s.volumeType === 'campanhas' && <>
                              <input type="number" min="0" placeholder="Qtd" value={sel?.campanhas ?? ''}
                                onChange={e => setServicoField(s.key, 'campanhas', e.target.value ? Number(e.target.value) : '')}
                                style={{ width: 65, padding: '4px 8px', borderRadius: 5, border: `1px solid #A7F3D0`, background: WHITE, fontSize: 12, color: GRAY1, outline: 'none' }} />
                              <span style={{ fontSize: 11, color: GRAY3, whiteSpace: 'nowrap' }}>campanhas/mês</span>
                            </>}
                            {s.volumeType === 'posts' && <>
                              <input type="number" min="0" placeholder="Qtd" value={sel?.posts ?? ''}
                                onChange={e => setServicoField(s.key, 'posts', e.target.value ? Number(e.target.value) : '')}
                                style={{ width: 65, padding: '4px 8px', borderRadius: 5, border: `1px solid #A7F3D0`, background: WHITE, fontSize: 12, color: GRAY1, outline: 'none' }} />
                              <span style={{ fontSize: 11, color: GRAY3, whiteSpace: 'nowrap' }}>posts/mês</span>
                            </>}
                            {s.volumeType === 'design' && <>
                              <input type="number" min="0" placeholder="Estáticos" value={sel?.estaticos ?? ''}
                                onChange={e => setServicoField(s.key, 'estaticos', e.target.value ? Number(e.target.value) : '')}
                                style={{ width: 70, padding: '4px 8px', borderRadius: 5, border: `1px solid #A7F3D0`, background: WHITE, fontSize: 12, color: GRAY1, outline: 'none' }} />
                              <span style={{ fontSize: 11, color: GRAY3 }}>est</span>
                              <input type="number" min="0" placeholder="Vídeos" value={sel?.videos ?? ''}
                                onChange={e => setServicoField(s.key, 'videos', e.target.value ? Number(e.target.value) : '')}
                                style={{ width: 70, padding: '4px 8px', borderRadius: 5, border: `1px solid #A7F3D0`, background: WHITE, fontSize: 12, color: GRAY1, outline: 'none' }} />
                              <span style={{ fontSize: 11, color: GRAY3, whiteSpace: 'nowrap' }}>vid/mês</span>
                            </>}
                            {s.volumeType === 'generic' && <>
                              <input type="text" placeholder="Volume" value={sel?.volume ?? ''}
                                onChange={e => setServicoField(s.key, 'volume', e.target.value)}
                                style={{ width: 80, padding: '4px 8px', borderRadius: 5, border: `1px solid #A7F3D0`, background: WHITE, fontSize: 12, color: GRAY1, outline: 'none' }} />
                              <span style={{ fontSize: 11, color: GRAY3, whiteSpace: 'nowrap' }}>/mês</span>
                            </>}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                <div style={{ fontSize: 10, color: GRAY3, marginTop: 6 }}>* Volume mensal obrigatório para Mídia Paga, Design Gráfico e Social Media</div>
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
                value={fmtCents(form.valor)}
                onChange={e => setForm(p => ({ ...p, valor: e.target.value.replace(/\D/g, '') }))}
                placeholder="0,00" style={input14} />
            </div>
            {form.tipo === 'executar' && (
              <div>
                <label style={{ fontSize: 11, color: GRAY3, display: 'block', marginBottom: 4, fontWeight: 600 }}>Verba Google/Meta Ads (R$/mês)</label>
                <input type="text" inputMode="numeric"
                  value={fmtCents(form.investimento_midia)}
                  onChange={e => setForm(p => ({ ...p, investimento_midia: e.target.value.replace(/\D/g, '') }))}
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
          {(form.tipo === 'saber' || form.tipo === 'ter') && (
            <div style={{ marginTop: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ flex: 1, height: 1, background: GRAY5 }} />
                <span style={{ fontSize: 10, color: GRAY3, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '0 4px' }}>
                  Serviços contratados{newServicos.length > 0 && <span style={{ marginLeft: 7, color: BLUE, background: '#EDE9FE', padding: '2px 8px', borderRadius: 10 }}>{newServicos.length}</span>}
                </span>
                <div style={{ flex: 1, height: 1, background: GRAY5 }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {newServicos.map((s, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="text" value={s.nome} onChange={e => setNewServicos(prev => prev.map((x, j) => j === i ? { ...x, nome: e.target.value } : x))} placeholder="Nome do serviço"
                      style={{ flex: 1, padding: '8px 10px', border: `1.5px solid ${GRAY5}`, borderRadius: 8, fontSize: 13, color: GRAY1, outline: 'none', background: WHITE }} />
                    <input type="number" min="1" value={s.quantidade_prevista} onChange={e => setNewServicos(prev => prev.map((x, j) => j === i ? { ...x, quantidade_prevista: parseInt(e.target.value) || 1 } : x))}
                      style={{ width: 60, padding: '8px 10px', border: `1.5px solid ${GRAY5}`, borderRadius: 8, fontSize: 13, color: GRAY1, outline: 'none', background: WHITE, textAlign: 'center' }} />
                    <input type="text" value={s.unidade} onChange={e => setNewServicos(prev => prev.map((x, j) => j === i ? { ...x, unidade: e.target.value } : x))} placeholder="entrega"
                      style={{ width: 90, padding: '8px 10px', border: `1.5px solid ${GRAY5}`, borderRadius: 8, fontSize: 13, color: GRAY1, outline: 'none', background: WHITE }} />
                    <button onClick={() => setNewServicos(prev => prev.filter((_, j) => j !== i))} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: GRAY3, display: 'flex', padding: 4, borderRadius: 6 }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                {newServicos.length > 0 && <div style={{ fontSize: 10, color: GRAY3, marginBottom: 2 }}>Nome · Qtd prevista · Unidade (ex: entrega, hora, apresentação)</div>}
                <button onClick={() => setNewServicos(prev => [...prev, { nome: '', quantidade_prevista: 1, unidade: 'entrega' }])}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 8, border: `1.5px dashed ${GRAY5}`, background: GRAY4, color: GRAY2, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  <Plus size={13} /> Adicionar serviço
                </button>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button onClick={save} disabled={!form.nome.trim() || saving} style={btnPrimary(!form.nome.trim() || saving)}>{saving ? 'Salvando...' : 'Salvar Projeto'}</button>
            <button onClick={() => setShowNew(false)} style={btnGhost}>Cancelar</button>
          </div>
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

function TabHealthScore({ entries, metas, clienteId, onReload, canEdit, objetivos, resultados }: { entries: HealthScoreEntry[]; metas: MetaSemanal[]; clienteId: string; onReload: () => void; canEdit: boolean; objetivos: ObjetivoMensal[]; resultados: ResultadoSemanal[] }) {
  const semanaAtual = startOfWeek()
  const mesAtual = semanaAtual.slice(0, 7)
  const jaTemSemana = entries.some(e => e.semana === semanaAtual)

  // New system: objetivos_mensais + resultados_semanais
  const objetivosMes = objetivos.filter(o => o.mes === mesAtual)
  const resultadosSemana = resultados.filter(r => r.semana === semanaAtual)
  // Gate: all objectives must have weekly results before saving Health Score
  // Exceção: 1ª segunda do mês não tem slot de resultado (cobrindo mês anterior)
  const isPrimeiraSegunda = semanaAtual === getFirstMondayOfMonth(mesAtual)
  const objetivosSemFalta = isPrimeiraSegunda ? [] : objetivosMes.filter(o =>
    !resultadosSemana.some(r => r.objetivo_id === o.id && r.valor_realizado !== null)
  )
  const gateOk = objetivosMes.length === 0 || isPrimeiraSegunda || objetivosSemFalta.length === 0

  const metasSemana = metas.filter(m => m.semana === semanaAtual && m.valor_meta && m.valor_realizado !== null)
  const resultado = useMemo(() => {
    const objMes = objetivos.filter(o => o.mes === mesAtual)
    if (objMes.length > 0) {
      const [y, m] = mesAtual.split('-').map(Number)
      const daysInMonth = new Date(y, m, 0).getDate()
      const slotDays = getSlotDays(semanaAtual, mesAtual)
      const resSem = resultados.filter(r => r.semana === semanaAtual)
      const pcts = objMes.map(o => {
        const r = resSem.find(r => r.objetivo_id === o.id)
        if (!r || r.valor_realizado === null) return null
        const metaPeriodo = o.valor_meta * slotDays / daysInMonth
        if (!metaPeriodo) return null
        return (r.valor_realizado / metaPeriodo) * 100
      }).filter((v): v is number => v !== null)
      if (!pcts.length) return 0
      return Math.min(10, parseFloat((pcts.reduce((a, b) => a + b, 0) / pcts.length / 10).toFixed(2)))
    }
    const legacy = metas.filter(m => m.semana === semanaAtual && m.valor_meta && m.valor_realizado !== null)
    if (!legacy.length) return 0
    const avg = legacy.reduce((acc, m) => acc + (m.valor_realizado! / m.valor_meta!) * 100, 0) / legacy.length
    return Math.min(10, parseFloat((avg / 10).toFixed(2)))
  }, [objetivos, resultados, metas, semanaAtual, mesAtual])

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
    if (!gateOk) {
      toast.warning('Preencha o resultado semanal de todos os objetivos antes de salvar o Health Score.')
      return
    }
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
      toast.error('Erro ao salvar health score: ' + error.message)
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
            <RadarChart data={radarData} outerRadius={70} margin={{ top: 10, right: 20, bottom: 10, left: 30 }}>
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
                  <span style={{ fontSize: 14, fontWeight: 800, color: resultado > 0 ? healthColor(resultado) : GRAY3, minWidth: 32, textAlign: 'right' }}>
                    {resultado > 0 ? resultado.toFixed(1) : '—'}
                  </span>
                </div>
                <div style={{ padding: '14px 16px' }}>
                  {objetivosMes.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {(() => {
                        const [hy, hm] = mesAtual.split('-').map(Number)
                        const hDaysInMonth = new Date(hy, hm, 0).getDate()
                        const hSlotDays = getSlotDays(semanaAtual, mesAtual)
                        return objetivosMes.map(o => {
                        const r = resultadosSemana.find(r => r.objetivo_id === o.id)
                        const metaPeriodo = o.valor_meta * hSlotDays / hDaysInMonth
                        const pct = r?.valor_realizado != null ? (r.valor_realizado / metaPeriodo) * 100 : null
                        const c = pct != null ? (pct >= 100 ? GREEN : pct >= 50 ? YELLOW : R) : GRAY3
                        return (
                          <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 12, color: pct == null ? R : GRAY2, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {o.descricao}
                              {pct == null && <span style={{ color: R, fontWeight: 700, marginLeft: 4 }}>⚠</span>}
                            </span>
                            {pct != null ? (
                              <>
                                <div style={{ width: 80, height: 5, background: GRAY5, borderRadius: 3, flexShrink: 0 }}>
                                  <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: c, borderRadius: 3 }} />
                                </div>
                                <span style={{ fontSize: 11, fontWeight: 700, color: c, width: 38, textAlign: 'right', flexShrink: 0 }}>{pct.toFixed(0)}%</span>
                              </>
                            ) : (
                              <span style={{ fontSize: 11, color: R, width: 80, textAlign: 'right', flexShrink: 0 }}>sem resultado</span>
                            )}
                          </div>
                        )
                      })})()}
                      {resultado > 0 && (
                        <div style={{ fontSize: 11, color: GRAY3, marginTop: 4 }}>
                          Média: {(resultado * 10).toFixed(1)}% → score {resultado.toFixed(1)}/10
                        </div>
                      )}
                    </div>
                  ) : metasSemana.length === 0 ? (
                    <div style={{ fontSize: 12, color: GRAY3, fontStyle: 'italic' }}>
                      Nenhum objetivo registrado para este mês. Cadastre objetivos na aba <strong>Metas</strong>.
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
              {!gateOk && (
                <div style={{ padding: '10px 14px', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 8, fontSize: 12, color: '#92400E', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>Preencha o resultado semanal {objetivosSemFalta.length === 1 ? 'do objetivo' : `dos ${objetivosSemFalta.length} objetivos`}: <strong>{objetivosSemFalta.map(o => o.descricao).join(', ')}</strong></span>
                </div>
              )}
              <button onClick={saveHealth} disabled={saving || !gateOk} style={btnPrimary(saving || !gateOk)}>
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
// TAB: METAS MENSAIS (Burnup)
// ══════════════════════════════════════════════════════════════════════════════
function TabMetas({ metas, projetos, clienteId, onReload, canEdit, objetivos, resultados }: { metas: MetaSemanal[]; projetos: Projeto[]; clienteId: string; onReload: () => void; canEdit: boolean; objetivos: ObjetivoMensal[]; resultados: ResultadoSemanal[] }) {
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const mesAtual = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

  const meses = useMemo(() => {
    const all = [mesAtual, ...objetivos.map(o => o.mes)]
    return Array.from(new Set(all)).sort().reverse()
  }, [objetivos, mesAtual])

  const [selectedMes, setSelectedMes] = useState(mesAtual)
  const [showNewObjetivo, setShowNewObjetivo] = useState(false)
  const [formObjetivo, setFormObjetivo] = useState({ descricao: '', valor_meta: '', unidade: '', projeto_id: '' })
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ descricao: '', valor_meta: '', unidade: '', projeto_id: '' })
  const [resultadosLocal, setResultadosLocal] = useState<Record<string, string>>({})

  const objetivosMes = objetivos.filter(o => o.mes === selectedMes)
  const mondays = useMemo(() => getMondaysInMonth(selectedMes), [selectedMes])
  const firstMonday = getFirstMondayOfMonth(selectedMes)
  const objetivosLocked = false // sem bloqueio — pode editar a qualquer momento

  function getResultado(objetivoId: string, semana: string) {
    return resultados.find(r => r.objetivo_id === objetivoId && r.semana === semana)
  }
  function localKey(objetivoId: string, semana: string) { return `${objetivoId}_${semana}` }

  function getBurnupData(objetivo: ObjetivoMensal) {
    const weeks = getMondaysInMonth(objetivo.mes)
    const [y, m] = objetivo.mes.split('-').map(Number)
    const daysInMonth = new Date(y, m, 0).getDate()
    const nextM = m === 12 ? 1 : m + 1
    const nextY = m === 12 ? y + 1 : y
    const closingSemana = getFirstMondayOfMonth(`${nextY}-${String(nextM).padStart(2,'0')}`)
    let cumulative = 0
    const data = weeks.map((semana, i) => {
      const r = getResultado(objetivo.id, semana)
      const hasValue = r?.valor_realizado != null
      if (hasValue) cumulative += r!.valor_realizado!
      const dayOfMonth = parseInt(semana.split('-')[2])
      return {
        semana: semana.slice(5).replace('-', '/'),
        planejado: parseFloat(((objetivo.valor_meta / daysInMonth) * dayOfMonth).toFixed(2)),
        // primeiro ponto sempre ancorado em 0 para a linha partir da origem
        realizado: i === 0 ? 0 : (hasValue ? cumulative : null),
      }
    })
    // closing slot: 1ª segunda do mês seguinte, cobre dias finais do mês atual
    const closingR = getResultado(objetivo.id, closingSemana)
    const hasClosing = closingR?.valor_realizado != null
    if (hasClosing) cumulative += closingR!.valor_realizado!
    data.push({
      semana: `${String(daysInMonth).padStart(2,'0')}/${String(m).padStart(2,'0')}`,
      planejado: objetivo.valor_meta,
      realizado: hasClosing ? cumulative : null,
    })
    return data
  }

  async function saveObjetivo() {
    if (!formObjetivo.descricao.trim() || !formObjetivo.valor_meta) return
    setSaving(true)
    await supabase.from('objetivos_mensais').insert({
      cliente_id: clienteId, mes: selectedMes,
      descricao: formObjetivo.descricao,
      valor_meta: parseFloat(formObjetivo.valor_meta),
      unidade: formObjetivo.unidade,
      projeto_id: formObjetivo.projeto_id || null,
      observacoes: '',
    })
    setShowNewObjetivo(false)
    setFormObjetivo({ descricao: '', valor_meta: '', unidade: '', projeto_id: '' })
    await onReload(); setSaving(false)
  }

  async function saveEditObjetivo() {
    if (!editingId || !editForm.descricao.trim() || !editForm.valor_meta) return
    setSaving(true)
    await supabase.from('objetivos_mensais').update({
      descricao: editForm.descricao,
      valor_meta: parseFloat(editForm.valor_meta),
      unidade: editForm.unidade,
      projeto_id: editForm.projeto_id || null,
    }).eq('id', editingId)
    setEditingId(null); await onReload(); setSaving(false)
  }

  async function deleteObjetivo(id: string) {
    if (!confirm('Excluir este objetivo? Todos os resultados semanais serão perdidos.')) return
    await supabase.from('resultados_semanais').delete().eq('objetivo_id', id)
    await supabase.from('objetivos_mensais').delete().eq('id', id)
    await onReload()
  }

  async function saveResultado(objetivoId: string, semana: string, valorStr: string) {
    const valor = valorStr !== '' ? parseFloat(valorStr) : null
    await supabase.from('resultados_semanais').upsert({
      objetivo_id: objetivoId, cliente_id: clienteId,
      semana, valor_realizado: valor, observacoes: '',
    }, { onConflict: 'objetivo_id,semana' })
    setResultadosLocal(prev => { const n = { ...prev }; delete n[localKey(objetivoId, semana)]; return n })
    await onReload()
  }

  return (
    <div>
      {/* Month selector */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: GRAY3, fontWeight: 600, marginRight: 4 }}>Mês:</span>
        {meses.map(mes => (
          <button key={mes} onClick={() => setSelectedMes(mes)} style={{
            padding: '6px 14px', borderRadius: 7,
            border: `1px solid ${selectedMes === mes ? PURPLE : GRAY5}`,
            background: selectedMes === mes ? PURPLE : WHITE,
            color: selectedMes === mes ? WHITE : GRAY2,
            fontSize: 12, fontWeight: selectedMes === mes ? 700 : 400, cursor: 'pointer',
          }}>
            {fmtMes(mes)}{mes === mesAtual ? ' ·' : ''}
          </button>
        ))}
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: GRAY1 }}>Objetivos de {fmtMes(selectedMes)}</div>
          <div style={{ fontSize: 11, color: GRAY3, marginTop: 2 }}>
            1ª segunda-feira: {fmtDate(firstMonday)}
          </div>
        </div>
        {canEdit && !objetivosLocked && (
          <button onClick={() => setShowNewObjetivo(o => !o)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 8, border: `1px solid ${GRAY5}`,
            background: WHITE, color: GRAY2, fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>
            <Plus size={13} /> Novo objetivo
          </button>
        )}
      </div>

      {/* New objective form */}
      {showNewObjetivo && canEdit && (
        <div style={{ ...card, padding: 18, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: GRAY1, marginBottom: 12 }}>Novo objetivo mensal</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px', gap: 10, marginBottom: 10 }}>
            <input value={formObjetivo.descricao} onChange={e => setFormObjetivo(p => ({ ...p, descricao: e.target.value }))}
              placeholder="Descrição do objetivo *" style={{ ...input14 }} />
            <input type="number" value={formObjetivo.valor_meta} onChange={e => setFormObjetivo(p => ({ ...p, valor_meta: e.target.value }))}
              placeholder="Meta *" style={{ ...input14 }} />
            <input value={formObjetivo.unidade} onChange={e => setFormObjetivo(p => ({ ...p, unidade: e.target.value }))}
              placeholder="Unidade" style={{ ...input14 }} />
          </div>
          {projetos.length > 0 && (
            <select value={formObjetivo.projeto_id} onChange={e => setFormObjetivo(p => ({ ...p, projeto_id: e.target.value }))}
              style={{ ...input14, marginBottom: 10 }}>
              <option value="">Projeto (opcional)</option>
              {projetos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={saveObjetivo} disabled={!formObjetivo.descricao.trim() || !formObjetivo.valor_meta || saving}
              style={btnPrimary(!formObjetivo.descricao.trim() || !formObjetivo.valor_meta || saving)}>
              {saving ? 'Salvando...' : 'Adicionar objetivo'}
            </button>
            <button onClick={() => setShowNewObjetivo(false)} style={btnGhost}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {objetivosMes.length === 0 && (
        <div style={{ ...card, padding: '40px 0', textAlign: 'center', marginBottom: 24 }}>
          <Target size={28} color={GRAY3} style={{ marginBottom: 10, opacity: 0.5 }} />
          <div style={{ fontSize: 14, color: GRAY2 }}>Nenhum objetivo para {fmtMes(selectedMes)}</div>
          {!objetivosLocked && canEdit && (
            <div style={{ fontSize: 12, color: GRAY3, marginTop: 4 }}>Adicione objetivos mensais acima</div>
          )}
        </div>
      )}

      {/* Objectives with burnup charts + weekly inputs */}
      {objetivosMes.map(objetivo => {
        const burnupData = getBurnupData(objetivo)
        const isEditingThis = editingId === objetivo.id
        const cumulativo = resultados
          .filter(r => r.objetivo_id === objetivo.id)
          .reduce((sum, r) => sum + (r.valor_realizado ?? 0), 0)
        const pct = objetivo.valor_meta ? (cumulativo / objetivo.valor_meta) * 100 : 0
        const statusColor = pct >= 100 ? GREEN : pct >= 50 ? YELLOW : R

        return (
          <div key={objetivo.id} style={{ ...card, padding: 20, marginBottom: 16 }}>
            {/* Objective header */}
            {isEditingThis ? (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px', gap: 10, marginBottom: 10 }}>
                  <input autoFocus value={editForm.descricao} onChange={e => setEditForm(p => ({ ...p, descricao: e.target.value }))}
                    placeholder="Descrição *" style={{ ...input14 }} />
                  <input type="number" value={editForm.valor_meta} onChange={e => setEditForm(p => ({ ...p, valor_meta: e.target.value }))}
                    placeholder="Meta *" style={{ ...input14 }} />
                  <input value={editForm.unidade} onChange={e => setEditForm(p => ({ ...p, unidade: e.target.value }))}
                    placeholder="Unidade" style={{ ...input14 }} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={saveEditObjetivo} disabled={!editForm.descricao.trim() || !editForm.valor_meta || saving}
                    style={btnPrimary(!editForm.descricao.trim() || !editForm.valor_meta || saving)}>
                    {saving ? 'Salvando...' : 'Salvar'}
                  </button>
                  <button onClick={() => setEditingId(null)} style={btnGhost}>Cancelar</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: GRAY1 }}>{objetivo.descricao}</div>
                  <div style={{ fontSize: 12, color: GRAY3, marginTop: 3, display: 'flex', gap: 10 }}>
                    <span>Meta: <strong style={{ color: GRAY2 }}>{objetivo.valor_meta} {objetivo.unidade}</strong></span>
                    <span>Realizado: <strong style={{ color: statusColor }}>{cumulativo > 0 ? `${cumulativo.toFixed(1)} ${objetivo.unidade}` : '—'}</strong></span>
                    {cumulativo > 0 && <span style={{ color: statusColor, fontWeight: 700 }}>{pct.toFixed(1)}%</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                    background: pct >= 100 ? '#D1FAE5' : pct >= 50 ? '#FEF3C7' : '#FEE2E2',
                    color: pct >= 100 ? '#065F46' : pct >= 50 ? '#92400E' : '#991B1B',
                    border: `1px solid ${pct >= 100 ? '#A7F3D0' : pct >= 50 ? '#FDE68A' : '#FECACA'}`,
                  }}>
                    {pct >= 100 ? 'Atingida' : pct >= 50 ? 'Parcial' : cumulativo > 0 ? 'Abaixo' : 'Pendente'}
                  </span>
                  {canEdit && !objetivosLocked && (
                    <>
                      <button onClick={() => { setEditingId(objetivo.id); setEditForm({ descricao: objetivo.descricao, valor_meta: String(objetivo.valor_meta), unidade: objetivo.unidade || '', projeto_id: objetivo.projeto_id || '' }) }}
                        style={{ padding: 5, border: 'none', background: 'transparent', cursor: 'pointer', color: GRAY3, display: 'flex' }}
                        onMouseEnter={e => (e.currentTarget.style.color = BLUE)} onMouseLeave={e => (e.currentTarget.style.color = GRAY3)}>
                        <Edit2 size={13} />
                      </button>
                      <button onClick={() => deleteObjetivo(objetivo.id)}
                        style={{ padding: 5, border: 'none', background: 'transparent', cursor: 'pointer', color: GRAY3, display: 'flex' }}
                        onMouseEnter={e => (e.currentTarget.style.color = R)} onMouseLeave={e => (e.currentTarget.style.color = GRAY3)}>
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Burnup chart */}
            <div style={{ marginBottom: 16 }}>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={burnupData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id={`gp-${objetivo.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={BLUE} stopOpacity={0.15} />
                      <stop offset="95%" stopColor={BLUE} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id={`gr-${objetivo.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={GREEN} stopOpacity={0.22} />
                      <stop offset="95%" stopColor={GREEN} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={GRAY5} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="semana" tick={{ fontSize: 10, fill: GRAY3 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: GRAY3 }} axisLine={false} tickLine={false} domain={[0, objetivo.valor_meta * 1.15]} />
                  <Tooltip
                    contentStyle={{ background: WHITE, border: `1px solid ${GRAY5}`, borderRadius: 8, fontSize: 12, boxShadow: '0 4px 16px rgba(0,0,0,.08)' }}
                    formatter={(v: any, name: string) => [`${Number(v).toFixed(1)} ${objetivo.unidade}`, name]}
                    labelStyle={{ color: GRAY2 }} />
                  <ReferenceLine y={objetivo.valor_meta} stroke={R} strokeDasharray="4 2" strokeWidth={1.5} />
                  <Area type="monotone" dataKey="planejado" name="Planejado" stroke={BLUE} strokeWidth={1.5} fill={`url(#gp-${objetivo.id})`} strokeDasharray="5 3" dot={false} connectNulls />
                  <Area type="monotone" dataKey="realizado" name="Realizado" stroke={GREEN} strokeWidth={2.5} fill={`url(#gr-${objetivo.id})`} dot={(p: any) => p.value > 0 ? <circle key={p.key} cx={p.cx} cy={p.cy} r={4} fill={GREEN} /> : <g key={p.key} />} connectNulls={false} />
                </AreaChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', gap: 16, fontSize: 10, color: GRAY3, marginTop: 4, paddingLeft: 4 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 20, height: 0, borderTop: `2px dashed ${BLUE}`, display: 'inline-block' }} /> Planejado (linear)
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 20, height: 2, background: GREEN, display: 'inline-block', borderRadius: 2 }} /> Realizado (acumulado)
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 20, height: 0, borderTop: `2px dashed ${R}`, display: 'inline-block' }} /> Meta
                </span>
              </div>
            </div>

            {/* Weekly results grid */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: GRAY3, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 8 }}>
                Resultados semanais
              </div>
              {(() => {
                const fmtShort = (s: string) => `${s.slice(8)}/${s.slice(5,7)}`
                const [mesY, mesM] = selectedMes.split('-').map(Number)
                const daysInMonth = new Date(mesY, mesM, 0).getDate()
                const lastDayOfMonth = `${selectedMes}-${String(daysInMonth).padStart(2,'0')}`
                const lastMondayOfMonth = mondays[mondays.length - 1]

                // slot de fechamento: 1ª segunda do mês seguinte cobre dias finais do mês
                const nextM = mesM === 12 ? 1 : mesM + 1
                const nextY = mesM === 12 ? mesY + 1 : mesY
                const nextMes = `${nextY}-${String(nextM).padStart(2,'0')}`
                const closingSemana = getFirstMondayOfMonth(nextMes)

                // slots regulares: 2ª segunda em diante (cada um cobre segunda anterior – domingo)
                const resultSlots = mondays.slice(1).map((semana, idx, arr) => {
                  const prevD = new Date(semana + 'T12:00:00'); prevD.setDate(prevD.getDate() - 7)
                  const prevFmt = `${prevD.getFullYear()}-${String(prevD.getMonth()+1).padStart(2,'0')}-${String(prevD.getDate()).padStart(2,'0')}`
                  const sunD = new Date(semana + 'T12:00:00'); sunD.setDate(sunD.getDate() - 1)
                  const sunFmt = `${sunD.getFullYear()}-${String(sunD.getMonth()+1).padStart(2,'0')}-${String(sunD.getDate()).padStart(2,'0')}`
                  return {
                    semana,
                    periodoStart: idx === 0 ? `${selectedMes}-01` : prevFmt,
                    periodoEnd: sunFmt,
                    isClosing: false,
                  }
                })

                // closing slot: 1ª segunda do mês seguinte, cobre do último Monday até fim do mês
                resultSlots.push({
                  semana: closingSemana,
                  periodoStart: lastMondayOfMonth,
                  periodoEnd: lastDayOfMonth,
                  isClosing: true,
                })

                const allSlots = resultSlots
                const cols = Math.min(allSlots.length, 4)

                return (
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8 }}>
                    {allSlots.map(({ semana, periodoStart, periodoEnd, isClosing }) => {
                      const existing = getResultado(objetivo.id, semana)
                      const lk = localKey(objetivo.id, semana)
                      const localVal = resultadosLocal[lk]
                      const displayVal = localVal !== undefined ? localVal : (existing?.valor_realizado != null ? String(existing.valor_realizado) : '')
                      // fechamento: disponível a partir do dia seguinte ao último dia do mês
                      const isFuture = isClosing ? todayStr <= lastDayOfMonth : semana > todayStr
                      const isCurrentWeek = !isClosing && semana === startOfWeek()
                      const hasSaved = existing?.valor_realizado != null
                      const periodoLabel = `${fmtShort(periodoStart)} – ${fmtShort(periodoEnd)}`
                      const disponivelApos = isClosing ? fmtDate(lastDayOfMonth) : fmtDate(semana)

                      return (
                        <div key={semana} style={{
                          padding: '10px 12px',
                          background: isClosing ? '#FFF7ED' : isCurrentWeek ? '#F5F3FF' : GRAY4,
                          border: `1px solid ${isClosing ? '#FED7AA' : isCurrentWeek ? PURPLE : hasSaved ? GREEN + '80' : GRAY5}`,
                          borderRadius: 8,
                        }}>
                          <div style={{ fontSize: 10, color: isClosing ? '#C2410C' : isCurrentWeek ? PURPLE : GRAY3, fontWeight: 600, marginBottom: 1 }}>
                            {isClosing ? 'Fechamento' : fmtDate(semana)}{isCurrentWeek ? ' ★' : ''}
                          </div>
                          <div style={{ fontSize: 9, color: isClosing ? '#EA580C' : isCurrentWeek ? PURPLE : GRAY3, marginBottom: 6, opacity: 0.75 }}>
                            {periodoLabel}
                          </div>
                          {canEdit && !isFuture ? (
                            <input
                              type="number"
                              value={displayVal}
                              onChange={e => setResultadosLocal(prev => ({ ...prev, [lk]: e.target.value }))}
                              onBlur={e => saveResultado(objetivo.id, semana, e.currentTarget.value)}
                              placeholder={`Acumulado ${periodoLabel}`}
                              style={{
                                width: '100%', padding: '5px 7px', background: WHITE,
                                border: `1px solid ${GRAY5}`, borderRadius: 5,
                                color: GRAY1, fontSize: 12, outline: 'none', boxSizing: 'border-box' as const,
                              }} />
                          ) : (
                            <div style={{ fontSize: 14, fontWeight: 700, color: hasSaved ? GRAY1 : isFuture ? GRAY3 : GRAY2 }}>
                              {hasSaved ? existing!.valor_realizado : isFuture ? 'Após ' + disponivelApos : '—'}
                            </div>
                          )}
                          {hasSaved && (
                            <div style={{ fontSize: 10, color: GRAY3, marginTop: 2 }}>{objetivo.unidade}</div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          </div>
        )
      })}
    </div>
  )
}
// ══════════════════════════════════════════════════════════════════════════════
// TAB: OPORTUNIDADES (Kanban)
// ══════════════════════════════════════════════════════════════════════════════
function TabOportunidades({ oportunidades, clienteId, onReload, canEdit }: { oportunidades: Oportunidade[]; clienteId: string; onReload: () => void; canEdit: boolean }) {
  const [showNew, setShowNew]           = useState(false)
  const [form, setForm]                 = useState({ titulo: '', descricao: '', etapa: 'identificada' as Oportunidade['etapa'], valor_estimado: '', data_estimada: '' })
  const [saving, setSaving]             = useState(false)
  const [ganhoOpp, setGanhoOpp]         = useState<Oportunidade | null>(null)
  const [ganhoLink, setGanhoLink]       = useState('')

  async function save() {
    if (!form.titulo.trim()) return; setSaving(true)
    await supabase.from('oportunidades').insert({ ...form, valor_estimado: form.valor_estimado ? parseFloat(form.valor_estimado) : null, data_estimada: form.data_estimada || null, cliente_id: clienteId })
    setShowNew(false); setForm({ titulo: '', descricao: '', etapa: 'identificada', valor_estimado: '', data_estimada: '' }); await onReload(); setSaving(false)
  }
  async function moveOpp(id: string, etapa: Oportunidade['etapa'], extra?: Record<string, any>) {
    await supabase.from('oportunidades').update({ etapa, ...extra }).eq('id', id); await onReload()
  }
  async function confirmarGanho() {
    if (!ganhoOpp) return; setSaving(true)
    await moveOpp(ganhoOpp.id, 'fechada', { link_contrato: ganhoLink || null })
    setGanhoOpp(null); setGanhoLink(''); setSaving(false)
  }
  async function deleteOpp(id: string) { await supabase.from('oportunidades').delete().eq('id', id); await onReload() }

  const totalPipeline = oportunidades.filter(o => o.etapa !== 'fechada').reduce((s, o) => s + (o.valor_estimado || 0), 0)

  return (
    <div>
      {/* Modal de ganho */}
      {ganhoOpp && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => { setGanhoOpp(null); setGanhoLink('') }}>
          <div style={{ background: WHITE, borderRadius: 16, padding: 28, width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#065F46' }}>🎉 Marcar como Ganho</div>
              <button onClick={() => { setGanhoOpp(null); setGanhoLink('') }} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: GRAY3, padding: 4 }}><X size={18} /></button>
            </div>
            <div style={{ fontSize: 13, color: GRAY2, marginBottom: 16 }}>
              <strong style={{ color: GRAY1 }}>{ganhoOpp.titulo}</strong>
            </div>
            <label style={{ fontSize: 11, fontWeight: 600, color: GRAY3, display: 'block', marginBottom: 6 }}>Link do Contrato (opcional)</label>
            <input
              type="url"
              value={ganhoLink}
              onChange={e => setGanhoLink(e.target.value)}
              placeholder="https://..."
              style={{ ...input14, marginBottom: 20 }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={confirmarGanho} disabled={saving} style={btnPrimary(saving)}
                onMouseEnter={e => (e.currentTarget.style.background = '#065F46')}
                onMouseLeave={e => (e.currentTarget.style.background = R)}>
                {saving ? 'Salvando...' : 'Confirmar Ganho'}
              </button>
              <button onClick={() => { setGanhoOpp(null); setGanhoLink('') }} style={btnGhost}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

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
                    <div style={{ fontSize: 13, fontWeight: 600, color: GRAY1, marginBottom: 4 }}>{o.titulo}</div>
                    {o.descricao ? <div style={{ fontSize: 11, color: GRAY2, marginBottom: 6, lineHeight: 1.45 }}>{o.descricao}</div> : null}
                    {o.valor_estimado ? <div style={{ fontSize: 13, fontWeight: 800, color: '#92400E', marginBottom: 4 }}>{fmt(o.valor_estimado)}</div> : null}
                    {o.data_estimada ? <div style={{ fontSize: 11, color: GRAY3, display: 'flex', alignItems: 'center', gap: 3, marginBottom: 4 }}><Calendar size={10} />{fmtDate(o.data_estimada)}</div> : null}
                    {o.link_contrato ? (
                      <a href={o.link_contrato} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#065F46', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6, textDecoration: 'none' }}>
                        <ExternalLink size={10} /> Ver contrato
                      </a>
                    ) : null}
                    {canEdit && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                        {OPP_STAGES.filter(s => s.key !== stage.key).map(s => (
                          <button key={s.key}
                            onClick={() => s.key === 'fechada' ? setGanhoOpp(o) : moveOpp(o.id, s.key)}
                            style={{ padding: '2px 7px', borderRadius: 4, border: `1px solid ${GRAY5}`, background: s.bg, color: s.color, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>→ {s.label}</button>
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
// TAB: ENTREGAS
// ══════════════════════════════════════════════════════════════════════════════
function EntregaProgressBar({ label, atual, meta }: { label: string; atual: number; meta: number }) {
  const pct = meta > 0 ? Math.min(100, (atual / meta) * 100) : 0
  const cor = pct >= 100 ? GREEN : pct >= 60 ? BLUE : pct > 0 ? YELLOW : GRAY3
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: GRAY2 }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: cor }}>{atual}{meta > 0 ? ` / ${meta}` : ''}</span>
      </div>
      <div style={{ height: 6, background: GRAY5, borderRadius: 4 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: cor, borderRadius: 4, transition: 'width .3s' }} />
      </div>
    </div>
  )
}

function TabEntregas({ registros, projetos, servicosProjeto, clienteId, onReload, canEdit }: {
  registros: RegistroEntrega[]; projetos: Projeto[]; servicosProjeto: ServicoProjeto[]
  clienteId: string; onReload: () => void; canEdit: boolean
}) {
  const hoje = new Date()
  const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`
  const [mesSel, setMesSel] = useState(mesAtual)
  const [modalProjeto, setModalProjeto] = useState<Projeto | null>(null)
  const [modalMes, setModalMes]         = useState(mesAtual)
  const [modalForm, setModalForm]       = useState({ campanhas: '', estaticos: '', videos: '', posts: '', data: hoje.toISOString().slice(0, 10), observacao: '' })
  const [modalServicoId, setModalServicoId] = useState('')
  const [modalQuantidade, setModalQuantidade] = useState('1')
  const [saving, setSaving]             = useState(false)

  const projetosAtivos = projetos.filter(p => p.status === 'ativo' && (p.tipo === 'executar' || p.tipo === 'saber' || p.tipo === 'ter'))
  const registrosMes   = registros.filter(r => r.mes === mesSel)
  const mesesDisponiveis = Array.from(new Set([mesAtual, ...registros.map(r => r.mes)])).sort((a, b) => b.localeCompare(a))

  function fmtMesLabel(m: string) {
    const [y, mo] = m.split('-')
    const nomes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
    return `${nomes[parseInt(mo) - 1]} ${y}`
  }

  function openModal(p: Projeto) {
    setModalProjeto(p)
    setModalMes(mesAtual)
    setModalForm({ campanhas: '', estaticos: '', videos: '', posts: '', data: new Date().toISOString().slice(0, 10), observacao: '' })
    setModalServicoId('')
    setModalQuantidade('1')
  }

  async function saveModal() {
    if (!modalProjeto) return
    setSaving(true)
    const vals: any = {
      projeto_id: modalProjeto.id,
      cliente_id: clienteId,
      mes: modalMes,
      data: modalForm.data || new Date().toISOString().slice(0, 10),
      observacao: modalForm.observacao || null,
    }
    if (modalProjeto.tipo === 'executar') {
      const servicos = (modalProjeto.servicos_executar || []).map(s => s.key)
      if (servicos.includes('midia_paga'))     vals.campanhas = modalForm.campanhas  ? parseInt(modalForm.campanhas,  10) : null
      if (servicos.includes('design_grafico')) { vals.estaticos = modalForm.estaticos ? parseInt(modalForm.estaticos, 10) : null; vals.videos = modalForm.videos ? parseInt(modalForm.videos, 10) : null }
      if (servicos.includes('social_media'))   vals.posts     = modalForm.posts      ? parseInt(modalForm.posts,      10) : null
    } else {
      if (!modalServicoId) { toast.warning('Selecione o serviço entregue.'); setSaving(false); return }
      vals.servico_id = modalServicoId
      vals.quantidade = parseInt(modalQuantidade, 10) || 1
    }
    const { error } = await supabase.from('registros_entrega').insert(vals)
    setSaving(false)
    if (error) { toast.error('Erro ao salvar: ' + error.message); return }
    setModalProjeto(null)
    await onReload()
  }

  async function deleteRegistro(id: string) {
    if (!confirm('Excluir este lançamento?')) return
    await supabase.from('registros_entrega').delete().eq('id', id)
    await onReload()
  }

  function soma(arr: RegistroEntrega[], campo: keyof RegistroEntrega) {
    return arr.reduce((s, r) => s + ((r[campo] as number) || 0), 0)
  }

  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', border: `1px solid ${GRAY5}`, borderRadius: 8, fontSize: 13, color: GRAY1, outline: 'none', boxSizing: 'border-box' }

  const tipoColor: Record<string, { color: string; bg: string; border: string; label: string }> = {
    executar: { color: '#065F46', bg: '#ECFDF5', border: '#A7F3D0', label: 'Executar' },
    saber:    { color: BLUE,      bg: '#EDE9FE', border: '#DDD6FE', label: 'Saber' },
    ter:      { color: PURPLE,    bg: '#F5F3FF', border: '#DDD6FE', label: 'Ter' },
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: GRAY1 }}>Entregas</div>
          <div style={{ fontSize: 12, color: GRAY3, marginTop: 2 }}>Lançamentos cumulativos por mês</div>
        </div>
        <select value={mesSel} onChange={e => setMesSel(e.target.value)} style={{ padding: '7px 10px', border: `1px solid ${GRAY5}`, borderRadius: 8, fontSize: 13, color: GRAY1, outline: 'none', fontWeight: 600, cursor: 'pointer' }}>
          {mesesDisponiveis.map(m => <option key={m} value={m}>{fmtMesLabel(m)}</option>)}
        </select>
      </div>

      {projetosAtivos.length === 0 && (
        <div style={{ ...card, padding: '48px 24px', textAlign: 'center' }}>
          <BarChart2 size={32} color={GRAY3} style={{ margin: '0 auto 12px' }} />
          <div style={{ fontSize: 14, color: GRAY2 }}>Nenhum projeto ativo</div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {projetosAtivos.map(p => {
          const regsProj  = registrosMes.filter(r => r.projeto_id === p.id)
          const tc        = tipoColor[p.tipo]
          const isExec    = p.tipo === 'executar'
          const projSvcs  = servicosProjeto.filter(s => s.projeto_id === p.id)

          // Executar metrics
          const servicos  = (p.servicos_executar || []).map(s => s.key)
          const hasMidia  = isExec && servicos.includes('midia_paga')
          const hasDesign = isExec && servicos.includes('design_grafico')
          const hasSocial = isExec && servicos.includes('social_media')
          const sv = (p.servicos_executar || [])
          const metaCampanhas = hasMidia  ? (sv.find(s => s.key === 'midia_paga')?.campanhas   ?? 0) : 0
          const metaEstaticos = hasDesign ? (sv.find(s => s.key === 'design_grafico')?.estaticos ?? 0) : 0
          const metaVideos    = hasDesign ? (sv.find(s => s.key === 'design_grafico')?.videos    ?? 0) : 0
          const metaPosts     = hasSocial ? (sv.find(s => s.key === 'social_media')?.posts      ?? 0) : 0

          return (
            <div key={p.id} style={{ ...card, padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: tc.bg, border: `1px solid ${tc.border}`, color: tc.color, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{tc.label}</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: GRAY1 }}>{p.nome}</div>
                    <div style={{ fontSize: 11, color: GRAY3, marginTop: 2 }}>{regsProj.length} lançamento{regsProj.length !== 1 ? 's' : ''} em {fmtMesLabel(mesSel)}</div>
                  </div>
                </div>
                {canEdit && (
                  <button onClick={() => openModal(p)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: 'none', background: BLUE, color: WHITE, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    <Plus size={13} /> Registrar
                  </button>
                )}
              </div>

              {/* Progress bars */}
              {isExec && (hasMidia || hasDesign || hasSocial) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', background: GRAY4, borderRadius: 10, marginBottom: 16 }}>
                  {hasMidia  && <EntregaProgressBar label="Campanhas (Mídia Paga)" atual={soma(regsProj, 'campanhas')} meta={metaCampanhas} />}
                  {hasDesign && <EntregaProgressBar label="Estáticos (Design)"     atual={soma(regsProj, 'estaticos')} meta={metaEstaticos} />}
                  {hasDesign && <EntregaProgressBar label="Vídeos (Design)"        atual={soma(regsProj, 'videos')}    meta={metaVideos} />}
                  {hasSocial && <EntregaProgressBar label="Posts (Social Media)"   atual={soma(regsProj, 'posts')}     meta={metaPosts} />}
                </div>
              )}
              {!isExec && projSvcs.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', background: GRAY4, borderRadius: 10, marginBottom: 16 }}>
                  {projSvcs.map(svc => {
                    const entregues = regsProj.filter(r => r.servico_id === svc.id).reduce((s, r) => s + (r.quantidade || 0), 0)
                    return <EntregaProgressBar key={svc.id} label={`${svc.nome} (${svc.unidade})`} atual={entregues} meta={svc.quantidade_prevista} />
                  })}
                </div>
              )}
              {!isExec && projSvcs.length === 0 && (
                <div style={{ fontSize: 12, color: GRAY3, padding: '8px 0 12px', fontStyle: 'italic' }}>Nenhum serviço cadastrado. Edite o projeto para adicionar serviços.</div>
              )}

              {/* Registros do mês */}
              {regsProj.length === 0 ? (
                <div style={{ fontSize: 12, color: GRAY3, fontStyle: 'italic', textAlign: 'center', padding: '12px 0' }}>Nenhum lançamento neste mês</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {regsProj.map(r => {
                    const svcNome = r.servico_id ? servicosProjeto.find(s => s.id === r.servico_id)?.nome : null
                    return (
                      <div key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 12px', background: WHITE, borderRadius: 8, border: `1px solid ${GRAY5}` }}>
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: `${BLUE}0F`, border: `1px solid ${BLUE}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Calendar size={14} color={BLUE} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: GRAY1, marginBottom: 3 }}>{fmtDate(r.data)}</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
                            {svcNome && r.quantidade != null && <span style={{ fontSize: 11, color: GRAY2 }}>✔ {r.quantidade}x {svcNome}</span>}
                            {r.campanhas != null && <span style={{ fontSize: 11, color: GRAY2 }}>📢 {r.campanhas} campanha{r.campanhas !== 1 ? 's' : ''}</span>}
                            {r.estaticos != null && <span style={{ fontSize: 11, color: GRAY2 }}>🖼 {r.estaticos} estático{r.estaticos !== 1 ? 's' : ''}</span>}
                            {r.videos    != null && <span style={{ fontSize: 11, color: GRAY2 }}>🎬 {r.videos} vídeo{r.videos !== 1 ? 's' : ''}</span>}
                            {r.posts     != null && <span style={{ fontSize: 11, color: GRAY2 }}>📝 {r.posts} post{r.posts !== 1 ? 's' : ''}</span>}
                          </div>
                          {r.observacao && <div style={{ fontSize: 11, color: GRAY3, marginTop: 4, fontStyle: 'italic' }}>{r.observacao}</div>}
                        </div>
                        {canEdit && (
                          <button onClick={() => deleteRegistro(r.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: GRAY3, padding: 4, flexShrink: 0 }}
                            onMouseEnter={e => (e.currentTarget.style.color = R)} onMouseLeave={e => (e.currentTarget.style.color = GRAY3)}>
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Modal de lançamento */}
      {modalProjeto && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => setModalProjeto(null)}>
          <div style={{ background: WHITE, borderRadius: 16, padding: 28, width: '100%', maxWidth: 460, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: GRAY1 }}>Registrar Entrega</div>
                <div style={{ fontSize: 11, color: GRAY3, marginTop: 2 }}>{modalProjeto.nome}</div>
              </div>
              <button onClick={() => setModalProjeto(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: GRAY3, padding: 4, borderRadius: 6, display: 'flex' }}><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: GRAY3, display: 'block', marginBottom: 4, fontWeight: 600 }}>Data do lançamento</label>
                  <input type="date" value={modalForm.data} onChange={e => setModalForm(f => ({ ...f, data: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: GRAY3, display: 'block', marginBottom: 4, fontWeight: 600 }}>Mês de referência</label>
                  <input type="month" value={modalMes} onChange={e => setModalMes(e.target.value)} style={inp} />
                </div>
              </div>
              {modalProjeto.tipo !== 'executar' ? (
                <>
                  <div>
                    <label style={{ fontSize: 11, color: GRAY3, display: 'block', marginBottom: 4, fontWeight: 600 }}>Serviço entregue *</label>
                    <select value={modalServicoId} onChange={e => setModalServicoId(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                      <option value="">Selecione...</option>
                      {servicosProjeto.filter(s => s.projeto_id === modalProjeto.id).map(s => (
                        <option key={s.id} value={s.id}>{s.nome}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: GRAY3, display: 'block', marginBottom: 4, fontWeight: 600 }}>
                      Quantidade {modalServicoId ? `(${servicosProjeto.find(s => s.id === modalServicoId)?.unidade ?? 'entrega'})` : ''}
                    </label>
                    <input type="number" min="1" value={modalQuantidade} onChange={e => setModalQuantidade(e.target.value)} placeholder="1" style={inp} />
                  </div>
                </>
              ) : (
                <>
              {(modalProjeto.servicos_executar || []).map(s => s.key).includes('midia_paga') && (
                <div>
                  <label style={{ fontSize: 11, color: GRAY3, display: 'block', marginBottom: 4, fontWeight: 600 }}>Campanhas rodadas (Mídia Paga)</label>
                  <input type="number" min="0" value={modalForm.campanhas} onChange={e => setModalForm(f => ({ ...f, campanhas: e.target.value }))} placeholder="0" style={inp} />
                </div>
              )}
              {(modalProjeto.servicos_executar || []).map(s => s.key).includes('design_grafico') && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, color: GRAY3, display: 'block', marginBottom: 4, fontWeight: 600 }}>Estáticos entregues</label>
                    <input type="number" min="0" value={modalForm.estaticos} onChange={e => setModalForm(f => ({ ...f, estaticos: e.target.value }))} placeholder="0" style={inp} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: GRAY3, display: 'block', marginBottom: 4, fontWeight: 600 }}>Vídeos entregues</label>
                    <input type="number" min="0" value={modalForm.videos} onChange={e => setModalForm(f => ({ ...f, videos: e.target.value }))} placeholder="0" style={inp} />
                  </div>
                </div>
              )}
              {(modalProjeto.servicos_executar || []).map(s => s.key).includes('social_media') && (
                <div>
                  <label style={{ fontSize: 11, color: GRAY3, display: 'block', marginBottom: 4, fontWeight: 600 }}>Posts publicados (Social Media)</label>
                  <input type="number" min="0" value={modalForm.posts} onChange={e => setModalForm(f => ({ ...f, posts: e.target.value }))} placeholder="0" style={inp} />
                </div>
              )}
                </>
              )}
              <div>
                <label style={{ fontSize: 11, color: GRAY3, display: 'block', marginBottom: 4, fontWeight: 600 }}>Observação (opcional)</label>
                <input type="text" value={modalForm.observacao} onChange={e => setModalForm(f => ({ ...f, observacao: e.target.value }))} placeholder="Ex: Entrega parcial — arte aprovada" style={inp} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => setModalProjeto(null)} style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${GRAY5}`, background: WHITE, color: GRAY2, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={saveModal} disabled={saving} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: BLUE, color: WHITE, fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: REUNIÕES
// ══════════════════════════════════════════════════════════════════════════════
type ReuniaoFormData = { data: string; titulo: string; link_apresentacao: string; link_transcricao: string; observacoes: string }

function ReuniaoFormFields({ f, setF }: { f: ReuniaoFormData; setF: (v: ReuniaoFormData) => void }) {
  return (
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
}

function ReuniaoLinkButton({ href, label, icon: Icon, color }: { href: string; label: string; icon: React.ComponentType<any>; color: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 7, border: `1px solid ${color}30`, background: `${color}08`, color, fontSize: 12, fontWeight: 600, textDecoration: 'none', transition: 'all .15s' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${color}18` }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = `${color}08` }}
    >
      <Icon size={13} /> {label}
    </a>
  )
}

function TabReunioes({ reunioes, clienteId, onReload, canEdit }: {
  reunioes: Reuniao[]; clienteId: string; onReload: () => void; canEdit: boolean
}) {
  const emptyForm: ReuniaoFormData = { data: new Date().toISOString().split('T')[0], titulo: '', link_apresentacao: '', link_transcricao: '', observacoes: '' }
  const [showNew, setShowNew]   = useState(false)
  const [form, setForm]         = useState(emptyForm)
  const [saving, setSaving]     = useState(false)
  const [editId, setEditId]     = useState<string | null>(null)
  const [editForm, setEditForm] = useState<ReuniaoFormData>(emptyForm)

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
          <ReuniaoFormFields f={form} setF={setForm} />
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
                  <ReuniaoFormFields f={editForm} setF={setEditForm} />
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
                      ? <ReuniaoLinkButton href={r.link_apresentacao} label="Apresentação" icon={ExternalLink} color={BLUE} />
                      : <span style={{ fontSize: 12, color: GRAY3, fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 5 }}><ExternalLink size={12} /> Sem link de apresentação</span>
                    }
                    {r.link_transcricao
                      ? <ReuniaoLinkButton href={r.link_transcricao} label="Transcrição" icon={Globe} color={GREEN} />
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

