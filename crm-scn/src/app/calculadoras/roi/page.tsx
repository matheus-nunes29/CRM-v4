'use client'
export const dynamic = 'force-dynamic'
import React, { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import CRMLayout from '../../_components/CRMLayout'
import { R, WHITE, GRAY1, GRAY2, GRAY3, GRAY4 } from '@/lib/crm-constants'

const BORDER = '#E5E7EB'
const GREEN = '#16A34A'

const fmtCur = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function InputCard({ label, value, onChange, prefix, suffix }: { label: string; value: string; onChange: (v: string) => void; prefix?: string; suffix?: string }) {
  return (
    <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: GRAY2, marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {prefix && <span style={{ fontSize: 14, fontWeight: 600, color: GRAY3 }}>{prefix}</span>}
        <input
          type="text"
          inputMode="numeric"
          style={{ flex: 1, border: 'none', outline: 'none', fontSize: 24, fontWeight: 900, color: GRAY1, background: 'transparent', fontFamily: 'inherit' }}
          placeholder="0"
          value={value}
          onChange={e => {
            const raw = e.target.value.replace(/\D/g, '')
            if (raw === '') { onChange(''); return }
            onChange(Number(raw).toLocaleString('pt-BR'))
          }}
        />
        {suffix && <span style={{ fontSize: 14, fontWeight: 600, color: GRAY3 }}>{suffix}</span>}
      </div>
    </div>
  )
}

function ResultCard({ label, value, sub, highlight }: { label: string; value: string; sub: string; highlight?: boolean }) {
  return (
    <div style={{
      background: highlight ? `${R}06` : WHITE,
      border: `1.5px solid ${highlight ? `${R}40` : BORDER}`,
      borderRadius: 12, padding: '18px 20px',
      boxShadow: highlight ? `0 0 0 3px ${R}10` : 'none',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: highlight ? R : GRAY3, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 900, color: highlight ? R : GRAY1, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: GRAY2, marginTop: 6 }}>{sub}</div>
    </div>
  )
}

function BarRow({ label, value, max, formatted, variant }: { label: string; value: number; max: number; formatted: string; variant: 'primary' | 'muted' }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 13, color: GRAY1 }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: GRAY1 }}>{formatted}</span>
      </div>
      <div style={{ height: 10, borderRadius: 99, background: '#E5E7EB', overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 99,
          background: variant === 'primary' ? R : '#9CA3AF',
          width: `${pct}%`,
          transition: 'width .7s cubic-bezier(.22,1,.36,1)',
        }} />
      </div>
    </div>
  )
}

export default function CalculadoraROIPage() {
  const router = useRouter()
  const [faturamento, setFaturamento] = useState('')
  const [ticketMedio, setTicketMedio] = useState('')
  const [margem, setMargem] = useState('')
  const [eficiencia, setEficiencia] = useState('')
  const [investimento, setInvestimento] = useState('')
  const [investimentoMidia, setInvestimentoMidia] = useState('')

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push('/login')
    })
  }, [])

  const parseNum = (v: string) => {
    const n = parseFloat(v.replace(/\./g, '').replace(',', '.'))
    return isNaN(n) ? 0 : n
  }

  const r = useMemo(() => {
    const fat = parseNum(faturamento)
    const ticket = parseNum(ticketMedio)
    const marg = parseNum(margem)
    const efic = parseNum(eficiencia)
    const invest = parseNum(investimento)
    const midia = parseNum(investimentoMidia)

    const vendasAtuais = ticket > 0 ? fat / ticket : 0
    const aumentoMensal = fat * (efic / 100)
    const novoFaturamento = fat + aumentoMensal
    const novasVendas = ticket > 0 ? novoFaturamento / ticket : 0
    const vendasExtras = novasVendas - vendasAtuais
    const lucroMensal = aumentoMensal * (marg / 100)
    const lucroAnual = lucroMensal * 12
    const aumentoAnual = aumentoMensal * 12
    const investimentoTotalMensal = invest + midia
    const investimentoAnual = investimentoTotalMensal * 12
    const roi = investimentoAnual > 0 ? lucroAnual / investimentoAnual : 0
    const roas = midia > 0 ? aumentoMensal / midia : 0
    const cac = vendasExtras > 0 ? investimentoTotalMensal / vendasExtras : null

    return { vendasAtuais, novasVendas, vendasExtras, aumentoMensal, aumentoAnual, lucroMensal, lucroAnual, investimentoAnual, roi, roas, cac }
  }, [faturamento, ticketMedio, margem, eficiencia, investimento, investimentoMidia])

  const hasInputs = parseNum(faturamento) > 0 && parseNum(ticketMedio) > 0 && parseNum(margem) > 0 && parseNum(eficiencia) > 0 && (parseNum(investimento) > 0 || parseNum(investimentoMidia) > 0)

  return (
    <CRMLayout>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: R, textTransform: 'uppercase', letterSpacing: '0.18em', marginBottom: 6 }}>Calculadoras</div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: GRAY1, margin: 0, letterSpacing: '-0.02em' }}>Calculadora de Ganho</h1>
          <p style={{ fontSize: 14, color: GRAY2, marginTop: 6 }}>
            Simule o retorno sobre investimento e descubra quanto o negócio pode crescer com a V4.
          </p>
        </div>

        {/* Inputs */}
        <div style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: GRAY1, marginBottom: 14 }}>
            Dados do <span style={{ color: R }}>Negócio</span>
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <InputCard label="Faturamento Mensal" value={faturamento} onChange={setFaturamento} prefix="R$" />
            <InputCard label="Ticket Médio" value={ticketMedio} onChange={setTicketMedio} prefix="R$" />
            <InputCard label="Margem de Contribuição" value={margem} onChange={setMargem} suffix="%" />
            <InputCard label="Eficiência no Funil" value={eficiencia} onChange={setEficiencia} suffix="%" />
            <InputCard label="Investimento Mensal V4" value={investimento} onChange={setInvestimento} prefix="R$" />
            <InputCard label="Investimento em Mídia" value={investimentoMidia} onChange={setInvestimentoMidia} prefix="R$" />
          </div>
        </div>

        {/* Results */}
        {hasInputs && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: GRAY1, marginBottom: 14 }}>
              Seu <span style={{ color: R }}>Resultado</span>
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <ResultCard
                  label="Vendas Extras / mês"
                  value={`+${r.vendasExtras.toFixed(0)}`}
                  sub={`De ${r.vendasAtuais.toFixed(0)} para ${r.novasVendas.toFixed(0)} vendas`}
                />
                <ResultCard
                  label="CAC (Custo de Aquisição)"
                  value={r.cac != null ? fmtCur(r.cac) : '—'}
                  sub="(V4 + Mídia) ÷ vendas extras/mês"
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <ResultCard label="Adicional de Receita" value={fmtCur(r.aumentoAnual)} sub={`${fmtCur(r.aumentoMensal)} / mês`} />
                <ResultCard label="ROAS" value={`${r.roas.toFixed(2)}x`} sub="Receita adicional ÷ investimento em mídia" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <ResultCard label="Adicional de Margem" value={fmtCur(r.lucroAnual)} sub={`${fmtCur(r.lucroMensal)} / mês`} />
                <ResultCard label="ROI" value={`${r.roi.toFixed(2)}x`} sub="Margem adicionada ÷ (V4 + mídia)" highlight />
              </div>

              {/* Comparison bar */}
              <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '20px 22px' }}>
                <div style={{ fontSize: 12, color: GRAY2, marginBottom: 14 }}>Comparativo Anual (Lucro vs Investimento)</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <BarRow label="Investimento Anual" value={r.investimentoAnual} max={Math.max(r.investimentoAnual, r.lucroAnual)} formatted={fmtCur(r.investimentoAnual)} variant="muted" />
                  <BarRow label="Lucro Anual" value={r.lucroAnual} max={Math.max(r.investimentoAnual, r.lucroAnual)} formatted={fmtCur(r.lucroAnual)} variant="primary" />
                </div>
              </div>
            </div>
          </div>
        )}
        <div style={{ height: 40 }} />
      </div>
    </CRMLayout>
  )
}
