'use client'
export const dynamic = 'force-dynamic'
import LeadModal from './LeadModal'
import React, { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, Lead } from '@/lib/supabase'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts'
import { Users, Flame, Snowflake, ThermometerSun, CheckCircle2, Clock, Plus, Search, X, Edit2, Trash2, ChevronLeft, ChevronRight, ArrowRight, Target, LayoutDashboard, GitBranch, Settings, Upload, FileSpreadsheet, CheckCircle, AlertCircle } from 'lucide-react'

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
  const [view, setView] = useState<'dashboard' | 'leads' | 'pipeline' | 'metas' | 'configuracoes'>('dashboard')
  const [leads, setLeads] = useState<Lead[]>([])
  const [metas, setMetas] = useState<Record<string, Record<string, any>>>({})
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<{ open: boolean; lead: Partial<Lead> | null }>({ open: false, lead: null })
  const closeModal = React.useCallback(() => setModal({ open: false, lead: null }), [])
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

  const saveLead = React.useCallback(async (form: Partial<Lead>) => {
    if (!form.empresa) return
    const { id, created_at, updated_at, ...data } = form as any
    if (id) {
      const { error } = await supabase.from('leads').update(data).eq('id', id)
      if (error) { alert('Erro: ' + error.message); return }
    } else {
      const clean: Record<string, any> = {}
      Object.entries(data).forEach(([k, v]) => { clean[k] = (v === '' || v === undefined) ? null : v })
      const { error } = await supabase.from('leads').insert(clean)
      if (error) { alert('Erro: ' + error.message); return }
    }
    setModal({ open: false, lead: null })
    fetchLeads()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    leads: leads.filter(l => getPipelineStage(l) === stage.key && (pipelineCanal === 'Canal' || l.origem === pipelineCanal))
  })), [leads, pipelineCanal])

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

  const MENU = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'leads', label: 'Leads', icon: Users },
    { id: 'pipeline', label: 'Pipeline', icon: GitBranch },
    { id: 'metas', label: 'Metas', icon: Target },
    { id: 'configuracoes', label: 'Configurações', icon: Settings },
  ]

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

      {/* SIDEBAR */}
      <aside style={{ width: 230, background: SIDEBAR_BG, display: 'flex', flexDirection: 'column', flexShrink: 0, boxShadow: '4px 0 24px rgba(0,0,0,0.06)', zIndex: 10 }}>
        <div style={{ padding: '22px 20px 20px', borderBottom: '1px solid #F0EFF8' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 40, height: 40, flexShrink: 0 }}>
              <img src="data:image/png;base64,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" alt="V4 Company" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover' }} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: GRAY1, letterSpacing: '0.02em', lineHeight: 1 }}>V4 COMPANY</div>
              <div style={{ fontSize: 10, color: GRAY2, marginTop: 2, letterSpacing: '0.06em' }}>SCN & CO</div>
            </div>
          </div>
        </div>
        <nav style={{ flex: 1, padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {MENU.map(item => {
            const active = view === item.id
            return (
              <button key={item.id} onClick={() => setView(item.id as any)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%', background: active ? 'linear-gradient(135deg, #E8001C, #B91C1C)' : 'transparent', color: active ? WHITE : GRAY2, fontWeight: active ? 700 : 500, fontSize: 13, transition: 'all .18s', boxShadow: active ? '0 4px 16px rgba(232,0,28,0.3)' : 'none' }}
                onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = '#FFF1F2'; (e.currentTarget as HTMLElement).style.color = R } }}
                onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = GRAY2 } }}
              >
                <item.icon size={16} />{item.label}
              </button>
            )
          })}
        </nav>
        <div style={{ padding: '14px 12px', borderTop: '1px solid #F0EFF8' }}>
          <button onClick={() => setModal({ open: true, lead: null })} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #E8001C, #B91C1C)', color: WHITE, fontSize: 13, fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 12px rgba(232,0,28,0.28)' }}>
            <Plus size={15} /> NOVO LEAD
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 4px 4px' }}>
            {session?.user?.user_metadata?.avatar_url
              ? <img src={session.user.user_metadata.avatar_url} style={{ width:32, height:32, borderRadius:'50%', flexShrink:0, border:'2px solid #EDE9FE' }} />
              : <div style={{ width:32, height:32, borderRadius:'50%', background:'linear-gradient(135deg, #7C3AED, #6D28D9)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, color:WHITE, flexShrink:0 }}>{(session?.user?.user_metadata?.full_name || session?.user?.email || 'U')[0].toUpperCase()}</div>
            }
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:12, fontWeight:700, color:GRAY1, lineHeight:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{session?.user?.user_metadata?.full_name || session?.user?.email || ''}</div>
              <button onClick={handleSignOut} style={{ fontSize:11, color:GRAY2, marginTop:3, background:'none', border:'none', cursor:'pointer', padding:0, fontWeight:500 }}>Sair →</button>
            </div>
          </div>
        </div>
      </aside>

      {/* CONTENT */}
      <div style={{ flex: 1, background: CONTENT_BG, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ background: WHITE, borderBottom: '1px solid #EEEEF5', padding: '0 28px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, boxShadow: '0 1px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: R, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>CRM</span>
            <span style={{ color: GRAY3, fontSize: 16, lineHeight: '1' }}>›</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: GRAY1 }}>{MENU.find(m => m.id === view)?.label}</span>
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
                const kpis = [
                  { label: 'Entradas', real: lm.entrada.length, meta: mm.meta_entradas, color: BLUE },
                  { label: 'Reu. Agend.', real: lm.ra.length, meta: mm.meta_ra, color: YELLOW },
                  { label: 'Reu. Realiz.', real: lm.rr.length, meta: mm.meta_rr, color: PURPLE },
                  { label: 'Vendas', real: lm.venda.length, meta: mm.meta_vendas, color: GREEN },
                  { label: 'Ativações', real: lm.ativacao.length, meta: mm.meta_ativacoes, color: R },
                ]
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10 }}>
                    {kpis.map(k => {
                      const pct = k.meta ? Math.min(Math.round(k.real / k.meta * 100), 100) : null
                      const over = !!(k.meta && k.real >= k.meta)
                      return (
                        <div key={k.label} style={{ background: WHITE, borderRadius: 16, padding: '20px 20px 18px', boxShadow: '0 1px 8px rgba(0,0,0,.05)', border: '1px solid rgba(0,0,0,.05)', position: 'relative', overflow: 'hidden' }}>
                          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: k.color, borderRadius: '16px 0 0 16px' }} />
                          <div style={{ paddingLeft: 10 }}>
                            <div style={{ fontSize: 10, fontWeight: 800, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>{k.label}</div>
                            <div style={{ fontSize: 44, fontWeight: 900, color: GRAY1, lineHeight: 1, letterSpacing: '-0.03em' }}>{k.real}</div>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Linha 1: busca + filtros rápidos */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ position: 'relative' }}>
                    <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: GRAY2 }} />
                    <input style={{ ...inputCls, paddingLeft: 34, width: 260 }} placeholder="Buscar empresa ou nome do lead..." value={search} onChange={e => setSearch(e.target.value)} />
                  </div>
                  {[
                    { val: filters.closer, key: 'closer', ph: 'Closer', opts: CLOSERS },
                    { val: filters.temperatura, key: 'temperatura', ph: 'Temperatura', opts: TEMPERATURAS },
                    { val: filters.origem, key: 'origem', ph: 'Origem', opts: ORIGENS },
                    { val: filters.tier, key: 'tier', ph: 'Tier', opts: ['TINY','SMALL','MEDIUM','LARGE','ENTERPRISE'] },
                  ].map(f => (
                    <select key={f.key} style={{ ...inputCls, width: 'auto', minWidth: 120, cursor: 'pointer' }} value={f.val} onChange={e => setFilters(p => ({ ...p, [f.key]: e.target.value }))}>
                      <option value="">{f.ph}</option>
                      {f.opts.map(o => <option key={o}>{o}</option>)}
                    </select>
                  ))}
                </div>
                {/* Linha 2: filtros de situação e mês */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {[
                    { val: filters.situacao_pre_vendas, key: 'situacao_pre_vendas', ph: 'Sit. BDR', opts: SITUACOES_PRE_VENDAS },
                    { val: filters.situacao, key: 'situacao', ph: 'Sit. Closer', opts: SITUACOES },
                  ].map(f => (
                    <select key={f.key} style={{ ...inputCls, width: 'auto', minWidth: 140, cursor: 'pointer' }} value={f.val} onChange={e => setFilters(p => ({ ...p, [f.key]: e.target.value }))}>
                      <option value="">{f.ph}</option>
                      {f.opts.map(o => <option key={o}>{o}</option>)}
                    </select>
                  ))}
                  {/* Filtros de mês */}
                  {[
                    { val: filters.mes_entrada, key: 'mes_entrada', ph: 'Mês Entrada' },
                    { val: filters.mes_ra, key: 'mes_ra', ph: 'Mês RA' },
                    { val: filters.mes_rr, key: 'mes_rr', ph: 'Mês RR' },
                    { val: filters.mes_venda, key: 'mes_venda', ph: 'Mês Venda' },
                    { val: filters.mes_ativacao, key: 'mes_ativacao', ph: 'Mês Ativação' },
                  ].map(f => {
                    // Build unique months from leads for each field
                    const fieldMap: Record<string, keyof typeof leads[0]> = {
                      mes_entrada: 'data_entrada', mes_ra: 'data_ra', mes_rr: 'data_rr',
                      mes_venda: 'data_assinatura', mes_ativacao: 'data_ativacao'
                    }
                    const months = Array.from(new Set(leads.map(l => mesAno(l[fieldMap[f.key]] as string)).filter(Boolean))).sort().reverse() as string[]
                    return (
                      <select key={f.key} style={{ ...inputCls, width: 'auto', minWidth: 130, cursor: 'pointer' }} value={f.val} onChange={e => setFilters(p => ({ ...p, [f.key]: e.target.value }))}>
                        <option value="">{f.ph}</option>
                        {months.map(m => <option key={m} value={m}>{mesFmt(m)}</option>)}
                      </select>
                    )
                  })}
                  {/* Limpar */}
                  {(Object.values(filters).some(v => v) || search) && (
                    <button onClick={() => { setFilters({ closer:'', temperatura:'', situacao:'', origem:'', tier:'', mes_entrada:'', mes_ra:'', mes_rr:'', mes_venda:'', mes_ativacao:'', situacao_pre_vendas:'' }); setSearch('') }}
                      style={{ display:'flex', alignItems:'center', gap:6, padding:'9px 14px', border:`1px solid ${R}33`, borderRadius:8, background:WHITE, color:R, fontSize:12, cursor:'pointer', whiteSpace:'nowrap' }}>
                      <X size={12} /> Limpar filtros
                    </button>
                  )}
                </div>
              </div>
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
                            <div onClick={() => setModal({ open:true, lead:l })} style={{ fontWeight:700, color:R, cursor:'pointer' }} onMouseEnter={e => (e.currentTarget as HTMLElement).style.textDecoration='underline'} onMouseLeave={e => (e.currentTarget as HTMLElement).style.textDecoration='none'}>{l.empresa}</div>
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
                              <button onClick={() => setModal({ open:true, lead:l })} style={{ background:`${R}12`, border:'none', borderRadius:6, padding:6, cursor:'pointer', color:R, display:'flex' }}><Edit2 size={13}/></button>
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
            <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                <div>
                  <h1 style={{ fontSize:22, fontWeight:800, color:GRAY1, margin:0 }}>Pipeline</h1>
                  <p style={{ fontSize:13, color:GRAY2, marginTop:4 }}>Gerencie os leads por etapa</p>
                </div>
                <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                  {/* Canal filter */}
                  <div style={{ display:'flex', alignItems:'center', gap:8, background:WHITE, border:'1px solid #E5E7EB', borderRadius:10, padding:'8px 14px', boxShadow:'0 1px 4px rgba(0,0,0,.06)' }}>
                    <button onClick={() => setPipelineCanal(c => CANAIS[(CANAIS.indexOf(c) - 1 + CANAIS.length) % CANAIS.length])} style={{ background:'none', border:'none', color:GRAY2, cursor:'pointer', display:'flex', padding:0 }}><ChevronLeft size={16} /></button>
                    <span style={{ fontSize:14, fontWeight:700, color:GRAY1, minWidth:110, textAlign:'center' }}>{pipelineCanal}</span>
                    <button onClick={() => setPipelineCanal(c => CANAIS[(CANAIS.indexOf(c) + 1) % CANAIS.length])} style={{ background:'none', border:'none', color:GRAY2, cursor:'pointer', display:'flex', padding:0 }}><ChevronRight size={16} /></button>
                  </div>
                  {/* View toggle */}
                  <div style={{ display:'flex', gap:4, background:'#F3F4F6', borderRadius:10, padding:4 }}>
                    {([
                      { key:'total', label:'Visão Total', icon:'⚡' },
                      { key:'pre-vendas', label:'Pré-Vendas', icon:'🎯' },
                      { key:'vendas', label:'Vendas', icon:'💰' },
                    ] as const).map(opt => (
                      <button key={opt.key} onClick={() => setPipelineView(opt.key)}
                        style={{ padding:'8px 16px', borderRadius:8, border:'none', cursor:'pointer', fontSize:12, fontWeight:700, transition:'all .15s',
                          background: pipelineView === opt.key ? WHITE : 'transparent',
                          color: pipelineView === opt.key ? GRAY1 : GRAY2,
                          boxShadow: pipelineView === opt.key ? '0 1px 4px rgba(0,0,0,.1)' : 'none',
                        }}>
                        {opt.icon} {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {pipelineView === 'vendas' && (
                <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:WHITE, borderRadius:10, border:'1px solid #E5E7EB', boxShadow:'0 1px 4px rgba(0,0,0,.06)', marginBottom:4 }}>
                  <span style={{ fontSize:12, fontWeight:700, color:GRAY2, whiteSpace:'nowrap' }}>Filtrar por FUP:</span>
                  <input
                    type="date"
                    value={fupFilter}
                    onChange={e => setFupFilter(e.target.value)}
                    style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #E5E7EB', fontSize:12, color:GRAY1, outline:'none', cursor:'pointer' }}
                  />
                  {fupFilter && (
                    <button onClick={() => setFupFilter('')} style={{ display:'flex', alignItems:'center', gap:4, padding:'5px 10px', borderRadius:7, border:'1px solid #E5E7EB', background:WHITE, color:GRAY2, cursor:'pointer', fontSize:12, fontWeight:600 }}>
                      <X size={12} /> Limpar
                    </button>
                  )}
                  {fupFilter && (
                    <span style={{ fontSize:11, fontWeight:600, color:R, marginLeft:4 }}>
                      {fupFilter ? `Mostrando leads com FUP em ${new Date(fupFilter + 'T00:00:00').toLocaleDateString('pt-BR')}` : ''}
                    </span>
                  )}
                </div>
              )}
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
                const cols = visibleStages.length
                return (
              <div style={{ display:'grid', gridTemplateColumns:`repeat(${cols}, 1fr)`, gap:10, minWidth:0 }}>
                {visibleStages.map((etapa,idx) => (
                  <div key={etapa.label}
                    onDragOver={e => { e.preventDefault(); setDragOver(etapa.key) }}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={e => {
                      e.preventDefault(); setDragOver(null)
                      const leadData = JSON.parse(e.dataTransfer.getData('lead'))
                      if (leadData && getPipelineStage(leadData) !== etapa.key) {
                        const reqs = STAGE_REQUIREMENTS[etapa.key]
                        if (reqs) setDragModal({ open: true, lead: leadData, targetStage: etapa.key })
                        else applyDragUpdate(leadData, etapa.key, {})
                      }
                    }}
                    style={{ background: dragOver === etapa.key ? `${etapa.color}10` : WHITE, borderRadius:12, border: dragOver === etapa.key ? `2px dashed ${etapa.color}` : '1px solid #E5E7EB', overflow:'hidden', borderTop:`3px solid ${etapa.color}`, boxShadow:'0 1px 4px rgba(0,0,0,.06)', minWidth:0, transition:'all .15s' }}>
                    <div style={{ padding:'12px 14px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid #F3F4F6' }}>
                      <div>
                        <div style={{ fontSize:10, fontWeight:700, color:GRAY2, textTransform:'uppercase', letterSpacing:'0.07em', lineHeight:1.3 }}>{etapa.label}</div>
                        <div style={{ fontSize:24, fontWeight:900, color:etapa.color, lineHeight:1.1, marginTop:2 }}>{etapa.leads.length}</div>
                      </div>
                      {idx<visibleStages.length-1&&<ArrowRight size={12} color={GRAY3}/>}
                    </div>
                    <div style={{ padding:8, maxHeight:'55vh', overflowY:'auto', display:'flex', flexDirection:'column', gap:6 }}>
                      {etapa.leads.map(l => {
                        // Stage-based display logic
                        const preVendasStages = ['ENTRADA','TENTANDO CONTATO','EM QUALIFICAÇÃO','REUNIÃO AGENDADA','NO-SHOW/REMARCANDO']
                        const isPreVendas = preVendasStages.includes(etapa.key)
                        const isRRPlus = ['REUNIÃO REALIZADA','FOLLOW UP'].includes(etapa.key)
                        const isVendaPlus = ['VENDA','ATIVADO','PERDIDO'].includes(etapa.key)
                        return (
                        <div key={l.id}
                          draggable
                          onDragStart={e => { e.dataTransfer.setData('lead', JSON.stringify(l)); e.dataTransfer.effectAllowed = 'move' }}
                          onClick={() => setModal({ open:true, lead:l })}
                          style={{ background:WHITE, borderRadius:10, padding:'10px 12px', border:'1px solid #E5E7EB', cursor:'grab', userSelect:'none', boxShadow:'0 1px 3px rgba(0,0,0,.06)' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor=etapa.color; (e.currentTarget as HTMLElement).style.boxShadow=`0 2px 8px ${etapa.color}22` }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor='#E5E7EB'; (e.currentTarget as HTMLElement).style.boxShadow='0 1px 3px rgba(0,0,0,.06)' }}>

                          {/* Hierarquia principal */}
                          <div style={{ fontSize:12, fontWeight:800, color:GRAY1, lineHeight:1.3, marginBottom:2 }}>{l.empresa}</div>
                          {(l as any).nome_lead && <div style={{ fontSize:11, fontWeight:600, color:GRAY2, marginBottom:1 }}>{(l as any).nome_lead}</div>}
                          {(l as any).telefone && <div style={{ fontSize:10, color:GRAY3, display:'flex', alignItems:'center', gap:3 }}>📞 {(l as any).telefone}</div>}

                          {/* Tags Pré-Vendas (até Reunião Agendada) */}
                          {isPreVendas && (
                            <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:8 }}>
                              {(l as any).cadencia && (
                                <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:20, background:'#78350F', color:'#FCD34D' }}>
                                  Dia {(l as any).cadencia}
                                </span>
                              )}
                              {(l as any).contato_agendado && (
                                <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:20, background:`${GREEN}18`, color:GREEN }}>
                                  ✓ Contato Agendado
                                </span>
                              )}
                              {l.origem && (
                                <span style={{ fontSize:10, fontWeight:600, padding:'2px 7px', borderRadius:20, background:`${BLUE}12`, color:BLUE }}>
                                  {l.origem}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Tags RR + Follow Up */}
                          {isRRPlus && (
                            <div style={{ display:'flex', flexDirection:'column', gap:4, marginTop:8 }}>
                              {l.tcv && <div style={{ fontSize:11, fontWeight:800, color:GREEN, fontFamily:'monospace' }}>{fmt(l.tcv)}</div>}
                              <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                                {l.situacao_closer && (
                                  <span style={{ fontSize:10, fontWeight:600, padding:'2px 7px', borderRadius:20, background:`${PURPLE}15`, color:PURPLE, maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                    {l.situacao_closer}
                                  </span>
                                )}
                                {l.temperatura && <TempBadge temp={l.temperatura}/>}
                                {l.data_fup && (
                                  <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:20, background:`${YELLOW}18`, color:YELLOW, whiteSpace:'nowrap' }}>
                                    📅 FUP {new Date(l.data_fup + 'T00:00:00').toLocaleDateString('pt-BR')}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Tags Venda+ (sem temperatura) */}
                          {isVendaPlus && (
                            <div style={{ display:'flex', flexDirection:'column', gap:4, marginTop:8 }}>
                              {l.tcv && <div style={{ fontSize:11, fontWeight:800, color:GREEN, fontFamily:'monospace' }}>{fmt(l.tcv)}</div>}
                              <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                                {l.situacao_closer && (
                                  <span style={{ fontSize:10, fontWeight:600, padding:'2px 7px', borderRadius:20, background:`${PURPLE}15`, color:PURPLE, display:'inline-block', maxWidth:'100%', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                    {l.situacao_closer}
                                  </span>
                                )}
                                {l.data_fup && (
                                  <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:20, background:`${YELLOW}18`, color:YELLOW, whiteSpace:'nowrap' }}>
                                    📅 FUP {new Date(l.data_fup + 'T00:00:00').toLocaleDateString('pt-BR')}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                        )
                      })}
                      {etapa.leads.length===0&&<div style={{ textAlign:'center', padding:24, fontSize:12, color:GRAY3, borderRadius:8 }}>Solte aqui</div>}
                    </div>
                  </div>
                ))}
              </div>
              )
              })()}
            </div>
          )}

          {/* METAS */}
          {!loading && view === 'metas' && (
            <MetasPage metas={metas} mesSel={mesSel} mesFmt={mesFmt} navMes={navMes} saveMeta={saveMeta} />
          )}

          {/* CONFIGURAÇÕES */}
          {!loading && view === 'configuracoes' && (
            <ConfiguracoesPage onImport={importLeads} userEmail={session?.user?.email} />
          )}

        </div>
      </div>


      {/* DRAG MODAL */}
      {dragModal?.open && <DragModal info={dragModal} stageReqs={STAGE_REQUIREMENTS} pipelineStages={PIPELINE_STAGES} onConfirm={applyDragUpdate} onClose={() => setDragModal(null)} />}
      {modal.open && <LeadModal lead={modal.lead} onClose={closeModal} onSave={saveLead} />}
    </div>
  )
}
