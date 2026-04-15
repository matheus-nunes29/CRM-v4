'use client'
export const dynamic = 'force-dynamic'
import React, { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, Lead } from '@/lib/supabase'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts'
import { Users, Flame, Snowflake, ThermometerSun, CheckCircle2, Clock, Plus, Search, X, Edit2, Trash2, ChevronLeft, ChevronRight, ArrowRight, Target, LayoutDashboard, GitBranch, Settings, Upload, FileSpreadsheet, CheckCircle, AlertCircle, CalendarDays } from 'lucide-react'
import Sidebar from './Sidebar'

const R = '#E8001C'
const SIDEBAR_BG = '#FFFFFF'
const SIDEBAR_HOVER = '#F5F3FF'
const CONTENT_BG = '#F2F1EE'
const WHITE = '#FFFFFF'
const GRAY1 = '#1A1A1A'
const GRAY2 = '#6B7280'
const GRAY3 = '#D1D5DB'
const GRAY4 = '#F3F4F6'
const GREEN = '#16A34A'
const BLUE = '#0D9488'
const YELLOW = '#D97706'
const PURPLE = '#7C3AED'

const TEMP_COLORS: Record<string, string> = { FRIO: BLUE, MORNO: YELLOW, QUENTE: R, FECHADO: GREEN }
const CLOSERS = ['VITOR', 'MATHEUS']
const SITUACOES = ['EM FOLLOW UP', 'REUNIAO EXTRA AGENDADA', 'AGENDA FUTURA', 'PERDIDO CLOSER', 'FECHADO']
const SITUACOES_PRE_VENDAS = ['TENTANDO CONTATO', 'EM QUALIFICAÇÃO', 'REUNIÃO AGENDADA', 'REUNIÃO REALIZADA', 'PERDIDO SDR', 'NO SHOW/REMARCANDO', 'REEMBOLSO', 'AGENDA FUTURA']
const SPV_COLORS: Record<string, string> = {
  'TENTANDO CONTATO': '#E8001C',
  'EM QUALIFICAÇÃO': '#F97316',
  'REUNIÃO AGENDADA': '#0D9488',
  'REUNIÃO REALIZADA': '#8B5CF6',
  'PERDIDO SDR': '#6B7280',
  'NO SHOW/REMARCANDO': '#92400E',
  'REEMBOLSO': '#1E40AF',
  'AGENDA FUTURA': '#065F46',
}
const TEMPERATURAS = ['FRIO', 'MORNO', 'QUENTE', 'FECHADO']
const CARGOS_OPTIONS = ['Não identificado', 'Sócio', 'Diretor', 'Gerente', 'Coordenador', 'Analista', 'Assistente', 'Outro']
const ORIGENS = ['Lead Broker', 'Recomendação', 'Eventos', 'Prospecção Ativa (BDR/Hunter)', 'Indicação', 'Recovery']
const SEGMENTOS = ['Varejo', 'Serviço', 'Indústria', 'Food Service', 'Educação', 'SAAS', 'Imobiliária', 'Outro']
const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const FATURAMENTO_TIER = [
  { faturamento: '50-70k', tier: 'TINY' }, { faturamento: '70-100k', tier: 'TINY' },
  { faturamento: '100-200k', tier: 'SMALL' }, { faturamento: '200-400k', tier: 'SMALL' },
  { faturamento: '400k-1M', tier: 'MEDIUM' }, { faturamento: '1M-4M', tier: 'MEDIUM' },
  { faturamento: '4M-16M', tier: 'LARGE' }, { faturamento: '+16M', tier: 'ENTERPRISE' },
]
const FATURAMENTOS = FATURAMENTO_TIER.map(f => f.faturamento)
const fatToTier = (fat: string) => FATURAMENTO_TIER.find(f => f.faturamento === fat)?.tier || ''

const fmt = (n: number | null | undefined) => n == null ? '—' : 'R$ ' + n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const fmtDate = (d: string | null | undefined) => d ? new Date(d).toLocaleDateString('pt-BR') : '—'
const mesAno = (d: string | null | undefined): string | null => {
  if (!d) return null
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return null
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
}

const inputCls: React.CSSProperties = {
  width: '100%', border: '1px solid #D1D5DB', borderRadius: 8,
  padding: '9px 12px', fontSize: 13, color: GRAY1, outline: 'none',
  boxSizing: 'border-box', background: WHITE,
}
const labelCls: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 600, color: GRAY2,
  marginBottom: 5, textTransform: 'uppercase' as const, letterSpacing: '0.05em',
}

function TempBadge({ temp }: { temp: string | null }) {
  if (!temp) return <span style={{ color: GRAY2, fontSize: 11 }}>—</span>
  const icons: Record<string, React.ReactNode> = {
    FRIO: <Snowflake size={9} />, MORNO: <ThermometerSun size={9} />,
    QUENTE: <Flame size={9} />, FECHADO: <CheckCircle2 size={9} />,
  }
  const c = TEMP_COLORS[temp] || GRAY2
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: `${c}18`, color: c, border: `1px solid ${c}33` }}>
      {icons[temp]} {temp}
    </span>
  )
}

function SitBadge({ s }: { s: string | null }) {
  if (!s) return <span style={{ color: GRAY2, fontSize: 11 }}>—</span>
  const map: Record<string, string> = { 'EM FOLLOW UP': BLUE, 'REUNIAO EXTRA AGENDADA': YELLOW, 'AGENDA FUTURA': PURPLE, 'PERDIDO CLOSER': R, 'FECHADO': GREEN }
  const c = map[s] || GRAY2
  return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600, background: `${c}18`, color: c, border: `1px solid ${c}33` }}>{s}</span>
}


function SpvBadge({ s }: { s: string | null }) {
  if (!s) return <span style={{ color: GRAY2, fontSize: 11 }}>—</span>
  const c = SPV_COLORS[s] || GRAY2
  return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: `${c}22`, color: c, border: `1px solid ${c}44`, whiteSpace: 'nowrap' }}>{s}</span>
}


const CANAIS_METAS = ['Recovery', 'Lead Broker', 'Recomendação', 'Eventos', 'Indicação']

function MetasPage({ metas, mesSel, mesFmt, navMes, saveMeta }: any) {
  const [canalTab, setCanalTab] = useState('Recovery')
  const [form, setForm] = useState({ meta_entradas: '', meta_ra: '', meta_rr: '', meta_vendas: '', meta_tcv: '', meta_ativacoes: '' })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const canalKey = canalTab

  useEffect(() => {
    const m = metas[mesSel]?.[canalKey] || {}
    setForm({ meta_entradas: m.meta_entradas || '', meta_ra: m.meta_ra || '', meta_rr: m.meta_rr || '', meta_vendas: m.meta_vendas || '', meta_tcv: m.meta_tcv || '', meta_ativacoes: m.meta_ativacoes || '' })
    setSaved(false)
  }, [mesSel, metas, canalTab])

  const set = (k: string, v: string) => { setForm(f => ({ ...f, [k]: v })); setSaved(false) }

  async function handleSave() {
    setSaving(true)
    const vals: Record<string, number | null> = {}
    Object.entries(form).forEach(([k, v]) => { vals[k] = v !== '' ? Number(v) : null })
    await saveMeta(mesSel, canalKey, vals)
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const CAMPOS = [
    { key: 'meta_entradas', label: 'Entradas (Leads)', icon: '👥' },
    { key: 'meta_ra', label: 'Reuniões Agendadas (RA)', icon: '📅' },
    { key: 'meta_rr', label: 'Reuniões Realizadas (RR)', icon: '✅' },
    { key: 'meta_vendas', label: 'Vendas (Qtd)', icon: '🏆' },
    { key: 'meta_tcv', label: 'TCV (R$)', icon: '💰' },
    { key: 'meta_ativacoes', label: 'Ativações', icon: '⚡' },
  ]

  const allMonths = (() => {
    const months = []
    const now = new Date()
    for (let i = -3; i <= 8; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i)
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    return months
  })()

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: GRAY1, margin: 0 }}>Metas Mensais</h1>
          <p style={{ fontSize: 13, color: GRAY2, marginTop: 4 }}>Defina as metas por canal — a meta geral é a soma de todos os canais</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: WHITE, border: '1px solid #E5E7EB', borderRadius: 10, padding: '8px 14px', boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
          <button onClick={() => navMes(-1)} style={{ background: 'none', border: 'none', color: GRAY2, cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 2px' }}>‹</button>
          <span style={{ fontSize: 14, fontWeight: 700, color: GRAY1, minWidth: 90, textAlign: 'center' }}>{mesFmt(mesSel)}</span>
          <button onClick={() => navMes(1)} style={{ background: 'none', border: 'none', color: GRAY2, cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 2px' }}>›</button>
        </div>
      </div>

      {/* Resumo geral — soma dos canais */}
      {(() => {
        const vals = CANAIS_METAS.map(c => metas[mesSel]?.[c]).filter(Boolean)
        if (vals.length === 0) return null
        const soma: Record<string, number> = {}
        CAMPOS.forEach(c => { soma[c.key] = vals.reduce((s: number, m: any) => s + (m[c.key] || 0), 0) })
        return (
          <div style={{ background: `${R}06`, border: `1px solid ${R}20`, borderRadius: 14, padding: '16px 22px', marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: R, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>Meta Geral — {mesFmt(mesSel)} (soma de todos os canais)</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 12 }}>
              {CAMPOS.map(c => (
                <div key={c.key}>
                  <div style={{ fontSize: 10, color: GRAY2, marginBottom: 3 }}>{c.icon} {c.label.replace(' (R$)', '').replace(' (Qtd)', '').replace(' (Leads)', '')}</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: GRAY1 }}>{c.key === 'meta_tcv' ? fmt(soma[c.key]) : soma[c.key] || '—'}</div>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Canal tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {CANAIS_METAS.map(c => {
          const key = c
          const hasData = !!metas[mesSel]?.[key]
          const isSel = canalTab === c
          return (
            <button key={c} onClick={() => { setCanalTab(c); setSaved(false) }}
              style={{ padding: '7px 16px', borderRadius: 20, border: `1px solid ${isSel ? R : '#E5E7EB'}`, background: isSel ? R : WHITE, color: isSel ? WHITE : GRAY1, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, transition: 'all .15s' }}>
              {c}
              {hasData && <span style={{ width: 6, height: 6, borderRadius: '50%', background: isSel ? 'rgba(255,255,255,.7)' : GREEN, display: 'inline-block' }} />}
            </button>
          )
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div style={{ background: WHITE, borderRadius: 14, padding: 28, boxShadow: '0 1px 6px rgba(0,0,0,.07)', border: '1px solid #E5E7EB' }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: GRAY1, marginBottom: 4 }}>
            Meta — {canalTab} · {mesFmt(mesSel)}
          </div>
          <div style={{ fontSize: 12, color: GRAY2, marginBottom: 22 }}>
            Meta específica para o canal {canalTab}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {CAMPOS.map(c => (
              <div key={c.key}>
                <label style={labelCls}>{c.icon} {c.label}</label>
                <input type="number" placeholder="0" style={inputCls} value={(form as any)[c.key]} onChange={e => set(c.key, e.target.value)} />
              </div>
            ))}
          </div>
          <button onClick={handleSave} disabled={saving} style={{ width: '100%', marginTop: 22, padding: 13, borderRadius: 10, border: 'none', background: saved ? GREEN : R, color: WHITE, fontSize: 14, fontWeight: 800, cursor: 'pointer', transition: 'background .3s' }}>
            {saving ? 'SALVANDO...' : saved ? '✓ SALVO!' : 'SALVAR METAS'}
          </button>
        </div>
        <div style={{ background: WHITE, borderRadius: 14, padding: 28, boxShadow: '0 1px 6px rgba(0,0,0,.07)', border: '1px solid #E5E7EB' }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: GRAY1, marginBottom: 4 }}>Histórico</div>
          <div style={{ fontSize: 12, color: GRAY2, marginBottom: 20 }}>Meses com metas cadastradas</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 420, overflowY: 'auto' }}>
            {allMonths.map(m => {
              const hasMeta = !!(metas[m] && Object.keys(metas[m]).length > 0)
              const isSel = m === mesSel
              return (
                <div key={m} onClick={() => navMes(allMonths.indexOf(m) - allMonths.findIndex((x: string) => x === mesSel))}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', borderRadius: 10, cursor: 'pointer', border: `1px solid ${isSel ? R : '#E5E7EB'}`, background: isSel ? `${R}08` : WHITE }}>
                  <span style={{ fontSize: 13, fontWeight: isSel ? 700 : 500, color: isSel ? R : GRAY1 }}>{mesFmt(m)}</span>
                  {hasMeta ? (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: `${GREEN}18`, color: GREEN }}>
                      ✓ {Object.keys(metas[m]).length} canal{Object.keys(metas[m]).length !== 1 ? 'is' : ''}
                    </span>
                  ) : <span style={{ fontSize: 10, color: GRAY3 }}>— sem meta</span>}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}



// ── AcompanhamentoPage ────────────────────────────────────────────────────────
function AcompanhamentoPage({ leads, metas, mesSel, mesFmt, navMes }: any) {
  const toDS = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

  function easterDate(year: number): Date {
    const a=year%19, b=Math.floor(year/100), c=year%100
    const d=Math.floor(b/4), e=b%4, f=Math.floor((b+8)/25)
    const g=Math.floor((b-f+1)/3), h=(19*a+b-d-g+15)%30
    const i=Math.floor(c/4), k=c%4, l=(32+2*e+2*i-h-k)%7
    const m=Math.floor((a+11*h+22*l)/451)
    return new Date(year, Math.floor((h+l-7*m+114)/31)-1, ((h+l-7*m+114)%31)+1)
  }
  function getBrHolidays(year: number): Set<string> {
    const s = new Set<string>()
    ;[[1,1],[4,21],[5,1],[9,7],[10,12],[11,2],[11,15],[12,25]].forEach(([mo,d]) =>
      s.add(`${year}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`)
    )
    const easter = easterDate(year)
    ;[-48,-47,-2,60].forEach(off => { const dt = new Date(easter.getTime()+off*86400000); s.add(toDS(dt)) })
    return s
  }

  const [y, mo] = mesSel.split('-').map(Number)
  const holidays = getBrHolidays(y)
  const today = toDS(new Date())
  const daysInMonth = new Date(y, mo, 0).getDate()

  const workDays: string[] = []
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    const dow = new Date(ds+'T12:00:00').getDay()
    if (dow !== 0 && dow !== 6 && !holidays.has(ds)) workDays.push(ds)
  }

  // Group into Mon-Sun calendar weeks
  const weekGroups: string[][] = []
  let cur: string[] = []
  workDays.forEach((ds, i) => {
    const dow = new Date(ds+'T12:00:00').getDay()
    if (dow === 1 && cur.length > 0) { weekGroups.push(cur); cur = [] }
    cur.push(ds)
    if (i === workDays.length - 1 && cur.length > 0) weekGroups.push(cur)
  })

  const nWD = workDays.length || 1
  const cMetas = Object.fromEntries(CANAIS_METAS.map(c => [c, metas[mesSel]?.[c] || {}]))
  const sumM = (key: string) => CANAIS_METAS.reduce((s, c) => s + (cMetas[c][key]||0), 0)
  const totMeta = { ent: sumM('meta_entradas'), ra: sumM('meta_ra'), rr: sumM('meta_rr'), venda: sumM('meta_vendas') }

  const countMap = (field: string, canal?: string) => {
    const m: Record<string, number> = {}
    leads.forEach((l: any) => {
      const v = l[field]; if (!v) return
      const ds = String(v).substring(0,10)
      if (!ds.startsWith(mesSel)) return
      if (canal && l.origem !== canal) return
      m[ds] = (m[ds]||0) + 1
    })
    return m
  }
  const entMap = countMap('data_entrada')
  const raMap  = countMap('data_ra')
  const rrMap  = countMap('data_rr')
  const vMap   = countMap('data_assinatura')
  const cEntMaps = Object.fromEntries(CANAIS_METAS.map(c => [c, countMap('data_entrada', c)]))

  type RowDef = { label: string; abbr: string; meta: number; rMap: Record<string,number>; isCanal?: boolean; isSeparator?: boolean }
  const CANAL_ABBR: Record<string,string> = { 'Recovery':'RECOVERY', 'Lead Broker':'LEAD BROKER', 'Recomendação':'RECOMEND.', 'Eventos':'EVENTOS', 'Indicação':'INDICAÇÃO' }
  const rows: RowDef[] = [
    { label:'LEADS TOTAL', abbr:'LEADS TOTAL', meta: totMeta.ent, rMap: entMap },
    ...CANAIS_METAS.map(c => ({ label: CANAL_ABBR[c]||c.toUpperCase(), abbr: CANAL_ABBR[c]||c.toUpperCase(), meta: cMetas[c].meta_entradas||0, rMap: cEntMaps[c], isCanal: true })),
    { label:'R. AGENDADA', abbr:'R. AGENDADA', meta: totMeta.ra, rMap: raMap, isSeparator: true },
    { label:'R. REALIZADA', abbr:'R. REALIZADA', meta: totMeta.rr, rMap: rrMap, isSeparator: true },
    { label:'VENDAS', abbr:'VENDAS', meta: totMeta.venda, rMap: vMap, isSeparator: true },
  ]

  const dP = (meta: number) => meta > 0 ? Math.round(meta/nWD) : 0
  const wTotal = (meta: number, wk: string[]) => wk.length * dP(meta)
  const rTotal = (rMap: Record<string,number>, days: string[]) => days.reduce((s,ds) => s+(rMap[ds]||0), 0)

  const CELL: React.CSSProperties = { padding:'4px 6px', textAlign:'center', fontSize:11, fontWeight:700, border:'1px solid #E5E7EB', whiteSpace:'nowrap' }
  const WK_COL: React.CSSProperties = { ...CELL, background:'#111', color:WHITE, minWidth:36 }
  const T_COL: React.CSSProperties  = { ...CELL, background:'#111', color:WHITE, minWidth:36 }
  const P_CELL: React.CSSProperties = { ...CELL, background:'#F8F8F8', color:'#555', minWidth:32 }
  const R_CELL_DEF: React.CSSProperties = { ...CELL, background:WHITE, color:GRAY1, minWidth:32 }
  const LABEL_CELL = (isCanal?: boolean, isSep?: boolean): React.CSSProperties => ({
    ...CELL, textAlign:'left', padding:'0 10px',
    background: isSep ? '#1A1A1A' : isCanal ? '#B91C1C' : '#E8001C',
    color: WHITE, fontWeight:800, fontSize:10, letterSpacing:'0.07em',
    whiteSpace:'nowrap', position:'sticky', left:0, zIndex:2,
  })
  const PR_CELL = (type: 'P'|'R'): React.CSSProperties => ({
    ...CELL, background: type==='P' ? '#F0F0F0' : WHITE,
    color: type==='P' ? GRAY2 : GRAY1, fontWeight:800, fontSize:10,
    position:'sticky', left:120, zIndex:2, minWidth:24, padding:'4px 4px',
  })

  const totalCols = weekGroups.reduce((s,wk) => s + wk.length + 1, 0) + 1 // days + week totals + T

  return (
    <div>
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <div style={{ fontSize:10, fontWeight:800, color:R, textTransform:'uppercase', letterSpacing:'0.18em', marginBottom:6 }}>Funil Comercial</div>
          <h1 style={{ fontSize:30, fontWeight:900, color:GRAY1, margin:0, letterSpacing:'-0.02em', lineHeight:1 }}>Acompanhamento Diário</h1>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, background:WHITE, border:'1px solid #E5E7EB', borderRadius:10, padding:'8px 14px', boxShadow:'0 1px 4px rgba(0,0,0,.06)' }}>
          <button onClick={() => navMes(-1)} style={{ background:'none', border:'none', color:GRAY2, cursor:'pointer', fontSize:18, padding:'0 2px' }}>‹</button>
          <span style={{ fontSize:14, fontWeight:700, color:GRAY1, minWidth:90, textAlign:'center' }}>{mesFmt(mesSel)}</span>
          <button onClick={() => navMes(1)} style={{ background:'none', border:'none', color:GRAY2, cursor:'pointer', fontSize:18, padding:'0 2px' }}>›</button>
        </div>
      </div>

      <div style={{ overflowX:'auto', borderRadius:14, border:'1px solid #E5E7EB', boxShadow:'0 2px 12px rgba(0,0,0,.07)' }}>
        <table style={{ borderCollapse:'collapse', width:'100%', tableLayout:'auto' }}>
          <thead>
            {/* Row 1: week group headers */}
            <tr style={{ background:'#111' }}>
              <th colSpan={2} style={{ ...CELL, background:'#111', color:WHITE, fontSize:10, letterSpacing:'0.1em', position:'sticky', left:0, zIndex:3, minWidth:144 }}>
                {mesFmt(mesSel).toUpperCase()}
              </th>
              {weekGroups.map((wk, wi) => (
                <React.Fragment key={wi}>
                  {wk.map(ds => (
                    <th key={ds} style={{ ...CELL, background: ds===today ? '#E8001C' : '#222', color:WHITE, fontSize:10, letterSpacing:'0.05em', minWidth:32 }}>
                      {new Date(ds+'T12:00:00').getDate()}
                    </th>
                  ))}
                  <th style={{ ...CELL, background:'#E8001C', color:WHITE, fontSize:10, fontWeight:900, minWidth:36 }}>
                    W{wi+1}
                  </th>
                </React.Fragment>
              ))}
              <th style={{ ...CELL, background:'#E8001C', color:WHITE, fontSize:11, fontWeight:900, minWidth:40 }}>T</th>
            </tr>
            {/* Row 2: week labels spanning */}
            <tr style={{ background:'#1A1A1A' }}>
              <th colSpan={2} style={{ ...CELL, background:'#1A1A1A', color:'#666', fontSize:9, letterSpacing:'0.1em', position:'sticky', left:0, zIndex:3 }}>SEÇÃO</th>
              {weekGroups.map((wk, wi) => (
                <React.Fragment key={wi}>
                  {wk.map(ds => {
                    const dt = new Date(ds+'T12:00:00')
                    const dayNames = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
                    return (
                      <th key={ds} style={{ ...CELL, background: ds===today ? `${R}22` : '#1A1A1A', color: ds===today ? R : '#555', fontSize:9, fontWeight:600, minWidth:32 }}>
                        {dayNames[dt.getDay()]}
                      </th>
                    )
                  })}
                  <th style={{ ...CELL, background:'#1A1A1A', color:'#555', fontSize:9, fontWeight:600 }}>WEEK {wi+1}</th>
                </React.Fragment>
              ))}
              <th style={{ ...CELL, background:'#1A1A1A', color:'#555', fontSize:9 }}>TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <React.Fragment key={row.abbr}>
                {/* P row */}
                <tr>
                  <td rowSpan={2} style={LABEL_CELL(row.isCanal, row.isSeparator)}>
                    {row.abbr}
                  </td>
                  <td style={PR_CELL('P')}>P</td>
                  {weekGroups.map((wk, wi) => (
                    <React.Fragment key={wi}>
                      {wk.map(ds => (
                        <td key={ds} style={{ ...P_CELL, background: ds===today ? '#FFF7ED' : P_CELL.background }}>
                          {dP(row.meta) || ''}
                        </td>
                      ))}
                      <td style={{ ...P_CELL, background:'#EEE', fontWeight:900 }}>{wTotal(row.meta, wk) || ''}</td>
                    </React.Fragment>
                  ))}
                  <td style={{ ...P_CELL, background:'#DDD', fontWeight:900 }}>{row.meta || ''}</td>
                </tr>
                {/* R row */}
                <tr style={{ borderBottom: row.isSeparator || (ri < rows.length-1 && !rows[ri+1]?.isCanal) ? '2px solid #E5E7EB' : undefined }}>
                  <td style={PR_CELL('R')}>R</td>
                  {weekGroups.map((wk, wi) => (
                    <React.Fragment key={wi}>
                      {wk.map(ds => {
                        const val = row.rMap[ds] || 0
                        const planned = dP(row.meta)
                        const isFuture = ds > today
                        const color = isFuture ? GRAY3 : val >= planned && planned > 0 ? GREEN : val > 0 ? GRAY1 : GRAY3
                        return (
                          <td key={ds} style={{ ...R_CELL_DEF, background: ds===today ? '#F0FDF4' : R_CELL_DEF.background, color, fontWeight: val > 0 ? 800 : 400 }}>
                            {isFuture ? '' : val || '·'}
                          </td>
                        )
                      })}
                      <td style={{ ...R_CELL_DEF, background:'#F5F5F5', fontWeight:900, color: rTotal(row.rMap,wk) > 0 ? GRAY1 : GRAY3 }}>
                        {rTotal(row.rMap, wk) || '·'}
                      </td>
                    </React.Fragment>
                  ))}
                  <td style={{ ...R_CELL_DEF, background:'#EBEBEB', fontWeight:900, color: rTotal(row.rMap,workDays) > 0 ? GRAY1 : GRAY3 }}>
                    {rTotal(row.rMap, workDays) || '·'}
                  </td>
                </tr>
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display:'flex', gap:16, marginTop:14, fontSize:11, color:GRAY2 }}>
        <span>· = zero realizado</span>
        <span style={{ color:GREEN }}>■ = meta atingida no dia</span>
        <span>Dias úteis do mês: {workDays.length} · Feriados excluídos</span>
        {today >= `${mesSel}-01` && today <= `${mesSel}-31` && <span style={{ color:R, fontWeight:700 }}>● Hoje: {new Date(today+'T12:00:00').toLocaleDateString('pt-BR')}</span>}
      </div>
    </div>
  )
}


// ── DragModal ─────────────────────────────────────────────────────────────────
function DragModal({ info, stageReqs, pipelineStages, onConfirm, onClose }: {
  info: { lead: any; targetStage: string }
  stageReqs: Record<string, any>
  pipelineStages: { key: string; color: string }[]
  onConfirm: (lead: any, stage: string, data: Record<string,any>) => void
  onClose: () => void
}) {
  const [form, setForm] = useState<Record<string,any>>({})
  const [errors, setErrors] = useState<Record<string,string>>({})
  const reqs = stageReqs[info.targetStage]
  const stageColor = pipelineStages.find(s => s.key === info.targetStage)?.color || R
  const effectiveFields = [...(reqs?.fields ?? []), ...(reqs?.extraFields?.(info.lead) ?? [])]

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', zIndex:60, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:WHITE, borderRadius:16, width:'100%', maxWidth:480, boxShadow:'0 25px 60px rgba(0,0,0,.3)', overflow:'hidden' }}>
        <div style={{ padding:'20px 24px', borderBottom:'1px solid #E5E7EB', borderTop:`4px solid ${stageColor}` }}>
          <div style={{ fontSize:11, fontWeight:700, color:stageColor, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:4 }}>Mover para</div>
          <div style={{ fontSize:18, fontWeight:800, color:GRAY1 }}>{reqs?.label}</div>
          <div style={{ fontSize:12, color:GRAY2, marginTop:4 }}>Lead: <strong>{info.lead.empresa}</strong></div>
        </div>
        <div style={{ padding:24, display:'flex', flexDirection:'column', gap:16 }}>
          {effectiveFields.length === 0 ? (
            <div style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:10, padding:'12px 14px', fontSize:13, color:'#15803D', fontWeight:600 }}>
              Confirme para mover <strong>{info.lead.empresa}</strong> para <strong>{reqs?.label}</strong>.
            </div>
          ) : (
            <div style={{ background:'#FEF9C3', border:'1px solid #FDE047', borderRadius:10, padding:'12px 14px', fontSize:12, color:'#92400E' }}>
              <div style={{ fontWeight:700, marginBottom:6 }}>Campos obrigatórios para mover para <strong>{reqs?.label}</strong>:</div>
              <ul style={{ margin:0, paddingLeft:16, display:'flex', flexDirection:'column', gap:3 }}>
                {effectiveFields.map((f: any) => (
                  <li key={f.key} style={{ fontSize:12 }}>{f.label}</li>
                ))}
              </ul>
            </div>
          )}
          {effectiveFields.map((f: any) => (
            <div key={f.key}>
              <label style={labelCls}>{f.label} *</label>
              {f.type === 'select' ? (
                <select style={{ ...inputCls, borderColor: errors[f.key] ? R : '#D1D5DB' }}
                  value={form[f.key] ?? info.lead[f.key] ?? ''}
                  onChange={e => { setForm((p:any) => ({...p, [f.key]: e.target.value})); setErrors((p:any) => ({...p, [f.key]:''}))}}>
                  <option value="">Selecione</option>
                  {f.options?.map((o: string) => <option key={o}>{o}</option>)}
                </select>
              ) : f.type === 'number' ? (
                <input type="number" style={{ ...inputCls, borderColor: errors[f.key] ? R : '#D1D5DB' }}
                  placeholder="Ex: 5000"
                  value={form[f.key] ?? info.lead[f.key] ?? ''}
                  onChange={e => { setForm((p:any) => ({...p, [f.key]: e.target.value ? Number(e.target.value) : ''})); setErrors((p:any) => ({...p, [f.key]:''}))} } />
              ) : f.type === 'text' ? (
                <input type="text" style={{ ...inputCls, borderColor: errors[f.key] ? R : '#D1D5DB' }}
                  placeholder={f.key === 'link_transcricao' ? 'https://...' : ''}
                  value={form[f.key] ?? info.lead[f.key] ?? ''}
                  onChange={e => { setForm((p:any) => ({...p, [f.key]: e.target.value})); setErrors((p:any) => ({...p, [f.key]:''}))} } />
              ) : f.type === 'bant' ? (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                    {[
                      { key: 'bant_budget', label: '💰 Budget' },
                      { key: 'bant_authority', label: '👤 Authority' },
                      { key: 'bant_need', label: '🎯 Need' },
                      { key: 'bant_timing', label: '⏰ Timing' },
                    ].map(item => {
                      const checked = !!(form[item.key] ?? info.lead[item.key])
                      return (
                        <div key={item.key}
                          onClick={() => {
                            const newVal = !checked
                            const updated = { ...form, [item.key]: newVal }
                            const score = ['bant_budget','bant_authority','bant_need','bant_timing'].filter(k => !!(updated[k] ?? info.lead[k])).length
                            setForm({ ...updated, bant: score })
                            setErrors((p: any) => ({...p, bant: ''}))
                          }}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', border: `2px solid ${checked ? GREEN : GRAY3}`, background: checked ? `${GREEN}10` : WHITE }}>
                          <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${checked ? GREEN : GRAY3}`, background: checked ? GREEN : WHITE, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {checked && <span style={{ color: WHITE, fontSize: 11, fontWeight: 900 }}>✓</span>}
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 600, color: checked ? GREEN : GRAY1 }}>{item.label}</span>
                        </div>
                      )
                    })}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: GRAY2 }}>Nota BANT:</span>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900, background: (form.bant ?? info.lead.bant ?? 0) >= 3 ? `${GREEN}18` : `${R}18`, color: (form.bant ?? info.lead.bant ?? 0) >= 3 ? GREEN : R, border: `2px solid ${(form.bant ?? info.lead.bant ?? 0) >= 3 ? GREEN : R}` }}>
                      {form.bant ?? info.lead.bant ?? 0}
                    </div>
                    {(form.bant ?? info.lead.bant ?? 0) < 3
                      ? <span style={{ fontSize: 11, color: R, fontWeight: 700 }}>⚠️ Mínimo 3 para avançar</span>
                      : <span style={{ fontSize: 11, color: GREEN, fontWeight: 700 }}>✓ Qualificado</span>}
                  </div>
                </div>
              ) : (
                <input type="date" style={{ ...inputCls, borderColor: errors[f.key] ? R : '#D1D5DB' }}
                  value={form[f.key] ?? info.lead[f.key] ?? ''}
                  onChange={e => { setForm((p:any) => ({...p, [f.key]: e.target.value})); setErrors((p:any) => ({...p, [f.key]:''}))} } />
              )}
              {errors[f.key] && <span style={{ fontSize:11, color:R, marginTop:3, display:'block' }}>{errors[f.key]}</span>}
            </div>
          ))}
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:10, padding:'16px 24px', borderTop:'1px solid #E5E7EB' }}>
          <button onClick={onClose} style={{ padding:'10px 20px', borderRadius:8, border:'1px solid #D1D5DB', background:WHITE, color:GRAY2, fontSize:13, fontWeight:600, cursor:'pointer' }}>Cancelar</button>
          <button onClick={() => {
            const errs: Record<string,string> = {}
            effectiveFields.forEach((f: any) => {
              if (f.type === 'bant') {
                const score = form.bant ?? info.lead.bant ?? 0
                if (score < 3) errs[f.key] = 'BANT mínimo 3 para avançar'
              } else {
                const val = form[f.key] ?? info.lead[f.key]
                if (!val || String(val).trim() === '') errs[f.key] = 'Obrigatório'
              }
            })
            if (Object.keys(errs).length > 0) { setErrors(errs); return }
            const merged: Record<string,any> = {}
            effectiveFields.forEach((f: any) => { merged[f.key] = form[f.key] ?? info.lead[f.key] })
            onConfirm(info.lead, info.targetStage, merged)
          }} style={{ padding:'10px 24px', borderRadius:8, border:'none', background:stageColor, color:WHITE, fontSize:13, fontWeight:800, cursor:'pointer' }}>
            Confirmar Movimentação
          </button>
        </div>
      </div>
    </div>
  )
}


// ── UsuariosCard ──────────────────────────────────────────────────────────────
function UsuariosCard() {
  const [usuarios, setUsuarios] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { fetchUsuarios() }, [])

  async function fetchUsuarios() {
    setLoading(true)
    const { data } = await supabase.from('usuarios_permitidos').select('*').order('created_at')
    setUsuarios(data || [])
    setLoading(false)
  }

  async function addUsuario() {
    if (!nome.trim() || !email.trim()) { setError('Preencha nome e email'); return }
    if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) { setError('Email inválido'); return }
    setSaving(true); setError('')
    const { error: err } = await supabase.from('usuarios_permitidos').insert({ nome: nome.trim(), email: email.trim().toLowerCase() })
    if (err) {
      setError(err.code === '23505' ? 'Este email já está cadastrado' : 'Erro ao adicionar usuário')
    } else {
      setNome(''); setEmail(''); fetchUsuarios()
    }
    setSaving(false)
  }

  async function toggleAtivo(id: string, ativo: boolean) {
    await supabase.from('usuarios_permitidos').update({ ativo: !ativo }).eq('id', id)
    fetchUsuarios()
  }

  async function removeUsuario(id: string) {
    if (!confirm('Remover este usuário?')) return
    await supabase.from('usuarios_permitidos').delete().eq('id', id)
    fetchUsuarios()
  }

  return (
    <div style={{ background: WHITE, borderRadius: 14, border: '1px solid #E5E7EB', boxShadow: '0 1px 6px rgba(0,0,0,.07)', overflow: 'hidden' }}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 40, height: 40, background: `${BLUE}12`, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Users size={20} color={BLUE} />
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: GRAY1 }}>Usuários com Acesso</div>
          <div style={{ fontSize: 12, color: GRAY2, marginTop: 2 }}>Gerencie quem pode acessar o CRM via Google</div>
        </div>
      </div>

      <div style={{ padding: 24 }}>
        {/* Add user form */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, marginBottom: 20 }}>
          <div>
            <label style={labelCls}>Nome</label>
            <input style={inputCls} placeholder="Nome completo" value={nome} onChange={e => { setNome(e.target.value); setError('') }} />
          </div>
          <div>
            <label style={labelCls}>Email Google</label>
            <input style={inputCls} placeholder="email@gmail.com" value={email} onChange={e => { setEmail(e.target.value); setError('') }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button onClick={addUsuario} disabled={saving}
              style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: saving ? GRAY2 : R, color: WHITE, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={14} /> Adicionar
            </button>
          </div>
        </div>
        {error && <div style={{ fontSize: 12, color: R, marginBottom: 14, fontWeight: 600 }}>⚠️ {error}</div>}

        {/* Users list */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 32, color: GRAY2, fontSize: 13 }}>Carregando...</div>
        ) : (
          <div style={{ border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: GRAY4 }}>
                  {['Nome', 'Email', 'Status', 'Ações'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 700, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u, i) => (
                  <tr key={u.id} style={{ borderTop: '1px solid #F3F4F6', background: i % 2 ? GRAY4 : WHITE }}>
                    <td style={{ padding: '12px 14px', fontWeight: 600, color: GRAY1 }}>{u.nome}</td>
                    <td style={{ padding: '12px 14px', color: GRAY2, fontSize: 12 }}>{u.email}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: u.ativo ? `${GREEN}18` : `${GRAY2}18`, color: u.ativo ? GREEN : GRAY2, border: `1px solid ${u.ativo ? GREEN : GRAY2}33` }}>
                        {u.ativo ? '✓ Ativo' : '✗ Inativo'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => toggleAtivo(u.id, u.ativo)}
                          style={{ padding: '5px 10px', borderRadius: 6, border: `1px solid ${u.ativo ? YELLOW : GREEN}44`, background: u.ativo ? `${YELLOW}12` : `${GREEN}12`, color: u.ativo ? YELLOW : GREEN, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                          {u.ativo ? 'Desativar' : 'Ativar'}
                        </button>
                        <button onClick={() => removeUsuario(u.id)}
                          style={{ padding: '5px 10px', borderRadius: 6, border: `1px solid ${R}33`, background: `${R}10`, color: R, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                          Remover
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {usuarios.length === 0 && (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: 32, color: GRAY2 }}>Nenhum usuário cadastrado</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ marginTop: 14, fontSize: 12, color: GRAY2 }}>
          💡 O login é feito com a conta Google cadastrada aqui. Usuários inativos não conseguem acessar.
        </div>
      </div>
    </div>
  )
}

// ── ConfiguracoesPage ─────────────────────────────────────────────────────────
const ADMIN_EMAIL = 'matheus.nunes@v4company.com'

function ConfiguracoesPage({ onImport, userEmail }: { onImport: (leads: any[]) => Promise<{ok: number, errors: number}>; userEmail?: string }) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<any[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ok: number, errors: number} | null>(null)
  const [step, setStep] = useState<'upload' | 'map' | 'done'>('upload')
  const [dragOver, setDragOver] = useState(false)

  const CRM_FIELDS = [
    { key: '', label: '— Ignorar coluna —' },
    { key: 'empresa', label: 'Empresa *' },
    { key: 'origem', label: 'Origem' },
    { key: 'segmento', label: 'Segmento' },
    { key: 'closer', label: 'Closer' },
    { key: 'temperatura', label: 'Temperatura' },
    { key: 'situacao_closer', label: 'Situação Closer' },
    { key: 'tier', label: 'Tier' },
    { key: 'faturamento', label: 'Faturamento' },
    { key: 'cargo', label: 'Cargo' },
    { key: 'urgencia', label: 'Urgência' },
    { key: 'data_entrada', label: 'Data de Entrada' },
    { key: 'data_ra', label: 'Data RA' },
    { key: 'data_rr', label: 'Data RR' },
    { key: 'data_assinatura', label: 'Data Venda' },
    { key: 'data_ativacao', label: 'Data Ativação' },
    { key: 'data_fup', label: 'Data FUP' },
    { key: 'tcv', label: 'TCV (R$)' },
    { key: 'proximos_passos', label: 'Próximos Passos' },
    { key: 'venda', label: 'Venda?' },
    { key: 'bant', label: 'BANT' },
    { key: 'nome_lead', label: 'Nome do Lead' },
    { key: 'telefone', label: 'Telefone' },
    { key: 'situacao_pre_vendas', label: 'Situação BDR' },
    { key: 'broker', label: 'Custo Broker' },
    { key: 'recomendacoes', label: 'Quem Recomendou' },
    { key: 'conexao', label: 'Conexão' },
  ]

  // Auto-map columns by name similarity
  function autoMap(cols: string[]) {
    const auto: Record<string, string> = {}
    const aliases: Record<string, string> = {
      'empresa': 'empresa', 'company': 'empresa', 'nome': 'empresa',
      'origem': 'origem', 'source': 'origem',
      'segmento': 'segmento', 'segment': 'segmento',
      'closer': 'closer', 'vendedor': 'closer',
      'temperatura': 'temperatura', 'temp': 'temperatura',
      'situação closer': 'situacao_closer', 'situacao': 'situacao_closer', 'status': 'situacao_closer',
      'tier': 'tier',
      'faturamento': 'faturamento', 'revenue': 'faturamento',
      'cargo': 'cargo', 'role': 'cargo',
      'urgência': 'urgencia', 'urgencia': 'urgencia',
      'data entrada': 'data_entrada', 'data de entrada': 'data_entrada', 'entrada': 'data_entrada',
      'data ra': 'data_ra', 'data reunião agendada': 'data_ra', 'ra': 'data_ra',
      'data rr': 'data_rr', 'data reunião realizada': 'data_rr', 'rr': 'data_rr',
      'data assinatura': 'data_assinatura', 'data venda': 'data_assinatura', 'assinatura': 'data_assinatura',
      'data ativação': 'data_ativacao', 'data ativacao': 'data_ativacao', 'ativação': 'data_ativacao',
      'data fup': 'data_fup', 'fup': 'data_fup', 'follow up': 'data_fup',
      'tcv': 'tcv', 'valor': 'tcv', 'ticket': 'tcv',
      'próximos passos': 'proximos_passos', 'proximos passos': 'proximos_passos', 'next steps': 'proximos_passos',
      'venda': 'venda', 'vendido': 'venda',
      'bant': 'bant',
      'nome do lead': 'nome_lead', 'nome lead': 'nome_lead', 'contato': 'nome_lead',
      'telefone': 'telefone', 'phone': 'telefone',
      'situação bdr': 'situacao_pre_vendas', 'situacao bdr': 'situacao_pre_vendas',
      'custo broker': 'broker', 'broker': 'broker',
      'quem recomendou': 'recomendacoes', 'quem recomendou / indicou': 'recomendacoes', 'indicou': 'recomendacoes',
      'conexão': 'conexao', 'conexao': 'conexao',
      'step': '',
      'authority': 'autority', 'autority': 'autority',
      'need': 'need', 'timing': 'timing', 'budget': 'budget',
    }
    cols.forEach((col: string) => {
      const normalized = col.toLowerCase().trim()
      auto[col] = aliases[normalized] || ''
    })
    return auto
  }

  async function handleFile(f: File) {
    setFile(f)
    setResult(null)
    setStep('upload')
    
    // Use SheetJS via CDN loaded in browser
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const data = e.target?.result
        // Dynamically import xlsx
        const XLSX = (window as any).XLSX
        if (!XLSX) { alert('Aguarde o carregamento da biblioteca e tente novamente.'); return }
        const workbook = XLSX.read(data, { type: 'binary', cellDates: true })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
        
        if (rows.length < 2) return
        // Find the header row: first row where first non-empty cell is a known column name
        let headerRowIdx = 0
        for (let i = 0; i < Math.min(10, rows.length); i++) {
          const firstCell = String(rows[i][0] || '').trim().toUpperCase()
          if (firstCell === 'EMPRESA' || firstCell === 'COMPANY' || firstCell === 'NOME') {
            headerRowIdx = i; break
          }
        }
        const hdrs = rows[headerRowIdx].map((h: any) => String(h).trim()).filter((h: string) => h)
        setHeaders(hdrs)
        setMapping(autoMap(hdrs))
        // Preview first 5 data rows (skip hint row right after header if it looks like hints)
        const firstDataIdx = headerRowIdx + 1
        const dataRows = rows.slice(firstDataIdx, firstDataIdx + 6).filter((row: any[]) => {
          const first = String(row[0] || '').trim()
          return first && first !== hdrs[0] // skip hint rows
        }).slice(0, 5).map((row: any[]) => {
          const obj: Record<string, any> = {}
          hdrs.forEach((h: string, i: number) => { obj[h] = row[i] })
          return obj
        })
        setPreview(dataRows)
        setStep('map')
      } catch(err) {
        alert('Erro ao ler arquivo. Certifique-se que é um arquivo .xlsx ou .csv válido.')
      }
    }
    reader.readAsBinaryString(f)
  }

  async function handleImport() {
    if (!file) return
    setImporting(true)
    
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const data = e.target?.result
        const XLSX = (window as any).XLSX
        if (!XLSX) { alert('Aguarde o carregamento da biblioteca e tente novamente.'); return }
        const workbook = XLSX.read(data, { type: 'binary', cellDates: true })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
        
        // Find header row
        let headerRowIdx = 0
        for (let i = 0; i < Math.min(10, rows.length); i++) {
          const firstCell = String(rows[i][0] || '').trim().toUpperCase()
          if (firstCell === 'EMPRESA' || firstCell === 'COMPANY' || firstCell === 'NOME') {
            headerRowIdx = i; break
          }
        }
        const hdrs = rows[headerRowIdx].map((h: any) => String(h).trim())
        // Skip hint row if present (next row after header looks like hints, not data)
        const firstDataIdx = headerRowIdx + 1
        const dataRows = rows.slice(firstDataIdx).filter((row: any[]) => {
          const first = String(row[0] || '').trim()
          return first && first.toUpperCase() !== hdrs[0].toUpperCase()
        })
        
        const leads = dataRows.map((row: any[]) => {
          const lead: Record<string, any> = {}
          hdrs.forEach((h: string, i: number) => {
            const field = mapping[h]
            if (!field || !h) return
            let val = row[i]
            if (val === '' || val === null || val === undefined) return
            // Handle dates
            if (field.startsWith('data_') && val instanceof Date) {
              val = val.toISOString().split('T')[0]
            } else if (field.startsWith('data_') && typeof val === 'string' && val.trim()) {
              try { val = new Date(val).toISOString().split('T')[0] } catch { return }
            }
            // Handle numbers
            if (field === 'tcv' || field === 'bant') {
              val = Number(String(val).replace(/[^0-9.,]/g, '').replace(',', '.'))
              if (isNaN(val)) return
            }
            lead[field] = val
          })
          return lead
        }).filter((l: any) => l.empresa && String(l.empresa).trim())

        const res = await onImport(leads)
        setResult(res)
        setStep('done')
      } catch(err: any) {
        alert('Erro na importação: ' + err.message)
      }
      setImporting(false)
    }
    reader.readAsBinaryString(file)
  }

  function reset() {
    setFile(null); setPreview([]); setHeaders([]); setMapping({})
    setResult(null); setStep('upload')
  }

  const btnStyle: React.CSSProperties = { padding: '11px 22px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: GRAY1, margin: 0 }}>Configurações</h1>
        <p style={{ fontSize: 13, color: GRAY2, marginTop: 4 }}>Importação em massa e configurações do CRM</p>
      </div>

      {/* CARD IMPORTAÇÃO */}
      <div style={{ background: WHITE, borderRadius: 14, border: '1px solid #E5E7EB', boxShadow: '0 1px 6px rgba(0,0,0,.07)', overflow: 'hidden' }}>
        
        {/* Header do card */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, background: `${R}12`, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FileSpreadsheet size={20} color={R} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: GRAY1 }}>Importar Leads via Excel</div>
            <div style={{ fontSize: 12, color: GRAY2, marginTop: 2 }}>Suba um arquivo .xlsx ou .csv com sua lista de leads</div>
          </div>
        </div>

        <div style={{ padding: 24 }}>

          {/* STEP 1: UPLOAD */}
          {step === 'upload' && (
            <div>
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
                style={{ border: `2px dashed ${dragOver ? R : '#D1D5DB'}`, borderRadius: 12, padding: '48px 24px', textAlign: 'center', background: dragOver ? `${R}06` : GRAY4, transition: 'all .2s', cursor: 'pointer' }}
                onClick={() => document.getElementById('xlsx-input')?.click()}
              >
                <Upload size={36} color={dragOver ? R : GRAY2} style={{ margin: '0 auto 12px', display: 'block' }} />
                <div style={{ fontSize: 15, fontWeight: 700, color: dragOver ? R : GRAY1, marginBottom: 6 }}>
                  {dragOver ? 'Solte o arquivo aqui' : 'Arraste o arquivo ou clique para selecionar'}
                </div>
                <div style={{ fontSize: 12, color: GRAY2 }}>Suporta .xlsx e .csv</div>
                <input id="xlsx-input" type="file" accept=".xlsx,.csv" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
              </div>

              {/* Modelo para download */}
              <div style={{ marginTop: 16, padding: '14px 16px', background: GRAY4, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: GRAY1 }}>📋 Modelo de planilha</div>
                  <div style={{ fontSize: 11, color: GRAY2, marginTop: 2 }}>Baixe o template com as colunas corretas</div>
                </div>
                <button onClick={() => {
                  const cols = ['EMPRESA','NOME DO LEAD','TELEFONE','DATA ENTRADA','ORIGEM','CUSTO BROKER','QUEM RECOMENDOU','SEGMENTO','CONEXÃO','SITUAÇÃO BDR','BANT','BUDGET','AUTHORITY','NEED','TIMING','TEMPERATURA','SITUAÇÃO CLOSER','FATURAMENTO','CARGO','TCV','DATA RA','DATA RR','DATA VENDA','DATA ATIVAÇÃO','DATA FUP','PRÓXIMOS PASSOS']
                  const example = ['Empresa Exemplo','João Silva','11999999999','2026-04-01','Indicação','','','Varejo','','','','','','','','MORNO','','200-400k','Diretor','15000','','','','','','Marcar reunião']
                  const csv = [cols.join(','), example.join(',')].join('\n')
                  const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a'); a.href = url; a.download = 'MODELO_LEADS_V4.csv'; a.click()
                  URL.revokeObjectURL(url)
                }} style={{ ...btnStyle, background: GRAY1, color: WHITE }}>
                  ⬇ Baixar modelo (.csv)
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: MAPEAMENTO */}
          {step === 'map' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: GRAY1 }}>📂 {file?.name}</div>
                  <div style={{ fontSize: 12, color: GRAY2, marginTop: 2 }}>{headers.length} colunas detectadas — mapeie cada uma para o campo correto</div>
                </div>
                <button onClick={reset} style={{ ...btnStyle, background: GRAY4, color: GRAY2, padding: '8px 14px', fontSize: 12 }}>
                  Trocar arquivo
                </button>
              </div>

              {/* Tabela de mapeamento */}
              <div style={{ border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: GRAY4 }}>
                      <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 700, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.07em', width: '35%' }}>Coluna na planilha</th>
                      <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 700, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.07em', width: '25%' }}>Exemplo</th>
                      <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 700, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Campo no CRM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {headers.map((h, i) => (
                      <tr key={h} style={{ borderTop: '1px solid #F3F4F6', background: i % 2 ? GRAY4 : WHITE }}>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: GRAY1 }}>{h}</td>
                        <td style={{ padding: '10px 14px', color: GRAY2, fontSize: 12, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {preview[0]?.[h] !== undefined ? String(preview[0][h]).slice(0, 40) : '—'}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <select style={{ ...inputCls, padding: '7px 10px', fontSize: 12, width: '100%' }}
                            value={mapping[h] || ''} onChange={e => setMapping(m => ({ ...m, [h]: e.target.value }))}>
                            {CRM_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Preview */}
              {preview.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Preview (primeiras 5 linhas)</div>
                  <div style={{ overflowX: 'auto', border: '1px solid #E5E7EB', borderRadius: 10 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: GRAY4 }}>
                          {headers.slice(0, 6).map(h => (
                            <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: GRAY2, fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.map((row, i) => (
                          <tr key={i} style={{ borderTop: '1px solid #F3F4F6' }}>
                            {headers.slice(0, 6).map(h => (
                              <td key={h} style={{ padding: '8px 12px', color: GRAY1, whiteSpace: 'nowrap', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {String(row[h] || '—').slice(0, 40)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={reset} style={{ ...btnStyle, background: GRAY4, color: GRAY2 }}>Cancelar</button>
                <button onClick={handleImport} disabled={importing} style={{ ...btnStyle, background: importing ? GRAY2 : R, color: WHITE, minWidth: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  {importing ? (
                    <><div style={{ width: 14, height: 14, border: '2px solid #ffffff44', borderTopColor: WHITE, borderRadius: '50%', animation: 'spin .7s linear infinite' }} /> Importando...</>
                  ) : (
                    <><Upload size={15} /> Importar Leads</>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: RESULTADO */}
          {step === 'done' && result && (
            <div style={{ textAlign: 'center', padding: '32px 24px' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: result.errors === 0 ? `${GREEN}18` : `${YELLOW}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                {result.errors === 0
                  ? <CheckCircle size={32} color={GREEN} />
                  : <AlertCircle size={32} color={YELLOW} />}
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: GRAY1, marginBottom: 8 }}>Importação concluída!</div>
              <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginBottom: 24 }}>
                <div style={{ background: `${GREEN}12`, border: `1px solid ${GREEN}33`, borderRadius: 10, padding: '12px 20px' }}>
                  <div style={{ fontSize: 28, fontWeight: 900, color: GREEN }}>{result.ok}</div>
                  <div style={{ fontSize: 12, color: GRAY2, marginTop: 2 }}>leads importados</div>
                </div>
                {result.errors > 0 && (
                  <div style={{ background: `${R}12`, border: `1px solid ${R}33`, borderRadius: 10, padding: '12px 20px' }}>
                    <div style={{ fontSize: 28, fontWeight: 900, color: R }}>{result.errors}</div>
                    <div style={{ fontSize: 12, color: GRAY2, marginTop: 2 }}>com erro</div>
                  </div>
                )}
              </div>
              <button onClick={reset} style={{ ...btnStyle, background: R, color: WHITE }}>Importar nova lista</button>
            </div>
          )}
        </div>
      </div>

      {/* CARD USUÁRIOS — visível apenas para o admin */}
      {userEmail === ADMIN_EMAIL && <UsuariosCard />}

      {/* CARD INFO */}
      <div style={{ background: WHITE, borderRadius: 14, border: '1px solid #E5E7EB', boxShadow: '0 1px 6px rgba(0,0,0,.07)', padding: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: GRAY1, marginBottom: 16 }}>📌 Como funciona a importação</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          {[
            { n: '1', title: 'Prepare a planilha', desc: 'Use o modelo disponível acima ou sua própria planilha. Cada linha deve ser um lead.' },
            { n: '2', title: 'Mapeie as colunas', desc: 'Após o upload, indique qual coluna da sua planilha corresponde a qual campo do CRM.' },
            { n: '3', title: 'Importe', desc: 'Clique em importar. Os leads são adicionados sem duplicar os já existentes.' },
          ].map(s => (
            <div key={s.n} style={{ display: 'flex', gap: 12 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: R, color: WHITE, fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>{s.n}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: GRAY1, marginBottom: 4 }}>{s.title}</div>
                <div style={{ fontSize: 12, color: GRAY2, lineHeight: 1.5 }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function CRMApp() {
  const router = useRouter()
  const [session, setSession] = useState<any>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [view, setView] = useState<'dashboard' | 'leads' | 'pipeline' | 'metas' | 'acompanhamento' | 'configuracoes'>('dashboard')
  const [leads, setLeads] = useState<Lead[]>([])
  const [metas, setMetas] = useState<Record<string, Record<string, any>>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({
    closer: '', temperatura: '', situacao: '',
    origem: '', tier: '',
    mes_entrada: '', mes_ra: '', mes_rr: '', mes_venda: '', mes_ativacao: '',
    situacao_pre_vendas: '',
  })
  const [mesSel, setMesSel] = useState(() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}` })
  const [canalSel, setCanalSel] = useState<string>('Canal')
  const [pipelineView, setPipelineView] = useState<'total' | 'pre-vendas' | 'vendas'>('total')
  const [pipelineCanal, setPipelineCanal] = useState<string>('Canal')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const PAGE_SIZE = 50
  const [dragModal, setDragModal] = useState<{ open: boolean; lead: any; targetStage: string } | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [fupFilter, setFupFilter] = useState<string>('')
  const [dashFilterOpen, setDashFilterOpen] = useState(false)
  const [pipelineFilterOpen, setPipelineFilterOpen] = useState(false)
  const [kpiHover, setKpiHover] = useState<string|null>(null)
  const [kpiPopoverPage, setKpiPopoverPage] = useState(0)
  const [leadsFilterOpen, setLeadsFilterOpen] = useState(false)
  const [draftLeadsFilters, setDraftLeadsFilters] = useState({ closer:'', temperatura:'', situacao:'', origem:'', tier:'', mes_entrada:'', mes_ra:'', mes_rr:'', mes_venda:'', mes_ativacao:'', situacao_pre_vendas:'' })
  const [draftPipelineCanal, setDraftPipelineCanal] = useState('Canal')
  const [pipelineCloser, setPipelineCloser] = useState('')
  const [draftPipelineCloser, setDraftPipelineCloser] = useState('')
  const [pipelineTemp, setPipelineTemp] = useState('')
  const [draftPipelineTemp, setDraftPipelineTemp] = useState('')
  const [tierSel, setTierSel] = useState('')
  const [closerSel, setCloserSel] = useState('')
  // draft state inside the filter popover
  const [draftCanal, setDraftCanal] = useState('Canal')
  const [draftMes, setDraftMes] = useState(() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}` })
  const [draftTier, setDraftTier] = useState('')
  const [draftCloser, setDraftCloser] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setSession(session)
      setAuthLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) { router.push('/login') }
      else { setSession(session); setAuthLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => { if (!authLoading && session) { fetchLeads(); fetchMetas() } }, [authLoading, session])
  useEffect(() => { setPage(1); setSelected(new Set()) }, [search, filters])

  async function fetchLeads() {
    const { data } = await supabase.from('leads').select('*').order('created_at', { ascending: false })
    setLeads(data || [])
    setLoading(false)
  }

  async function fetchMetas() {
    const { data } = await supabase.from('metas_mensais').select('*')
    if (data) {
      const map: Record<string, Record<string, any>> = {}
      data.forEach((m: any) => {
        const canal = m.canal || 'geral'
        if (!map[m.periodo]) map[m.periodo] = {}
        map[m.periodo][canal] = m
      })
      setMetas(map)
    }
  }

  async function saveMeta(periodo: string, canal: string, valores: any) {
    const existing = metas[periodo]?.[canal]
    if (existing) {
      await supabase.from('metas_mensais').update(valores).eq('id', existing.id)
    } else {
      await supabase.from('metas_mensais').insert({ periodo, canal, ...valores })
    }
    fetchMetas()
  }


  async function deleteLead(id: string) {
    if (!confirm('Excluir este lead?')) return
    await supabase.from('leads').delete().eq('id', id)
    fetchLeads()
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  async function deleteSelected() {
    if (!confirm(`Excluir ${selected.size} leads selecionados? Esta ação não pode ser desfeita.`)) return
    const ids = Array.from(selected)
    const CHUNK = 50
    for (let i = 0; i < ids.length; i += CHUNK) {
      await supabase.from('leads').delete().in('id', ids.slice(i, i + CHUNK))
    }
    setSelected(new Set())
    fetchLeads()
  }

  async function importLeads(leads: any[]): Promise<{ok: number, errors: number}> {
    let ok = 0, errors = 0
    const CHUNK = 50
    for (let i = 0; i < leads.length; i += CHUNK) {
      const batch = leads.slice(i, i + CHUNK).map((l: any) => {
        const clean: Record<string, any> = {}
        Object.entries(l).forEach(([k, v]) => { clean[k] = (v === '' || v === undefined) ? null : v })
        return clean
      })
      const { error } = await supabase.from('leads').insert(batch)
      if (error) { errors += batch.length } else { ok += batch.length }
    }
    fetchLeads()
    return { ok, errors }
  }

  async function applyDragUpdate(lead: any, targetStage: string, formData: Record<string, any>) {
    const updates: Record<string, any> = { ...formData }
    // Auto-set situacao_pre_vendas and situacao_closer based on target stage
    const spvMap: Record<string, string> = {
      'TENTANDO CONTATO': 'TENTANDO CONTATO',
      'EM QUALIFICAÇÃO': 'EM QUALIFICAÇÃO',
      'REUNIÃO AGENDADA': 'REUNIÃO AGENDADA',
      'NO-SHOW/REMARCANDO': 'NO SHOW/REMARCANDO',
      'REUNIÃO REALIZADA': 'REUNIÃO REALIZADA',
    }
    const scMap: Record<string, string> = {
      'FOLLOW UP': 'EM FOLLOW UP',
    }
    if (spvMap[targetStage]) updates.situacao_pre_vendas = spvMap[targetStage]
    if (scMap[targetStage]) updates.situacao_closer = scMap[targetStage]
    if (targetStage === 'PERDIDO') {
      updates.situacao_pre_vendas = 'PERDIDO SDR'
      updates.situacao_closer = 'PERDIDO CLOSER'
    }
    if (targetStage === 'VENDA' && formData.data_assinatura) updates.venda = 'SIM'
    const { error: updateError } = await supabase.from('leads').update(updates).eq('id', lead.id)
    if (updateError) { alert('Erro ao mover lead: ' + updateError.message); return }
    await fetchLeads()
    setDragModal(null)
  }

  const navMes = (dir: number) => {
    const [y, m] = mesSel.split('-').map(Number)
    const d = new Date(y, m - 1 + dir)
    setMesSel(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const mesFmt = (ym: string) => { const [y, m] = ym.split('-').map(Number); return `${MESES[m - 1]} ${y}` }

  const dadosMensais = useMemo(() => {
    const s = new Set<string>()
    const campos: (keyof Lead)[] = ['data_entrada', 'data_ra', 'data_rr', 'data_assinatura', 'data_ativacao']
    leads.forEach(l => campos.forEach(c => { const m = mesAno(l[c] as string); if (m) s.add(m) }))
    const byCanal = (l: any) => canalSel === 'Canal' || l.origem === canalSel
    return Array.from(s).sort().map(m => ({
      mes: mesFmt(m),
      entrada: leads.filter(l => mesAno(l.data_entrada as string) === m && byCanal(l)).length,
      ra: leads.filter(l => mesAno(l.data_ra as string) === m && byCanal(l)).length,
      rr: leads.filter(l => mesAno(l.data_rr as string) === m && byCanal(l)).length,
      vendas: leads.filter(l => mesAno(l.data_assinatura as string) === m && byCanal(l)).length,
      ativacao: leads.filter(l => mesAno(l.data_ativacao as string) === m && byCanal(l)).length,
      tcv: leads.filter(l => mesAno(l.data_assinatura as string) === m && byCanal(l)).reduce((s, l) => s + (l.tcv || 0), 0),
    }))
  }, [leads, canalSel])

  const CANAIS = ['Canal', 'Recovery', 'Lead Broker', 'Recomendação', 'Eventos', 'Indicação']

  const lm = useMemo(() => {
    const byCanal = (l: any) => canalSel === 'Canal' || l.origem === canalSel
    const byTier = (l: any) => !tierSel || l.tier === tierSel
    const byCloser = (l: any) => !closerSel || l.closer === closerSel
    const match = (l: any) => byCanal(l) && byTier(l) && byCloser(l)
    return {
      entrada: leads.filter(l => mesAno(l.data_entrada as string) === mesSel && match(l)),
      ra: leads.filter(l => mesAno(l.data_ra as string) === mesSel && match(l)),
      rr: leads.filter(l => mesAno(l.data_rr as string) === mesSel && match(l)),
      venda: leads.filter(l => mesAno(l.data_assinatura as string) === mesSel && match(l)),
      ativacao: leads.filter(l => mesAno(l.data_ativacao as string) === mesSel && match(l)),
    }
  }, [leads, mesSel, canalSel, tierSel, closerSel])

  const tcvMes = lm.venda.reduce((s, l) => s + (l.tcv || 0), 0)
  const conv = (a: number, b: number) => b > 0 ? Math.round(a / b * 100) : 0
  const convBar = (a: number, b: number) => Math.min(conv(a, b), 100)

  type StageField = { key: string; label: string; type: 'date' | 'select' | 'bant' | 'number' | 'text'; options?: string[] }
  type StageReq = { label: string; fields: StageField[]; extraFields?: (lead: any) => StageField[] }
  // Required fields when moving to each stage
  const STAGE_REQUIREMENTS: Record<string, StageReq> = {
    'TENTANDO CONTATO': { label: 'Tentando Contato', fields: [
      { key: 'situacao_pre_vendas', label: 'Situação Pré-Vendas', type: 'select', options: SITUACOES_PRE_VENDAS },
    ]},
    'EM QUALIFICAÇÃO': { label: 'Em Qualificação', fields: [
      { key: 'situacao_pre_vendas', label: 'Situação Pré-Vendas', type: 'select', options: SITUACOES_PRE_VENDAS },
    ]},
    'REUNIÃO AGENDADA': { label: 'Reunião Agendada', fields: [
      { key: 'data_ra', label: 'Data da Reunião Agendada', type: 'date' },
      { key: 'closer', label: 'Closer Responsável', type: 'select', options: CLOSERS },
      { key: 'situacao_pre_vendas', label: 'Situação Pré-Vendas', type: 'select', options: SITUACOES_PRE_VENDAS },
      { key: 'bant', label: 'Nota BANT (mín. 3)', type: 'bant' },
      { key: 'segmento', label: 'Segmento', type: 'select', options: SEGMENTOS },
      { key: 'faturamento', label: 'Faturamento', type: 'select', options: FATURAMENTOS },
      { key: 'cargo', label: 'Cargo do Lead', type: 'select', options: CARGOS_OPTIONS },
      { key: 'urgencia', label: 'Urgência', type: 'text' },
    ],
    extraFields: (lead: any) => lead.origem === 'Lead Broker' ? [
      { key: 'custo_broker', label: 'Custo de Broker (R$)', type: 'number' as const },
    ] : [],
    },
    'NO-SHOW/REMARCANDO': { label: 'No-Show/Remarcando', fields: [
      { key: 'situacao_pre_vendas', label: 'Situação Pré-Vendas', type: 'select', options: SITUACOES_PRE_VENDAS },
    ]},
    'REUNIÃO REALIZADA': { label: 'Reunião Realizada', fields: [
      { key: 'data_rr', label: 'Data da Reunião Realizada', type: 'date' },
      { key: 'closer', label: 'Closer Responsável', type: 'select', options: CLOSERS },
      { key: 'situacao_pre_vendas', label: 'Situação Pré-Vendas', type: 'select', options: SITUACOES_PRE_VENDAS },
      { key: 'data_fup', label: 'Data do FUP', type: 'date' },
      { key: 'link_transcricao', label: 'Link da Transcrição', type: 'text' },
      { key: 'temperatura', label: 'Temperatura', type: 'select', options: TEMPERATURAS },
      { key: 'tcv', label: 'TCV (R$)', type: 'number' },
    ]},
    'FOLLOW UP': { label: 'Follow Up', fields: [
      { key: 'situacao_closer', label: 'Situação Closer', type: 'select', options: SITUACOES },
      { key: 'data_fup', label: 'Data do FUP', type: 'date' },
      { key: 'data_rr', label: 'Data da Reunião Realizada', type: 'date' },
      { key: 'link_transcricao', label: 'Link da Transcrição', type: 'text' },
      { key: 'temperatura', label: 'Temperatura', type: 'select', options: TEMPERATURAS },
      { key: 'tcv', label: 'TCV (R$)', type: 'number' },
    ]},
    'VENDA': { label: 'Venda', fields: [
      { key: 'data_assinatura', label: 'Data da Venda', type: 'date' },
      { key: 'tcv', label: 'TCV (R$)', type: 'number' },
      { key: 'data_rr', label: 'Data da Reunião Realizada', type: 'date' },
      { key: 'link_transcricao', label: 'Link da Transcrição', type: 'text' },
      { key: 'temperatura', label: 'Temperatura', type: 'select', options: TEMPERATURAS },
    ]},
    'ATIVADO': { label: 'Ativado', fields: [
      { key: 'data_ativacao', label: 'Data de Ativação', type: 'date' },
    ]},
    'PERDIDO': { label: 'Perdido', fields: [] },
  }

  // Pipeline stage logic based on situacao_pre_vendas + situacao_closer
  const getPipelineStage = (l: any): string => {
    const spv = l.situacao_pre_vendas || ''
    const sc = l.situacao_closer || ''
    // PERDIDO tem prioridade máxima — mesmo que tenha data_assinatura
    if (sc === 'PERDIDO CLOSER') return 'PERDIDO'
    if (spv === 'PERDIDO SDR' || spv === 'REEMBOLSO') return 'PERDIDO'
    // Venda / Ativado
    if (sc === 'VENDA' || l.data_assinatura) return l.data_ativacao ? 'ATIVADO' : 'VENDA'
    // Follow Up
    if (sc === 'EM FOLLOW UP' || sc === 'REUNIAO EXTRA AGENDADA' || sc === 'AGENDA FUTURA') return 'FOLLOW UP'
    // Pré-Vendas
    if (spv === 'REUNIÃO REALIZADA') return 'REUNIÃO REALIZADA'
    if (spv === 'NO SHOW/REMARCANDO') return 'NO-SHOW/REMARCANDO'
    if (spv === 'REUNIÃO AGENDADA') return 'REUNIÃO AGENDADA'
    if (spv === 'EM QUALIFICAÇÃO' || spv === 'AGENDA FUTURA') return 'EM QUALIFICAÇÃO'
    if (spv === 'TENTANDO CONTATO') return 'TENTANDO CONTATO'
    return 'ENTRADA'
  }

  const PIPELINE_STAGES = [
    { label: 'Entrada',              key: 'ENTRADA',              color: BLUE },
    { label: 'Tentando Contato',     key: 'TENTANDO CONTATO',     color: '#F97316' },
    { label: 'Em Qualificação',      key: 'EM QUALIFICAÇÃO',      color: YELLOW },
    { label: 'Reunião Agendada',     key: 'REUNIÃO AGENDADA',     color: '#0D9488' },
    { label: 'No-Show/Remarcando',   key: 'NO-SHOW/REMARCANDO',   color: '#92400E' },
    { label: 'Reunião Realizada',    key: 'REUNIÃO REALIZADA',    color: PURPLE },
    { label: 'Follow Up',            key: 'FOLLOW UP',            color: '#8B5CF6' },
    { label: 'Venda',                key: 'VENDA',                color: GREEN },
    { label: 'Ativado',              key: 'ATIVADO',              color: '#0EA5E9' },
    { label: 'Perdido',              key: 'PERDIDO',              color: GRAY2 },
  ]

  const funilPipeline = useMemo(() => PIPELINE_STAGES.map(stage => ({
    ...stage,
    leads: leads.filter(l =>
      getPipelineStage(l) === stage.key &&
      (pipelineCanal === 'Canal' || l.origem === pipelineCanal) &&
      (!pipelineCloser || l.closer === pipelineCloser) &&
      (!pipelineTemp || l.temperatura === pipelineTemp)
    )
  })), [leads, pipelineCanal, pipelineCloser, pipelineTemp])

  const filtered = leads.filter(l =>
    (!search || l.empresa?.toLowerCase().includes(search.toLowerCase()) || l.closer?.toLowerCase().includes(search.toLowerCase()) || (l as any).nome_lead?.toLowerCase().includes(search.toLowerCase()))
    && (!filters.closer || l.closer === filters.closer)
    && (!filters.temperatura || l.temperatura === filters.temperatura)
    && (!filters.situacao || l.situacao_closer === filters.situacao)
    && (!filters.origem || l.origem === filters.origem)
    && (!filters.tier || l.tier === filters.tier)
    && (!filters.situacao_pre_vendas || (l as any).situacao_pre_vendas === filters.situacao_pre_vendas)
    && (!filters.mes_entrada || mesAno(l.data_entrada) === filters.mes_entrada)
    && (!filters.mes_ra || mesAno(l.data_ra) === filters.mes_ra)
    && (!filters.mes_rr || mesAno(l.data_rr) === filters.mes_rr)
    && (!filters.mes_venda || mesAno(l.data_assinatura) === filters.mes_venda)
    && (!filters.mes_ativacao || mesAno(l.data_ativacao) === filters.mes_ativacao)
  )

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pagedLeads = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const allPageSelected = pagedLeads.length > 0 && pagedLeads.every(l => selected.has(l.id))

  const tooltipStyle = { background: WHITE, border: '1px solid #E5E7EB', borderRadius: 8, color: GRAY1, fontSize: 12 }

  if (authLoading) return (
    <div style={{ minHeight:'100vh', background:'#EFEFEF', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:16 }}>
      <div style={{ width:36, height:36, border:'3px solid #E5E7EB', borderTopColor:GRAY2, borderRadius:'50%', animation:'spin .8s linear infinite' }} />
      <div style={{ color:GRAY2, fontSize:14, fontWeight:500 }}>Carregando...</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: "'Plus Jakarta Sans', 'DM Sans', system-ui, sans-serif" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } } * { box-sizing: border-box; }`}</style>

      <Sidebar activeView={view} onNavigate={v => setView(v as any)} />

      {/* CONTENT */}
      <div style={{ flex: 1, background: CONTENT_BG, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ background: WHITE, borderBottom: '1px solid #EEEEF5', padding: '0 28px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, boxShadow: '0 1px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: R, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>CRM</span>
            <span style={{ color: GRAY3, fontSize: 16, lineHeight: '1' }}>›</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: GRAY1 }}>{({'dashboard':'Dashboard','leads':'Leads','pipeline':'Pipeline','metas':'Metas','acompanhamento':'Acompanhamento','configuracoes':'Configurações'} as Record<string,string>)[view] || view}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 12, color: GRAY2, background: GRAY4, padding: '5px 12px', borderRadius: 20, fontWeight: 500 }}>{leads.length} leads</span>
            {session?.user?.user_metadata?.avatar_url
              ? <img src={session.user.user_metadata.avatar_url} style={{ width:34, height:34, borderRadius:'50%', border:'2px solid #EDE9FE' }} alt="" />
              : <div style={{ width:34, height:34, borderRadius:'50%', background:'linear-gradient(135deg, #E8001C, #B91C1C)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:800, color:WHITE }}>
                  {(session?.user?.user_metadata?.full_name || session?.user?.email || 'U')[0].toUpperCase()}
                </div>
            }
          </div>
        </div>

        {loading && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
            <div style={{ width: 36, height: 36, border: `3px solid ${GRAY3}`, borderTopColor: PURPLE, borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
            <span style={{ fontSize: 13, color: GRAY2 }}>Carregando...</span>
          </div>
        )}

        <div style={{ flex: 1, padding: 28 }}>

          {/* DASHBOARD */}
          {!loading && view === 'dashboard' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

              {/* ── Header ── */}
              {(() => {
                const TIERS = ['TINY', 'SMALL', 'MEDIUM', 'LARGE', 'ENTERPRISE']
                const allMonthsOpts = (() => {
                  const months: string[] = []
                  const now = new Date()
                  for (let i = -11; i <= 2; i++) {
                    const d = new Date(now.getFullYear(), now.getMonth() + i)
                    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
                  }
                  return months
                })()
                const activeFilters = [
                  canalSel !== 'Canal' && { key: 'canal', label: canalSel, onRemove: () => setCanalSel('Canal') },
                  mesSel !== draftMes && { key: 'mes', label: mesFmt(mesSel), onRemove: () => { const n = new Date(); const m = `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`; setMesSel(m); setDraftMes(m) } },
                  tierSel && { key: 'tier', label: `Tier: ${tierSel}`, onRemove: () => { setTierSel(''); setDraftTier('') } },
                  closerSel && { key: 'closer', label: `Closer: ${closerSel}`, onRemove: () => { setCloserSel(''); setDraftCloser('') } },
                ].filter(Boolean) as { key: string; label: string; onRemove: () => void }[]
                return (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: activeFilters.length > 0 ? 12 : 0 }}>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 800, color: R, textTransform: 'uppercase', letterSpacing: '0.18em', marginBottom: 6 }}>Performance Comercial</div>
                        <h1 style={{ fontSize: 30, fontWeight: 900, color: GRAY1, margin: 0, letterSpacing: '-0.02em', lineHeight: 1 }}>Dashboard</h1>
                      </div>
                      <div style={{ position: 'relative' }}>
                        <button onClick={() => { setDraftCanal(canalSel); setDraftMes(mesSel); setDraftTier(tierSel); setDraftCloser(closerSel); setDashFilterOpen(v => !v) }}
                          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 10, border: '1px solid #E5E7EB', background: WHITE, color: GRAY1, fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M4 8h8M6 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                          Adicionar Filtro
                          {activeFilters.length > 0 && <span style={{ background: R, color: WHITE, borderRadius: '50%', width: 17, height: 17, fontSize: 10, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{activeFilters.length}</span>}
                        </button>
                        {dashFilterOpen && (
                          <>
                            <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setDashFilterOpen(false)} />
                            <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', background: WHITE, border: '1px solid #E5E7EB', borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,.14)', zIndex: 50, width: 340, padding: 24 }}>
                              <div style={{ fontSize: 15, fontWeight: 800, color: GRAY1, marginBottom: 4 }}>Personalize seu filtro</div>
                              <div style={{ fontSize: 12, color: GRAY2, marginBottom: 20 }}>Escolha os filtros e as opções desejadas.</div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                                <div>
                                  <label style={labelCls}>Canal <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 10, color: GRAY3 }}>(optional)</span></label>
                                  <select style={inputCls} value={draftCanal} onChange={e => setDraftCanal(e.target.value)}>
                                    {CANAIS.map(c => <option key={c} value={c}>{c}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label style={labelCls}>Mês <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 10, color: GRAY3 }}>(optional)</span></label>
                                  <select style={inputCls} value={draftMes} onChange={e => setDraftMes(e.target.value)}>
                                    {allMonthsOpts.map(m => <option key={m} value={m}>{mesFmt(m)}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label style={labelCls}>Tier <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 10, color: GRAY3 }}>(optional)</span></label>
                                  <select style={inputCls} value={draftTier} onChange={e => setDraftTier(e.target.value)}>
                                    <option value="">Selecione</option>
                                    {TIERS.map(t => <option key={t}>{t}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label style={labelCls}>Closer <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 10, color: GRAY3 }}>(optional)</span></label>
                                  <select style={inputCls} value={draftCloser} onChange={e => setDraftCloser(e.target.value)}>
                                    <option value="">Selecione</option>
                                    {CLOSERS.map(c => <option key={c}>{c}</option>)}
                                  </select>
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                                <button onClick={() => { setCanalSel('Canal'); const n = new Date(); const m = `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`; setMesSel(m); setDraftMes(m); setDraftCanal('Canal'); setTierSel(''); setCloserSel(''); setDraftTier(''); setDraftCloser(''); setDashFilterOpen(false) }}
                                  style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid #E5E7EB', background: WHITE, color: GRAY1, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Limpar</button>
                                <button onClick={() => { setCanalSel(draftCanal); setMesSel(draftMes); setTierSel(draftTier); setCloserSel(draftCloser); setDashFilterOpen(false) }}
                                  style={{ flex: 2, padding: '10px 0', borderRadius: 10, border: 'none', background: R, color: WHITE, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>Aplicar</button>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    {activeFilters.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {activeFilters.map(f => (
                          <span key={f.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, background: `${R}10`, border: `1px solid ${R}30`, fontSize: 12, fontWeight: 700, color: R }}>
                            {f.label}
                            <button onClick={f.onRemove} style={{ background: 'none', border: 'none', cursor: 'pointer', color: R, padding: 0, display: 'flex', lineHeight: 1 }}>×</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* ── KPI Cards ── */}
              {(() => {
                const mm = (() => {
                  if (canalSel !== 'Canal') return metas[mesSel]?.[canalSel] || {}
                  const vals = CANAIS_METAS.map(c => metas[mesSel]?.[c]).filter(Boolean)
                  if (vals.length === 0) return {}
                  return { meta_entradas: vals.reduce((s:number,m:any)=>s+(m.meta_entradas||0),0)||null, meta_ra: vals.reduce((s:number,m:any)=>s+(m.meta_ra||0),0)||null, meta_rr: vals.reduce((s:number,m:any)=>s+(m.meta_rr||0),0)||null, meta_vendas: vals.reduce((s:number,m:any)=>s+(m.meta_vendas||0),0)||null, meta_tcv: vals.reduce((s:number,m:any)=>s+(m.meta_tcv||0),0)||null, meta_ativacoes: vals.reduce((s:number,m:any)=>s+(m.meta_ativacoes||0),0)||null }
                })()
                const KPI_PAGE = 10
                const kpis = [
                  { label: 'Entradas',    real: lm.entrada.length, leads: lm.entrada,  dateKey: 'data_entrada'    as keyof Lead, meta: mm.meta_entradas,  color: BLUE },
                  { label: 'Reu. Agend.', real: lm.ra.length,      leads: lm.ra,       dateKey: 'data_ra'         as keyof Lead, meta: mm.meta_ra,        color: YELLOW },
                  { label: 'Reu. Realiz.',real: lm.rr.length,      leads: lm.rr,       dateKey: 'data_rr'         as keyof Lead, meta: mm.meta_rr,        color: PURPLE },
                  { label: 'Vendas',      real: lm.venda.length,   leads: lm.venda,    dateKey: 'data_assinatura' as keyof Lead, meta: mm.meta_vendas,    color: GREEN },
                  { label: 'Ativações',   real: lm.ativacao.length,leads: lm.ativacao, dateKey: 'data_ativacao'   as keyof Lead, meta: mm.meta_ativacoes, color: R },
                ]
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10 }}>
                    {kpis.map((k, ki) => {
                      const pct = k.meta ? Math.min(Math.round(k.real / k.meta * 100), 100) : null
                      const over = !!(k.meta && k.real >= k.meta)
                      const isHovered = kpiHover === k.label
                      const totalKpiPages = Math.ceil(k.leads.length / KPI_PAGE)
                      const pageLeads = k.leads.slice(kpiPopoverPage * KPI_PAGE, (kpiPopoverPage + 1) * KPI_PAGE)
                      // Align popover: last two cards align right to avoid overflow
                      const popoverLeft = ki >= 3 ? 'auto' : '50%'
                      const popoverRight = ki >= 3 ? 0 : 'auto'
                      const popoverTransform = ki >= 3 ? 'none' : 'translateX(-50%)'
                      return (
                        <div key={k.label} style={{ position: 'relative' }}
                          onMouseEnter={() => { setKpiHover(k.label); setKpiPopoverPage(0) }}
                          onMouseLeave={() => setKpiHover(null)}
                        >
                          <div style={{ background: WHITE, borderRadius: 16, padding: '20px 20px 18px', boxShadow: '0 1px 8px rgba(0,0,0,.05)', border: '1px solid rgba(0,0,0,.05)', position: 'relative', overflow: 'hidden' }}>
                            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: k.color, borderRadius: '16px 0 0 16px' }} />
                            <div style={{ paddingLeft: 10 }}>
                              <div style={{ fontSize: 10, fontWeight: 800, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>{k.label}</div>
                              <div style={{ fontSize: 44, fontWeight: 900, color: GRAY1, lineHeight: 1, letterSpacing: '-0.03em', cursor: k.leads.length > 0 ? 'default' : 'default' }}>{k.real}</div>
                              {k.meta ? (
                                <div style={{ marginTop: 12 }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                                    <span style={{ fontSize: 10, color: GRAY2 }}>Meta: {k.meta}</span>
                                    <span style={{ fontSize: 10, fontWeight: 900, color: over ? GREEN : k.color, background: over ? `${GREEN}14` : `${k.color}14`, padding: '2px 7px', borderRadius: 20 }}>{pct}%</span>
                                  </div>
                                  <div style={{ height: 3, background: '#EBEBEB', borderRadius: 2 }}>
                                    <div style={{ height: 3, borderRadius: 2, background: over ? GREEN : k.color, width: `${pct}%`, transition: 'width .7s cubic-bezier(.4,0,.2,1)' }} />
                                  </div>
                                </div>
                              ) : <div style={{ fontSize: 10, color: GRAY3, marginTop: 10 }}>Sem meta</div>}
                            </div>
                          </div>
                          {/* ── Lead popover on hover ── */}
                          {isHovered && k.leads.length > 0 && (
                            <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: popoverLeft, right: popoverRight, transform: popoverTransform, width: 290, background: WHITE, border: '1px solid #E5E7EB', borderRadius: 14, boxShadow: '0 10px 36px rgba(0,0,0,.16)', zIndex: 200, overflow: 'hidden' }}>
                              {/* header */}
                              <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: 11, fontWeight: 800, color: k.color, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{k.label}</span>
                                <span style={{ fontSize: 10, fontWeight: 700, color: GRAY2 }}>{k.leads.length} lead{k.leads.length !== 1 ? 's' : ''}</span>
                              </div>
                              {/* rows */}
                              <div>
                                {pageLeads.map((l, i) => (
                                  <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderBottom: i < pageLeads.length - 1 ? '1px solid #F9FAFB' : 'none', background: i % 2 ? '#FAFAFA' : WHITE }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ fontSize: 12, fontWeight: 700, color: GRAY1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.empresa}</div>
                                      <div style={{ fontSize: 10, color: GRAY3, marginTop: 1 }}>{fmtDate(l[k.dateKey] as string) || '—'}</div>
                                    </div>
                                    {l.closer && (
                                      <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 20, background: l.closer === 'VITOR' ? `${PURPLE}18` : `${BLUE}18`, color: l.closer === 'VITOR' ? PURPLE : BLUE, whiteSpace: 'nowrap', flexShrink: 0 }}>{l.closer}</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                              {/* pagination */}
                              {totalKpiPages > 1 && (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', borderTop: '1px solid #F3F4F6', background: '#FAFAFA' }}>
                                  <button onClick={e => { e.stopPropagation(); setKpiPopoverPage(p => Math.max(0, p - 1)) }} disabled={kpiPopoverPage === 0}
                                    style={{ padding: '4px 10px', borderRadius: 7, border: '1px solid #E5E7EB', background: kpiPopoverPage === 0 ? GRAY4 : WHITE, color: kpiPopoverPage === 0 ? GRAY3 : GRAY1, fontSize: 11, fontWeight: 700, cursor: kpiPopoverPage === 0 ? 'default' : 'pointer' }}>‹ Anterior</button>
                                  <span style={{ fontSize: 10, color: GRAY2, fontWeight: 600 }}>{kpiPopoverPage + 1} / {totalKpiPages}</span>
                                  <button onClick={e => { e.stopPropagation(); setKpiPopoverPage(p => Math.min(totalKpiPages - 1, p + 1)) }} disabled={kpiPopoverPage === totalKpiPages - 1}
                                    style={{ padding: '4px 10px', borderRadius: 7, border: '1px solid #E5E7EB', background: kpiPopoverPage === totalKpiPages - 1 ? GRAY4 : WHITE, color: kpiPopoverPage === totalKpiPages - 1 ? GRAY3 : GRAY1, fontSize: 11, fontWeight: 700, cursor: kpiPopoverPage === totalKpiPages - 1 ? 'default' : 'pointer' }}>Próxima ›</button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })()}

              {/* ── TCV + (broker cards se Lead Broker) + Conversão + Funil ── */}
              {(() => {
                const mm = (() => {
                  if (canalSel !== 'Canal') return metas[mesSel]?.[canalSel] || {}
                  const vals = CANAIS_METAS.map(c => metas[mesSel]?.[c]).filter(Boolean)
                  if (vals.length === 0) return {}
                  return { meta_entradas: vals.reduce((s:number,m:any)=>s+(m.meta_entradas||0),0)||null, meta_ra: vals.reduce((s:number,m:any)=>s+(m.meta_ra||0),0)||null, meta_rr: vals.reduce((s:number,m:any)=>s+(m.meta_rr||0),0)||null, meta_vendas: vals.reduce((s:number,m:any)=>s+(m.meta_vendas||0),0)||null, meta_tcv: vals.reduce((s:number,m:any)=>s+(m.meta_tcv||0),0)||null, meta_ativacoes: vals.reduce((s:number,m:any)=>s+(m.meta_ativacoes||0),0)||null }
                })()
                const mt = mm.meta_tcv
                const pct = mt ? Math.min(Math.round(tcvMes / mt * 100), 999) : null
                const over = !!(mt && tcvMes >= mt)
                const isLB = canalSel === 'Lead Broker'
                const valorInvestido = lm.entrada.reduce((s: number, l: any) => s + (l.custo_broker || 0), 0)
                const cpmql = lm.entrada.length > 0 && valorInvestido > 0 ? valorInvestido / lm.entrada.length : null
                const roas = valorInvestido > 0 ? tcvMes / valorInvestido : null

                const cardTCV = (
                  <div style={{ background: WHITE, borderRadius: 16, padding: '24px 22px', boxShadow: '0 1px 8px rgba(0,0,0,.05)', border: '1px solid rgba(0,0,0,.05)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 180 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                        <div style={{ fontSize: 10, fontWeight: 800, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.14em' }}>TCV do Mês</div>
                        <div style={{ fontSize: 10, fontWeight: 800, color: R, background: `${R}12`, border: `1px solid ${R}30`, padding: '3px 9px', borderRadius: 20 }}>{lm.venda.length} venda{lm.venda.length !== 1 ? 's' : ''}</div>
                      </div>
                      <div style={{ fontSize: 26, fontWeight: 900, color: GREEN, lineHeight: 1.1, letterSpacing: '-0.02em' }}>{fmt(tcvMes)}</div>
                    </div>
                    {mt ? (
                      <div style={{ marginTop: 18 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
                          <span style={{ fontSize: 10, color: GRAY2 }}>Meta: {fmt(mt)}</span>
                          <span style={{ fontSize: 12, fontWeight: 900, color: over ? GREEN : R }}>{pct}%</span>
                        </div>
                        <div style={{ height: 3, background: '#EBEBEB', borderRadius: 2 }}>
                          <div style={{ height: 3, borderRadius: 2, background: over ? GREEN : R, width: `${Math.min(pct || 0, 100)}%`, transition: 'width .7s' }} />
                        </div>
                        <div style={{ fontSize: 10, color: GRAY2, marginTop: 7 }}>{over ? `✓ Meta batida! +${fmt(tcvMes - mt)}` : `Falta ${fmt(mt - tcvMes)}`}</div>
                      </div>
                    ) : <div style={{ fontSize: 10, color: GRAY3, marginTop: 14 }}>Sem meta definida</div>}
                  </div>
                )

                const cardConversao = (
                  <div style={{ background: WHITE, borderRadius: 16, padding: '22px 22px', boxShadow: '0 1px 8px rgba(0,0,0,.05)', border: '1px solid rgba(0,0,0,.05)' }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 20 }}>Taxas de Conversão</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {[
                        { label: 'Entrada → RA', a: lm.ra.length, b: lm.entrada.length, color: YELLOW },
                        { label: 'RA → RR', a: lm.rr.length, b: lm.ra.length, color: PURPLE },
                        { label: 'RR → Venda', a: lm.venda.length, b: lm.rr.length, color: GREEN },
                        { label: 'Venda → Ativação', a: lm.ativacao.length, b: lm.venda.length, color: R },
                      ].map(c => (
                        <div key={c.label}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
                            <span style={{ fontSize: 11, color: GRAY2, fontWeight: 600 }}>{c.label}</span>
                            <span style={{ fontSize: 15, fontWeight: 900, color: c.color }}>{conv(c.a, c.b)}<span style={{ fontSize: 10, fontWeight: 700 }}>%</span></span>
                          </div>
                          <div style={{ height: 4, background: '#F0F0F0', borderRadius: 3 }}>
                            <div style={{ height: 4, borderRadius: 3, background: `linear-gradient(90deg, ${c.color}80, ${c.color})`, width: `${convBar(c.a, c.b)}%`, transition: 'width .7s cubic-bezier(.4,0,.2,1)' }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )

                const cardFunil = (
                  <div style={{ background: WHITE, borderRadius: 16, padding: '22px 22px', boxShadow: '0 1px 8px rgba(0,0,0,.05)', border: '1px solid rgba(0,0,0,.05)' }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 20 }}>Funil do Mês</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {[
                        { label: 'Entrada', value: lm.entrada.length, color: BLUE },
                        { label: 'Reu. Agend.', value: lm.ra.length, color: YELLOW },
                        { label: 'Reu. Realiz.', value: lm.rr.length, color: PURPLE },
                        { label: 'Vendas', value: lm.venda.length, color: GREEN },
                        { label: 'Ativações', value: lm.ativacao.length, color: R },
                      ].map((f, _, arr) => {
                        const max = Math.max(...arr.map(x => x.value))
                        const w = max > 0 ? Math.max(f.value / max * 100, f.value > 0 ? 7 : 0) : 0
                        return (
                          <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 11, color: GRAY2, width: 82, flexShrink: 0, fontWeight: 500 }}>{f.label}</span>
                            <div style={{ flex: 1, height: 22, background: '#F4F4F7', borderRadius: 7, overflow: 'hidden' }}>
                              <div style={{ height: '100%', borderRadius: 7, background: `linear-gradient(90deg, ${f.color}BB, ${f.color})`, width: `${w}%`, maxWidth: '100%', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 8, transition: 'width .7s cubic-bezier(.4,0,.2,1)' }}>
                                {f.value > 0 && <span style={{ fontSize: 11, fontWeight: 800, color: WHITE }}>{f.value}</span>}
                              </div>
                            </div>
                            {f.value === 0 && <span style={{ fontSize: 11, color: GRAY3, fontWeight: 700, width: 14 }}>0</span>}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )

                return isLB ? (
                  <>
                    {/* Lead Broker: TCV + 3 broker metrics na mesma linha */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
                      {cardTCV}
                      {/* Valor Investido */}
                      <div style={{ background: WHITE, borderRadius: 16, padding: '24px 22px', boxShadow: '0 1px 8px rgba(0,0,0,.05)', border: '1px solid rgba(0,0,0,.05)', position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: YELLOW, borderRadius: '16px 0 0 16px' }} />
                        <div style={{ paddingLeft: 10 }}>
                          <div style={{ fontSize: 10, fontWeight: 800, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>Valor Investido</div>
                          <div style={{ fontSize: 28, fontWeight: 900, color: GRAY1, lineHeight: 1, letterSpacing: '-0.02em' }}>{fmt(valorInvestido)}</div>
                          <div style={{ fontSize: 10, color: GRAY2, marginTop: 8 }}>{lm.entrada.length} lead{lm.entrada.length !== 1 ? 's' : ''} no mês</div>
                        </div>
                      </div>
                      {/* CPMQL */}
                      <div style={{ background: WHITE, borderRadius: 16, padding: '24px 22px', boxShadow: '0 1px 8px rgba(0,0,0,.05)', border: '1px solid rgba(0,0,0,.05)', position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: PURPLE, borderRadius: '16px 0 0 16px' }} />
                        <div style={{ paddingLeft: 10 }}>
                          <div style={{ fontSize: 10, fontWeight: 800, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>CPMQL</div>
                          <div style={{ fontSize: 28, fontWeight: 900, color: GRAY1, lineHeight: 1, letterSpacing: '-0.02em' }}>{cpmql != null ? fmt(cpmql) : '—'}</div>
                          <div style={{ fontSize: 10, color: GRAY2, marginTop: 8 }}>Custo médio por lead</div>
                        </div>
                      </div>
                      {/* ROAS */}
                      <div style={{ background: WHITE, borderRadius: 16, padding: '24px 22px', boxShadow: '0 1px 8px rgba(0,0,0,.05)', border: '1px solid rgba(0,0,0,.05)', position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: roas != null && roas >= 1 ? GREEN : R, borderRadius: '16px 0 0 16px' }} />
                        <div style={{ paddingLeft: 10 }}>
                          <div style={{ fontSize: 10, fontWeight: 800, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>ROAS</div>
                          <div style={{ fontSize: 28, fontWeight: 900, color: roas != null && roas >= 1 ? GREEN : roas != null ? R : GRAY1, lineHeight: 1, letterSpacing: '-0.02em' }}>
                            {roas != null ? `${roas.toFixed(2)}x` : '—'}
                          </div>
                          <div style={{ fontSize: 10, color: GRAY2, marginTop: 8 }}>TCV ÷ Valor investido</div>
                        </div>
                      </div>
                    </div>
                    {/* Conversão + Funil abaixo */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      {cardConversao}
                      {cardFunil}
                    </div>
                  </>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr 1fr', gap: 10 }}>
                    {cardTCV}
                    {cardConversao}
                    {cardFunil}
                  </div>
                )
              })()}

              {/* ── Charts row ── */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
                <div style={{ background: WHITE, borderRadius: 16, padding: '22px 22px', boxShadow: '0 1px 8px rgba(0,0,0,.05)', border: '1px solid rgba(0,0,0,.05)' }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 20 }}>Evolução Mensal</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={dadosMensais}>
                      <CartesianGrid strokeDasharray="2 4" stroke="#EBEBEB" />
                      <XAxis dataKey="mes" tick={{ fill: GRAY2, fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: GRAY2, fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 14 }} />
                      <Line type="monotone" dataKey="entrada" name="Entradas" stroke={BLUE} strokeWidth={2.5} dot={{ r: 4, fill: WHITE, strokeWidth: 2.5 }} activeDot={{ r: 6 }} />
                      <Line type="monotone" dataKey="ra" name="Reu. Agend." stroke={YELLOW} strokeWidth={2.5} dot={{ r: 4, fill: WHITE, strokeWidth: 2.5 }} />
                      <Line type="monotone" dataKey="rr" name="Reu. Realiz." stroke={PURPLE} strokeWidth={2.5} dot={{ r: 4, fill: WHITE, strokeWidth: 2.5 }} />
                      <Line type="monotone" dataKey="vendas" name="Vendas" stroke={GREEN} strokeWidth={2.5} dot={{ r: 4, fill: WHITE, strokeWidth: 2.5 }} />
                      <Line type="monotone" dataKey="ativacao" name="Ativações" stroke={R} strokeWidth={2.5} dot={{ r: 4, fill: WHITE, strokeWidth: 2.5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ background: WHITE, borderRadius: 16, padding: '22px 22px', boxShadow: '0 1px 8px rgba(0,0,0,.05)', border: '1px solid rgba(0,0,0,.05)' }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 20 }}>TCV por Mês</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={dadosMensais}>
                      <CartesianGrid strokeDasharray="2 4" stroke="#EBEBEB" />
                      <XAxis dataKey="mes" tick={{ fill: GRAY2, fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: GRAY2, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [fmt(v), 'TCV']} />
                      <Bar dataKey="tcv" fill={R} radius={[6,6,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* ── Próximos FUPs ── */}
              <div style={{ background: WHITE, borderRadius: 16, padding: '22px 22px', boxShadow: '0 1px 8px rgba(0,0,0,.05)', border: '1px solid rgba(0,0,0,.05)' }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 16 }}>Próximos Follow Ups</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 8 }}>
                  {leads.filter(l => l.data_fup && new Date(l.data_fup) >= new Date()).sort((a,b) => new Date(a.data_fup!).getTime()-new Date(b.data_fup!).getTime()).slice(0,8).map(l => (
                    <div key={l.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', background: '#F9F8F6', borderRadius: 10, border: '1px solid #EEEDE8' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: GRAY1 }}>{l.empresa}</div>
                        <div style={{ fontSize: 11, color: GRAY2, marginTop: 2 }}>{l.closer}{l.proximos_passos ? ` · ${l.proximos_passos?.slice(0,30)}` : ''}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
                        <TempBadge temp={l.temperatura} />
                        <span style={{ fontSize: 11, fontWeight: 700, color: R, background: `${R}10`, border: `1px solid ${R}22`, padding: '3px 9px', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}><Clock size={10} />{fmtDate(l.data_fup)}</span>
                      </div>
                    </div>
                  ))}
                  {leads.filter(l => l.data_fup && new Date(l.data_fup) >= new Date()).length === 0 && (
                    <div style={{ textAlign: 'center', padding: 32, fontSize: 13, color: GRAY2, gridColumn: '1/-1' }}>Nenhum FUP agendado</div>
                  )}
                </div>
              </div>

            </div>
          )}

          {/* LEADS */}
          {!loading && view === 'leads' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div>
                  <h1 style={{ fontSize: 22, fontWeight: 800, color: GRAY1, margin: 0 }}>Leads</h1>
                  <p style={{ fontSize: 13, color: GRAY2, marginTop: 4 }}>{filtered.length} de {leads.length} leads • página {page} de {totalPages}</p>
                </div>
                {selected.size > 0 && (
                  <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 16px', background:`${R}10`, border:`1px solid ${R}33`, borderRadius:10 }}>
                    <span style={{ fontSize:13, fontWeight:700, color:R }}>{selected.size} lead{selected.size > 1 ? 's' : ''} selecionado{selected.size > 1 ? 's' : ''}</span>
                    <button onClick={deleteSelected} style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', background:R, color:WHITE, border:'none', borderRadius:7, fontSize:12, fontWeight:700, cursor:'pointer' }}>
                      <Trash2 size={13}/> Excluir selecionados
                    </button>
                    <button onClick={() => setSelected(new Set())} style={{ padding:'7px 12px', background:'transparent', color:R, border:`1px solid ${R}44`, borderRadius:7, fontSize:12, cursor:'pointer' }}>
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
              {/* ── Filter bar ── */}
              {(() => {
                const emptyFilters = { closer:'', temperatura:'', situacao:'', origem:'', tier:'', mes_entrada:'', mes_ra:'', mes_rr:'', mes_venda:'', mes_ativacao:'', situacao_pre_vendas:'' }
                const activeLeadsFilters = [
                  filters.closer && { key:'closer', label:`Closer: ${filters.closer}`, onRemove:()=>setFilters(p=>({...p,closer:''})) },
                  filters.temperatura && { key:'temperatura', label:filters.temperatura, onRemove:()=>setFilters(p=>({...p,temperatura:''})) },
                  filters.tier && { key:'tier', label:`Tier: ${filters.tier}`, onRemove:()=>setFilters(p=>({...p,tier:''})) },
                  filters.origem && { key:'origem', label:`Origem: ${filters.origem}`, onRemove:()=>setFilters(p=>({...p,origem:''})) },
                  filters.situacao_pre_vendas && { key:'situacao_pre_vendas', label:`BDR: ${filters.situacao_pre_vendas}`, onRemove:()=>setFilters(p=>({...p,situacao_pre_vendas:''})) },
                  filters.situacao && { key:'situacao', label:`Sit: ${filters.situacao}`, onRemove:()=>setFilters(p=>({...p,situacao:''})) },
                  filters.mes_entrada && { key:'mes_entrada', label:`Entrada: ${mesFmt(filters.mes_entrada)}`, onRemove:()=>setFilters(p=>({...p,mes_entrada:''})) },
                  filters.mes_ra && { key:'mes_ra', label:`RA: ${mesFmt(filters.mes_ra)}`, onRemove:()=>setFilters(p=>({...p,mes_ra:''})) },
                  filters.mes_rr && { key:'mes_rr', label:`RR: ${mesFmt(filters.mes_rr)}`, onRemove:()=>setFilters(p=>({...p,mes_rr:''})) },
                  filters.mes_venda && { key:'mes_venda', label:`Venda: ${mesFmt(filters.mes_venda)}`, onRemove:()=>setFilters(p=>({...p,mes_venda:''})) },
                  filters.mes_ativacao && { key:'mes_ativacao', label:`Ativação: ${mesFmt(filters.mes_ativacao)}`, onRemove:()=>setFilters(p=>({...p,mes_ativacao:''})) },
                ].filter(Boolean) as { key:string; label:string; onRemove:()=>void }[]
                return (
                  <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                    <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                      {/* Search */}
                      <div style={{ position:'relative' }}>
                        <Search size={14} style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:GRAY2 }} />
                        <input style={{ ...inputCls, paddingLeft:34, width:260 }} placeholder="Buscar empresa ou nome do lead..." value={search} onChange={e => setSearch(e.target.value)} />
                      </div>
                      {/* Filter popover button */}
                      <div style={{ position:'relative' }}>
                        <button onClick={() => { setDraftLeadsFilters({...filters}); setLeadsFilterOpen(v => !v) }}
                          style={{ display:'flex', alignItems:'center', gap:7, padding:'9px 16px', borderRadius:10, border:'1px solid #E5E7EB', background:WHITE, color:GRAY1, fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 1px 4px rgba(0,0,0,.06)', whiteSpace:'nowrap' }}>
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M4 8h8M6 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                          Adicionar Filtro
                          {activeLeadsFilters.length > 0 && <span style={{ background:R, color:WHITE, borderRadius:'50%', width:17, height:17, fontSize:10, fontWeight:900, display:'flex', alignItems:'center', justifyContent:'center' }}>{activeLeadsFilters.length}</span>}
                        </button>
                        {leadsFilterOpen && (
                          <>
                            <div style={{ position:'fixed', inset:0, zIndex:49 }} onClick={() => setLeadsFilterOpen(false)} />
                            <div style={{ position:'absolute', left:0, top:'calc(100% + 8px)', background:WHITE, border:'1px solid #E5E7EB', borderRadius:16, boxShadow:'0 8px 32px rgba(0,0,0,.14)', zIndex:50, width:500, padding:24 }}>
                              <div style={{ fontSize:15, fontWeight:800, color:GRAY1, marginBottom:4 }}>Personalize seu filtro</div>
                              <div style={{ fontSize:12, color:GRAY2, marginBottom:20 }}>Escolha os filtros e as opções desejadas.</div>
                              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14 }}>
                                <div>
                                  <label style={labelCls}>Closer</label>
                                  <select style={inputCls} value={draftLeadsFilters.closer} onChange={e => setDraftLeadsFilters(p=>({...p,closer:e.target.value}))}>
                                    <option value="">Todos</option>
                                    {CLOSERS.map(c=><option key={c}>{c}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label style={labelCls}>Temperatura</label>
                                  <select style={inputCls} value={draftLeadsFilters.temperatura} onChange={e => setDraftLeadsFilters(p=>({...p,temperatura:e.target.value}))}>
                                    <option value="">Todas</option>
                                    {TEMPERATURAS.map(t=><option key={t}>{t}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label style={labelCls}>Tier</label>
                                  <select style={inputCls} value={draftLeadsFilters.tier} onChange={e => setDraftLeadsFilters(p=>({...p,tier:e.target.value}))}>
                                    <option value="">Todos</option>
                                    {['TINY','SMALL','MEDIUM','LARGE','ENTERPRISE'].map(t=><option key={t}>{t}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label style={labelCls}>Origem</label>
                                  <select style={inputCls} value={draftLeadsFilters.origem} onChange={e => setDraftLeadsFilters(p=>({...p,origem:e.target.value}))}>
                                    <option value="">Todas</option>
                                    {ORIGENS.map(o=><option key={o}>{o}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label style={labelCls}>Sit. BDR</label>
                                  <select style={inputCls} value={draftLeadsFilters.situacao_pre_vendas} onChange={e => setDraftLeadsFilters(p=>({...p,situacao_pre_vendas:e.target.value}))}>
                                    <option value="">Todas</option>
                                    {SITUACOES_PRE_VENDAS.map(s=><option key={s}>{s}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label style={labelCls}>Sit. Closer</label>
                                  <select style={inputCls} value={draftLeadsFilters.situacao} onChange={e => setDraftLeadsFilters(p=>({...p,situacao:e.target.value}))}>
                                    <option value="">Todas</option>
                                    {SITUACOES.map(s=><option key={s}>{s}</option>)}
                                  </select>
                                </div>
                                {([
                                  { key:'mes_entrada', label:'Mês Entrada', dataKey:'data_entrada' },
                                  { key:'mes_ra', label:'Mês RA', dataKey:'data_ra' },
                                  { key:'mes_rr', label:'Mês RR', dataKey:'data_rr' },
                                  { key:'mes_venda', label:'Mês Venda', dataKey:'data_assinatura' },
                                  { key:'mes_ativacao', label:'Mês Ativação', dataKey:'data_ativacao' },
                                ] as { key: keyof typeof draftLeadsFilters; label: string; dataKey: keyof Lead }[]).map(f => {
                                  const months = Array.from(new Set(leads.map(l => mesAno(l[f.dataKey] as string)).filter(Boolean))).sort().reverse() as string[]
                                  return (
                                    <div key={f.key}>
                                      <label style={labelCls}>{f.label}</label>
                                      <select style={inputCls} value={draftLeadsFilters[f.key]} onChange={e => setDraftLeadsFilters(p=>({...p,[f.key]:e.target.value}))}>
                                        <option value="">Todos</option>
                                        {months.map(m=><option key={m} value={m}>{mesFmt(m)}</option>)}
                                      </select>
                                    </div>
                                  )
                                })}
                              </div>
                              <div style={{ display:'flex', gap:10, marginTop:20 }}>
                                <button onClick={() => { setFilters(emptyFilters); setDraftLeadsFilters(emptyFilters); setSearch(''); setLeadsFilterOpen(false) }}
                                  style={{ flex:1, padding:'10px 0', borderRadius:10, border:'1px solid #E5E7EB', background:WHITE, color:GRAY1, fontSize:13, fontWeight:700, cursor:'pointer' }}>Limpar</button>
                                <button onClick={() => { setFilters({...draftLeadsFilters}); setLeadsFilterOpen(false) }}
                                  style={{ flex:2, padding:'10px 0', borderRadius:10, border:'none', background:R, color:WHITE, fontSize:13, fontWeight:800, cursor:'pointer' }}>Aplicar</button>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    {/* Active chips */}
                    {activeLeadsFilters.length > 0 && (
                      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                        {activeLeadsFilters.map(f => (
                          <span key={f.key} style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:20, background:`${R}10`, border:`1px solid ${R}30`, fontSize:12, fontWeight:700, color:R }}>
                            {f.label}
                            <button onClick={f.onRemove} style={{ background:'none', border:'none', cursor:'pointer', color:R, padding:0, display:'flex', lineHeight:1 }}>×</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })()}
              <div style={{ background: WHITE, borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,.06)', border: '1px solid #E5E7EB', overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #E5E7EB', background: GRAY4 }}>
                        <th style={{ padding:'10px 12px', width:40, minWidth:40 }}>
                          <input type="checkbox" checked={allPageSelected}
                            onChange={e => {
                              const next = new Set(selected)
                              if (e.target.checked) pagedLeads.forEach(l => next.add(l.id))
                              else pagedLeads.forEach(l => next.delete(l.id))
                              setSelected(next)
                            }}
                            style={{ cursor:'pointer', width:15, height:15, accentColor:R }} />
                        </th>
                        {[
                          { h:'Empresa', w:200 },{ h:'Closer', w:90 },{ h:'Temp.', w:80 },
                          { h:'Sit. Closer', w:160 },{ h:'Sit. BDR', w:160 },
                          { h:'Entrada', w:100 },{ h:'RA', w:100 },{ h:'RR', w:100 },
                          { h:'Venda', w:100 },{ h:'Ativação', w:100 },
                          { h:'TCV', w:90 },{ h:'FUP', w:100 },{ h:'', w:80 },
                        ].map(({ h, w }) => (
                          <th key={h} style={{ textAlign:'left', padding:'10px 12px', fontSize:10, fontWeight:700, color:GRAY2, textTransform:'uppercase', letterSpacing:'0.07em', whiteSpace:'nowrap', minWidth:w, width:w }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pagedLeads.map((l,i) => (
                        <tr key={l.id} style={{ borderBottom:'1px solid #F3F4F6', background: selected.has(l.id) ? `${R}08` : i%2 ? GRAY4 : WHITE }}>
                          <td style={{ padding:'10px 12px' }}>
                            <input type="checkbox" checked={selected.has(l.id)}
                              onChange={e => {
                                const next = new Set(selected)
                                if (e.target.checked) next.add(l.id); else next.delete(l.id)
                                setSelected(next)
                              }}
                              style={{ cursor:'pointer', width:15, height:15, accentColor:R }} />
                          </td>
                          <td style={{ padding:'10px 12px' }}>
                            <div onClick={() => router.push(`/leads/${l.id}?from=leads`)} style={{ fontWeight:700, color:R, cursor:'pointer' }} onMouseEnter={e => (e.currentTarget as HTMLElement).style.textDecoration='underline'} onMouseLeave={e => (e.currentTarget as HTMLElement).style.textDecoration='none'}>{l.empresa}</div>
                            <div style={{ fontSize:11, color:GRAY2, marginTop:1 }}>{l.segmento}</div>
                          </td>
                          <td style={{ padding:'10px 12px' }}>
                            <span style={{ fontSize:11, fontWeight:700, padding:'3px 8px', borderRadius:20, background:l.closer==='VITOR'?`${PURPLE}18`:`${BLUE}18`, color:l.closer==='VITOR'?PURPLE:BLUE }}>{l.closer||'—'}</span>
                          </td>
                          <td style={{ padding:'10px 12px' }}><TempBadge temp={l.temperatura} /></td>
                          <td style={{ padding:'10px 12px' }}><SitBadge s={l.situacao_closer} /></td>
                          <td style={{ padding:'10px 12px' }}><SpvBadge s={(l as any).situacao_pre_vendas} /></td>
                          <td style={{ padding:'10px 12px', fontSize:12, color:GRAY2, whiteSpace:'nowrap' }}>{fmtDate(l.data_entrada)}</td>
                          <td style={{ padding:'10px 12px', fontSize:12, color:GRAY2, whiteSpace:'nowrap' }}>{fmtDate(l.data_ra)}</td>
                          <td style={{ padding:'10px 12px', fontSize:12, color:GRAY2, whiteSpace:'nowrap' }}>{fmtDate(l.data_rr)}</td>
                          <td style={{ padding:'10px 12px', fontSize:12, color:GRAY2, whiteSpace:'nowrap' }}>{fmtDate(l.data_assinatura)}</td>
                          <td style={{ padding:'10px 12px', fontSize:12, color:GRAY2, whiteSpace:'nowrap' }}>{fmtDate(l.data_ativacao)}</td>
                          <td style={{ padding:'10px 12px', fontSize:12, fontWeight:700, color:l.tcv?GREEN:GRAY2, whiteSpace:'nowrap', fontFamily:'monospace' }}>{l.tcv?fmt(l.tcv):'—'}</td>
                          <td style={{ padding:'10px 12px', whiteSpace:'nowrap' }}>
                            {l.data_fup?<span style={{ fontSize:11, color:GRAY2, display:'flex', alignItems:'center', gap:4 }}><Clock size={10}/>{fmtDate(l.data_fup)}</span>:'—'}
                          </td>
                          <td style={{ padding:'10px 12px' }}>
                            <div style={{ display:'flex', gap:4 }}>
                              <button onClick={() => router.push(`/leads/${l.id}?from=leads`)} style={{ background:`${R}12`, border:'none', borderRadius:6, padding:6, cursor:'pointer', color:R, display:'flex' }}><Edit2 size={13}/></button>
                              <button onClick={() => deleteLead(l.id)} style={{ background:GRAY4, border:'none', borderRadius:6, padding:6, cursor:'pointer', color:GRAY2, display:'flex' }}><Trash2 size={13}/></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filtered.length===0&&<div style={{ textAlign:'center', padding:60, color:GRAY2 }}><Users size={36} style={{ margin:'0 auto 12px', opacity:0.3, display:'block' }}/>Nenhum lead encontrado</div>}
                </div>
              </div>

              {/* PAGINAÇÃO */}
              {totalPages > 1 && (
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 4px' }}>
                  <span style={{ fontSize:12, color:GRAY2 }}>
                    Mostrando {(page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE, filtered.length)} de {filtered.length} leads
                  </span>
                  <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                    <button onClick={() => setPage(1)} disabled={page===1}
                      style={{ padding:'6px 10px', borderRadius:7, border:'1px solid #E5E7EB', background:page===1?GRAY4:WHITE, color:page===1?GRAY3:GRAY1, cursor:page===1?'default':'pointer', fontSize:12, fontWeight:600 }}>«</button>
                    <button onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1}
                      style={{ padding:'6px 10px', borderRadius:7, border:'1px solid #E5E7EB', background:page===1?GRAY4:WHITE, color:page===1?GRAY3:GRAY1, cursor:page===1?'default':'pointer', fontSize:12, fontWeight:600 }}>‹</button>
                    {Array.from({ length: Math.min(7, totalPages) }, (_, idx) => {
                      let p: number
                      if (totalPages <= 7) p = idx + 1
                      else if (page <= 4) p = idx + 1
                      else if (page >= totalPages - 3) p = totalPages - 6 + idx
                      else p = page - 3 + idx
                      return (
                        <button key={p} onClick={() => setPage(p)}
                          style={{ padding:'6px 12px', borderRadius:7, border:`1px solid ${p===page?R:'#E5E7EB'}`, background:p===page?R:WHITE, color:p===page?WHITE:GRAY1, cursor:'pointer', fontSize:12, fontWeight:p===page?800:500, minWidth:34 }}>{p}</button>
                      )
                    })}
                    <button onClick={() => setPage(p => Math.min(totalPages,p+1))} disabled={page===totalPages}
                      style={{ padding:'6px 10px', borderRadius:7, border:'1px solid #E5E7EB', background:page===totalPages?GRAY4:WHITE, color:page===totalPages?GRAY3:GRAY1, cursor:page===totalPages?'default':'pointer', fontSize:12, fontWeight:600 }}>›</button>
                    <button onClick={() => setPage(totalPages)} disabled={page===totalPages}
                      style={{ padding:'6px 10px', borderRadius:7, border:'1px solid #E5E7EB', background:page===totalPages?GRAY4:WHITE, color:page===totalPages?GRAY3:GRAY1, cursor:page===totalPages?'default':'pointer', fontSize:12, fontWeight:600 }}>»</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* PIPELINE */}
          {!loading && view === 'pipeline' && (
            <div style={{ display:'flex', flexDirection:'column', gap:18 }}>

              {/* ── Header ── */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div>
                  <div style={{ fontSize:10, fontWeight:800, color:R, textTransform:'uppercase', letterSpacing:'0.18em', marginBottom:6 }}>Gestão de Leads</div>
                  <h1 style={{ fontSize:30, fontWeight:900, color:GRAY1, margin:0, letterSpacing:'-0.02em', lineHeight:1 }}>Pipeline</h1>
                </div>
                <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                  {/* Stylish view toggle */}
                  <div style={{ display:'flex', background:WHITE, border:'1px solid #E5E7EB', borderRadius:12, padding:4, boxShadow:'0 1px 4px rgba(0,0,0,.06)', gap:2 }}>
                    {([
                      { key:'total', label:'Total', color: GRAY1 },
                      { key:'pre-vendas', label:'Pré-Vendas', color: BLUE },
                      { key:'vendas', label:'Vendas', color: R },
                    ] as const).map(opt => {
                      const active = pipelineView === opt.key
                      return (
                        <button key={opt.key} onClick={() => setPipelineView(opt.key)}
                          style={{ padding:'8px 20px', borderRadius:9, border:'none', cursor:'pointer', fontSize:12, fontWeight:800, transition:'all .18s',
                            background: active ? opt.color : 'transparent',
                            color: active ? WHITE : GRAY2,
                            letterSpacing: active ? '0.02em' : '0',
                            boxShadow: active ? `0 2px 8px ${opt.color}40` : 'none',
                          }}>
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>
                  {/* Filter button */}
                  <div style={{ position:'relative' }}>
                    {(() => {
                      const activeCount = (pipelineCanal !== 'Canal' ? 1 : 0) + (pipelineCloser ? 1 : 0) + (pipelineTemp ? 1 : 0)
                      return (
                        <button onClick={() => { setDraftPipelineCanal(pipelineCanal); setDraftPipelineCloser(pipelineCloser); setDraftPipelineTemp(pipelineTemp); setPipelineFilterOpen(v => !v) }}
                          style={{ display:'flex', alignItems:'center', gap:7, padding:'9px 16px', borderRadius:10, border:'1px solid #E5E7EB', background:WHITE, color:GRAY1, fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 1px 4px rgba(0,0,0,.06)' }}>
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M4 8h8M6 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                          Filtros
                          {activeCount > 0 && <span style={{ background:R, color:WHITE, borderRadius:'50%', width:17, height:17, fontSize:10, fontWeight:900, display:'flex', alignItems:'center', justifyContent:'center' }}>{activeCount}</span>}
                        </button>
                      )
                    })()}
                    {pipelineFilterOpen && (
                      <>
                        <div style={{ position:'fixed', inset:0, zIndex:49 }} onClick={() => setPipelineFilterOpen(false)} />
                        <div style={{ position:'absolute', right:0, top:'calc(100% + 8px)', background:WHITE, border:'1px solid #E5E7EB', borderRadius:16, boxShadow:'0 8px 32px rgba(0,0,0,.14)', zIndex:50, width:320, padding:24 }}>
                          <div style={{ fontSize:15, fontWeight:800, color:GRAY1, marginBottom:4 }}>Filtros do Pipeline</div>
                          <div style={{ fontSize:12, color:GRAY2, marginBottom:20 }}>Filtre os leads por canal e closer.</div>
                          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                            <div>
                              <label style={labelCls}>Canal <span style={{ fontWeight:400, textTransform:'none', fontSize:10, color:GRAY3 }}>(optional)</span></label>
                              <select style={inputCls} value={draftPipelineCanal} onChange={e => setDraftPipelineCanal(e.target.value)}>
                                {CANAIS.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </div>
                            <div>
                              <label style={labelCls}>Closer <span style={{ fontWeight:400, textTransform:'none', fontSize:10, color:GRAY3 }}>(optional)</span></label>
                              <select style={inputCls} value={draftPipelineCloser} onChange={e => setDraftPipelineCloser(e.target.value)}>
                                <option value="">Selecione</option>
                                {CLOSERS.map(c => <option key={c}>{c}</option>)}
                              </select>
                            </div>
                            <div>
                              <label style={labelCls}>Temperatura <span style={{ fontWeight:400, textTransform:'none', fontSize:10, color:GRAY3 }}>(optional)</span></label>
                              <select style={inputCls} value={draftPipelineTemp} onChange={e => setDraftPipelineTemp(e.target.value)}>
                                <option value="">Selecione</option>
                                {TEMPERATURAS.map(t => <option key={t}>{t}</option>)}
                              </select>
                            </div>
                          </div>
                          <div style={{ display:'flex', gap:10, marginTop:20 }}>
                            <button onClick={() => { setPipelineCanal('Canal'); setDraftPipelineCanal('Canal'); setPipelineCloser(''); setDraftPipelineCloser(''); setPipelineTemp(''); setDraftPipelineTemp(''); setPipelineFilterOpen(false) }}
                              style={{ flex:1, padding:'10px 0', borderRadius:10, border:'1px solid #E5E7EB', background:WHITE, color:GRAY1, fontSize:13, fontWeight:700, cursor:'pointer' }}>Limpar</button>
                            <button onClick={() => { setPipelineCanal(draftPipelineCanal); setPipelineCloser(draftPipelineCloser); setPipelineTemp(draftPipelineTemp); setPipelineFilterOpen(false) }}
                              style={{ flex:2, padding:'10px 0', borderRadius:10, border:'none', background:R, color:WHITE, fontSize:13, fontWeight:800, cursor:'pointer' }}>Aplicar</button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Chips ativos */}
              {(pipelineCanal !== 'Canal' || pipelineCloser || pipelineTemp) && (
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  {pipelineCanal !== 'Canal' && (
                    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:20, background:`${R}10`, border:`1px solid ${R}30`, fontSize:12, fontWeight:700, color:R }}>
                      {pipelineCanal}
                      <button onClick={() => setPipelineCanal('Canal')} style={{ background:'none', border:'none', cursor:'pointer', color:R, padding:0, display:'flex', lineHeight:1 }}>×</button>
                    </span>
                  )}
                  {pipelineCloser && (
                    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:20, background:`${R}10`, border:`1px solid ${R}30`, fontSize:12, fontWeight:700, color:R }}>
                      Closer: {pipelineCloser}
                      <button onClick={() => setPipelineCloser('')} style={{ background:'none', border:'none', cursor:'pointer', color:R, padding:0, display:'flex', lineHeight:1 }}>×</button>
                    </span>
                  )}
                  {pipelineTemp && (
                    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:20, background:`${TEMP_COLORS[pipelineTemp]}18`, border:`1px solid ${TEMP_COLORS[pipelineTemp]}40`, fontSize:12, fontWeight:700, color:TEMP_COLORS[pipelineTemp] }}>
                      {pipelineTemp}
                      <button onClick={() => setPipelineTemp('')} style={{ background:'none', border:'none', cursor:'pointer', color:TEMP_COLORS[pipelineTemp], padding:0, display:'flex', lineHeight:1 }}>×</button>
                    </span>
                  )}
                </div>
              )}

              {/* FUP filter bar (Vendas) */}
              {pipelineView === 'vendas' && (
                <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:WHITE, borderRadius:10, border:'1px solid #E5E7EB', boxShadow:'0 1px 4px rgba(0,0,0,.06)' }}>
                  <span style={{ fontSize:12, fontWeight:700, color:GRAY2, whiteSpace:'nowrap' }}>Filtrar por FUP:</span>
                  <input type="date" value={fupFilter} onChange={e => setFupFilter(e.target.value)}
                    style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #E5E7EB', fontSize:12, color:GRAY1, outline:'none', cursor:'pointer' }} />
                  {fupFilter && (
                    <button onClick={() => setFupFilter('')} style={{ display:'flex', alignItems:'center', gap:4, padding:'5px 10px', borderRadius:7, border:'1px solid #E5E7EB', background:WHITE, color:GRAY2, cursor:'pointer', fontSize:12, fontWeight:600 }}>
                      <X size={12} /> Limpar
                    </button>
                  )}
                  {fupFilter && <span style={{ fontSize:11, fontWeight:600, color:R, marginLeft:4 }}>FUP em {new Date(fupFilter + 'T00:00:00').toLocaleDateString('pt-BR')}</span>}
                </div>
              )}

              {/* ── Board ── */}
              {(() => {
                const PRE_VENDAS_KEYS = ['ENTRADA','TENTANDO CONTATO','EM QUALIFICAÇÃO','REUNIÃO AGENDADA','NO-SHOW/REMARCANDO','REUNIÃO REALIZADA']
                const VENDAS_KEYS = ['REUNIÃO REALIZADA','FOLLOW UP','VENDA','ATIVADO','PERDIDO']
                const visibleStages = funilPipeline.filter(s =>
                  pipelineView === 'total' ? true :
                  pipelineView === 'pre-vendas' ? PRE_VENDAS_KEYS.includes(s.key) :
                  VENDAS_KEYS.includes(s.key)
                ).map(s => {
                  if (pipelineView === 'vendas' && fupFilter) {
                    return { ...s, leads: s.leads.filter((l: any) => l.data_fup === fupFilter) }
                  }
                  return s
                })
                return (
                  <div style={{ overflowX:'auto', paddingBottom:8 }}>
                    <div style={{ display:'grid', gridTemplateColumns:`repeat(${visibleStages.length}, minmax(270px, 1fr))`, gap:12, minWidth: visibleStages.length * 282 }}>
                      {visibleStages.map((etapa, idx) => (
                        <div key={etapa.label}
                          onDragOver={e => { e.preventDefault(); setDragOver(etapa.key) }}
                          onDragLeave={() => setDragOver(null)}
                          onDrop={e => {
                            e.preventDefault(); setDragOver(null)
                            const leadData = JSON.parse(e.dataTransfer.getData('lead'))
                            if (leadData && getPipelineStage(leadData) !== etapa.key) {
                              const reqs = STAGE_REQUIREMENTS[etapa.key]
                              if (reqs) setDragModal({ open:true, lead:leadData, targetStage:etapa.key })
                              else applyDragUpdate(leadData, etapa.key, {})
                            }
                          }}
                          style={{ background: dragOver === etapa.key ? `${etapa.color}10` : '#FAFAFA', borderRadius:14, border: dragOver === etapa.key ? `2px dashed ${etapa.color}` : '1px solid #E8E8EE', overflow:'hidden', borderTop:`4px solid ${etapa.color}`, boxShadow:'0 2px 8px rgba(0,0,0,.05)', transition:'all .15s' }}>

                          {/* Column header */}
                          <div style={{ padding:'14px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', background:WHITE, borderBottom:'1px solid #F0F0F0' }}>
                            <div>
                              <div style={{ fontSize:10, fontWeight:800, color:GRAY2, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>{etapa.label}</div>
                              <div style={{ fontSize:28, fontWeight:900, color:etapa.color, lineHeight:1, letterSpacing:'-0.02em' }}>{etapa.leads.length}</div>
                            </div>
                            {idx < visibleStages.length - 1 && <ArrowRight size={14} color={GRAY3} />}
                          </div>

                          {/* Cards */}
                          <div style={{ padding:'8px 8px', maxHeight:'62vh', overflowY:'auto', display:'flex', flexDirection:'column', gap:7 }}>
                            {etapa.leads.map(l => {
                              const preVendasStages = ['ENTRADA','TENTANDO CONTATO','EM QUALIFICAÇÃO','REUNIÃO AGENDADA','NO-SHOW/REMARCANDO']
                              const isPreVendas = preVendasStages.includes(etapa.key)
                              const isRRPlus = ['REUNIÃO REALIZADA','FOLLOW UP'].includes(etapa.key)
                              const isVendaPlus = ['VENDA','ATIVADO','PERDIDO'].includes(etapa.key)
                              return (
                                <div key={l.id}
                                  draggable
                                  onDragStart={e => { e.dataTransfer.setData('lead', JSON.stringify(l)); e.dataTransfer.effectAllowed = 'move' }}
                                  onClick={() => router.push(`/leads/${l.id}?from=pipeline`)}
                                  style={{ background:WHITE, borderRadius:10, padding:'12px 14px', border:'1px solid #EBEBEB', cursor:'grab', userSelect:'none', boxShadow:'0 1px 4px rgba(0,0,0,.05)', transition:'border-color .12s, box-shadow .12s' }}
                                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor=etapa.color; (e.currentTarget as HTMLElement).style.boxShadow=`0 3px 10px ${etapa.color}28` }}
                                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor='#EBEBEB'; (e.currentTarget as HTMLElement).style.boxShadow='0 1px 4px rgba(0,0,0,.05)' }}>

                                  <div style={{ fontSize:13, fontWeight:800, color:GRAY1, lineHeight:1.35, marginBottom:3 }}>{l.empresa}</div>
                                  {(l as any).nome_lead && <div style={{ fontSize:11, fontWeight:600, color:GRAY2, marginBottom:2 }}>{(l as any).nome_lead}</div>}
                                  {(l as any).telefone && <div style={{ fontSize:11, color:GRAY3, display:'flex', alignItems:'center', gap:4, marginBottom:2 }}>📞 {(l as any).telefone}</div>}

                                  {isPreVendas && (
                                    <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:9 }}>
                                      {(l as any).cadencia && (
                                        <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20, background:'#78350F', color:'#FCD34D' }}>Dia {(l as any).cadencia}</span>
                                      )}
                                      {(l as any).contato_agendado && (
                                        <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20, background:`${GREEN}18`, color:GREEN }}>✓ Agendado</span>
                                      )}
                                      {l.origem && (
                                        <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:20, background:`${BLUE}12`, color:BLUE }}>{l.origem}</span>
                                      )}
                                    </div>
                                  )}

                                  {isRRPlus && (
                                    <div style={{ display:'flex', flexDirection:'column', gap:5, marginTop:9 }}>
                                      {l.tcv && <div style={{ fontSize:12, fontWeight:800, color:GREEN }}>{fmt(l.tcv)}</div>}
                                      <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                                        {l.temperatura && <TempBadge temp={l.temperatura}/>}
                                        {l.situacao_closer && (
                                          <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:20, background:`${PURPLE}15`, color:PURPLE, maxWidth:130, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.situacao_closer}</span>
                                        )}
                                        {l.data_fup && (
                                          <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20, background:`${YELLOW}18`, color:YELLOW, whiteSpace:'nowrap' }}>📅 {new Date(l.data_fup + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                                        )}
                                      </div>
                                    </div>
                                  )}

                                  {isVendaPlus && (
                                    <div style={{ display:'flex', flexDirection:'column', gap:5, marginTop:9 }}>
                                      {l.tcv && <div style={{ fontSize:12, fontWeight:800, color:GREEN }}>{fmt(l.tcv)}</div>}
                                      <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                                        {l.situacao_closer && (
                                          <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:20, background:`${PURPLE}15`, color:PURPLE, maxWidth:'100%', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.situacao_closer}</span>
                                        )}
                                        {l.data_fup && (
                                          <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20, background:`${YELLOW}18`, color:YELLOW, whiteSpace:'nowrap' }}>📅 {new Date(l.data_fup + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                            {etapa.leads.length === 0 && (
                              <div style={{ textAlign:'center', padding:'28px 16px', fontSize:12, color:GRAY3, borderRadius:10, border:`1.5px dashed ${GRAY3}`, margin:'2px 0' }}>
                                Arraste um lead aqui
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}
            </div>
          )}

          {/* METAS */}
          {!loading && view === 'metas' && (
            <MetasPage metas={metas} mesSel={mesSel} mesFmt={mesFmt} navMes={navMes} saveMeta={saveMeta} />
          )}

          {/* ACOMPANHAMENTO */}
          {!loading && view === 'acompanhamento' && (
            <AcompanhamentoPage leads={leads} metas={metas} mesSel={mesSel} mesFmt={mesFmt} navMes={navMes} />
          )}

          {/* CONFIGURAÇÕES */}
          {!loading && view === 'configuracoes' && (
            <ConfiguracoesPage onImport={importLeads} userEmail={session?.user?.email} />
          )}

        </div>
      </div>


      {/* DRAG MODAL */}
      {dragModal?.open && <DragModal info={dragModal} stageReqs={STAGE_REQUIREMENTS} pipelineStages={PIPELINE_STAGES} onConfirm={applyDragUpdate} onClose={() => setDragModal(null)} />}
    </div>
  )
}
