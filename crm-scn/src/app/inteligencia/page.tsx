'use client'
export const dynamic = 'force-dynamic'
import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import type { Lead } from '@/lib/supabase'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import CRMLayout from '../_components/CRMLayout'
import { getPipelineStage } from '@/lib/crm-pipeline'
import { useCloserUsers } from '@/lib/useCloserUsers'
import {
  R, WHITE, GRAY1, GRAY2, GRAY3, GRAY4, GREEN, BLUE, YELLOW, PURPLE,
  TIERS, SEGMENTOS, CANAIS_METAS, mesAno, fmt, mesFmt,
  MOTIVOS_PERDA_PRE_VENDAS, MOTIVOS_PERDA_CLOSER,
} from '@/lib/crm-constants'

const CANAL_COLORS: Record<string, string> = {
  'Recovery': BLUE,
  'Lead Broker': YELLOW,
  'Recomendação': GREEN,
  'Eventos': PURPLE,
  'Indicação': '#F97316',
}

const BORDER = '#E5E7EB'

function Card({ children, style, title, info }: {
  children: React.ReactNode
  style?: React.CSSProperties
  title?: string
  info?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ background: WHITE, borderRadius: 16, padding: '22px 22px', position: 'relative', boxShadow: '0 1px 4px rgba(0,0,0,.06)', border: `1px solid ${BORDER}`, ...style }}>
      {(title || info) && (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          {title && <div style={{ fontSize: 10, fontWeight: 800, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.12em' }}>{title}</div>}
          {info && (
            <div style={{ position: 'relative', flexShrink: 0, marginLeft: 8 }}>
              <button onClick={() => setOpen(v => !v)}
                style={{ width: 18, height: 18, borderRadius: '50%', border: `1.5px solid ${open ? R : GRAY3}`, background: open ? `${R}12` : 'transparent', color: open ? R : GRAY3, fontSize: 10, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, transition: 'all .15s', padding: 0 }}>
                i
              </button>
              {open && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setOpen(false)} />
                  <div style={{ position: 'absolute', right: 0, top: 26, width: 300, background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,.14)', zIndex: 999, padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <div style={{ width: 16, height: 16, borderRadius: '50%', background: R, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 900, color: WHITE, flexShrink: 0 }}>i</div>
                      <span style={{ fontSize: 10, fontWeight: 800, color: R, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{title}</span>
                    </div>
                    <p style={{ fontSize: 12, color: GRAY1, lineHeight: 1.6, margin: 0 }}>{info}</p>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
      {children}
    </div>
  )
}

function Bar2({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div style={{ height: 6, background: '#F0F0F0', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ height: 6, borderRadius: 3, background: color, width: `${pct}%`, transition: 'width .6s cubic-bezier(.22,1,.36,1)' }} />
    </div>
  )
}

export default function InteligenciaPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [periodoSel, setPeriodoSel] = useState<'3m' | '6m' | '12m' | 'all'>('6m')
  const closerUsers = useCloserUsers()

  useEffect(() => {
    supabase.from('leads').select('*').order('created_at', { ascending: false }).then(({ data }) => {
      setLeads(data || [])
      setLoading(false)
    })
    const ch = supabase.channel('inteligencia-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
        supabase.from('leads').select('*').then(({ data }) => setLeads(data || []))
      }).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  // ── Helpers ──────────────────────────────────────────────────────────────
  const avgDays = (arr: Lead[], from: keyof Lead, to: keyof Lead): number | null => {
    const diffs = arr
      .filter(l => l[from] && l[to])
      .map(l => Math.round(
        (new Date(l[to] as string).getTime() - new Date(l[from] as string).getTime()) / 86400000
      ))
      .filter(d => d >= 0 && d < 400)
    return diffs.length > 0 ? Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length) : null
  }

  const winRate = (won: number, lost: number): number | null =>
    won + lost > 0 ? Math.round(won / (won + lost) * 100) : null

  const dayColor = (d: number | null, mid = 14, hi = 30) =>
    d == null ? GRAY3 : d <= mid ? GREEN : d <= hi ? YELLOW : R

  // ── Período ──────────────────────────────────────────────────────────────
  const filteredLeads = useMemo(() => {
    if (periodoSel === 'all') return leads
    const months = periodoSel === '3m' ? 3 : periodoSel === '6m' ? 6 : 12
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - months)
    return leads.filter(l => l.data_entrada && new Date(l.data_entrada) >= cutoff)
  }, [leads, periodoSel])

  // ── Funil por Canal ───────────────────────────────────────────────────────
  const canalFunil = useMemo(() => {
    return CANAIS_METAS.map(canal => {
      const cl = filteredLeads.filter(l => l.origem === canal)
      const ra  = cl.filter(l => l.data_ra).length
      const rr  = cl.filter(l => l.data_rr).length
      const v   = cl.filter(l => l.data_assinatura).length
      const p   = cl.filter(l => getPipelineStage(l) === 'PERDIDO').length
      const total = cl.length
      return {
        canal,
        total,
        ra,  raRate:  total > 0 ? Math.round(ra / total * 100)  : 0,
        rr,  rrRate:  ra    > 0 ? Math.round(rr / ra    * 100)  : 0,
        v,   vRate:   rr    > 0 ? Math.round(v  / rr    * 100)  : 0,
        p,
        overallRate: winRate(v, p),
        color: CANAL_COLORS[canal] || GRAY2,
      }
    }).filter(c => c.total > 0).sort((a, b) => b.total - a.total)
  }, [filteredLeads])

  // ── Velocity ──────────────────────────────────────────────────────────────
  const velocityData = useMemo(() => {
    const won = filteredLeads.filter(l => l.data_assinatura)
    const global = [
      { stage: 'Entrada → RA',     days: avgDays(won, 'data_entrada', 'data_ra'),        desc: 'do primeiro contato à reunião agendada' },
      { stage: 'RA → Realizada',   days: avgDays(won, 'data_ra', 'data_rr'),             desc: 'da agenda à reunião realizada' },
      { stage: 'RR → Venda',       days: avgDays(won, 'data_rr', 'data_assinatura'),     desc: 'da reunião ao fechamento' },
      { stage: 'Venda → Ativação', days: avgDays(filteredLeads.filter(l => l.data_assinatura && l.data_ativacao), 'data_assinatura', 'data_ativacao'), desc: 'do fechamento à ativação' },
      { stage: 'Ciclo Total',      days: avgDays(won, 'data_entrada', 'data_assinatura'), desc: 'entrada até venda' },
    ]

    const byCloser = closerUsers.map(u => {
      const cWon = won.filter(l => l.closer === u.nome)
      return {
        nome: u.nome,
        entToRa:   avgDays(cWon, 'data_entrada', 'data_ra'),
        raToRr:    avgDays(cWon, 'data_ra', 'data_rr'),
        rrToVenda: avgDays(cWon, 'data_rr', 'data_assinatura'),
        total:     avgDays(cWon, 'data_entrada', 'data_assinatura'),
        deals:     cWon.length,
      }
    })

    const byCanal = CANAIS_METAS.map(canal => {
      const cWon = won.filter(l => l.origem === canal)
      return {
        canal,
        total:     avgDays(cWon, 'data_entrada', 'data_assinatura'),
        rrToVenda: avgDays(cWon, 'data_rr', 'data_assinatura'),
        deals:     cWon.length,
      }
    }).filter(c => c.deals > 0)

    return { global, byCloser, byCanal }
  }, [filteredLeads, closerUsers])

  // ── Win Rate por Tier ─────────────────────────────────────────────────────
  const tierAnalysis = useMemo(() => {
    return TIERS.map(tier => {
      const tl  = filteredLeads.filter(l => l.tier === tier)
      const won = tl.filter(l => l.data_assinatura)
      const lost = tl.filter(l => getPipelineStage(l) === 'PERDIDO')
      const tcv  = won.reduce((s, l) => s + (l.tcv || 0), 0)
      return {
        tier,
        volume: tl.length,
        vendas: won.length,
        perdidos: lost.length,
        winRate: winRate(won.length, lost.length),
        tcvTotal: tcv,
        ticketMedio: won.length > 0 ? tcv / won.length : 0,
        cycleAvg: avgDays(won, 'data_entrada', 'data_assinatura'),
      }
    }).filter(t => t.volume > 0)
  }, [filteredLeads])

  // ── Win Rate por Segmento ─────────────────────────────────────────────────
  const segmentoAnalysis = useMemo(() => {
    return SEGMENTOS.map(seg => {
      const sl  = filteredLeads.filter(l => l.segmento === seg)
      const won = sl.filter(l => l.data_assinatura)
      const lost = sl.filter(l => getPipelineStage(l) === 'PERDIDO')
      const tcv  = won.reduce((s, l) => s + (l.tcv || 0), 0)
      return {
        seg,
        volume: sl.length,
        vendas: won.length,
        winRate: winRate(won.length, lost.length),
        tcvTotal: tcv,
        ticketMedio: won.length > 0 ? tcv / won.length : 0,
      }
    }).filter(s => s.volume > 0).sort((a, b) => b.volume - a.volume)
  }, [filteredLeads])

  // ── Motivos de Perda ──────────────────────────────────────────────────────
  const motivosPerda = useMemo(() => {
    const perdidos = filteredLeads.filter(l => getPipelineStage(l) === 'PERDIDO')

    const countMotivos = (motivos: string[], field: 'motivo_perda_pre_vendas' | 'motivo_perda_closer') => {
      const total = perdidos.filter(l => l[field]).length
      return motivos
        .map(m => ({ motivo: m, count: perdidos.filter(l => l[field] === m).length }))
        .filter(m => m.count > 0)
        .sort((a, b) => b.count - a.count)
        .map(m => ({ ...m, pct: total > 0 ? Math.round(m.count / total * 100) : 0 }))
    }

    return {
      preVendas: countMotivos(MOTIVOS_PERDA_PRE_VENDAS, 'motivo_perda_pre_vendas'),
      closer:    countMotivos(MOTIVOS_PERDA_CLOSER, 'motivo_perda_closer'),
      totalPerdidos: perdidos.length,
      semMotivoPreVendas: perdidos.filter(l => !l.motivo_perda_pre_vendas && !l.data_rr).length,
      semMotivoCloser:    perdidos.filter(l => !l.motivo_perda_closer && !!l.data_rr).length,
    }
  }, [filteredLeads])

  // ── BANT ──────────────────────────────────────────────────────────────────
  const bantAnalysis = useMemo(() => {
    const active = filteredLeads.filter(l => getPipelineStage(l) !== 'PERDIDO')
    const total = active.length
    if (total === 0) return null
    const fields: { key: keyof Lead; label: string }[] = [
      { key: 'bant_budget',    label: 'Budget' },
      { key: 'bant_authority', label: 'Authority' },
      { key: 'bant_need',      label: 'Need' },
      { key: 'bant_timing',    label: 'Timing' },
    ]
    const pcts = fields.map(f => ({
      field: f.label,
      pct:   Math.round(active.filter(l => l[f.key]).length / total * 100),
      count: active.filter(l => l[f.key]).length,
    }))
    const fullyQual = filteredLeads.filter(l => fields.every(f => l[f.key]))
    const partial   = filteredLeads.filter(l => !fields.every(f => l[f.key]))
    const wrFull    = fullyQual.length > 0 ? Math.round(fullyQual.filter(l => l.data_assinatura).length / fullyQual.length * 100) : null
    const wrPart    = partial.length   > 0 ? Math.round(partial.filter(l => l.data_assinatura).length   / partial.length   * 100) : null
    const avgScore  = (active.reduce((s, l) => s + fields.filter(f => l[f.key]).length, 0) / total).toFixed(1)
    return { pcts, fullyQual: fullyQual.length, total, avgScore, wrFull, wrPart }
  }, [filteredLeads])

  // ── Crescimento MoM ───────────────────────────────────────────────────────
  const momGrowth = useMemo(() => {
    const now = new Date()
    const months: string[] = []
    for (let i = -5; i <= 0; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i)
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    return months.map((m, idx) => {
      const prev = months[idx - 1]
      const cur  = (field: keyof Lead) => leads.filter(l => mesAno(l[field] as string) === m).length
      const prv  = (field: keyof Lead) => prev ? leads.filter(l => mesAno(l[field] as string) === prev).length : null
      const delta = (a: number, b: number | null) => b !== null && b > 0 ? Math.round((a - b) / b * 100) : null
      const ent = cur('data_entrada'); const entP = prv('data_entrada')
      const ra  = cur('data_ra');      const raP  = prv('data_ra')
      const rr  = cur('data_rr');      const rrP  = prv('data_rr')
      const v   = cur('data_assinatura'); const vP = prv('data_assinatura')
      return {
        mes: mesFmt(m),
        entrada: ent, entradaDelta: delta(ent, entP),
        ra, raDelta: delta(ra, raP),
        rr, rrDelta: delta(rr, rrP),
        venda: v, vendaDelta: delta(v, vP),
      }
    })
  }, [leads])

  // ── Revenue Attribution ───────────────────────────────────────────────────
  const revenueAttribution = useMemo(() => {
    const won   = filteredLeads.filter(l => l.data_assinatura && l.tcv)
    const total = won.reduce((s, l) => s + (l.tcv || 0), 0)

    const byCanal = CANAIS_METAS.map(canal => {
      const cl  = won.filter(l => l.origem === canal)
      const tcv = cl.reduce((s, l) => s + (l.tcv || 0), 0)
      return { name: canal, tcv, pct: total > 0 ? Math.round(tcv / total * 100) : 0, count: cl.length, color: CANAL_COLORS[canal] || GRAY2 }
    }).filter(c => c.tcv > 0).sort((a, b) => b.tcv - a.tcv)

    const colors = [PURPLE, BLUE, GREEN, R, YELLOW, '#F97316']
    const byCloser = closerUsers.map((u, i) => {
      const cl  = won.filter(l => l.closer === u.nome)
      const tcv = cl.reduce((s, l) => s + (l.tcv || 0), 0)
      return { name: u.nome, tcv, pct: total > 0 ? Math.round(tcv / total * 100) : 0, count: cl.length, color: colors[i % colors.length] }
    }).filter(c => c.tcv > 0).sort((a, b) => b.tcv - a.tcv)

    return { byCanal, byCloser, total }
  }, [filteredLeads, closerUsers])

  // ─────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <CRMLayout>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
          <div style={{ width: 32, height: 32, border: `3px solid ${GRAY3}`, borderTopColor: R, borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
        </div>
      </CRMLayout>
    )
  }

  const tooltipStyle = { background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 8, color: GRAY1, fontSize: 12, boxShadow: '0 4px 16px rgba(0,0,0,.10)' }

  return (
    <CRMLayout>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1100, margin: '0 auto' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, color: R, textTransform: 'uppercase', letterSpacing: '0.18em', marginBottom: 6 }}>Analytics Avançado</div>
            <h1 style={{ fontSize: 30, fontWeight: 900, color: GRAY1, margin: 0, letterSpacing: '-0.02em', lineHeight: 1 }}>Inteligência Comercial</h1>
            <p style={{ fontSize: 13, color: GRAY2, marginTop: 6, marginBottom: 0 }}>
              Análise profunda de processo, canais e profissionais
            </p>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['3m', '6m', '12m', 'all'] as const).map(p => (
              <button key={p} onClick={() => setPeriodoSel(p)}
                style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${periodoSel === p ? R : BORDER}`, background: periodoSel === p ? R : WHITE, color: periodoSel === p ? WHITE : GRAY1, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                {p === 'all' ? 'Tudo' : p === '3m' ? '3 meses' : p === '6m' ? '6 meses' : '12 meses'}
              </button>
            ))}
          </div>
        </div>

        {/* ── Funil por Canal ── */}
        {canalFunil.length > 0 && (
          <Card
            title="Funil de Conversão por Canal"
            info="Mostra a taxa de conversão em cada etapa do funil para cada canal de aquisição. Entrada→RA% é quantos leads chegam à reunião agendada; RA→RR% é quantos das agendadas se realizam; RR→Venda% é quantas reuniões viram venda. Win Rate geral é vendas ÷ (vendas + perdidos).">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Header columns */}
              <div style={{ display: 'grid', gridTemplateColumns: '130px 60px 1fr 80px 80px 80px 80px', gap: 10, alignItems: 'center', paddingBottom: 8, borderBottom: `1px solid ${BORDER}` }}>
                <span style={{ fontSize: 9, fontWeight: 800, color: GRAY3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Canal</span>
                <span style={{ fontSize: 9, fontWeight: 800, color: GRAY3, textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'center' }}>Leads</span>
                <span />
                <span style={{ fontSize: 9, fontWeight: 800, color: GRAY3, textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'center' }}>Ent→RA (CR2)</span>
                <span style={{ fontSize: 9, fontWeight: 800, color: GRAY3, textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'center' }}>RA→RR (CR3)</span>
                <span style={{ fontSize: 9, fontWeight: 800, color: GRAY3, textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'center' }}>RR→Venda (CR4)</span>
                <span style={{ fontSize: 9, fontWeight: 800, color: GRAY3, textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'center' }}>Hit Rate</span>
              </div>
              {canalFunil.map(c => {
                const maxLeads = Math.max(...canalFunil.map(x => x.total))
                return (
                  <div key={c.canal} style={{ display: 'grid', gridTemplateColumns: '130px 60px 1fr 80px 80px 80px 80px', gap: 10, alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: GRAY1 }}>{c.canal}</span>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 900, color: GRAY1, textAlign: 'center' }}>{c.total}</span>
                    <Bar2 value={c.total} max={maxLeads} color={c.color} />
                    {/* Ent→RA */}
                    <div style={{ textAlign: 'center' }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: c.raRate >= 60 ? GREEN : c.raRate >= 30 ? YELLOW : R }}>{c.raRate}%</span>
                      <div style={{ fontSize: 9, color: GRAY3 }}>{c.ra} RAs</div>
                    </div>
                    {/* RA→RR */}
                    <div style={{ textAlign: 'center' }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: c.rrRate >= 70 ? GREEN : c.rrRate >= 40 ? YELLOW : R }}>{c.rrRate > 0 ? `${c.rrRate}%` : '—'}</span>
                      <div style={{ fontSize: 9, color: GRAY3 }}>{c.rr} RRs</div>
                    </div>
                    {/* RR→Venda */}
                    <div style={{ textAlign: 'center' }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: c.vRate >= 40 ? GREEN : c.vRate >= 20 ? YELLOW : R }}>{c.vRate > 0 ? `${c.vRate}%` : '—'}</span>
                      <div style={{ fontSize: 9, color: GRAY3 }}>{c.v} vendas</div>
                    </div>
                    {/* Win Rate geral */}
                    <div style={{ textAlign: 'center' }}>
                      {c.overallRate != null
                        ? <span style={{ fontSize: 13, fontWeight: 900, color: c.overallRate >= 40 ? GREEN : c.overallRate >= 20 ? YELLOW : R }}>{c.overallRate}%</span>
                        : <span style={{ fontSize: 13, color: GRAY3 }}>—</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        )}

        {/* ── Crescimento MoM ── */}
        <Card
          title="Crescimento Mês a Mês — Últimos 6 Meses"
          info="Evolução dos principais KPIs do funil nos últimos 6 meses. O Δ% indica crescimento ou queda em relação ao mês anterior. Use para identificar tendências e sazonalidades.">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #F0F0F0' }}>
                  {['Mês', 'Entradas', 'Δ', 'R.Agend.', 'Δ', 'R.Realiz.', 'Δ', 'Vendas', 'Δ'].map((h, i) => (
                    <th key={i} style={{ padding: '8px 12px', textAlign: i === 0 ? 'left' : 'center', fontSize: 10, fontWeight: 700, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {momGrowth.map((row, i) => {
                  const deltaCell = (d: number | null) => {
                    if (d === null) return <td style={{ padding: '10px 8px', textAlign: 'center', color: GRAY3 }}>—</td>
                    const c = d > 0 ? GREEN : d < 0 ? R : GRAY3
                    return <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 800, color: c }}>{d > 0 ? `+${d}%` : `${d}%`}</td>
                  }
                  return (
                    <tr key={row.mes} style={{ borderBottom: '1px solid #F9F9F9', background: i % 2 ? '#FAFAFA' : WHITE }}>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: GRAY1 }}>{row.mes}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: GRAY1 }}>{row.entrada}</td>
                      {deltaCell(row.entradaDelta)}
                      <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: GRAY1 }}>{row.ra}</td>
                      {deltaCell(row.raDelta)}
                      <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: GRAY1 }}>{row.rr}</td>
                      {deltaCell(row.rrDelta)}
                      <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: GREEN }}>{row.venda}</td>
                      {deltaCell(row.vendaDelta)}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {/* ── Velocity Report ── */}
        <Card
          title="Velocity Report — Tempo Médio por Etapa"
          info="Tempo médio em dias que os deals ganhos levaram em cada etapa. Calculado apenas sobre deals fechados. Compare closers e canais para identificar gargalos no processo.">

          {/* Global */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 28 }}>
            {velocityData.global.map(item => (
              <div key={item.stage} style={{ background: GRAY4, borderRadius: 12, padding: '16px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: 9, fontWeight: 800, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>{item.stage}</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: dayColor(item.days, 7, 21), lineHeight: 1 }}>
                  {item.days != null ? `${item.days}d` : '—'}
                </div>
                <div style={{ fontSize: 9, color: GRAY3, marginTop: 6 }}>{item.desc}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* Por Closer */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>Por Closer</div>
              {velocityData.byCloser.length === 0 ? (
                <div style={{ fontSize: 12, color: GRAY3 }}>Nenhum closer cadastrado</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #F0F0F0' }}>
                      {['Closer', 'Ent→RA', 'RA→RR', 'RR→Venda', 'Total', 'Deals'].map(h => (
                        <th key={h} style={{ padding: '6px 10px', textAlign: h === 'Closer' ? 'left' : 'center', fontSize: 9, fontWeight: 700, color: GRAY3, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {velocityData.byCloser.map((c, i) => {
                      const clr = [PURPLE, BLUE, GREEN, R, YELLOW][i % 5]
                      const d = (v: number | null) => v != null ? `${v}d` : '—'
                      return (
                        <tr key={c.nome} style={{ borderBottom: '1px solid #F9F9F9' }}>
                          <td style={{ padding: '8px 10px', fontWeight: 800, color: clr }}>{c.nome}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, color: dayColor(c.entToRa, 7, 21) }}>{d(c.entToRa)}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, color: dayColor(c.raToRr, 7, 21) }}>{d(c.raToRr)}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, color: dayColor(c.rrToVenda, 7, 21) }}>{d(c.rrToVenda)}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 800, color: dayColor(c.total, 14, 30) }}>{d(c.total)}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'center', color: GRAY2, fontWeight: 700 }}>{c.deals}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Por Canal */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>Por Canal</div>
              {velocityData.byCanal.length === 0 ? (
                <div style={{ fontSize: 12, color: GRAY3 }}>Sem deals ganhos com canal preenchido</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #F0F0F0' }}>
                      {['Canal', 'RR→Venda', 'Ciclo Total', 'Deals'].map(h => (
                        <th key={h} style={{ padding: '6px 10px', textAlign: h === 'Canal' ? 'left' : 'center', fontSize: 9, fontWeight: 700, color: GRAY3, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {velocityData.byCanal.map(c => (
                      <tr key={c.canal} style={{ borderBottom: '1px solid #F9F9F9' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 700, color: CANAL_COLORS[c.canal] || GRAY2 }}>{c.canal}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, color: dayColor(c.rrToVenda) }}>{c.rrToVenda != null ? `${c.rrToVenda}d` : '—'}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, color: dayColor(c.total) }}>{c.total != null ? `${c.total}d` : '—'}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'center', color: GRAY2, fontWeight: 700 }}>{c.deals}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </Card>

        {/* ── Win Rate por Tier e Segmento ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Card
            title="Win Rate por Tier (ICP por Porte)"
            info="Taxa de conversão real (ganhos ÷ (ganhos + perdidos)) por porte de empresa. Identifica o ICP real — qual tamanho converte melhor. O ticket médio mostra o valor médio dos deals ganhos por porte.">
            {tierAnalysis.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 32, fontSize: 13, color: GRAY3 }}>Sem dados com tier preenchido</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {tierAnalysis.sort((a, b) => (b.winRate || 0) - (a.winRate || 0)).map(t => {
                  const wr = t.winRate
                  const color = wr != null ? (wr >= 40 ? GREEN : wr >= 20 ? YELLOW : R) : GRAY3
                  return (
                    <div key={t.tier}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: GRAY1 }}>{t.tier}</span>
                        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                          <span style={{ fontSize: 10, color: GRAY2 }}>{fmt(t.ticketMedio)} / deal</span>
                          <span style={{ fontSize: 14, fontWeight: 900, color }}>{wr != null ? `${wr}%` : '—'}</span>
                        </div>
                      </div>
                      <Bar2 value={wr || 0} max={100} color={color} />
                      <div style={{ fontSize: 10, color: GRAY3, marginTop: 4 }}>{t.volume} leads · {t.vendas} vendas · {t.perdidos} perdidos</div>
                    </div>
                  )
                })}
                <div style={{ marginTop: 4, padding: '10px 14px', background: GRAY4, borderRadius: 10 }}>
                  <div style={{ fontSize: 10, color: GRAY2, fontWeight: 600 }}>
                    Melhor ICP: <strong style={{ color: GRAY1 }}>
                      {[...tierAnalysis].sort((a, b) => (b.winRate || 0) - (a.winRate || 0))[0]?.tier}
                    </strong> — maior taxa de conversão
                  </div>
                </div>
              </div>
            )}
          </Card>

          <Card
            title="Win Rate por Segmento"
            info="Taxa de conversão por setor de mercado. Identifica em quais nichos a operação é mais eficiente. Use para focar prospecção nos segmentos com maior win rate.">
            {segmentoAnalysis.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 32, fontSize: 13, color: GRAY3 }}>Sem dados com segmento preenchido</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[...segmentoAnalysis].sort((a, b) => (b.winRate || 0) - (a.winRate || 0)).map(s => {
                  const wr = s.winRate
                  const color = wr != null ? (wr >= 35 ? GREEN : wr >= 15 ? YELLOW : R) : GRAY3
                  return (
                    <div key={s.seg}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: GRAY1 }}>{s.seg}</span>
                        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                          <span style={{ fontSize: 10, color: GRAY3 }}>{s.volume} leads</span>
                          <span style={{ fontSize: 13, fontWeight: 900, color }}>{wr != null ? `${wr}%` : '—'}</span>
                        </div>
                      </div>
                      <Bar2 value={wr || 0} max={100} color={color} />
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        </div>

        {/* ── Motivos de Perda ── */}
        {motivosPerda.totalPerdidos > 0 && (
          <Card
            title={`Motivos de Perda — ${motivosPerda.totalPerdidos} leads perdidos`}
            info="Analisa os principais motivos pelos quais leads foram perdidos, separando por etapa (Pré-Vendas e Closer). Use para identificar os maiores gargalos: se 'Incontactável' domina em Pré-Vendas, o problema é de cadência; se 'Preço alto' domina no Closer, é um problema de posicionamento ou qualificação BANT.">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
              {/* Pré-Vendas */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 800, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>
                  Pré-Vendas
                  {motivosPerda.semMotivoPreVendas > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 600, color: YELLOW, marginLeft: 8 }}>({motivosPerda.semMotivoPreVendas} sem motivo)</span>
                  )}
                </div>
                {motivosPerda.preVendas.length === 0 ? (
                  <div style={{ fontSize: 12, color: GRAY3, padding: '12px 0' }}>Nenhum motivo registrado</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {motivosPerda.preVendas.map((m, i) => (
                      <div key={m.motivo}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <span style={{ fontSize: 10, fontWeight: 800, color: WHITE, background: i === 0 ? R : GRAY2, borderRadius: 4, padding: '1px 6px', minWidth: 18, textAlign: 'center' }}>{i + 1}</span>
                            <span style={{ fontSize: 12, color: GRAY1 }}>{m.motivo}</span>
                          </div>
                          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
                            <span style={{ fontSize: 11, color: GRAY3 }}>{m.count}×</span>
                            <span style={{ fontSize: 13, fontWeight: 900, color: i === 0 ? R : GRAY2 }}>{m.pct}%</span>
                          </div>
                        </div>
                        <Bar2 value={m.count} max={motivosPerda.preVendas[0]?.count || 1} color={i === 0 ? R : GRAY3} />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Closer */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 800, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>
                  Closer
                  {motivosPerda.semMotivoCloser > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 600, color: YELLOW, marginLeft: 8 }}>({motivosPerda.semMotivoCloser} sem motivo)</span>
                  )}
                </div>
                {motivosPerda.closer.length === 0 ? (
                  <div style={{ fontSize: 12, color: GRAY3, padding: '12px 0' }}>Nenhum motivo registrado</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {motivosPerda.closer.map((m, i) => (
                      <div key={m.motivo}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <span style={{ fontSize: 10, fontWeight: 800, color: WHITE, background: i === 0 ? R : GRAY2, borderRadius: 4, padding: '1px 6px', minWidth: 18, textAlign: 'center' }}>{i + 1}</span>
                            <span style={{ fontSize: 12, color: GRAY1 }}>{m.motivo}</span>
                          </div>
                          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
                            <span style={{ fontSize: 11, color: GRAY3 }}>{m.count}×</span>
                            <span style={{ fontSize: 13, fontWeight: 900, color: i === 0 ? R : GRAY2 }}>{m.pct}%</span>
                          </div>
                        </div>
                        <Bar2 value={m.count} max={motivosPerda.closer[0]?.count || 1} color={i === 0 ? R : GRAY3} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* ── BANT Analytics ── */}
        {bantAnalysis && (
          <Card
            title="BANT Analytics — Qualidade de Qualificação"
            info="BANT: Budget, Authority, Need, Timing. Mostra quais campos estão preenchidos nos leads ativos e o impacto direto no win rate. Leads com BANT completo geralmente convertem significativamente mais.">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: GRAY3, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>Completude por Campo — {bantAnalysis.total} leads ativos</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {bantAnalysis.pcts.map(p => (
                    <div key={p.field}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: GRAY1 }}>{p.field}</span>
                        <span style={{ fontSize: 12, fontWeight: 900, color: p.pct >= 70 ? GREEN : p.pct >= 40 ? YELLOW : R }}>{p.pct}%</span>
                      </div>
                      <Bar2 value={p.pct} max={100} color={p.pct >= 70 ? GREEN : p.pct >= 40 ? YELLOW : R} />
                      <div style={{ fontSize: 10, color: GRAY3, marginTop: 3 }}>{p.count} de {bantAnalysis.total} leads</div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: GRAY3, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>Impacto do BANT no Win Rate</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ background: `${GREEN}10`, border: `1px solid ${GREEN}30`, borderRadius: 12, padding: '16px 18px' }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: GREEN, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>✓ BANT Completo (4/4)</div>
                    <div style={{ fontSize: 32, fontWeight: 900, color: GREEN, lineHeight: 1 }}>{bantAnalysis.wrFull != null ? `${bantAnalysis.wrFull}%` : '—'}</div>
                    <div style={{ fontSize: 11, color: GRAY2, marginTop: 6 }}>taxa de conversão · {bantAnalysis.fullyQual} leads</div>
                  </div>
                  <div style={{ background: `${YELLOW}10`, border: `1px solid ${YELLOW}30`, borderRadius: 12, padding: '16px 18px' }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: YELLOW, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>⚠ BANT Incompleto</div>
                    <div style={{ fontSize: 32, fontWeight: 900, color: YELLOW, lineHeight: 1 }}>{bantAnalysis.wrPart != null ? `${bantAnalysis.wrPart}%` : '—'}</div>
                    <div style={{ fontSize: 11, color: GRAY2, marginTop: 6 }}>taxa de conversão · {bantAnalysis.total - bantAnalysis.fullyQual} leads</div>
                  </div>
                  <div style={{ background: GRAY4, borderRadius: 12, padding: '12px 16px' }}>
                    <div style={{ fontSize: 10, color: GRAY2 }}>Score BANT médio: <strong style={{ color: GRAY1 }}>{bantAnalysis.avgScore}/4</strong></div>
                    {bantAnalysis.wrFull != null && bantAnalysis.wrPart != null && bantAnalysis.wrFull > bantAnalysis.wrPart && (
                      <div style={{ fontSize: 10, color: GREEN, marginTop: 4 }}>
                        BANT completo converte <strong>{bantAnalysis.wrFull - bantAnalysis.wrPart}pp</strong> a mais
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* ── Revenue Attribution ── */}
        {revenueAttribution.total > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Card
              title={`Receita por Canal — ${fmt(revenueAttribution.total)} total`}
              info="Distribuição de receita (TCV) entre canais de aquisição. Se um canal tem 10% do volume mas 40% da receita, ele é desproporcionalmente valioso. Use para calibrar onde alocar orçamento.">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {revenueAttribution.byCanal.map(c => (
                  <div key={c.name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: GRAY1 }}>{c.name}</span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 12, fontWeight: 900, color: GREEN }}>{fmt(c.tcv)}</div>
                        <div style={{ fontSize: 9, color: GRAY3 }}>{c.count} deals · {c.pct}%</div>
                      </div>
                    </div>
                    <Bar2 value={c.pct} max={100} color={c.color} />
                  </div>
                ))}
              </div>
            </Card>

            <Card
              title="Receita por Closer"
              info="Contribuição individual de cada closer na receita total gerada no período. Inclui número de vendas e percentual da receita. Use para calibrar metas individuais.">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {revenueAttribution.byCloser.map(c => (
                  <div key={c.name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 900, color: c.color }}>{c.name}</div>
                        <div style={{ fontSize: 10, color: GRAY3 }}>{c.count} vendas · {c.pct}% da receita</div>
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 900, color: GREEN }}>{fmt(c.tcv)}</div>
                    </div>
                    <div style={{ height: 8, background: '#F0F0F0', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: 8, borderRadius: 4, background: `linear-gradient(90deg, ${c.color}90, ${c.color})`, width: `${c.pct}%`, transition: 'width .6s' }} />
                    </div>
                    <div style={{ fontSize: 10, color: GRAY2, marginTop: 6 }}>
                      Ticket médio: <strong style={{ color: GRAY1 }}>{fmt(c.count > 0 ? c.tcv / c.count : 0)}</strong>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* ── Gráfico Velocity por Canal ── */}
        {velocityData.byCanal.length > 0 && (
          <Card
            title="Ciclo de Venda por Canal (dias — deals ganhos)"
            info="Comparação visual do tempo de ciclo entre canais. 'Ciclo Total' é da entrada à venda; 'RR→Venda' é da reunião realizada ao fechamento. Canais com ciclos menores geram retorno mais rápido.">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={velocityData.byCanal.map(c => ({ name: c.canal, dias: c.total ?? 0, rr: c.rrToVenda ?? 0 }))} barCategoryGap="35%">
                <CartesianGrid strokeDasharray="2 4" stroke="#EBEBEB" />
                <XAxis dataKey="name" tick={{ fill: GRAY2, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: GRAY2, fontSize: 10 }} axisLine={false} tickLine={false} unit="d" />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: any, n: string) => [`${v}d`, n === 'dias' ? 'Ciclo Total' : 'RR→Venda']} />
                <Bar dataKey="dias" name="Ciclo Total" fill={BLUE} radius={[6, 6, 0, 0]} isAnimationActive animationDuration={800} />
                <Bar dataKey="rr"   name="RR→Venda"   fill={R}    radius={[6, 6, 0, 0]} isAnimationActive animationDuration={800} animationBegin={100} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}

        <div style={{ height: 24 }} />
      </div>
    </CRMLayout>
  )
}
