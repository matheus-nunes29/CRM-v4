'use client'
export const dynamic = 'force-dynamic'
import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import CRMLayout from '../_components/CRMLayout'
import {
  R, WHITE, GRAY1, GRAY2, GRAY3, GREEN, YELLOW, PURPLE, BLUE,
  CANAIS_METAS, MESES,
  fmt, mesFmt,
  inputCls, labelCls,
} from '@/lib/crm-constants'

export default function MetasPageRoute() {
  const router = useRouter()
  const [metas, setMetas] = useState<Record<string, Record<string, any>>>({})
  const [mesSel, setMesSel] = useState(() => {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
  })

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      fetchMetas()
    })
  }, [])

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

  const navMes = (dir: number) => {
    const [y, m] = mesSel.split('-').map(Number)
    const d = new Date(y, m - 1 + dir)
    setMesSel(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  return (
    <CRMLayout>
      <MetasContent metas={metas} mesSel={mesSel} navMes={navMes} saveMeta={saveMeta} />
    </CRMLayout>
  )
}

function MetasContent({ metas, mesSel, navMes, saveMeta }: any) {
  const [canalTab, setCanalTab] = useState('Recovery')
  const [form, setForm] = useState({ meta_entradas: '', meta_ra: '', meta_rr: '', meta_vendas: '', meta_tcv: '', meta_ativacoes: '', meta_valor_investido: '' })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const canalKey = canalTab

  useEffect(() => {
    const m = metas[mesSel]?.[canalKey] || {}
    setForm({ meta_entradas: m.meta_entradas || '', meta_ra: m.meta_ra || '', meta_rr: m.meta_rr || '', meta_vendas: m.meta_vendas || '', meta_tcv: m.meta_tcv || '', meta_ativacoes: m.meta_ativacoes || '', meta_valor_investido: m.meta_valor_investido || '' })
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

            {/* Lead Broker extra fields */}
            {canalTab === 'Lead Broker' && (() => {
              const metaVI = Number(form.meta_valor_investido) || 0
              const metaEntradas = Number(form.meta_entradas) || 0
              const metaTCV = Number(form.meta_tcv) || 0
              const cpmql = metaEntradas > 0 && metaVI > 0 ? metaVI / metaEntradas : null
              const roas = metaVI > 0 && metaTCV > 0 ? metaTCV / metaVI : null
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 14, borderTop: '1px solid #F3F4F6' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: YELLOW, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Lead Broker</div>
                  <div>
                    <label style={labelCls}>💸 Meta de Valor Investido (R$)</label>
                    <input type="number" placeholder="0" style={inputCls} value={form.meta_valor_investido} onChange={e => set('meta_valor_investido', e.target.value)} />
                  </div>
                  {/* CPMQL calculado */}
                  <div style={{ background: `${PURPLE}08`, border: `1px solid ${PURPLE}20`, borderRadius: 10, padding: '12px 14px' }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: PURPLE, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>CPMQL — Meta Calculada</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: cpmql ? PURPLE : GRAY2 }}>
                      {cpmql ? fmt(cpmql) : '—'}
                    </div>
                    <div style={{ fontSize: 11, color: GRAY2, marginTop: 3 }}>Valor Investido ÷ Meta de Entradas</div>
                  </div>
                  {/* ROAS calculado */}
                  <div style={{ background: `${(roas != null && roas >= 1) ? GREEN : R}08`, border: `1px solid ${(roas != null && roas >= 1) ? GREEN : R}20`, borderRadius: 10, padding: '12px 14px' }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: (roas != null && roas >= 1) ? GREEN : R, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>ROAS — Meta Calculada</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: roas ? ((roas >= 1) ? GREEN : R) : GRAY2 }}>
                      {roas ? `${roas.toFixed(2)}x` : '—'}
                    </div>
                    <div style={{ fontSize: 11, color: GRAY2, marginTop: 3 }}>Meta TCV ÷ Valor Investido</div>
                  </div>
                </div>
              )
            })()}
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
