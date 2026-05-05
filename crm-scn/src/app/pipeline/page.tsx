'use client'
export const dynamic = 'force-dynamic'
import React, { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Lead } from '@/lib/supabase'
import { ArrowRight, X, Search } from 'lucide-react'
import CRMLayout from '../_components/CRMLayout'
import { TempBadge } from '@/lib/crm-badges'
import {
  R, WHITE, GRAY1, GRAY2, GRAY3, GRAY4, GREEN, BLUE, PURPLE, YELLOW,
  TEMPERATURAS, CANAIS, TEMP_COLORS,
  fmt, fmtDate,
  inputCls, labelCls,
} from '@/lib/crm-constants'
import { useCloserUsers } from '@/lib/useCloserUsers'
import {
  PIPELINE_STAGES, STAGE_REQUIREMENTS, getPipelineStage
} from '@/lib/crm-pipeline'
import { useUserRole } from '@/lib/useUserRole'
import { UserSelect } from '@/components/UserSelect'

function DragModal({ info, onConfirm, onClose }: {
  info: { lead: any; targetStage: string }
  onConfirm: (lead: any, stage: string, data: Record<string,any>) => void
  onClose: () => void
}) {
  const [form, setForm] = useState<Record<string,any>>({})
  const [errors, setErrors] = useState<Record<string,string>>({})
  const [uploading, setUploading] = useState<Record<string,boolean>>({})
  const reqs = STAGE_REQUIREMENTS[info.targetStage]
  const stageColor = PIPELINE_STAGES.find(s => s.key === info.targetStage)?.color || R
  const effectiveFields = [...(reqs?.fields ?? []), ...(reqs?.extraFields?.(info.lead) ?? [])]

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', zIndex:60, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:WHITE, borderRadius:16, width:'100%', maxWidth:480, boxShadow:'0 25px 60px rgba(0,0,0,.3)', overflow:'hidden', maxHeight:'90vh', display:'flex', flexDirection:'column' }}>
        <div style={{ padding:'20px 24px', borderBottom:'1px solid #E5E7EB', borderTop:`4px solid ${stageColor}` }}>
          <div style={{ fontSize:11, fontWeight:700, color:stageColor, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:4 }}>Mover para</div>
          <div style={{ fontSize:18, fontWeight:800, color:GRAY1 }}>{reqs?.label}</div>
          <div style={{ fontSize:12, color:GRAY2, marginTop:4 }}>Lead: <strong>{info.lead.empresa}</strong></div>
        </div>
        <div style={{ padding:24, display:'flex', flexDirection:'column', gap:16, overflowY:'auto', flex:1 }}>
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
              {f.type === 'select' && f.key === 'closer' ? (
                <UserSelect
                  value={form[f.key] ?? info.lead[f.key] ?? null}
                  onChange={v => { setForm((p:any) => ({...p, [f.key]: v})); setErrors((p:any) => ({...p, [f.key]:''}))}
                  }
                  placeholder="Selecione o closer"
                  borderColor={errors[f.key] ? R : '#D1D5DB'}
                />
              ) : f.type === 'select' ? (
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
              ) : f.type === 'file' ? (
                <div>
                  {(form[f.key] ?? info.lead[f.key]) ? (
                    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', borderRadius:8, border:`1px solid ${GREEN}`, background:`${GREEN}08` }}>
                      <span style={{ fontSize:12, color:GREEN, fontWeight:600, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        ✓ {typeof (form[f.key] ?? info.lead[f.key]) === 'string' ? (form[f.key] ?? info.lead[f.key]).split('/').pop() : 'Arquivo enviado'}
                      </span>
                      <button type="button" onClick={() => setForm((p:any) => ({...p, [f.key]: ''}))}
                        style={{ fontSize:11, color:R, background:'none', border:'none', cursor:'pointer', fontWeight:600 }}>Trocar</button>
                    </div>
                  ) : (
                    <label style={{ display:'block', padding:'18px 12px', borderRadius:8, border:`2px dashed ${errors[f.key] ? R : '#D1D5DB'}`, background:'#FAFAFA', cursor:'pointer', textAlign:'center' }}>
                      <input type="file" style={{ display:'none' }} accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                        onChange={async (e) => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          setUploading((p) => ({...p, [f.key]: true}))
                          const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
                          const path = `${info.lead.id}/${Date.now()}_${safeName}`
                          const { data, error } = await supabase.storage.from('contratos').upload(path, file, { upsert: true })
                          if (error) {
                            console.error('Supabase storage error:', error)
                            setErrors((p:any) => ({...p, [f.key]: `Erro: ${error.message}`}))
                          } else {
                            const { data: { publicUrl } } = supabase.storage.from('contratos').getPublicUrl(data.path)
                            setForm((p:any) => ({...p, [f.key]: publicUrl}))
                            setErrors((p:any) => ({...p, [f.key]: ''}))
                          }
                          setUploading((p) => ({...p, [f.key]: false}))
                        }}
                      />
                      {uploading[f.key] ? (
                        <span style={{ fontSize:13, color:GRAY2 }}>Enviando...</span>
                      ) : (
                        <>
                          <span style={{ fontSize:22, display:'block', marginBottom:4 }}>📎</span>
                          <span style={{ fontSize:13, color:GRAY2 }}>Clique para selecionar o contrato</span>
                          <span style={{ fontSize:11, color:GRAY3, display:'block', marginTop:2 }}>PDF, Word ou imagem</span>
                        </>
                      )}
                    </label>
                  )}
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
              } else if (f.type === 'file') {
                const val = form[f.key] ?? info.lead[f.key]
                if (!val || String(val).trim() === '') errs[f.key] = 'Obrigatório — faça o upload do contrato'
              } else {
                const val = form[f.key] ?? info.lead[f.key]
                if (!val || String(val).trim() === '') errs[f.key] = 'Obrigatório'
              }
            })
            if (Object.keys(errs).length > 0) { setErrors(errs); return }
            const merged: Record<string,any> = {}
            effectiveFields.forEach((f: any) => { merged[f.key] = form[f.key] ?? info.lead[f.key] })
            onConfirm(info.lead, info.targetStage, merged)
          }} style={{ padding:'10px 24px', borderRadius:8, border:'none', background:R, color:WHITE, fontSize:13, fontWeight:800, cursor:'pointer' }}>
            Confirmar Movimentação
          </button>
        </div>
      </div>
    </div>
  )
}

export default function PipelinePage() {
  const router = useRouter()
  const { canEdit } = useUserRole()
  const closerUsers = useCloserUsers()
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [pipelineView, setPipelineView] = useState<'total' | 'pre-vendas' | 'vendas'>('total')
  const [pipelineCanal, setPipelineCanal] = useState<string>('Canal')
  const [pipelineCloser, setPipelineCloser] = useState('')
  const [pipelineTemp, setPipelineTemp] = useState('')
  const [pipelineUltimaAtiv, setPipelineUltimaAtiv] = useState('')
  const [pipelineCadencia, setPipelineCadencia] = useState<number | ''>('')
  const [pipelineFilterOpen, setPipelineFilterOpen] = useState(false)
  const [draftPipelineCanal, setDraftPipelineCanal] = useState('Canal')
  const [draftPipelineCloser, setDraftPipelineCloser] = useState('')
  const [draftPipelineTemp, setDraftPipelineTemp] = useState('')
  const [draftUltimaAtiv, setDraftUltimaAtiv] = useState('')
  const [draftCadencia, setDraftCadencia] = useState<number | ''>('')
  const [dragModal, setDragModal] = useState<{ open: boolean; lead: any; targetStage: string } | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [landedStage, setLandedStage] = useState<string | null>(null)
  const [fupFilter, setFupFilter] = useState<string>('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      fetchLeads()
    })
  }, [])

  useEffect(() => {
    const channel = supabase
      .channel('pipeline-leads-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, silentFetchLeads)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  async function fetchLeads() {
    setLoading(true)
    try {
      const { data, error } = await supabase.from('leads').select('*').order('created_at', { ascending: false })
      if (error) throw error
      setLeads(data || [])
    } catch {
      setLeads([])
    } finally {
      setLoading(false)
    }
  }

  async function silentFetchLeads() {
    try {
      const { data, error } = await supabase.from('leads').select('*').order('created_at', { ascending: false })
      if (error) throw error
      setLeads(data || [])
    } catch {
      // silently ignore — UI keeps current state
    }
  }

  async function applyDragUpdate(lead: any, targetStage: string, formData: Record<string, any>) {
    const updates: Record<string, any> = { ...formData }
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

    // Optimistic update — move the card locally before the API call
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, ...updates } : l))
    setDragModal(null)
    setLandedStage(targetStage)
    setTimeout(() => setLandedStage(null), 900)

    const { error: updateError } = await supabase.from('leads').update(updates).eq('id', lead.id)
    if (updateError) {
      // Revert on failure
      setLeads(prev => prev.map(l => l.id === lead.id ? lead : l))
      alert('Erro ao mover lead: ' + updateError.message)
    }
  }

  const funilPipeline = useMemo(() => {
    const q = search.toLowerCase()
    // Converte YYYY-MM-DD → DD/MM/YYYY para comparar com datas do histórico
    const ultimaAtivFmt = pipelineUltimaAtiv
      ? pipelineUltimaAtiv.split('-').reverse().join('/')
      : ''
    const getUltimaAtiv = (l: any): string | null => {
      const hist: any[] = Array.isArray(l.historico_anotacoes_pre_vendas) ? l.historico_anotacoes_pre_vendas : []
      const ativs = hist.filter((e: any) => e.tipo === 'cadencia')
      if (ativs.length === 0) return null
      return ativs[0]?.data?.substring(0, 10) ?? null // "DD/MM/YYYY"
    }
    return PIPELINE_STAGES.map(stage => ({
      ...stage,
      leads: leads.filter(l =>
        getPipelineStage(l) === stage.key &&
        (pipelineCanal === 'Canal' || l.origem === pipelineCanal) &&
        (!pipelineCloser || l.closer === pipelineCloser) &&
        (!pipelineTemp || l.temperatura === pipelineTemp) &&
        (!pipelineCadencia || (l as any).cadencia === pipelineCadencia) &&
        (!ultimaAtivFmt || getUltimaAtiv(l) === ultimaAtivFmt) &&
        (!q || l.empresa?.toLowerCase().includes(q) || (l as any).nome_lead?.toLowerCase().includes(q))
      )
    }))
  }, [leads, pipelineCanal, pipelineCloser, pipelineTemp, pipelineUltimaAtiv, pipelineCadencia, search])

  const weightTrembleStyle = `
    @keyframes weight-land {
      0%   { transform: translate(0px,   0px) rotate(0deg);    }
      8%   { transform: translate(-3px,  5px) rotate(-0.7deg); }
      16%  { transform: translate( 3px,  6px) rotate( 0.7deg); }
      26%  { transform: translate(-2px,  4px) rotate(-0.5deg); }
      36%  { transform: translate( 2px,  4px) rotate( 0.5deg); }
      48%  { transform: translate(-1.5px,2px) rotate(-0.3deg); }
      58%  { transform: translate( 1.5px,2px) rotate( 0.3deg); }
      68%  { transform: translate(-1px,  1px) rotate(-0.15deg);}
      78%  { transform: translate( 1px,  1px) rotate( 0.15deg);}
      88%  { transform: translate(-0.5px,0px) rotate(-0.05deg);}
      94%  { transform: translate( 0.5px,0px) rotate( 0.05deg);}
      100% { transform: translate(0px,   0px) rotate(0deg);    }
    }
  `

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
      <style>{weightTrembleStyle}</style>
      <div style={{ display:'flex', flexDirection:'column', gap:18 }}>

        {/* ── Header ── */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:10, fontWeight:800, color:R, textTransform:'uppercase', letterSpacing:'0.18em', marginBottom:6 }}>Gestão de Leads</div>
            <h1 style={{ fontSize:30, fontWeight:900, color:GRAY1, margin:0, letterSpacing:'-0.02em', lineHeight:1 }}>Pipeline</h1>
          </div>
          <div style={{ display:'flex', gap:10, alignItems:'center' }}>
            <div style={{ position:'relative' }}>
              <Search size={14} style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:GRAY2, pointerEvents:'none' }} />
              <input
                style={{ paddingLeft:34, paddingRight:12, paddingTop:9, paddingBottom:9, border:'1px solid #E5E7EB', borderRadius:10, fontSize:13, color:GRAY1, outline:'none', background:WHITE, width:240, boxShadow:'0 1px 4px rgba(0,0,0,.06)' }}
                placeholder="Buscar empresa ou lead..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
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
            <div style={{ position:'relative' }}>
              {(() => {
                const activeCount = (pipelineCanal !== 'Canal' ? 1 : 0) + (pipelineCloser ? 1 : 0) + (pipelineTemp ? 1 : 0) + (pipelineUltimaAtiv ? 1 : 0) + (pipelineCadencia !== '' ? 1 : 0)
                return (
                  <button onClick={() => { setDraftPipelineCanal(pipelineCanal); setDraftPipelineCloser(pipelineCloser); setDraftPipelineTemp(pipelineTemp); setDraftUltimaAtiv(pipelineUltimaAtiv); setDraftCadencia(pipelineCadencia); setPipelineFilterOpen(v => !v) }}
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
                  <div style={{ position:'absolute', right:0, top:'calc(100% + 8px)', background:WHITE, border:'1px solid #E5E7EB', borderRadius:16, boxShadow:'0 8px 32px rgba(0,0,0,.14)', zIndex:50, width:340, padding:24 }}>
                    <div style={{ fontSize:15, fontWeight:800, color:GRAY1, marginBottom:4 }}>Filtros do Pipeline</div>
                    <div style={{ fontSize:12, color:GRAY2, marginBottom:20 }}>Filtre os leads por canal, cadência e atividade.</div>
                    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                      <div>
                        <label style={labelCls}>Canal</label>
                        <select style={inputCls} value={draftPipelineCanal} onChange={e => setDraftPipelineCanal(e.target.value)}>
                          {CANAIS.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={labelCls}>Closer</label>
                        <select style={inputCls} value={draftPipelineCloser} onChange={e => setDraftPipelineCloser(e.target.value)}>
                          <option value="">Todos</option>
                          {closerUsers.map(u => <option key={u.nome} value={u.nome}>{u.nome}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={labelCls}>Temperatura</label>
                        <select style={inputCls} value={draftPipelineTemp} onChange={e => setDraftPipelineTemp(e.target.value)}>
                          <option value="">Todas</option>
                          {TEMPERATURAS.map(t => <option key={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={labelCls}>Dia de Cadência</label>
                        <select style={inputCls} value={draftCadencia} onChange={e => setDraftCadencia(e.target.value ? Number(e.target.value) : '')}>
                          <option value="">Todos</option>
                          {Array.from({ length: 10 }, (_, i) => i + 1).map(d => (
                            <option key={d} value={d}>Dia {d}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={labelCls}>Última Atividade de Cadência</label>
                        <input type="date" style={inputCls} value={draftUltimaAtiv} onChange={e => setDraftUltimaAtiv(e.target.value)} />
                        {draftUltimaAtiv && <div style={{ fontSize:11, color:GRAY3, marginTop:4 }}>Leads com atividade em {new Date(draftUltimaAtiv + 'T12:00:00').toLocaleDateString('pt-BR')}</div>}
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:10, marginTop:20 }}>
                      <button onClick={() => { setPipelineCanal('Canal'); setDraftPipelineCanal('Canal'); setPipelineCloser(''); setDraftPipelineCloser(''); setPipelineTemp(''); setDraftPipelineTemp(''); setPipelineUltimaAtiv(''); setDraftUltimaAtiv(''); setPipelineCadencia(''); setDraftCadencia(''); setPipelineFilterOpen(false) }}
                        style={{ flex:1, padding:'10px 0', borderRadius:10, border:'1px solid #E5E7EB', background:WHITE, color:GRAY1, fontSize:13, fontWeight:700, cursor:'pointer' }}>Limpar</button>
                      <button onClick={() => { setPipelineCanal(draftPipelineCanal); setPipelineCloser(draftPipelineCloser); setPipelineTemp(draftPipelineTemp); setPipelineUltimaAtiv(draftUltimaAtiv); setPipelineCadencia(draftCadencia); setPipelineFilterOpen(false) }}
                        style={{ flex:2, padding:'10px 0', borderRadius:10, border:'none', background:R, color:WHITE, fontSize:13, fontWeight:800, cursor:'pointer' }}>Aplicar</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Chips ativos */}
        {(pipelineCanal !== 'Canal' || pipelineCloser || pipelineTemp || pipelineUltimaAtiv || pipelineCadencia !== '') && (
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
            {pipelineCadencia !== '' && (
              <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:20, background:`${PURPLE}12`, border:`1px solid ${PURPLE}30`, fontSize:12, fontWeight:700, color:PURPLE }}>
                Cadência: Dia {pipelineCadencia}
                <button onClick={() => setPipelineCadencia('')} style={{ background:'none', border:'none', cursor:'pointer', color:PURPLE, padding:0, display:'flex', lineHeight:1 }}>×</button>
              </span>
            )}
            {pipelineUltimaAtiv && (
              <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:20, background:`${BLUE}12`, border:`1px solid ${BLUE}30`, fontSize:12, fontWeight:700, color:BLUE }}>
                Ativ.: {new Date(pipelineUltimaAtiv + 'T12:00:00').toLocaleDateString('pt-BR')}
                <button onClick={() => setPipelineUltimaAtiv('')} style={{ background:'none', border:'none', cursor:'pointer', color:BLUE, padding:0, display:'flex', lineHeight:1 }}>×</button>
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
                    onDragOver={e => { if (!canEdit) return; e.preventDefault(); setDragOver(etapa.key) }}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={e => {
                      if (!canEdit) return
                      e.preventDefault(); setDragOver(null)
                      const leadData = JSON.parse(e.dataTransfer.getData('lead'))
                      if (leadData && getPipelineStage(leadData) !== etapa.key) {
                        const reqs = STAGE_REQUIREMENTS[etapa.key]
                        if (reqs) setDragModal({ open:true, lead:leadData, targetStage:etapa.key })
                        else applyDragUpdate(leadData, etapa.key, {})
                      }
                    }}
                    style={{ background: dragOver === etapa.key ? `${etapa.color}10` : '#FAFAFA', borderRadius:14, border: dragOver === etapa.key ? `2px dashed ${etapa.color}` : '1px solid #E8E8EE', overflow:'hidden', borderTop:`4px solid ${etapa.color}`, boxShadow: landedStage === etapa.key ? `0 8px 28px ${etapa.color}50` : dragOver === etapa.key ? `0 4px 16px ${etapa.color}30` : '0 2px 8px rgba(0,0,0,.05)', transition:'background .15s, border .15s, box-shadow .15s', animation: landedStage === etapa.key ? 'weight-land 0.9s ease-out forwards' : 'none' }}>

                    {/* Column header */}
                    <div style={{ padding:'14px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', background:WHITE, borderBottom:'1px solid #F0F0F0' }}>
                      <div>
                        <div style={{ fontSize:10, fontWeight:800, color:GRAY2, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>{etapa.label}</div>
                        <div style={{ fontSize:28, fontWeight:900, color:etapa.color, lineHeight:1, letterSpacing:'-0.02em' }}>{etapa.leads.length}</div>
                        {(() => { const tcvTotal = etapa.leads.reduce((s:number, l:any) => s + (l.tcv || 0), 0); return tcvTotal > 0 ? <div style={{ fontSize:11, fontWeight:700, color:GREEN, marginTop:4 }}>{fmt(tcvTotal)}</div> : null })()}
                      </div>
                      {idx < visibleStages.length - 1 && <ArrowRight size={14} color={GRAY3} />}
                    </div>

                    {/* Cards */}
                    <div style={{ padding:'8px 8px', maxHeight:'62vh', overflowY:'auto', display:'flex', flexDirection:'column', gap:7 }}>
                      {etapa.leads.map((l: any) => {
                        const preVendasStages = ['ENTRADA','TENTANDO CONTATO','EM QUALIFICAÇÃO','REUNIÃO AGENDADA','NO-SHOW/REMARCANDO']
                        const isPreVendas = preVendasStages.includes(etapa.key)
                        const isRRPlus = ['REUNIÃO REALIZADA','FOLLOW UP'].includes(etapa.key)
                        const isVendaPlus = ['VENDA','ATIVADO','PERDIDO'].includes(etapa.key)
                        return (
                          <a key={l.id}
                            href={`/leads/${l.id}?from=pipeline`}
                            draggable={canEdit}
                            onDragStart={e => { if (!canEdit) return; e.dataTransfer.setData('lead', JSON.stringify(l)); e.dataTransfer.effectAllowed = 'move' }}
                            onClick={e => { if (!e.metaKey && !e.ctrlKey && !e.shiftKey) { e.preventDefault(); router.push(`/leads/${l.id}?from=pipeline`) } }}
                            style={{ display:'block', textDecoration:'none', color:'inherit', background:WHITE, borderRadius:10, padding:'12px 14px', border:'1px solid #EBEBEB', cursor:'grab', userSelect:'none', boxShadow:'0 1px 4px rgba(0,0,0,.05)', transition:'border-color .12s, box-shadow .12s' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor=etapa.color; (e.currentTarget as HTMLElement).style.boxShadow=`0 3px 10px ${etapa.color}28` }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor='#EBEBEB'; (e.currentTarget as HTMLElement).style.boxShadow='0 1px 4px rgba(0,0,0,.05)' }}>

                            <div style={{ fontSize:13, fontWeight:800, color:GRAY1, lineHeight:1.35, marginBottom:3 }}>{l.empresa}</div>
                            {l.nome_lead && <div style={{ fontSize:11, fontWeight:600, color:GRAY2, marginBottom:2 }}>{l.nome_lead}</div>}
                            {l.telefone && <div style={{ fontSize:11, color:GRAY3, display:'flex', alignItems:'center', gap:4, marginBottom:2 }}>📞 {l.telefone}</div>}
                            {l.origem === 'Recomendação' && (
                              <div style={{ fontSize:11, color:GRAY2, display:'flex', alignItems:'center', gap:4, marginBottom:2 }}>
                                🤝 {l.recomendacoes ? l.recomendacoes : <span style={{ color:GRAY3, fontStyle:'italic' }}>Sem indicador</span>}
                              </div>
                            )}

                            {isPreVendas && (
                              <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:9 }}>
                                {l.bant > 0 && (
                                  <span style={{ fontSize:10, fontWeight:800, padding:'2px 8px', borderRadius:20, background: l.bant >= 3 ? `${GREEN}18` : `${R}18`, color: l.bant >= 3 ? GREEN : R, border: `1px solid ${l.bant >= 3 ? `${GREEN}40` : `${R}40`}` }}>BANT {l.bant}/4</span>
                                )}
                                {l.cadencia && (
                                  <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20, background: l.cadencia >= 5 && !l.contato_agendado ? R : '#78350F', color: l.cadencia >= 5 && !l.contato_agendado ? WHITE : '#FCD34D' }}>
                                    {l.cadencia >= 5 && !l.contato_agendado ? '⚠️ ' : ''}Dia {l.cadencia}
                                  </span>
                                )}
                                {l.contato_agendado && (
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
                          </a>
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

      {/* DRAG MODAL */}
      {dragModal?.open && <DragModal info={dragModal} onConfirm={applyDragUpdate} onClose={() => setDragModal(null)} />}
    </CRMLayout>
  )
}
