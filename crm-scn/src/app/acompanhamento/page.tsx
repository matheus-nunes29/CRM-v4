'use client'
export const dynamic = 'force-dynamic'
import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import CRMLayout from '../_components/CRMLayout'
import {
  R, WHITE, GRAY1, GRAY2, GRAY3, GREEN,
  CANAIS_METAS, mesFmt,
} from '@/lib/crm-constants'

export default function AcompanhamentoPageRoute() {
  const router = useRouter()
  const [leads, setLeads] = useState<any[]>([])
  const [metas, setMetas] = useState<Record<string, Record<string, any>>>({})
  const [mesSel, setMesSel] = useState(() => {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
  })

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      fetchLeads()
      fetchMetas()
    })
  }, [])

  async function fetchLeads() {
    const { data } = await supabase.from('leads').select('*').order('created_at', { ascending: false })
    setLeads(data || [])
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

  return (
    <CRMLayout>
      <AcompanhamentoContent leads={leads} metas={metas} mesSel={mesSel} navMes={navMes} />
    </CRMLayout>
  )
}

function AcompanhamentoContent({ leads, metas, mesSel, navMes }: any) {
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
