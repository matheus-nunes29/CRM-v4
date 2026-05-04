'use client'
export const dynamic = 'force-dynamic'
import React, { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Lead } from '@/lib/supabase'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend, Cell, ComposedChart } from 'recharts'
import { Clock } from 'lucide-react'
import CRMLayout from './_components/CRMLayout'
import { AnimatedText } from '@/components/ui/animated-text'
import { TempBadge } from '@/lib/crm-badges'
import { getPipelineStage } from '@/lib/crm-pipeline'
import {
  R, WHITE, GRAY1, GRAY2, GRAY3, GRAY4, GREEN, BLUE, YELLOW, PURPLE,
  CANAIS, CANAIS_METAS, TIERS, SEGMENTOS,
  mesAno, fmt, fmtDate, mesFmt, inputCls, labelCls,
} from '@/lib/crm-constants'
import { useCountUp } from '@/lib/useCountUp'
import { useCloserUsers } from '@/lib/useCloserUsers'

function KpiNumber({ value, color, delay = 0 }: { value: number; color: string; delay?: number }) {
  const animated = useCountUp(value, 800, delay)
  return (
    <div style={{ fontSize: 44, fontWeight: 900, color, lineHeight: 1, letterSpacing: '-0.03em' }}>
      {animated}
    </div>
  )
}

export default function DashboardPage() {
  const router = useRouter()
  const [leads, setLeads] = useState<Lead[]>([])
  const [metas, setMetas] = useState<Record<string, Record<string, any>>>({})
  const [loading, setLoading] = useState(true)

  const [mesSel, setMesSel] = useState(() => {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
  })
  const [canalSel, setCanalSel] = useState<string>('Canal')
  const [tierSel, setTierSel] = useState('')
  const [closerSel, setCloserSel] = useState('')

  const [dashFilterOpen, setDashFilterOpen] = useState(false)
  const [draftCanal, setDraftCanal] = useState('Canal')
  const [draftMes, setDraftMes] = useState(() => {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
  })
  const [draftTier, setDraftTier] = useState('')
  const [draftCloser, setDraftCloser] = useState('')

  const [healthInfoOpen, setHealthInfoOpen] = useState<string | null>(null)
  const [kpiHover, setKpiHover] = useState<string | null>(null)
  const [kpiPopoverPage, setKpiPopoverPage] = useState(0)
  const [kpiPopoverRect, setKpiPopoverRect] = useState<DOMRect | null>(null)
  const [nomeUsuario, setNomeUsuario] = useState('')
  const closerUsers = useCloserUsers()

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      fetchLeads()
      fetchMetas()
      const { data: u } = await supabase.from('usuarios_permitidos').select('nome').eq('email', session.user.email).single()
      if (u?.nome) setNomeUsuario(u.nome.split(' ')[0])
    })
  }, [])

  useEffect(() => {
    const channel = supabase
      .channel('dashboard-leads-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, fetchLeads)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  async function fetchLeads() {
    try {
      const { data, error } = await supabase.from('leads').select('*').order('created_at', { ascending: false })
      if (error) console.error('fetchLeads error:', error)
      setLeads(data || [])
    } catch (e) {
      console.error('fetchLeads exception:', e)
      setLeads([])
    } finally {
      setLoading(false)
    }
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

  const navMes = (dir: number) => {
    const [y, m] = mesSel.split('-').map(Number)
    const d = new Date(y, m - 1 + dir)
    setMesSel(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const dadosMensais = useMemo(() => {
    const s = new Set<string>()
    const campos: (keyof Lead)[] = ['data_entrada', 'data_ra', 'data_rr', 'data_assinatura', 'data_ativacao']
    leads.forEach(l => campos.forEach(c => { const m = mesAno(l[c] as string); if (m) s.add(m) }))
    const now = new Date()
    const currentMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const byCanal = (l: any) => canalSel === 'Canal' || l.origem === canalSel
    return Array.from(s).sort().filter(m => m <= currentMes).slice(-4).map(m => ({
      mes: mesFmt(m),
      entrada: leads.filter(l => mesAno(l.data_entrada as string) === m && byCanal(l)).length,
      ra: leads.filter(l => mesAno(l.data_ra as string) === m && byCanal(l)).length,
      rr: leads.filter(l => mesAno(l.data_rr as string) === m && byCanal(l)).length,
      vendas: leads.filter(l => mesAno(l.data_assinatura as string) === m && byCanal(l)).length,
      ativacao: leads.filter(l => mesAno(l.data_ativacao as string) === m && byCanal(l)).length,
      tcv: leads.filter(l => mesAno(l.data_assinatura as string) === m && byCanal(l)).reduce((s, l) => s + (l.tcv || 0), 0),
    }))
  }, [leads, canalSel])

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
  const tooltipStyle = { background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 8, color: GRAY1, fontSize: 12, boxShadow: '0 4px 16px rgba(0,0,0,.10)' }

  const lmPrev = useMemo(() => {
    const [y, m] = mesSel.split('-').map(Number)
    const d = new Date(y, m - 2)
    const pm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const byCanal = (l: any) => canalSel === 'Canal' || l.origem === canalSel
    const byTier  = (l: any) => !tierSel   || l.tier   === tierSel
    const byClose = (l: any) => !closerSel || l.closer === closerSel
    const match   = (l: any) => byCanal(l) && byTier(l) && byClose(l)
    return {
      entrada:  leads.filter(l => mesAno(l.data_entrada)   === pm && match(l)).length,
      ra:       leads.filter(l => mesAno(l.data_ra)         === pm && match(l)).length,
      rr:       leads.filter(l => mesAno(l.data_rr)         === pm && match(l)).length,
      venda:    leads.filter(l => mesAno(l.data_assinatura) === pm && match(l)).length,
      ativacao: leads.filter(l => mesAno(l.data_ativacao)   === pm && match(l)).length,
    }
  }, [leads, mesSel, canalSel, tierSel, closerSel])

  const pipelineHealth = useMemo(() => {
    const active = leads.filter(l => !['VENDA', 'ATIVADO', 'PERDIDO'].includes(getPipelineStage(l)))
    if (active.length === 0) return { overall: 0, fup: 0, temp: 0, recent: 0, total: 0 }
    const fup  = Math.round(active.filter(l => l.data_fup).length   / active.length * 100)
    const temp = Math.round(active.filter(l => l.temperatura).length / active.length * 100)
    const rec  = Math.round(active.filter(l => Math.floor((Date.now() - new Date(l.updated_at).getTime()) / 86400000) <= 3).length / active.length * 100)
    return { overall: Math.round((fup + temp + rec) / 3), fup, temp, recent: rec, total: active.length }
  }, [leads])

  const forecastPipeline = useMemo(() => {
    const ACTIVE = ['ENTRADA','TENTANDO CONTATO','EM QUALIFICAÇÃO','REUNIÃO AGENDADA','NO-SHOW/REMARCANDO','REUNIÃO REALIZADA','FOLLOW UP']
    const active = leads.filter(l => ACTIVE.includes(getPipelineStage(l)) && (l.tcv || 0) > 0)
    const q = active.filter(l => l.temperatura === 'QUENTE').reduce((s, l) => s + (l.tcv || 0), 0)
    const m = active.filter(l => l.temperatura === 'MORNO').reduce((s, l)  => s + (l.tcv || 0), 0)
    return q * 0.7 + m * 0.3
  }, [leads])

  const stgAvgDays = (arr: Lead[], from: keyof Lead, to: keyof Lead) => {
    const diffs = arr
      .filter(l => l[from] && l[to])
      .map(l => Math.round((new Date(l[to] as string).getTime() - new Date(l[from] as string).getTime()) / 86400000))
      .filter(d => d >= 0 && d < 400)
    return diffs.length > 0 ? Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length) : null
  }

  if (loading) {
    return (
      <CRMLayout>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, flexDirection: 'column', gap: 12 }}>
          <div style={{ width: 36, height: 36, border: `3px solid ${GRAY3}`, borderTopColor: PURPLE, borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
          <span style={{ fontSize: 13, color: GRAY2 }}>Carregando...</span>
        </div>
      </CRMLayout>
    )
  }

  return (
    <CRMLayout>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* ── Header ── */}
        {(() => {
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
                <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 2 }}>
                  {(() => {
                    const h = new Date().getHours()
                    const saudacao = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
                    const texto = `${saudacao}${nomeUsuario ? `, ${nomeUsuario}` : ''}, vamos vender, porra!`
                    return (
                      <AnimatedText
                        text={texto}
                        duration={0.03}
                        delay={0.03}
                        textClassName="text-3xl font-black tracking-tight text-gray-900"
                        underlineGradient="from-red-500 via-red-400 to-red-600"
                        underlineHeight="h-[3px]"
                        underlineOffset="-bottom-1"
                        className="items-start"
                      />
                    )
                  })()}
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
                      <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,.14)', zIndex: 50, width: 340, padding: 24 }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: GRAY1, marginBottom: 4 }}>Personalize seu filtro</div>
                        <div style={{ fontSize: 12, color: GRAY2, marginBottom: 20 }}>Escolha os filtros e as opções desejadas.</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                          <div>
                            <label style={labelCls}>Canal</label>
                            <select style={inputCls} value={draftCanal} onChange={e => setDraftCanal(e.target.value)}>
                              {CANAIS.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={labelCls}>Mês</label>
                            <select style={inputCls} value={draftMes} onChange={e => setDraftMes(e.target.value)}>
                              {allMonthsOpts.map(m => <option key={m} value={m}>{mesFmt(m)}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={labelCls}>Tier</label>
                            <select style={inputCls} value={draftTier} onChange={e => setDraftTier(e.target.value)}>
                              <option value="">Selecione</option>
                              {TIERS.map(t => <option key={t}>{t}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={labelCls}>Closer</label>
                            <select style={inputCls} value={draftCloser} onChange={e => setDraftCloser(e.target.value)}>
                              <option value="">Selecione</option>
                              {closerUsers.map(u => <option key={u.nome} value={u.nome}>{u.nome}</option>)}
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

        {/* ── Pipeline Health Score ── */}
        {pipelineHealth.total > 0 && (
          <>
            {healthInfoOpen && <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setHealthInfoOpen(null)} />}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {[
                { label: 'Health Score',    value: `${pipelineHealth.overall}%`,  sub: `${pipelineHealth.total} leads ativos`,   alert: pipelineHealth.overall < 40,  info: 'Média ponderada de 3 indicadores operacionais: % de leads com FUP agendado, % com temperatura definida e % atualizados nos últimos 3 dias. Score abaixo de 60% indica pipeline mal gerenciado — algum critério está sendo negligenciado pelo time.' },
                { label: 'FUP Agendado',    value: `${pipelineHealth.fup}%`,      sub: 'dos ativos com data',                    alert: pipelineHealth.fup < 30,        info: 'Percentual dos leads ativos (excluindo vendas, ativados e perdidos) que têm uma data de follow-up agendada. Leads sem FUP ficam sem direção e tendem a esfriar. Meta ideal: acima de 70%. Se abaixo disso, o time está deixando leads sem próximo passo definido.' },
                { label: 'Temp. Definida',  value: `${pipelineHealth.temp}%`,     sub: 'dos ativos qualificados',                alert: pipelineHealth.temp < 40,       info: 'Percentual dos leads ativos com temperatura (FRIO, MORNO, QUENTE) preenchida. Sem temperatura definida, não é possível priorizar esforço, construir um forecast confiável nem identificar quais leads precisam de atenção imediata. Meta ideal: acima de 80%.' },
                { label: 'Atualizados <3d', value: `${pipelineHealth.recent}%`,   sub: 'atividade recente',                      alert: pipelineHealth.recent < 25,     info: 'Percentual dos leads ativos que tiveram alguma atualização nos últimos 3 dias. Indica o nível real de atividade do time sobre o pipeline. Abaixo de 40% sugere que a maioria dos leads está sendo negligenciada — o time não está tocando o pipeline com frequência suficiente.' },
              ].map(item => {
                const isOpen = healthInfoOpen === item.label
                return (
                  <div key={item.label} style={{ background: WHITE, borderRadius: 12, padding: '14px 16px', border: item.alert ? `1px solid ${R}30` : '1px solid #E5E7EB', boxShadow: '0 1px 4px rgba(0,0,0,.04)', display: 'flex', alignItems: 'center', gap: 12, position: 'relative' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 9, fontWeight: 800, color: GRAY3, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>{item.label}</div>
                      <div style={{ fontSize: 20, fontWeight: 900, color: item.alert ? R : GRAY1, lineHeight: 1 }}>{item.value}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        <span style={{ fontSize: 9, color: GRAY3 }}>{item.sub}</span>
                        {item.alert && <span style={{ fontSize: 9, fontWeight: 800, color: R, background: `${R}12`, padding: '1px 6px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Atenção</span>}
                      </div>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); setHealthInfoOpen(isOpen ? null : item.label) }}
                      style={{ width: 18, height: 18, borderRadius: '50%', border: `1.5px solid ${isOpen ? R : GRAY3}`, background: isOpen ? `${R}12` : 'transparent', color: isOpen ? R : GRAY3, fontSize: 10, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all .15s', padding: 0, alignSelf: 'flex-start' }}
                    >i</button>
                    {isOpen && (
                      <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 6, width: 280, background: '#FFFFFF', border: `1px solid #E5E7EB`, borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,.14)', zIndex: 999, padding: '14px 16px', animation: 'scaleIn .15s cubic-bezier(.22,1,.36,1)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                          <div style={{ width: 16, height: 16, borderRadius: '50%', background: R, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 900, color: '#FFFFFF', flexShrink: 0 }}>i</div>
                          <span style={{ fontSize: 10, fontWeight: 800, color: R, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{item.label}</span>
                        </div>
                        <p style={{ fontSize: 12, color: GRAY1, lineHeight: 1.6, margin: 0 }}>{item.info}</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}

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
            { label: 'Entradas',    real: lm.entrada.length,  prevVal: lmPrev.entrada,  leads: lm.entrada,  dateKey: 'data_entrada'    as keyof Lead, meta: mm.meta_entradas  },
            { label: 'Reu. Agend.', real: lm.ra.length,       prevVal: lmPrev.ra,       leads: lm.ra,       dateKey: 'data_ra'         as keyof Lead, meta: mm.meta_ra        },
            { label: 'Reu. Realiz.',real: lm.rr.length,       prevVal: lmPrev.rr,       leads: lm.rr,       dateKey: 'data_rr'         as keyof Lead, meta: mm.meta_rr        },
            { label: 'Vendas',      real: lm.venda.length,    prevVal: lmPrev.venda,    leads: lm.venda,    dateKey: 'data_assinatura' as keyof Lead, meta: mm.meta_vendas    },
            { label: 'Ativações',   real: lm.ativacao.length, prevVal: lmPrev.ativacao, leads: lm.ativacao, dateKey: 'data_ativacao'   as keyof Lead, meta: mm.meta_ativacoes },
          ]
          return (
            <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10 }}>
              {kpis.map((k, ki) => {
                const pct = k.meta ? Math.min(Math.round(k.real / k.meta * 100), 100) : null
                const over = !!(k.meta && k.real >= k.meta)
                const isHovered = kpiHover === k.label
                const totalKpiPages = Math.ceil(k.leads.length / KPI_PAGE)
                const pageLeads = k.leads.slice(kpiPopoverPage * KPI_PAGE, (kpiPopoverPage + 1) * KPI_PAGE)
                const popoverLeft = ki >= 3 ? 'auto' : '50%'
                const popoverRight = ki >= 3 ? 0 : 'auto'
                const popoverTransform = ki >= 3 ? 'none' : 'translateX(-50%)'
                return (
                  <div key={k.label}
                    className="anim-fade-up card-hover"
                    style={{ position: 'relative', animationDelay: `${ki * 60}ms` }}
                  >
                    <div
                      onClick={e => {
                        if (isHovered) { setKpiHover(null); setKpiPopoverRect(null); return }
                        if (k.leads.length === 0) return
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                        setKpiHover(k.label)
                        setKpiPopoverPage(0)
                        setKpiPopoverRect(rect)
                      }}
                      style={{
                        background: WHITE, borderRadius: 16, padding: '20px 20px 18px',
                        boxShadow: isHovered ? '0 8px 28px rgba(0,0,0,.10)' : '0 1px 8px rgba(0,0,0,.05)',
                        border: '1px solid #E5E7EB',
                        position: 'relative', overflow: 'hidden',
                        transition: 'border-color .2s, box-shadow .2s',
                        cursor: k.leads.length > 0 ? 'pointer' : 'default',
                      }}>
                      <div style={{ paddingLeft: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                          <div style={{ fontSize: 10, fontWeight: 800, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{k.label}</div>
                          {k.leads.length > 0 && <div style={{ fontSize: 9, color: GRAY3, fontWeight: 700 }}>ver lista</div>}
                        </div>
                        <KpiNumber value={k.real} color={GRAY1} delay={ki * 80} />
                        <div style={{ fontSize: 10, fontWeight: 700, marginTop: 3, color: k.real < k.prevVal ? R : GRAY3 }}>
                          {k.real < k.prevVal ? '▼ ' : ''}{Math.abs(k.real - k.prevVal)} vs mês ant.
                        </div>
                        {k.meta ? (
                          <div style={{ marginTop: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                              <span style={{ fontSize: 10, color: GRAY2 }}>Meta: {k.meta}</span>
                              <span style={{ fontSize: 10, fontWeight: 700, color: GRAY2 }}>{pct}%</span>
                            </div>
                            <div style={{ height: 3, background: '#EBEBEB', borderRadius: 2 }}>
                              <div className="progress-bar-fill" style={{ height: 3, borderRadius: 2, background: R, width: `${pct}%`, animationDelay: `${ki * 80 + 200}ms` }} />
                            </div>
                          </div>
                        ) : <div style={{ fontSize: 10, color: GRAY3, marginTop: 10 }}>Sem meta</div>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })()}

        {/* ── KPI Popover (fixed, fora do grid para não ser coberto) ── */}
        {kpiHover && kpiPopoverRect && (() => {
          const kpis = [
            { label: 'Entradas',    leads: lm.entrada,  dateKey: 'data_entrada'    as keyof Lead, color: BLUE },
            { label: 'Reu. Agend.', leads: lm.ra,       dateKey: 'data_ra'         as keyof Lead, color: YELLOW },
            { label: 'Reu. Realiz.',leads: lm.rr,       dateKey: 'data_rr'         as keyof Lead, color: PURPLE },
            { label: 'Vendas',      leads: lm.venda,    dateKey: 'data_assinatura' as keyof Lead, color: GREEN },
            { label: 'Ativações',   leads: lm.ativacao, dateKey: 'data_ativacao'   as keyof Lead, color: R },
          ]
          const k = kpis.find(x => x.label === kpiHover)
          if (!k) return null
          const KPI_PAGE = 10
          const totalKpiPages = Math.ceil(k.leads.length / KPI_PAGE)
          const pageLeads = k.leads.slice(kpiPopoverPage * KPI_PAGE, (kpiPopoverPage + 1) * KPI_PAGE)
          const left = Math.min(kpiPopoverRect.left, window.innerWidth - 300)
          const top  = kpiPopoverRect.bottom + 6
          const transform = 'none'
          return (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => { setKpiHover(null); setKpiPopoverRect(null) }} />
              <div style={{
                position: 'fixed', left, top, transform, width: 290, zIndex: 999,
                background: '#FFFFFF',
                border: '1px solid #E5E7EB', borderRadius: 14,
                boxShadow: '0 8px 32px rgba(0,0,0,.14)',
                overflow: 'hidden',
                animation: 'scaleIn .18s cubic-bezier(.22,1,.36,1)',
              }}>
                <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: k.color, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{k.label}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: GRAY2 }}>{k.leads.length} lead{k.leads.length !== 1 ? 's' : ''}</span>
                    <button onClick={() => { setKpiHover(null); setKpiPopoverRect(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: GRAY3, fontSize: 14, lineHeight: 1, padding: '0 2px' }}>×</button>
                  </div>
                </div>
                <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                  {pageLeads.map((l, i) => (
                    <div key={l.id} onClick={() => router.push(`/leads/${l.id}`)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderBottom: i < pageLeads.length - 1 ? '1px solid #F9FAFB' : 'none', background: i % 2 ? '#FAFAFA' : WHITE, cursor: 'pointer', transition: 'background .1s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${k.color}08` }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = i % 2 ? '#FAFAFA' : WHITE }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: GRAY1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.empresa}</div>
                        <div style={{ fontSize: 10, color: GRAY3, marginTop: 1 }}>{fmtDate(l[k.dateKey] as string) || '—'}</div>
                      </div>
                      {l.closer && (
                        <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 20, background: '#F0F0F0', color: GRAY2, whiteSpace: 'nowrap', flexShrink: 0 }}>{l.closer}</span>
                      )}
                    </div>
                  ))}
                </div>
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
            </>
          )
        })()}

        {/* ── TCV + Conversão + Funil ── */}
        {(() => {
          const mm = (() => {
            if (canalSel !== 'Canal') return metas[mesSel]?.[canalSel] || {}
            const vals = CANAIS_METAS.map(c => metas[mesSel]?.[c]).filter(Boolean)
            if (vals.length === 0) return {}
            return { meta_tcv: vals.reduce((s:number,m:any)=>s+(m.meta_tcv||0),0)||null, meta_valor_investido: vals.reduce((s:number,m:any)=>s+(m.meta_valor_investido||0),0)||null, meta_entradas: vals.reduce((s:number,m:any)=>s+(m.meta_entradas||0),0)||null, meta_vendas: vals.reduce((s:number,m:any)=>s+(m.meta_vendas||0),0)||null }
          })()
          const mt = mm.meta_tcv
          const pct = mt ? Math.min(Math.round(tcvMes / mt * 100), 999) : null
          const over = !!(mt && tcvMes >= mt)
          const isLB = canalSel === 'Lead Broker'
          const valorInvestido = lm.entrada.reduce((s: number, l: any) => s + (l.custo_broker || 0), 0)
          const cpmql = lm.entrada.length > 0 && valorInvestido > 0 ? valorInvestido / lm.entrada.length : null
          const roas = valorInvestido > 0 ? tcvMes / valorInvestido : null
          const metaVI = mm.meta_valor_investido || null
          const metaCpmql = (metaVI && mm.meta_entradas) ? metaVI / mm.meta_entradas : (metaVI && lm.entrada.length > 0 ? metaVI / lm.entrada.length : null)
          const metaRoas = (metaVI && mt) ? mt / metaVI : null
          const ticketMedioMes = lm.venda.length > 0 ? tcvMes / lm.venda.length : 0
          const metaVendas = canalSel !== 'Canal' ? metas[mesSel]?.[canalSel]?.meta_vendas || null : mm.meta_vendas
          const metaTicket = (mt && metaVendas) ? mt / metaVendas : null
          const ticketPct = metaTicket && ticketMedioMes > 0 ? Math.min(Math.round(ticketMedioMes / metaTicket * 100), 999) : null
          const ticketOver = !!(metaTicket && ticketMedioMes >= metaTicket)

          const cardTCV = (
            <div className="card-hover anim-fade-up" style={{ background: WHITE, borderRadius: 16, padding: '24px 22px', boxShadow: '0 1px 8px rgba(0,0,0,.05)', border: '1px solid rgba(0,0,0,.05)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 180 }}>
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
                  <div style={{ fontSize: 10, color: GRAY2, marginTop: 7 }}>{over ? `Meta batida! +${fmt(tcvMes - mt)}` : `Falta ${fmt(mt - tcvMes)}`}</div>
                </div>
              ) : <div style={{ fontSize: 10, color: GRAY3, marginTop: 14 }}>Sem meta definida</div>}

              {/* Ticket Médio */}
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #F0F0F0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.14em' }}>Ticket Médio</div>
                  {ticketPct !== null && <span style={{ fontSize: 10, fontWeight: 700, color: GRAY2 }}>{ticketPct}%</span>}
                </div>
                <div style={{ fontSize: 20, fontWeight: 900, color: GRAY1, lineHeight: 1, letterSpacing: '-0.02em', marginBottom: lm.venda.length > 0 ? 10 : 0 }}>
                  {lm.venda.length > 0 ? fmt(ticketMedioMes) : '—'}
                </div>
                {metaTicket && lm.venda.length > 0 && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                      <span style={{ fontSize: 10, color: GRAY2 }}>Meta: {fmt(metaTicket)}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: ticketOver ? GRAY1 : R, background: ticketOver ? '#F0F0F0' : `${R}12`, padding: '2px 7px', borderRadius: 20 }}>
                        {ticketOver ? 'Acima' : `Falta ${fmt(metaTicket - ticketMedioMes)}`}
                      </span>
                    </div>
                    <div style={{ height: 3, background: '#EBEBEB', borderRadius: 2 }}>
                      <div style={{ height: 3, borderRadius: 2, background: R, width: `${Math.min(ticketPct || 0, 100)}%`, transition: 'width .7s' }} />
                    </div>
                  </>
                )}
                {!metaTicket && lm.venda.length > 0 && <div style={{ fontSize: 10, color: GRAY3, marginTop: 4 }}>Sem meta (depende de meta TCV + Vendas)</div>}
              </div>

              {mt && forecastPipeline > 0 && (() => {
                const cov = forecastPipeline / mt
                const covGood = cov >= 3
                return (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #F0F0F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 10, color: GRAY2 }}>Cobertura pipeline</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: covGood ? GRAY1 : R, background: covGood ? '#F0F0F0' : `${R}12`, padding: '2px 8px', borderRadius: 20 }}>
                      {cov.toFixed(1)}x {covGood ? '' : '— baixo'}
                    </span>
                  </div>
                )
              })()}
            </div>
          )

          const noShows = lm.ra.filter((l: any) => l.situacao_pre_vendas === 'NO SHOW/REMARCANDO')
          const cardConversao = (
            <div className="card-hover anim-fade-up" style={{ background: WHITE, borderRadius: 16, padding: '22px 22px', boxShadow: '0 1px 8px rgba(0,0,0,.05)', border: '1px solid rgba(0,0,0,.05)', animationDelay: '60ms' }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 20 }}>Taxas de Conversão</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {[
                  { label: 'Entrada → RA', a: lm.ra.length, b: lm.entrada.length },
                  { label: 'No-Show (% das RAs)', a: noShows.length, b: lm.ra.length },
                  { label: 'RA → RR', a: lm.rr.length, b: lm.ra.length },
                  { label: 'RR → Venda', a: lm.venda.length, b: lm.rr.length },
                  { label: 'Venda → Ativação', a: lm.ativacao.length, b: lm.venda.length },
                ].map(c => (
                  <div key={c.label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
                      <span style={{ fontSize: 11, color: GRAY2, fontWeight: 600 }}>{c.label}</span>
                      <span style={{ fontSize: 15, fontWeight: 900, color: R }}>{conv(c.a, c.b)}<span style={{ fontSize: 10, fontWeight: 700 }}>%</span></span>
                    </div>
                    <div style={{ height: 3, background: '#EBEBEB', borderRadius: 3 }}>
                      <div style={{ height: 3, borderRadius: 3, background: R, width: `${convBar(c.a, c.b)}%`, transition: 'width .7s cubic-bezier(.4,0,.2,1)' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )

          const cardFunil = (
            <div className="card-hover anim-fade-up" style={{ background: WHITE, borderRadius: 16, padding: '22px 22px', boxShadow: '0 1px 8px rgba(0,0,0,.05)', border: '1px solid rgba(0,0,0,.05)', animationDelay: '120ms' }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 20 }}>Funil do Mês</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { label: 'Entrada', value: lm.entrada.length },
                  { label: 'Reu. Agend.', value: lm.ra.length },
                  { label: 'Reu. Realiz.', value: lm.rr.length },
                  { label: 'Vendas', value: lm.venda.length },
                  { label: 'Ativações', value: lm.ativacao.length },
                ].map((f, _, arr) => {
                  const max = Math.max(...arr.map(x => x.value))
                  const w = max > 0 ? Math.max(f.value / max * 100, f.value > 0 ? 7 : 0) : 0
                  return (
                    <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 11, color: GRAY2, width: 82, flexShrink: 0, fontWeight: 500 }}>{f.label}</span>
                      <div style={{ flex: 1, height: 22, background: '#F0F0F0', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 4, background: R, width: `${w}%`, maxWidth: '100%', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 8, transition: 'width .7s cubic-bezier(.4,0,.2,1)' }}>
                          {f.value > 0 && <span style={{ fontSize: 11, fontWeight: 800, color: '#FFFFFF' }}>{f.value}</span>}
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
                {cardTCV}
                {/* Valor Investido */}
                {(() => {
                  const pctVI = metaVI && valorInvestido ? Math.min(Math.round(valorInvestido / metaVI * 100), 100) : null
                  const overVI = !!(metaVI && valorInvestido >= metaVI)
                  const tierVI = [...TIERS, null].map(tier => {
                    const tLeads = lm.entrada.filter((l: any) => tier === null ? !l.tier : l.tier === tier)
                    const custo  = tLeads.reduce((s: number, l: any) => s + (l.custo_broker || 0), 0)
                    return { tier: tier ?? 'S/ TIER', volume: tLeads.length, custo }
                  }).filter(t => t.volume > 0)
                  const maxVI = Math.max(...tierVI.map(t => t.custo), 1)
                  return (
                    <div style={{ background: WHITE, borderRadius: 16, padding: '22px 20px', boxShadow: '0 1px 8px rgba(0,0,0,.05)', border: '1px solid rgba(0,0,0,.05)', display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 800, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Valor Investido</div>
                        <div style={{ fontSize: 26, fontWeight: 900, color: GRAY1, lineHeight: 1, letterSpacing: '-0.02em' }}>{fmt(valorInvestido)}</div>
                        <div style={{ fontSize: 10, color: GRAY2, marginTop: 5 }}>{lm.entrada.length} lead{lm.entrada.length !== 1 ? 's' : ''} no mês</div>
                        {metaVI && (
                          <div style={{ marginTop: 10 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                              <span style={{ fontSize: 10, color: GRAY2 }}>Meta: {fmt(metaVI)}</span>
                              <span style={{ fontSize: 10, fontWeight: 700, color: GRAY2 }}>{pctVI}%</span>
                            </div>
                            <div style={{ height: 3, background: '#EBEBEB', borderRadius: 2 }}>
                              <div style={{ height: 3, borderRadius: 2, background: R, width: `${pctVI}%`, transition: 'width .7s' }} />
                            </div>
                          </div>
                        )}
                      </div>
                      {tierVI.length > 0 && (
                        <div style={{ borderTop: '1px solid #F0F0F0', paddingTop: 12 }}>
                          <div style={{ fontSize: 9, fontWeight: 800, color: GRAY3, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Por Tier</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                            {tierVI.map(t => (
                              <div key={t.tier}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                                  <span style={{ fontSize: 10, fontWeight: 700, color: GRAY2 }}>{t.tier}</span>
                                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <span style={{ fontSize: 9, color: GRAY3, fontWeight: 600 }}>{t.volume} lead{t.volume !== 1 ? 's' : ''}</span>
                                    <span style={{ fontSize: 10, fontWeight: 800, color: GRAY1 }}>{fmt(t.custo)}</span>
                                  </div>
                                </div>
                                <div style={{ height: 2, background: '#EBEBEB', borderRadius: 1 }}>
                                  <div style={{ height: 2, borderRadius: 1, background: R, width: `${Math.round(t.custo / maxVI * 100)}%`, transition: 'width .6s' }} />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()}
                {/* CPMQL + ROAS por Tier */}
                {(() => {
                  const cpmqlBom = cpmql != null && metaCpmql != null ? cpmql <= metaCpmql : null
                  const tierData = [...TIERS, null].map(tier => {
                    const tLeads  = lm.entrada.filter((l: any) => tier === null ? !l.tier : l.tier === tier)
                    const tVendas = lm.venda.filter((l: any) => tier === null ? !l.tier : l.tier === tier)
                    const custo   = tLeads.reduce((s: number, l: any) => s + (l.custo_broker || 0), 0)
                    const tcvT    = tVendas.reduce((s: number, l: any) => s + (l.tcv || 0), 0)
                    const cpmqlT  = tLeads.length > 0 && custo > 0 ? custo / tLeads.length : null
                    const roasT   = custo > 0 ? tcvT / custo : null
                    return { tier: tier ?? 'S/ TIER', volume: tLeads.length, custo, cpmqlT, roasT }
                  }).filter(t => t.volume > 0)
                  return (
                    <div style={{ background: WHITE, borderRadius: 16, padding: '22px 20px', boxShadow: '0 1px 8px rgba(0,0,0,.05)', border: '1px solid rgba(0,0,0,.05)', display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 800, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>CPMQL</div>
                        <div style={{ fontSize: 26, fontWeight: 900, color: cpmqlBom === false ? R : GRAY1, lineHeight: 1, letterSpacing: '-0.02em' }}>{cpmql != null ? fmt(cpmql) : '—'}</div>
                        <div style={{ fontSize: 10, color: GRAY2, marginTop: 5 }}>Custo médio por lead</div>
                        {metaCpmql && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                            <span style={{ fontSize: 10, color: GRAY2 }}>Meta: {fmt(metaCpmql)}</span>
                            {cpmql != null && !cpmqlBom && (
                              <span style={{ fontSize: 10, fontWeight: 700, color: R, background: `${R}12`, padding: '2px 7px', borderRadius: 20 }}>Acima</span>
                            )}
                          </div>
                        )}
                      </div>
                      {tierData.length > 0 && (
                        <div style={{ borderTop: '1px solid #F0F0F0', paddingTop: 12 }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '4px 0', marginBottom: 6 }}>
                            <span style={{ fontSize: 9, fontWeight: 800, color: GRAY3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Tier</span>
                            <span style={{ fontSize: 9, fontWeight: 800, color: GRAY3, textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'center' }}>Leads</span>
                            <span style={{ fontSize: 9, fontWeight: 800, color: GRAY3, textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'right' }}>CPMQL</span>
                            <span style={{ fontSize: 9, fontWeight: 800, color: GRAY3, textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'right' }}>ROAS</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                            {tierData.map(t => (
                              <div key={t.tier} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid #F9FAFB' }}>
                                <span style={{ fontSize: 10, fontWeight: 700, color: GRAY1 }}>{t.tier}</span>
                                <span style={{ fontSize: 10, color: GRAY2, textAlign: 'center' }}>{t.volume}</span>
                                <span style={{ fontSize: 10, fontWeight: 700, color: t.cpmqlT && metaCpmql && t.cpmqlT > metaCpmql ? R : GRAY1, textAlign: 'right' }}>
                                  {t.cpmqlT != null ? fmt(t.cpmqlT) : '—'}
                                </span>
                                <span style={{ fontSize: 10, fontWeight: 700, color: t.roasT != null && t.roasT < 1 ? R : GRAY1, textAlign: 'right' }}>
                                  {t.roasT != null ? `${t.roasT.toFixed(1)}x` : '—'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()}
                {/* ROAS */}
                {(() => {
                  const roasBom = roas != null && metaRoas != null ? roas >= metaRoas : null
                  return (
                    <div style={{ background: WHITE, borderRadius: 16, padding: '24px 22px', boxShadow: '0 1px 8px rgba(0,0,0,.05)', border: '1px solid #E5E7EB', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 800, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>ROAS</div>
                        <div style={{ fontSize: 28, fontWeight: 900, color: roasBom === false ? R : GRAY1, lineHeight: 1, letterSpacing: '-0.02em' }}>
                          {roas != null ? `${roas.toFixed(2)}x` : '—'}
                        </div>
                        <div style={{ fontSize: 10, color: GRAY2, marginTop: 6 }}>TCV ÷ Valor investido</div>
                      </div>
                      {metaRoas ? (
                        <div style={{ marginTop: 14 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 10, color: GRAY2 }}>Meta: {metaRoas.toFixed(2)}x</span>
                            {roas != null && !roasBom && (
                              <span style={{ fontSize: 10, fontWeight: 700, color: R, background: `${R}12`, padding: '2px 7px', borderRadius: 20 }}>Abaixo</span>
                            )}
                          </div>
                          {roas != null && (
                            <div style={{ marginTop: 5 }}>
                              <div style={{ height: 3, background: '#EBEBEB', borderRadius: 2 }}>
                                <div style={{ height: 3, borderRadius: 2, background: R, width: `${Math.min(roas / metaRoas * 100, 100)}%`, transition: 'width .7s' }} />
                              </div>
                            </div>
                          )}
                        </div>
                      ) : <div style={{ fontSize: 10, color: GRAY3, marginTop: 10 }}>Sem meta</div>}
                    </div>
                  )
                })()}
              </div>
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
          <div className="card-hover anim-fade-up" style={{ background: WHITE, borderRadius: 16, padding: '22px 22px', boxShadow: '0 1px 8px rgba(0,0,0,.05)', border: '1px solid rgba(0,0,0,.05)', animationDelay: '100ms' }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 20 }}>Evolução Mensal</div>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={dadosMensais}>
                <CartesianGrid strokeDasharray="2 4" stroke="#EBEBEB" />
                <XAxis dataKey="mes" tick={{ fill: GRAY2, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fill: GRAY2, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: `${R}99`, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ ...tooltipStyle, boxShadow: '0 8px 24px rgba(0,0,0,.12)' }} formatter={(v: any, name: string) => name === 'TCV' ? [fmt(v), name] : [v, name]} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 14 }} />
                <Bar yAxisId="right" dataKey="tcv" name="TCV" fill={`${R}22`} stroke={R} strokeWidth={1} radius={[4,4,0,0]} isAnimationActive animationDuration={800} animationEasing="ease-out" />
                <Line yAxisId="left" type="monotone" dataKey="entrada" name="Entradas" stroke={GRAY3} strokeWidth={2} dot={{ r: 3, fill: WHITE, strokeWidth: 2 }} activeDot={{ r: 6, strokeWidth: 0 }} isAnimationActive animationDuration={1000} animationEasing="ease-out" />
                <Line yAxisId="left" type="monotone" dataKey="ra" name="Reu. Agend." stroke={GRAY2} strokeWidth={2} dot={{ r: 3, fill: WHITE, strokeWidth: 2 }} activeDot={{ r: 6, strokeWidth: 0 }} isAnimationActive animationDuration={1000} animationEasing="ease-out" animationBegin={80} />
                <Line yAxisId="left" type="monotone" dataKey="rr" name="Reu. Realiz." stroke={GRAY2} strokeWidth={2} dot={{ r: 3, fill: WHITE, strokeWidth: 2 }} activeDot={{ r: 6, strokeWidth: 0 }} isAnimationActive animationDuration={1000} animationEasing="ease-out" animationBegin={160} />
                <Line yAxisId="left" type="monotone" dataKey="vendas" name="Vendas" stroke={R} strokeWidth={2.5} dot={{ r: 4, fill: WHITE, strokeWidth: 2.5 }} activeDot={{ r: 7, strokeWidth: 0 }} isAnimationActive animationDuration={1000} animationEasing="ease-out" animationBegin={240} />
                <Line yAxisId="left" type="monotone" dataKey="ativacao" name="Ativações" stroke={GRAY1} strokeWidth={2} dot={{ r: 3, fill: WHITE, strokeWidth: 2 }} activeDot={{ r: 6, strokeWidth: 0 }} isAnimationActive animationDuration={1000} animationEasing="ease-out" animationBegin={320} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="card-hover anim-fade-up" style={{ background: WHITE, borderRadius: 16, padding: '22px 22px', boxShadow: '0 1px 8px rgba(0,0,0,.05)', border: '1px solid rgba(0,0,0,.05)', animationDelay: '180ms' }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 20 }}>TCV por Mês</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dadosMensais} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="2 4" stroke="#EBEBEB" />
                <XAxis dataKey="mes" tick={{ fill: GRAY2, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: GRAY2, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ ...tooltipStyle, boxShadow: '0 8px 24px rgba(0,0,0,.12)' }} formatter={(v: any) => [fmt(v), 'TCV']} cursor={{ fill: `${R}08` }} />
                <Bar dataKey="tcv" fill={R} radius={[8,8,0,0]} isAnimationActive animationDuration={800} animationEasing="ease-out" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── Comparativo de Closers ── */}
        {(() => {
          if (closerUsers.length === 0) return null
          const CLOSER_COLORS = [R, BLUE, PURPLE, GREEN, YELLOW]
          const closerStats = closerUsers.map((u, idx) => {
            const closer = u.nome
            const clColor = CLOSER_COLORS[idx % CLOSER_COLORS.length]
            const rrs     = lm.rr.filter((l: any) => l.closer === closer)
            const ras     = lm.ra.filter((l: any) => l.closer === closer)
            const vendas  = lm.venda.filter((l: any) => l.closer === closer)
            const noShows = ras.filter((l: any) => l.situacao_pre_vendas === 'NO SHOW/REMARCANDO')
            const tcvTotal    = vendas.reduce((s: number, l: any) => s + (l.tcv || 0), 0)
            const ticketMedio = vendas.length > 0 ? tcvTotal / vendas.length : 0
            const convRRVenda = rrs.length > 0 ? Math.round(vendas.length / rrs.length * 100) : 0
            const noShowRate  = ras.length > 0 ? Math.round(noShows.length / ras.length * 100) : 0
            const allTimeWins = leads.filter((l: any) => l.closer === closer && l.data_rr && l.data_assinatura)
            const avgRRVenda  = stgAvgDays(allTimeWins as Lead[], 'data_rr', 'data_assinatura')
            const perdidosC   = leads.filter((l: any) => l.closer === closer && l.motivo_perda_closer)
            const mCounts: Record<string, number> = {}
            perdidosC.forEach((l: any) => { if (l.motivo_perda_closer) mCounts[l.motivo_perda_closer] = (mCounts[l.motivo_perda_closer] || 0) + 1 })
            const topMotivo = Object.entries(mCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null
            return { closer, avatar_url: u.avatar_url, clColor, rrs: rrs.length, ras: ras.length, vendas: vendas.length, tcvTotal, ticketMedio, convRRVenda, noShowRate, avgRRVenda, topMotivo }
          })
          if (closerStats.every(s => s.rrs === 0 && s.vendas === 0)) return null
          const maxTcv = Math.max(...closerStats.map(s => s.tcvTotal), 1)
          return (
            <div style={{ background: WHITE, borderRadius: 16, padding: '22px 22px', boxShadow: '0 1px 8px rgba(0,0,0,.05)', border: '1px solid rgba(0,0,0,.05)' }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 20 }}>Comparativo de Closers — {mesFmt(mesSel)}</div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${closerUsers.length}, 1fr)`, gap: 16 }}>
                {closerStats.map((s, i) => {
                  const clColor = s.clColor
                  const primeiroNome = s.closer.split(' ')[0]
                  return (
                    <div key={s.closer} style={{ borderRadius: 12, border: `1px solid ${clColor}28`, background: `${clColor}06`, padding: '18px 20px', position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: clColor, borderRadius: '12px 0 0 12px' }} />
                      <div style={{ paddingLeft: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                          {s.avatar_url
                            ? <img src={s.avatar_url} alt={s.closer} width={28} height={28} style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: `2px solid ${clColor}40` }} />
                            : <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: clColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 900, color: WHITE }}>{primeiroNome[0]}</div>
                          }
                          <div style={{ fontSize: 13, fontWeight: 900, color: clColor, letterSpacing: '0.05em' }}>{primeiroNome}</div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
                          <div>
                            <div style={{ fontSize: 9, fontWeight: 700, color: GRAY3, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>Vendas</div>
                            <div style={{ fontSize: 24, fontWeight: 900, color: GREEN, lineHeight: 1 }}>{s.vendas}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 9, fontWeight: 700, color: GRAY3, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>Reuniões</div>
                            <div style={{ fontSize: 24, fontWeight: 900, color: clColor, lineHeight: 1 }}>{s.rrs}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 9, fontWeight: 700, color: GRAY3, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>RR → Venda</div>
                            <div style={{ fontSize: 24, fontWeight: 900, color: s.convRRVenda >= 30 ? GREEN : s.convRRVenda > 0 ? YELLOW : GRAY3, lineHeight: 1 }}>{s.convRRVenda}%</div>
                          </div>
                        </div>
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: 9, fontWeight: 700, color: GRAY3, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>TCV Total</div>
                          <div style={{ fontSize: 16, fontWeight: 900, color: GREEN }}>{fmt(s.tcvTotal)}</div>
                          <div style={{ height: 3, background: '#EBEBEB', borderRadius: 2, marginTop: 5 }}>
                            <div style={{ height: 3, borderRadius: 2, background: R, width: `${(s.tcvTotal / maxTcv) * 100}%`, transition: 'width .6s' }} />
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 9, fontWeight: 700, color: GRAY3, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>Ticket Médio</div>
                          <div style={{ fontSize: 13, fontWeight: 800, color: GRAY1 }}>{s.vendas > 0 ? fmt(s.ticketMedio) : '—'}</div>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14, paddingTop: 14, borderTop: `1px solid ${clColor}18` }}>
                        <div>
                          <div style={{ fontSize: 9, fontWeight: 700, color: GRAY3, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>No-Show</div>
                          <div style={{ fontSize: 20, fontWeight: 900, color: s.noShowRate > 30 ? R : GRAY1, lineHeight: 1 }}>{s.noShowRate}%</div>
                          <div style={{ fontSize: 9, color: GRAY3, marginTop: 2 }}>{s.ras} RAs no mês</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 9, fontWeight: 700, color: GRAY3, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>Ciclo RR→Venda</div>
                          <div style={{ fontSize: 20, fontWeight: 900, color: GRAY1, lineHeight: 1 }}>{s.avgRRVenda != null ? `${s.avgRRVenda}d` : '—'}</div>
                          <div style={{ fontSize: 9, color: GRAY3, marginTop: 2 }}>média histórica</div>
                        </div>
                      </div>
                      {s.topMotivo && (
                        <div style={{ marginTop: 10, padding: '7px 10px', background: `${R}08`, borderRadius: 8, border: `1px solid ${R}18` }}>
                          <div style={{ fontSize: 9, fontWeight: 700, color: GRAY3, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>Top motivo de perda</div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: R, lineHeight: 1.3 }}>{s.topMotivo}</div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

        {/* ── Análise por Canal ── */}
        {(() => {
          const CANAIS_LIST = ['Recovery', 'Lead Broker', 'Recomendação', 'Eventos', 'Indicação']
          const CANAL_COLORS: Record<string, string> = { 'Recovery': BLUE, 'Lead Broker': YELLOW, 'Recomendação': GREEN, 'Eventos': PURPLE, 'Indicação': '#F97316' }
          const canalData = CANAIS_LIST.map(canal => {
            const entradas = leads.filter(l => mesAno(l.data_entrada as string) === mesSel && l.origem === canal)
            const ras      = leads.filter(l => mesAno(l.data_ra as string)      === mesSel && l.origem === canal)
            const rrs      = leads.filter(l => mesAno(l.data_rr as string)      === mesSel && l.origem === canal)
            const vendas   = leads.filter(l => mesAno(l.data_assinatura as string) === mesSel && l.origem === canal)
            const tcvTotal = vendas.reduce((s, l) => s + (l.tcv || 0), 0)
            const noShows   = leads.filter(l => mesAno(l.data_ra as string) === mesSel && l.origem === canal && (l as any).situacao_pre_vendas === 'NO SHOW/REMARCANDO')
            const ativacoes = leads.filter(l => mesAno(l.data_ativacao as string) === mesSel && l.origem === canal)
            const convEntRA = entradas.length > 0 ? Math.round(ras.length    / entradas.length * 100) : 0
            const convRARR  = ras.length     > 0 ? Math.round(rrs.length    / ras.length      * 100) : 0
            const convRRV   = rrs.length     > 0 ? Math.round(vendas.length / rrs.length      * 100) : 0
            const convEntV  = entradas.length > 0 ? Math.round(vendas.length / entradas.length * 100) : 0
            const taxaNS    = ras.length     > 0 ? Math.round(noShows.length / ras.length     * 100) : 0
            const ticketMdC = vendas.length  > 0 ? tcvTotal / vendas.length : 0
            const taxaAtiv  = vendas.length  > 0 ? Math.round(ativacoes.length / vendas.length * 100) : 0
            return { canal, entradas: entradas.length, ras: ras.length, rrs: rrs.length, vendas: vendas.length, tcvTotal, convEntRA, convRARR, convRRV, convEntV, taxaNS, ticketMdC, taxaAtiv }
          }).filter(c => c.entradas > 0 || c.ras > 0 || c.rrs > 0 || c.vendas > 0)
          if (canalData.length === 0) return null
          const maxEnt = Math.max(...canalData.map(c => c.entradas), 1)
          return (
            <div style={{ background: WHITE, borderRadius: 16, padding: '22px 22px', boxShadow: '0 1px 8px rgba(0,0,0,.05)', border: '1px solid rgba(0,0,0,.05)' }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 20 }}>Análise por Canal — {mesFmt(mesSel)}</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #F0F0F0' }}>
                      {['Canal','Entradas','RAs','RRs','E2E%','Ent→RA','No-Show','RA→RR','RR→Venda','Vendas','TCV','Ticket Médio','Ativação%'].map(h => (
                        <th key={h} style={{ textAlign: h === 'Canal' ? 'left' : 'center', padding: '8px 12px', fontSize: 10, fontWeight: 700, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {canalData.map((c, i) => {
                      const cor = CANAL_COLORS[c.canal] || GRAY2
                      return (
                        <tr key={c.canal} style={{ borderBottom: '1px solid #F9F9F9', background: i % 2 ? '#FAFAFA' : WHITE }}>
                          <td style={{ padding: '10px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ width: 3, height: 28, borderRadius: 2, background: cor, flexShrink: 0 }} />
                              <div>
                                <div style={{ fontWeight: 700, color: GRAY1 }}>{c.canal}</div>
                                <div style={{ height: 3, background: '#F0F0F0', borderRadius: 2, marginTop: 4, width: 80 }}>
                                  <div style={{ height: 3, borderRadius: 2, background: cor, width: `${(c.entradas / maxEnt) * 100}%` }} />
                                </div>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: GRAY1 }}>{c.entradas}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: GRAY1 }}>{c.ras}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: GRAY1 }}>{c.rrs}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                            <span style={{ fontWeight: 900, color: c.convEntV >= 20 ? GREEN : c.convEntV > 0 ? YELLOW : GRAY3 }}>{c.convEntV}%</span>
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                            <span style={{ fontWeight: 800, color: c.convEntRA >= 50 ? GREEN : c.convEntRA > 0 ? YELLOW : GRAY3 }}>{c.convEntRA}%</span>
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                            <span style={{ fontWeight: 800, color: c.taxaNS === 0 ? GRAY3 : c.taxaNS <= 20 ? YELLOW : R }}>{c.taxaNS}%</span>
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                            <span style={{ fontWeight: 800, color: c.convRARR >= 50 ? GREEN : c.convRARR > 0 ? YELLOW : GRAY3 }}>{c.convRARR}%</span>
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                            <span style={{ fontWeight: 800, color: c.convRRV >= 30 ? GREEN : c.convRRV > 0 ? YELLOW : GRAY3 }}>{c.convRRV}%</span>
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 800, color: c.vendas > 0 ? GREEN : GRAY3 }}>{c.vendas}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 800, color: c.tcvTotal > 0 ? GREEN : GRAY3 }}>{c.tcvTotal > 0 ? fmt(c.tcvTotal) : '—'}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: c.ticketMdC > 0 ? GRAY1 : GRAY3 }}>{c.ticketMdC > 0 ? fmt(c.ticketMdC) : '—'}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                            <span style={{ fontWeight: 800, color: c.taxaAtiv >= 80 ? GREEN : c.taxaAtiv > 0 ? YELLOW : GRAY3 }}>{c.taxaAtiv > 0 ? `${c.taxaAtiv}%` : '—'}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })()}

        {/* ── Forecast + Leads Travados ── */}
        {(() => {
          const ACTIVE_STAGES = ['ENTRADA','TENTANDO CONTATO','EM QUALIFICAÇÃO','REUNIÃO AGENDADA','NO-SHOW/REMARCANDO','REUNIÃO REALIZADA','FOLLOW UP']
          const limiteDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
          const diasSem = (d: string) => Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
          const STAGE_COLORS: Record<string,string> = { 'ENTRADA': BLUE, 'TENTANDO CONTATO': '#F97316', 'EM QUALIFICAÇÃO': YELLOW, 'REUNIÃO AGENDADA': '#0D9488', 'NO-SHOW/REMARCANDO': '#92400E', 'REUNIÃO REALIZADA': PURPLE, 'FOLLOW UP': '#8B5CF6' }

          const leadsComTcv = leads.filter(l => ACTIVE_STAGES.includes(getPipelineStage(l)) && (l.tcv || 0) > 0)
          const quentes = leadsComTcv.filter(l => l.temperatura === 'QUENTE')
          const mornos  = leadsComTcv.filter(l => l.temperatura === 'MORNO')
          const tcvQ = quentes.reduce((s,l) => s + (l.tcv||0), 0)
          const tcvM = mornos.reduce((s,l)  => s + (l.tcv||0), 0)
          const forecastTotal = tcvQ * 0.7 + tcvM * 0.3
          const topLeads = [...quentes,...mornos].sort((a,b) => (b.tcv||0)-(a.tcv||0)).slice(0,5)

          const travados = leads
            .filter(l => ACTIVE_STAGES.includes(getPipelineStage(l)) && l.updated_at < limiteDate)
            .sort((a,b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime())

          return (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>

              {/* Forecast */}
              <div style={{ background:WHITE, borderRadius:16, padding:'22px 22px', boxShadow:'0 1px 8px rgba(0,0,0,.05)', border:'1px solid rgba(0,0,0,.05)' }}>
                <div style={{ fontSize:10, fontWeight:800, color:GRAY2, textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:4 }}>Forecast de Receita</div>
                <div style={{ fontSize:10, color:GRAY3, marginBottom:16 }}>Pipeline ativo com TCV — ponderado por temperatura</div>
                <div style={{ marginBottom:18 }}>
                  <div style={{ fontSize:30, fontWeight:900, color:GREEN, letterSpacing:'-0.02em', lineHeight:1 }}>{fmt(forecastTotal)}</div>
                  <div style={{ fontSize:10, color:GRAY2, marginTop:4 }}>forecast ponderado</div>
                </div>
                <div style={{ display:'flex', gap:8, marginBottom:18 }}>
                  <div style={{ flex:1, background:`${R}08`, borderRadius:10, padding:'10px 12px', border:`1px solid ${R}22` }}>
                    <div style={{ fontSize:9, fontWeight:800, color:R, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>🔥 Quente · 70%</div>
                    <div style={{ fontSize:16, fontWeight:900, color:R }}>{fmt(tcvQ*0.7)}</div>
                    <div style={{ fontSize:10, color:GRAY2, marginTop:2 }}>{quentes.length} leads · {fmt(tcvQ)} raw</div>
                  </div>
                  <div style={{ flex:1, background:'#FEF3C708', borderRadius:10, padding:'10px 12px', border:'1px solid #FDE68A' }}>
                    <div style={{ fontSize:9, fontWeight:800, color:'#B45309', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>☀️ Morno · 30%</div>
                    <div style={{ fontSize:16, fontWeight:900, color:'#B45309' }}>{fmt(tcvM*0.3)}</div>
                    <div style={{ fontSize:10, color:GRAY2, marginTop:2 }}>{mornos.length} leads · {fmt(tcvM)} raw</div>
                  </div>
                </div>
                {topLeads.length > 0 ? (
                  <>
                    <div style={{ fontSize:9, fontWeight:800, color:GRAY3, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:8 }}>Maiores oportunidades</div>
                    {topLeads.map(l => (
                      <div key={l.id} onClick={() => router.push(`/leads/${l.id}`)} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'7px 0', borderBottom:'1px solid #F3F4F6', cursor:'pointer' }}>
                        <div style={{ minWidth:0 }}>
                          <div style={{ fontSize:12, fontWeight:700, color:GRAY1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{l.empresa}</div>
                          <div style={{ fontSize:10, color:GRAY3 }}>{l.closer || '—'}</div>
                        </div>
                        <span style={{ fontSize:12, fontWeight:800, color: l.temperatura==='QUENTE' ? R : '#B45309', flexShrink:0, marginLeft:8 }}>{fmt(l.tcv||0)}</span>
                      </div>
                    ))}
                  </>
                ) : (
                  <div style={{ textAlign:'center', padding:24, fontSize:12, color:GRAY3 }}>Nenhum lead ativo com TCV definido</div>
                )}
              </div>

              {/* Leads Travados */}
              <div style={{ background:WHITE, borderRadius:16, padding:'22px 22px', boxShadow:'0 1px 8px rgba(0,0,0,.05)', border:'1px solid rgba(0,0,0,.05)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                  <div style={{ fontSize:10, fontWeight:800, color:GRAY2, textTransform:'uppercase', letterSpacing:'0.12em' }}>Leads Travados</div>
                  {travados.length > 0 && <span style={{ fontSize:10, fontWeight:800, color:'#F97316', background:'#FFF7ED', border:'1px solid #FED7AA', padding:'2px 8px', borderRadius:20 }}>{travados.length} lead{travados.length>1?'s':''}</span>}
                </div>
                <div style={{ fontSize:10, color:GRAY3, marginBottom:16 }}>Sem interação há mais de 7 dias</div>
                {travados.length === 0 ? (
                  <div style={{ textAlign:'center', padding:40, fontSize:13, color:GRAY3 }}>✓ Nenhum lead travado</div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:340, overflowY:'auto' }}>
                    {travados.slice(0,10).map(l => {
                      const dias = diasSem(l.updated_at)
                      const stage = getPipelineStage(l)
                      const sc = STAGE_COLORS[stage] || GRAY2
                      return (
                        <div key={l.id} onClick={() => router.push(`/leads/${l.id}`)} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'9px 12px', background:'#FFF7ED', borderRadius:10, border:'1px solid #FED7AA', cursor:'pointer' }}>
                          <div style={{ minWidth:0 }}>
                            <div style={{ fontSize:12, fontWeight:700, color:GRAY1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{l.empresa}</div>
                            <div style={{ fontSize:10, color:GRAY2, marginTop:2 }}>
                              <span style={{ color:sc, fontWeight:700 }}>{stage}</span>
                              {l.closer ? ` · ${l.closer}` : ''}
                            </div>
                          </div>
                          <span style={{ fontSize:11, fontWeight:800, color:'#C2410C', background:'#FED7AA', padding:'3px 9px', borderRadius:20, flexShrink:0, marginLeft:8, whiteSpace:'nowrap' }}>{dias}d parado</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

            </div>
          )
        })()}

        {/* ── Próximos FUPs ── */}
        {(() => {
          const hoje = new Date().toISOString().slice(0, 10)
          const naoEhPerdido = (l: any) => getPipelineStage(l) !== 'PERDIDO'
          const vencidos = leads.filter(l => l.data_fup && l.data_fup < hoje && naoEhPerdido(l)).sort((a,b) => new Date(a.data_fup!).getTime() - new Date(b.data_fup!).getTime())
          const proximos = leads.filter(l => l.data_fup && l.data_fup >= hoje && naoEhPerdido(l)).sort((a,b) => new Date(a.data_fup!).getTime() - new Date(b.data_fup!).getTime()).slice(0, 8)
          const fupCardStyle = (overdue: boolean) => ({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', background: overdue ? `${R}06` : '#F9F8F6', borderRadius: 10, border: `1px solid ${overdue ? `${R}30` : '#EEEDE8'}`, cursor: 'pointer', textDecoration: 'none', transition: 'opacity .15s' })
          return (
            <div style={{ background: WHITE, borderRadius: 16, padding: '22px 22px', boxShadow: '0 1px 8px rgba(0,0,0,.05)', border: '1px solid rgba(0,0,0,.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.12em' }}>Follow Ups</div>
                {vencidos.length > 0 && <span style={{ fontSize: 10, fontWeight: 800, color: R, background: `${R}12`, border: `1px solid ${R}30`, padding: '2px 8px', borderRadius: 20 }}>{vencidos.length} vencido{vencidos.length > 1 ? 's' : ''}</span>}
              </div>
              {vencidos.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: R, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>⚠️ Vencidos</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 8 }}>
                    {vencidos.map(l => (
                      <a key={l.id} href={`/leads/${l.id}?from=dashboard`} onClick={e => { if (!e.metaKey && !e.ctrlKey && !e.shiftKey) { e.preventDefault(); router.push(`/leads/${l.id}?from=dashboard`) } }} style={fupCardStyle(true)}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: GRAY1 }}>{l.empresa}</div>
                          <div style={{ fontSize: 11, color: GRAY2, marginTop: 2 }}>{l.closer}{l.proximos_passos ? ` · ${l.proximos_passos?.slice(0,30)}` : ''}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
                          <TempBadge temp={l.temperatura} />
                          <span style={{ fontSize: 11, fontWeight: 700, color: R, background: `${R}10`, border: `1px solid ${R}22`, padding: '3px 9px', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                            <Clock size={10} />Vencido {fmtDate(l.data_fup)}
                          </span>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {proximos.length > 0 && (
                <div>
                  {vencidos.length > 0 && <div style={{ fontSize: 10, fontWeight: 800, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Próximos</div>}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 8 }}>
                    {proximos.map(l => (
                      <a key={l.id} href={`/leads/${l.id}?from=dashboard`} onClick={e => { if (!e.metaKey && !e.ctrlKey && !e.shiftKey) { e.preventDefault(); router.push(`/leads/${l.id}?from=dashboard`) } }} style={fupCardStyle(false)}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: GRAY1 }}>{l.empresa}</div>
                          <div style={{ fontSize: 11, color: GRAY2, marginTop: 2 }}>{l.closer}{l.proximos_passos ? ` · ${l.proximos_passos?.slice(0,30)}` : ''}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
                          <TempBadge temp={l.temperatura} />
                          <span style={{ fontSize: 11, fontWeight: 700, color: R, background: `${R}10`, border: `1px solid ${R}22`, padding: '3px 9px', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                            <Clock size={10} />{fmtDate(l.data_fup)}
                          </span>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {vencidos.length === 0 && proximos.length === 0 && (
                <div style={{ textAlign: 'center', padding: 32, fontSize: 13, color: GRAY2 }}>Nenhum FUP agendado</div>
              )}
            </div>
          )
        })()}

        {/* ── Motivos de Perda ── */}
        {(() => {
          const perdidos = leads.filter(l => getPipelineStage(l) === 'PERDIDO')
          const contarMotivos = (campo: 'motivo_perda_pre_vendas' | 'motivo_perda_closer') => {
            const acc: Record<string,number> = {}
            perdidos.forEach(l => { const m = l[campo]; if (m) acc[m] = (acc[m]||0)+1 })
            return Object.entries(acc).sort((a,b) => b[1]-a[1])
          }
          const motivosPV = contarMotivos('motivo_perda_pre_vendas')
          const motivosC  = contarMotivos('motivo_perda_closer')
          if (perdidos.length === 0 || (motivosPV.length === 0 && motivosC.length === 0)) return null
          const maxPV = motivosPV[0]?.[1] || 1
          const maxC  = motivosC[0]?.[1]  || 1
          return (
            <div style={{ background:WHITE, borderRadius:16, padding:'22px 22px', boxShadow:'0 1px 8px rgba(0,0,0,.05)', border:'1px solid rgba(0,0,0,.05)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
                <div style={{ fontSize:10, fontWeight:800, color:GRAY2, textTransform:'uppercase', letterSpacing:'0.12em' }}>Motivos de Perda</div>
                <span style={{ fontSize:10, fontWeight:700, color:GRAY2, background:GRAY4, padding:'2px 8px', borderRadius:20 }}>{perdidos.length} leads perdidos</span>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:32 }}>
                <div>
                  <div style={{ fontSize:9, fontWeight:800, color:GRAY3, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:14 }}>Pré-Vendas (BDR)</div>
                  {motivosPV.length === 0 ? <div style={{ fontSize:12, color:GRAY3 }}>Sem dados registrados</div> : motivosPV.map(([motivo, count]) => (
                    <div key={motivo} style={{ marginBottom:12 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                        <span style={{ fontSize:11, color:GRAY1, fontWeight:600 }}>{motivo}</span>
                        <span style={{ fontSize:11, fontWeight:800, color:R }}>{count}</span>
                      </div>
                      <div style={{ height:4, background:'#F0F0F0', borderRadius:2 }}>
                        <div style={{ height:4, borderRadius:2, background:R, width:`${(count/maxPV)*100}%`, transition:'width .6s' }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ fontSize:9, fontWeight:800, color:GRAY3, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:14 }}>Closer</div>
                  {motivosC.length === 0 ? <div style={{ fontSize:12, color:GRAY3 }}>Sem dados registrados</div> : motivosC.map(([motivo, count]) => (
                    <div key={motivo} style={{ marginBottom:12 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                        <span style={{ fontSize:11, color:GRAY1, fontWeight:600 }}>{motivo}</span>
                        <span style={{ fontSize:11, fontWeight:800, color:PURPLE }}>{count}</span>
                      </div>
                      <div style={{ height:4, background:'#F0F0F0', borderRadius:2 }}>
                        <div style={{ height:4, borderRadius:2, background:PURPLE, width:`${(count/maxC)*100}%`, transition:'width .6s' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )
        })()}

      </div>
    </CRMLayout>
  )
}
