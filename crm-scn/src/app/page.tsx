'use client'
export const dynamic = 'force-dynamic'
import React, { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Lead } from '@/lib/supabase'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts'
import { Clock } from 'lucide-react'
import CRMLayout from './_components/CRMLayout'
import { TempBadge } from '@/lib/crm-badges'
import {
  R, WHITE, GRAY1, GRAY2, GRAY3, GRAY4, GREEN, BLUE, YELLOW, PURPLE,
  CANAIS, CANAIS_METAS, CLOSERS, TIERS,
  mesAno, fmt, fmtDate, mesFmt, inputCls, labelCls,
} from '@/lib/crm-constants'

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

  const [kpiHover, setKpiHover] = useState<string | null>(null)
  const [kpiPopoverPage, setKpiPopoverPage] = useState(0)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      fetchLeads()
      fetchMetas()
    })
  }, [])

  async function fetchLeads() {
    setLoading(true)
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

  const navMes = (dir: number) => {
    const [y, m] = mesSel.split('-').map(Number)
    const d = new Date(y, m - 1 + dir)
    setMesSel(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

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
  const tooltipStyle = { background: WHITE, border: '1px solid #E5E7EB', borderRadius: 8, color: GRAY1, fontSize: 12 }

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
                    {isHovered && k.leads.length > 0 && (
                      <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: popoverLeft, right: popoverRight, transform: popoverTransform, width: 290, background: WHITE, border: '1px solid #E5E7EB', borderRadius: 14, boxShadow: '0 10px 36px rgba(0,0,0,.16)', zIndex: 200, overflow: 'hidden' }}>
                        <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 11, fontWeight: 800, color: k.color, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{k.label}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, color: GRAY2 }}>{k.leads.length} lead{k.leads.length !== 1 ? 's' : ''}</span>
                        </div>
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

        {/* ── TCV + Conversão + Funil ── */}
        {(() => {
          const mm = (() => {
            if (canalSel !== 'Canal') return metas[mesSel]?.[canalSel] || {}
            const vals = CANAIS_METAS.map(c => metas[mesSel]?.[c]).filter(Boolean)
            if (vals.length === 0) return {}
            return { meta_tcv: vals.reduce((s:number,m:any)=>s+(m.meta_tcv||0),0)||null, meta_valor_investido: vals.reduce((s:number,m:any)=>s+(m.meta_valor_investido||0),0)||null, meta_entradas: vals.reduce((s:number,m:any)=>s+(m.meta_entradas||0),0)||null }
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
                {cardTCV}
                {/* Valor Investido */}
                {(() => {
                  const pctVI = metaVI && valorInvestido ? Math.min(Math.round(valorInvestido / metaVI * 100), 100) : null
                  const overVI = !!(metaVI && valorInvestido >= metaVI)
                  return (
                    <div style={{ background: WHITE, borderRadius: 16, padding: '24px 22px', boxShadow: '0 1px 8px rgba(0,0,0,.05)', border: '1px solid rgba(0,0,0,.05)', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: YELLOW, borderRadius: '16px 0 0 16px' }} />
                      <div style={{ paddingLeft: 10 }}>
                        <div style={{ fontSize: 10, fontWeight: 800, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>Valor Investido</div>
                        <div style={{ fontSize: 28, fontWeight: 900, color: GRAY1, lineHeight: 1, letterSpacing: '-0.02em' }}>{fmt(valorInvestido)}</div>
                        <div style={{ fontSize: 10, color: GRAY2, marginTop: 6 }}>{lm.entrada.length} lead{lm.entrada.length !== 1 ? 's' : ''} no mês</div>
                      </div>
                      {metaVI ? (
                        <div style={{ marginTop: 14, paddingLeft: 10 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                            <span style={{ fontSize: 10, color: GRAY2 }}>Meta: {fmt(metaVI)}</span>
                            <span style={{ fontSize: 10, fontWeight: 900, color: overVI ? GREEN : YELLOW, background: overVI ? `${GREEN}14` : `${YELLOW}14`, padding: '2px 7px', borderRadius: 20 }}>{pctVI}%</span>
                          </div>
                          <div style={{ height: 3, background: '#EBEBEB', borderRadius: 2 }}>
                            <div style={{ height: 3, borderRadius: 2, background: overVI ? GREEN : YELLOW, width: `${pctVI}%`, transition: 'width .7s' }} />
                          </div>
                        </div>
                      ) : <div style={{ fontSize: 10, color: GRAY3, marginTop: 10, paddingLeft: 10 }}>Sem meta</div>}
                    </div>
                  )
                })()}
                {/* CPMQL */}
                {(() => {
                  const cpmqlBom = cpmql != null && metaCpmql != null ? cpmql <= metaCpmql : null
                  return (
                    <div style={{ background: WHITE, borderRadius: 16, padding: '24px 22px', boxShadow: '0 1px 8px rgba(0,0,0,.05)', border: '1px solid rgba(0,0,0,.05)', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: PURPLE, borderRadius: '16px 0 0 16px' }} />
                      <div style={{ paddingLeft: 10 }}>
                        <div style={{ fontSize: 10, fontWeight: 800, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>CPMQL</div>
                        <div style={{ fontSize: 28, fontWeight: 900, color: cpmqlBom === true ? GREEN : cpmqlBom === false ? R : GRAY1, lineHeight: 1, letterSpacing: '-0.02em' }}>{cpmql != null ? fmt(cpmql) : '—'}</div>
                        <div style={{ fontSize: 10, color: GRAY2, marginTop: 6 }}>Custo médio por lead</div>
                      </div>
                      {metaCpmql ? (
                        <div style={{ marginTop: 14, paddingLeft: 10 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 10, color: GRAY2 }}>Meta: {fmt(metaCpmql)}</span>
                            {cpmql != null && (
                              <span style={{ fontSize: 10, fontWeight: 900, color: cpmqlBom ? GREEN : R, background: cpmqlBom ? `${GREEN}14` : `${R}14`, padding: '2px 7px', borderRadius: 20 }}>
                                {cpmqlBom ? '✓ OK' : '↑ Acima'}
                              </span>
                            )}
                          </div>
                        </div>
                      ) : <div style={{ fontSize: 10, color: GRAY3, marginTop: 10, paddingLeft: 10 }}>Sem meta</div>}
                    </div>
                  )
                })()}
                {/* ROAS */}
                {(() => {
                  const roasColor = roas != null && roas >= 1 ? GREEN : R
                  const roasBom = roas != null && metaRoas != null ? roas >= metaRoas : null
                  return (
                    <div style={{ background: WHITE, borderRadius: 16, padding: '24px 22px', boxShadow: '0 1px 8px rgba(0,0,0,.05)', border: '1px solid rgba(0,0,0,.05)', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: roasColor, borderRadius: '16px 0 0 16px' }} />
                      <div style={{ paddingLeft: 10 }}>
                        <div style={{ fontSize: 10, fontWeight: 800, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>ROAS</div>
                        <div style={{ fontSize: 28, fontWeight: 900, color: roasColor, lineHeight: 1, letterSpacing: '-0.02em' }}>
                          {roas != null ? `${roas.toFixed(2)}x` : '—'}
                        </div>
                        <div style={{ fontSize: 10, color: GRAY2, marginTop: 6 }}>TCV ÷ Valor investido</div>
                      </div>
                      {metaRoas ? (
                        <div style={{ marginTop: 14, paddingLeft: 10 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 10, color: GRAY2 }}>Meta: {metaRoas.toFixed(2)}x</span>
                            {roas != null && (
                              <span style={{ fontSize: 10, fontWeight: 900, color: roasBom ? GREEN : R, background: roasBom ? `${GREEN}14` : `${R}14`, padding: '2px 7px', borderRadius: 20 }}>
                                {roasBom ? '✓ OK' : '↓ Abaixo'}
                              </span>
                            )}
                          </div>
                          {roas != null && (
                            <div style={{ marginTop: 5 }}>
                              <div style={{ height: 3, background: '#EBEBEB', borderRadius: 2 }}>
                                <div style={{ height: 3, borderRadius: 2, background: roasBom ? GREEN : R, width: `${Math.min(roas / metaRoas * 100, 100)}%`, transition: 'width .7s' }} />
                              </div>
                            </div>
                          )}
                        </div>
                      ) : <div style={{ fontSize: 10, color: GRAY3, marginTop: 10, paddingLeft: 10 }}>Sem meta</div>}
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
    </CRMLayout>
  )
}
