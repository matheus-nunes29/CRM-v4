'use client'
export const dynamic = 'force-dynamic'
import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Lead } from '@/lib/supabase'
import { Users, Search, Edit2, Trash2 } from 'lucide-react'
import CRMLayout from '../_components/CRMLayout'
import { useUserRole } from '@/lib/useUserRole'
import { toast } from '@/lib/toast'
import { SpvBadge, SitBadge } from '@/lib/crm-badges'
import {
  R, WHITE, GRAY1, GRAY2, GRAY3, GRAY4, GREEN,
  TEMPERATURAS, SITUACOES, SITUACOES_PRE_VENDAS, ORIGENS,
  mesAno, fmt, fmtDate, mesFmt,
  inputCls, labelCls,
} from '@/lib/crm-constants'
import { useCloserUsers } from '@/lib/useCloserUsers'
import { getPipelineStage, PIPELINE_STAGES } from '@/lib/crm-pipeline'

function tempoRelativo(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `há ${d}d`
  const w = Math.floor(d / 7)
  if (w < 5) return `há ${w} sem`
  const mo = Math.floor(d / 30)
  return `há ${mo} mes${mo !== 1 ? 'es' : ''}`
}

const EMPTY_FILTERS = { closer:'', temperatura:'', situacao:'', origem:'', tier:'', mes_entrada:'', mes_ra:'', mes_rr:'', mes_venda:'', mes_ativacao:'', situacao_pre_vendas:'' }

const STAGE_COLOR: Record<string, string> = Object.fromEntries(
  PIPELINE_STAGES.map(s => [s.key, s.color])
)
const STAGE_LABEL: Record<string, string> = Object.fromEntries(
  PIPELINE_STAGES.map(s => [s.key, s.label])
)

function EtapaBadge({ lead }: { lead: any }) {
  const key = getPipelineStage(lead)
  const color = STAGE_COLOR[key] || GRAY2
  const label = STAGE_LABEL[key] || key
  return (
    <span style={{ display: 'inline-block', padding: '3px 9px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: `${color}18`, color, border: `1px solid ${color}33`, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  )
}

export default function LeadsPage() {
  const router = useRouter()
  const { canEdit } = useUserRole()
  const closerUsers = useCloserUsers()
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [search, setSearch] = useState(() => {
    if (typeof window === 'undefined') return ''
    return sessionStorage.getItem('leads-search') || ''
  })
  const [filters, setFilters] = useState(() => {
    if (typeof window === 'undefined') return EMPTY_FILTERS
    try {
      const stored = sessionStorage.getItem('leads-filters')
      return stored ? { ...EMPTY_FILTERS, ...JSON.parse(stored) } : EMPTY_FILTERS
    } catch { return EMPTY_FILTERS }
  })
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [filterOpen, setFilterOpen] = useState(false)
  const [draftFilters, setDraftFilters] = useState({
    closer:'', temperatura:'', situacao:'', origem:'', tier:'',
    mes_entrada:'', mes_ra:'', mes_rr:'', mes_venda:'', mes_ativacao:'', situacao_pre_vendas:''
  })
  const PAGE_SIZE = 50

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      fetchLeads()
    })
  }, [])

  useEffect(() => {
    const channel = supabase
      .channel('leads-list-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, fetchLeads)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  useEffect(() => { setPage(1); setSelected(new Set()) }, [search, filters])
  useEffect(() => { sessionStorage.setItem('leads-search', search) }, [search])
  useEffect(() => { sessionStorage.setItem('leads-filters', JSON.stringify(filters)) }, [filters])

  async function fetchLeads() {
    setLoading(true)
    setFetchError(null)
    try {
      const { data, error } = await supabase.from('leads').select('*').order('updated_at', { ascending: false })
      if (error) throw error
      setLeads(data || [])
    } catch (e: any) {
      setFetchError('Erro ao carregar leads. Verifique sua conexão e tente novamente.')
      setLeads([])
    } finally {
      setLoading(false)
    }
  }

  function exportCSV() {
    const headers = ['Empresa','Lead','Telefone','Email','Origem','Etapa','Sit. BDR','Sit. Closer','Closer','Segmento','Faturamento','Tier','TCV','Temperatura','Data Entrada','Data RA','Data RR','Data Assinatura','Data Ativação','BANT','Data FUP']
    const rows = filtered.map(l => [
      l.empresa||'', (l as any).nome_lead||'', l.telefone||'', (l as any).email||'',
      l.origem||'', getPipelineStage(l), (l as any).situacao_pre_vendas||'', l.situacao_closer||'',
      l.closer||'', l.segmento||'', l.faturamento||'', l.tier||'',
      l.tcv||'', l.temperatura||'',
      l.data_entrada||'', l.data_ra||'', l.data_rr||'', l.data_assinatura||'', l.data_ativacao||'',
      l.bant||'', l.data_fup||'',
    ])
    const csv = [headers,...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF'+csv], { type:'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `leads_${new Date().toISOString().slice(0,10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  function deleteLead(id: string) {
    const lead = leads.find(l => l.id === id)
    if (!lead) return
    setLeads(prev => prev.filter(l => l.id !== id))
    let undone = false
    const timer = setTimeout(() => { if (!undone) supabase.from('leads').delete().eq('id', id) }, 5000)
    toast.info(`"${lead.empresa}" excluído`, {
      duration: 5200,
      action: {
        label: 'Desfazer',
        onClick: () => {
          undone = true
          clearTimeout(timer)
          setLeads(prev => [lead, ...prev].sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime()))
        },
      },
    })
  }

  function deleteSelected() {
    const ids = Array.from(selected)
    const removed = leads.filter(l => ids.includes(l.id))
    setLeads(prev => prev.filter(l => !ids.includes(l.id)))
    setSelected(new Set())
    let undone = false
    const timer = setTimeout(async () => {
      if (undone) return
      const CHUNK = 50
      for (let i = 0; i < ids.length; i += CHUNK) {
        await supabase.from('leads').delete().in('id', ids.slice(i, i + CHUNK))
      }
    }, 5000)
    toast.info(`${ids.length} lead${ids.length > 1 ? 's' : ''} excluído${ids.length > 1 ? 's' : ''}`, {
      duration: 5200,
      action: {
        label: 'Desfazer',
        onClick: () => {
          undone = true
          clearTimeout(timer)
          setLeads(prev => [...prev, ...removed].sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime()))
        },
      },
    })
  }

  const filtered = useMemo(() => leads.filter(l =>
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
  ), [leads, search, filters])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pagedLeads = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const allPageSelected = pagedLeads.length > 0 && pagedLeads.every(l => selected.has(l.id))

  const emptyFilters = EMPTY_FILTERS
  const activeFilters = [
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

  if (loading) {
    return (
      <CRMLayout>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, flexDirection: 'column', gap: 12 }}>
          <div style={{ width: 36, height: 36, border: `3px solid ${GRAY3}`, borderTopColor: '#7C3AED', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
          <span style={{ fontSize: 13, color: GRAY2 }}>Carregando...</span>
        </div>
      </CRMLayout>
    )
  }

  if (fetchError) {
    return (
      <CRMLayout>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 32 }}>⚠️</div>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#B91C1C' }}>{fetchError}</span>
          <button onClick={fetchLeads} style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: R, color: '#FFF', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            Tentar novamente
          </button>
        </div>
      </CRMLayout>
    )
  }

  return (
    <CRMLayout>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: GRAY1, margin: 0 }}>Leads</h1>
            <p style={{ fontSize: 13, color: GRAY2, marginTop: 4 }}>{filtered.length} de {leads.length} leads • página {page} de {totalPages}</p>
          </div>
          <button onClick={exportCSV} style={{ display:'flex', alignItems:'center', gap:6, padding:'9px 16px', borderRadius:10, border:'1px solid #E5E7EB', background:WHITE, color:GRAY1, fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 1px 4px rgba(0,0,0,.06)' }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 2v9M5 8l3 3 3-3M3 13h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Exportar CSV
          </button>
          {canEdit && selected.size > 0 && (
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

        {/* Filter bar */}
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <div style={{ position:'relative' }}>
              <Search size={14} style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:GRAY2 }} />
              <input style={{ ...inputCls, paddingLeft:34, width:280 }} placeholder="Buscar empresa, lead ou closer..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div style={{ position:'relative' }}>
              <button onClick={() => { setDraftFilters({...filters}); setFilterOpen(v => !v) }}
                style={{ display:'flex', alignItems:'center', gap:7, padding:'9px 16px', borderRadius:10, border:'1px solid #E5E7EB', background:WHITE, color:GRAY1, fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 1px 4px rgba(0,0,0,.06)', whiteSpace:'nowrap' }}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M4 8h8M6 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                Adicionar Filtro
                {activeFilters.length > 0 && <span style={{ background:R, color:WHITE, borderRadius:'50%', width:17, height:17, fontSize:10, fontWeight:900, display:'flex', alignItems:'center', justifyContent:'center' }}>{activeFilters.length}</span>}
              </button>
              {filterOpen && (
                <>
                  <div style={{ position:'fixed', inset:0, zIndex:49 }} onClick={() => setFilterOpen(false)} />
                  <div style={{ position:'absolute', left:0, top:'calc(100% + 8px)', background:WHITE, border:'1px solid #E5E7EB', borderRadius:16, boxShadow:'0 8px 32px rgba(0,0,0,.14)', zIndex:50, width:500, padding:24 }}>
                    <div style={{ fontSize:15, fontWeight:800, color:GRAY1, marginBottom:4 }}>Personalize seu filtro</div>
                    <div style={{ fontSize:12, color:GRAY2, marginBottom:20 }}>Escolha os filtros e as opções desejadas.</div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14 }}>
                      <div>
                        <label style={labelCls}>Closer</label>
                        <select style={inputCls} value={draftFilters.closer} onChange={e => setDraftFilters(p=>({...p,closer:e.target.value}))}>
                          <option value="">Todos</option>
                          {closerUsers.map(u=><option key={u.nome} value={u.nome}>{u.nome}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={labelCls}>Temperatura</label>
                        <select style={inputCls} value={draftFilters.temperatura} onChange={e => setDraftFilters(p=>({...p,temperatura:e.target.value}))}>
                          <option value="">Todas</option>
                          {TEMPERATURAS.map(t=><option key={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={labelCls}>Tier</label>
                        <select style={inputCls} value={draftFilters.tier} onChange={e => setDraftFilters(p=>({...p,tier:e.target.value}))}>
                          <option value="">Todos</option>
                          {['TINY','SMALL','MEDIUM','LARGE','ENTERPRISE'].map(t=><option key={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={labelCls}>Origem</label>
                        <select style={inputCls} value={draftFilters.origem} onChange={e => setDraftFilters(p=>({...p,origem:e.target.value}))}>
                          <option value="">Todas</option>
                          {ORIGENS.map(o=><option key={o}>{o}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={labelCls}>Sit. BDR</label>
                        <select style={inputCls} value={draftFilters.situacao_pre_vendas} onChange={e => setDraftFilters(p=>({...p,situacao_pre_vendas:e.target.value}))}>
                          <option value="">Todas</option>
                          {SITUACOES_PRE_VENDAS.map(s=><option key={s}>{s}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={labelCls}>Sit. Closer</label>
                        <select style={inputCls} value={draftFilters.situacao} onChange={e => setDraftFilters(p=>({...p,situacao:e.target.value}))}>
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
                      ] as { key: keyof typeof draftFilters; label: string; dataKey: keyof Lead }[]).map(f => {
                        const months = Array.from(new Set(leads.map(l => mesAno(l[f.dataKey] as string)).filter(Boolean))).sort().reverse() as string[]
                        return (
                          <div key={f.key}>
                            <label style={labelCls}>{f.label}</label>
                            <select style={inputCls} value={draftFilters[f.key]} onChange={e => setDraftFilters(p=>({...p,[f.key]:e.target.value}))}>
                              <option value="">Todos</option>
                              {months.map(m=><option key={m} value={m}>{mesFmt(m)}</option>)}
                            </select>
                          </div>
                        )
                      })}
                    </div>
                    <div style={{ display:'flex', gap:10, marginTop:20 }}>
                      <button onClick={() => { setFilters(emptyFilters); setDraftFilters(emptyFilters); setSearch(''); setFilterOpen(false) }}
                        style={{ flex:1, padding:'10px 0', borderRadius:10, border:'1px solid #E5E7EB', background:WHITE, color:GRAY1, fontSize:13, fontWeight:700, cursor:'pointer' }}>Limpar</button>
                      <button onClick={() => { setFilters({...draftFilters}); setFilterOpen(false) }}
                        style={{ flex:2, padding:'10px 0', borderRadius:10, border:'none', background:R, color:WHITE, fontSize:13, fontWeight:800, cursor:'pointer' }}>Aplicar</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
          {activeFilters.length > 0 && (
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {activeFilters.map(f => (
                <span key={f.key} style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:20, background:`${R}10`, border:`1px solid ${R}30`, fontSize:12, fontWeight:700, color:R }}>
                  {f.label}
                  <button onClick={f.onRemove} style={{ background:'none', border:'none', cursor:'pointer', color:R, padding:0, display:'flex', lineHeight:1 }}>×</button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Table */}
        <div style={{ background: WHITE, borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,.06)', border: '1px solid #E5E7EB', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #E5E7EB', background: GRAY4 }}>
                  {canEdit && <th style={{ padding:'10px 12px', width:40, minWidth:40 }}>
                    <input type="checkbox" checked={allPageSelected}
                      onChange={e => {
                        const next = new Set(selected)
                        if (e.target.checked) pagedLeads.forEach(l => next.add(l.id))
                        else pagedLeads.forEach(l => next.delete(l.id))
                        setSelected(next)
                      }}
                      style={{ cursor:'pointer', width:15, height:15, accentColor:R }} />
                  </th>}
                  {[
                    { h:'Empresa', w:200 },
                    { h:'Lead', w:150 },
                    { h:'Faturamento / Tier', w:140 },
                    { h:'Etapa', w:160 },
                    { h:'Última Interação', w:130 },
                    { h:'Pré-Venda', w:180 },
                    { h:'Venda', w:160 },
                    ...(filters.origem === 'Lead Broker' ? [{ h:'Custo Broker', w:130 }] : []),
                    { h:'', w:72 },
                  ].map(({ h, w }) => (
                    <th key={h} style={{ textAlign:'left', padding:'10px 12px', fontSize:10, fontWeight:700, color:GRAY2, textTransform:'uppercase', letterSpacing:'0.07em', whiteSpace:'nowrap', minWidth:w, width:w }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedLeads.map((l, i) => (
                  <tr key={l.id} className="table-row" style={{ borderBottom:'1px solid #F3F4F6', background: selected.has(l.id) ? `${R}08` : i%2 ? GRAY4 : WHITE, animation: `fadeUp .3s cubic-bezier(.22,1,.36,1) ${i * 20}ms both` }}>
                    {canEdit && <td style={{ padding:'10px 12px' }}>
                      <input type="checkbox" checked={selected.has(l.id)}
                        onChange={e => {
                          const next = new Set(selected)
                          if (e.target.checked) next.add(l.id); else next.delete(l.id)
                          setSelected(next)
                        }}
                        style={{ cursor:'pointer', width:15, height:15, accentColor:R }} />
                    </td>}
                    {/* Empresa */}
                    <td style={{ padding:'10px 12px' }}>
                      <a href={`/leads/${l.id}?from=leads`} onClick={e => { if (!e.metaKey && !e.ctrlKey && !e.shiftKey) { e.preventDefault(); router.push(`/leads/${l.id}?from=leads`) } }} style={{ fontWeight:700, color:R, cursor:'pointer', textDecoration:'none' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.textDecoration='underline'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.textDecoration='none'}>
                        {l.empresa}
                      </a>
                      {l.segmento && <div style={{ fontSize:11, color:GRAY2, marginTop:1 }}>{l.segmento}</div>}
                    </td>
                    {/* Lead */}
                    <td style={{ padding:'10px 12px' }}>
                      <div style={{ fontSize:13, fontWeight:500, color:GRAY1 }}>{(l as any).nome_lead || '—'}</div>
                      {l.cargo && <div style={{ fontSize:11, color:GRAY2, marginTop:1 }}>{l.cargo}</div>}
                    </td>
                    {/* Faturamento / Tier */}
                    <td style={{ padding:'10px 12px' }}>
                      {l.faturamento
                        ? <div style={{ fontSize:12, fontWeight:600, color:GRAY1 }}>{l.faturamento}</div>
                        : <div style={{ fontSize:12, color:GRAY3 }}>—</div>}
                      {l.tier && <span style={{ display:'inline-block', marginTop:3, fontSize:10, fontWeight:800, padding:'2px 7px', borderRadius:20, background:`${R}12`, color:R }}>{l.tier}</span>}
                    </td>
                    {/* Etapa */}
                    <td style={{ padding:'10px 12px' }}>
                      <EtapaBadge lead={l} />
                    </td>
                    {/* Última interação */}
                    <td style={{ padding:'10px 12px' }}>
                      <span style={{ fontSize:12, fontWeight:600, color:GRAY2 }}>
                        {tempoRelativo(l.updated_at)}
                      </span>
                      <div style={{ fontSize:11, color:GRAY3, marginTop:1 }}>
                        {l.updated_at ? new Date(l.updated_at).toLocaleDateString('pt-BR') : ''}
                      </div>
                    </td>
                    {/* Pré-Venda */}
                    <td style={{ padding:'10px 12px' }}>
                      <SpvBadge s={(l as any).situacao_pre_vendas} />
                    </td>
                    {/* Venda */}
                    <td style={{ padding:'10px 12px' }}>
                      <SitBadge s={l.situacao_closer} />
                    </td>
                    {/* Custo Broker */}
                    {filters.origem === 'Lead Broker' && (
                      <td style={{ padding:'10px 12px' }}>
                        <span style={{ fontSize:13, fontWeight:700, color: (l as any).custo_broker ? GRAY1 : GRAY3 }}>
                          {(l as any).custo_broker ? fmt((l as any).custo_broker) : '—'}
                        </span>
                      </td>
                    )}
                    {/* Ações */}
                    <td style={{ padding:'10px 12px' }}>
                      <div style={{ display:'flex', gap:4 }}>
                        <button onClick={() => router.push(`/leads/${l.id}?from=leads`)} style={{ background:`${R}12`, border:'none', borderRadius:6, padding:6, cursor:'pointer', color:R, display:'flex' }}><Edit2 size={13}/></button>
                        {canEdit && <button onClick={() => deleteLead(l.id)} style={{ background:GRAY4, border:'none', borderRadius:6, padding:6, cursor:'pointer', color:GRAY2, display:'flex' }}><Trash2 size={13}/></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div style={{ textAlign:'center', padding:60, color:GRAY2, display:'flex', flexDirection:'column', alignItems:'center', gap:14 }}>
                <Users size={36} style={{ opacity:0.3 }}/>
                <div>
                  <div style={{ fontWeight:700, fontSize:14, color:GRAY1, marginBottom:6 }}>
                    {leads.length === 0 ? 'Nenhum lead cadastrado' : 'Nenhum resultado para os filtros aplicados'}
                  </div>
                  <div style={{ fontSize:13, color:GRAY2 }}>
                    {leads.length === 0 ? 'Crie seu primeiro lead para começar.' : 'Tente ajustar ou limpar os filtros.'}
                  </div>
                </div>
                {leads.length === 0
                  ? <button onClick={() => router.push('/leads/new')} style={{ padding:'9px 20px', borderRadius:9, border:'none', background:R, color:'#FFF', fontSize:13, fontWeight:700, cursor:'pointer' }}>+ Criar primeiro lead</button>
                  : <button onClick={() => { setFilters(EMPTY_FILTERS); setSearch('') }} style={{ padding:'9px 20px', borderRadius:9, border:`1px solid ${R}`, background:'transparent', color:R, fontSize:13, fontWeight:700, cursor:'pointer' }}>Limpar filtros</button>
                }
              </div>
            )}
          </div>
        </div>

        {/* Paginação */}
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
    </CRMLayout>
  )
}
