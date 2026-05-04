'use client'
export const dynamic = 'force-dynamic'
import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import CRMLayout from '../../_components/CRMLayout'
import { Check, CreditCard, QrCode, FileText, Calendar, X } from 'lucide-react'
import { R, WHITE, GRAY1, GRAY2, GRAY3, GRAY4 } from '@/lib/crm-constants'

const BORDER = '#E5E7EB'

// ─── Data ────────────────────────────────────────────────────────────────────
interface DedicationOption { percentage: string; hoursMonth: string; volume: string; priceMonth: number }
interface Service { id: string; name: string; description: string; dedications: DedicationOption[] }

const SERVICES: Service[] = [
  { id: 'midia-paga', name: 'Profissional de Mídia Paga', description: 'Gestão estratégica de campanhas pagas com foco em ROI e performance.', dedications: [
    { percentage: '10%', hoursMonth: '16h', volume: '6 campanhas (até R$ 5.000 gerenciados)', priceMonth: 5497.12 },
    { percentage: '15%', hoursMonth: '24h', volume: '9 campanhas (até R$ 10.000 gerenciados)', priceMonth: 8245.68 },
    { percentage: '25%', hoursMonth: '40h', volume: '15 campanhas (até R$ 20.000 gerenciados)', priceMonth: 13742.80 },
    { percentage: '50%', hoursMonth: '80h', volume: '30 campanhas (até R$ 50.000 gerenciados)', priceMonth: 27485.61 },
    { percentage: '100%', hoursMonth: '160h', volume: 'Operação completa (acima R$ 50.000 gerenciados)', priceMonth: 54971.21 },
  ]},
  { id: 'design-grafico', name: 'Profissional de Design Gráfico', description: 'Criação de peças visuais para campanhas, redes sociais e materiais digitais.', dedications: [
    { percentage: '10%', hoursMonth: '16h', volume: 'até 8 peças', priceMonth: 7706.88 },
    { percentage: '15%', hoursMonth: '24h', volume: 'até 12 peças', priceMonth: 11560.31 },
    { percentage: '25%', hoursMonth: '40h', volume: 'até 25 peças', priceMonth: 19267.19 },
    { percentage: '50%', hoursMonth: '80h', volume: 'até 50 peças', priceMonth: 38534.38 },
    { percentage: '100%', hoursMonth: '160h', volume: '80+ peças', priceMonth: 77068.75 },
  ]},
  { id: 'social-media', name: 'Social Media', description: 'Gestão completa de redes sociais com planejamento de conteúdo e engajamento.', dedications: [
    { percentage: '10%', hoursMonth: '16h', volume: '8 a 10 posts/mês', priceMonth: 7706.88 },
    { percentage: '15%', hoursMonth: '24h', volume: '12 a 15 posts/mês', priceMonth: 11560.31 },
    { percentage: '25%', hoursMonth: '40h', volume: '20 a 25 posts/mês', priceMonth: 19267.19 },
    { percentage: '50%', hoursMonth: '80h', volume: '40 a 50 posts/mês', priceMonth: 38534.38 },
    { percentage: '100%', hoursMonth: '160h', volume: '80+ posts/mês', priceMonth: 77068.75 },
  ]},
  { id: 'redator', name: 'Redator Publicitário', description: 'Produção de textos persuasivos para campanhas, e-mails, LPs e scripts.', dedications: [
    { percentage: '10%', hoursMonth: '16h', volume: '8 a 10 textos curtos', priceMonth: 5750.94 },
    { percentage: '15%', hoursMonth: '24h', volume: '12 a 15 textos curtos + 1 roteiro', priceMonth: 8626.41 },
    { percentage: '25%', hoursMonth: '40h', volume: '20 a 25 textos diversos', priceMonth: 14377.35 },
    { percentage: '50%', hoursMonth: '80h', volume: '40 a 50 textos (incluindo e-mails, LPs e scripts)', priceMonth: 28754.69 },
    { percentage: '100%', hoursMonth: '160h', volume: '80+ textos completos', priceMonth: 57509.38 },
  ]},
  { id: 'analista-crm', name: 'Analista de CRM', description: 'Gestão de fluxos de automação, dashboards e integrações de CRM.', dedications: [
    { percentage: '10%', hoursMonth: '16h', volume: '1 a 2 fluxos + revisões básicas', priceMonth: 4327.13 },
    { percentage: '15%', hoursMonth: '24h', volume: '2 a 3 fluxos + dashboards simples', priceMonth: 6490.69 },
    { percentage: '25%', hoursMonth: '40h', volume: '4 a 6 fluxos + relatórios semanais', priceMonth: 10817.81 },
    { percentage: '50%', hoursMonth: '80h', volume: '8+ fluxos + integrações complexas', priceMonth: 21635.63 },
    { percentage: '100%', hoursMonth: '160h', volume: '15+ fluxos + relatórios avançados', priceMonth: 43271.25 },
  ]},
  { id: 'bi', name: 'Profissional de BI', description: 'Criação de dashboards, análises e projeções baseadas em dados.', dedications: [
    { percentage: '10%', hoursMonth: '16h', volume: '1 dashboard + relatórios simples', priceMonth: 4957.13 },
    { percentage: '15%', hoursMonth: '24h', volume: '2 dashboards + análises pontuais', priceMonth: 7435.69 },
    { percentage: '25%', hoursMonth: '40h', volume: '3 a 5 dashboards + acompanhamento mensal', priceMonth: 12392.81 },
    { percentage: '50%', hoursMonth: '80h', volume: '8+ dashboards + análises e projeções', priceMonth: 24785.63 },
    { percentage: '100%', hoursMonth: '160h', volume: '15+ dashboards + relatórios executivos', priceMonth: 49571.25 },
  ]},
  { id: 'marketplace', name: 'Profissional de Marketplace', description: 'Gestão de produtos e pedidos em marketplaces digitais.', dedications: [
    { percentage: '10%', hoursMonth: '16h', volume: '10 a 15 produtos; 30 pedidos/semana', priceMonth: 5497.13 },
    { percentage: '15%', hoursMonth: '24h', volume: '20 a 30 produtos; 50 a 70 pedidos/semana', priceMonth: 8245.69 },
    { percentage: '25%', hoursMonth: '40h', volume: '40 a 50 produtos; 100+ pedidos/semana', priceMonth: 13742.81 },
    { percentage: '50%', hoursMonth: '80h', volume: '80 a 100 produtos; 200+ pedidos/semana', priceMonth: 27485.63 },
    { percentage: '100%', hoursMonth: '160h', volume: '150+ produtos; 400+ pedidos/semana', priceMonth: 54971.25 },
  ]},
  { id: 'seo', name: 'Profissional de SEO', description: 'Otimização para mecanismos de busca com auditorias e estratégias de crescimento orgânico.', dedications: [
    { percentage: '10%', hoursMonth: '16h', volume: '1 auditoria + 3 otimizações', priceMonth: 5477.18 },
    { percentage: '15%', hoursMonth: '24h', volume: '2 auditorias + 5 otimizações', priceMonth: 8215.76 },
    { percentage: '25%', hoursMonth: '40h', volume: '4 auditorias + 10 otimizações', priceMonth: 13692.94 },
    { percentage: '50%', hoursMonth: '80h', volume: '8+ auditorias + 20 otimizações', priceMonth: 27385.88 },
    { percentage: '100%', hoursMonth: '160h', volume: '15+ auditorias + planejamento completo', priceMonth: 54771.75 },
  ]},
  { id: 'kommo', name: 'Manutenção CRM Kommo', description: 'Monitoramento, administração de usuários e personalizações do CRM Kommo.', dedications: [
    { percentage: '—', hoursMonth: '2h', volume: 'Monitoramento, administração de usuários, personalizações', priceMonth: 714.64 },
  ]},
  { id: 'landing-page', name: 'Manutenção de Landing Page', description: 'Revisão, troca de copy, imagens e garantia de excelência das LPs.', dedications: [
    { percentage: '—', hoursMonth: '1h', volume: 'Revisão, troca de copy, imagens, garantir excelência', priceMonth: 620.63 },
  ]},
]

const fmtCur = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// ─── ServiceCard ─────────────────────────────────────────────────────────────
function ServiceCard({ service, selectedDedication, onSelect }: { service: Service; selectedDedication: DedicationOption | null; onSelect: (d: DedicationOption | null) => void }) {
  const [open, setOpen] = useState(false)
  const selected = !!selectedDedication

  return (
    <>
      <div
        onClick={() => setOpen(true)}
        style={{
          background: WHITE, border: `1.5px solid ${selected ? `${R}50` : BORDER}`,
          borderRadius: 12, padding: '16px 18px', cursor: 'pointer',
          boxShadow: selected ? `0 0 0 3px ${R}12, 0 2px 8px rgba(0,0,0,.06)` : '0 1px 4px rgba(0,0,0,.05)',
          transition: 'all .18s',
        }}
        onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLElement).style.borderColor = '#D1D5DB' }}
        onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLElement).style.borderColor = BORDER }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={e => { e.stopPropagation(); if (selected) onSelect(null) }}
            style={{
              width: 16, height: 16, borderRadius: '50%', border: 'none', flexShrink: 0, cursor: selected ? 'pointer' : 'default',
              background: selected ? R : '#D1D5DB', transition: 'all .15s',
            }}
          />
          <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: GRAY1 }}>{service.name}</span>
          {selected && <span style={{ fontSize: 13, fontWeight: 700, color: R, whiteSpace: 'nowrap' }}>{fmtCur(selectedDedication!.priceMonth)}/mês</span>}
        </div>
        {selected ? (
          <div style={{ marginTop: 8, marginLeft: 26, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: `${R}12`, color: R }}>{selectedDedication!.percentage}</span>
            <span style={{ fontSize: 11, color: GRAY2 }}>{selectedDedication!.hoursMonth} · {selectedDedication!.volume}</span>
          </div>
        ) : (
          <p style={{ marginTop: 4, marginLeft: 26, fontSize: 12, color: GRAY3 }}>Clique para selecionar</p>
        )}
      </div>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: WHITE, borderRadius: 16, padding: 0, zIndex: 101, width: 420, maxWidth: '92vw', maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,.2)' }}>
            <div style={{ padding: '20px 22px 14px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: GRAY1 }}>{service.name}</div>
                <div style={{ fontSize: 12, color: GRAY2, marginTop: 4 }}>{service.description}</div>
              </div>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: GRAY3, padding: 2, display: 'flex' }}><X size={16} /></button>
            </div>
            <div style={{ overflowY: 'auto', padding: '10px 12px 16px' }}>
              {service.dedications.map(ded => (
                <button
                  key={ded.percentage + ded.priceMonth}
                  onClick={() => { onSelect(ded); setOpen(false) }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 10, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', transition: 'background .12s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = GRAY4)}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {ded.percentage !== '—' && (
                      <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 20, background: `${R}12`, color: R, minWidth: 42, textAlign: 'center' }}>{ded.percentage}</span>
                    )}
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: GRAY1 }}>{ded.volume}</div>
                      <div style={{ fontSize: 11, color: GRAY3, marginTop: 2 }}>{ded.hoursMonth}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: GRAY1 }}>{fmtCur(ded.priceMonth)}</div>
                    <div style={{ fontSize: 10, color: GRAY3 }}>/mês</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  )
}

// ─── PricingSummary ──────────────────────────────────────────────────────────
type ContractDuration = 6 | 12 | null
type PaymentGroup = 'cartao' | 'pix-boleto' | 'cheque' | null
type CardInst = '1x' | '6x' | '12x' | 'recorrente' | null
type PixInst = '1x' | '6x' | '12x' | null
type ChequeInst = '2x' | '3x' | '4x' | '5x' | '6x' | null

const CARD_INSTS = [
  { id: '1x' as CardInst, label: '1x (à vista)', discount: 0.30 },
  { id: '6x' as CardInst, label: '6x', discount: 0.25 },
  { id: '12x' as CardInst, label: '12x', discount: 0.20 },
  { id: 'recorrente' as CardInst, label: 'Recorrente', discount: 0.12 },
]
const PIX_INSTS = [
  { id: '1x' as PixInst, label: '1x (à vista)', discount: 0.30 },
  { id: '6x' as PixInst, label: '6x', discount: 0 },
  { id: '12x' as PixInst, label: '12x', discount: 0 },
]
const CHEQUE_INSTS = [
  { id: '2x' as ChequeInst, label: '2x', discount: 0.25 },
  { id: '3x' as ChequeInst, label: '3x', discount: 0.25 },
  { id: '4x' as ChequeInst, label: '4x', discount: 0.20 },
  { id: '5x' as ChequeInst, label: '5x', discount: 0.20 },
  { id: '6x' as ChequeInst, label: '6x', discount: 0.15 },
]

function PricingSummary({ selected }: { selected: { service: Service; dedication: DedicationOption }[] }) {
  const [duration, setDuration] = useState<ContractDuration>(null)
  const [payGroup, setPayGroup] = useState<PaymentGroup>(null)
  const [cardInst, setCardInst] = useState<CardInst>(null)
  const [pixInst, setPixInst] = useState<PixInst>(null)
  const [chequeInst, setChequeInst] = useState<ChequeInst>(null)

  if (selected.length === 0) return null

  const monthlyTotal = selected.reduce((s, i) => s + i.dedication.priceMonth, 0)
  const months = duration || 1
  const contractTotal = monthlyTotal * months
  const durationDisc = duration === 6 ? 0.15 : duration === 12 ? 0.30 : 0

  let payDisc = 0
  if (payGroup === 'cartao' && cardInst) payDisc = CARD_INSTS.find(c => c.id === cardInst)?.discount || 0
  if (payGroup === 'pix-boleto' && pixInst) payDisc = PIX_INSTS.find(p => p.id === pixInst)?.discount || 0
  if (payGroup === 'cheque' && chequeInst) payDisc = CHEQUE_INSTS.find(c => c.id === chequeInst)?.discount || 0

  const durationDiscVal = contractTotal * durationDisc
  const payDiscVal = contractTotal * payDisc
  const finalTotal = contractTotal - durationDiscVal - payDiscVal
  const totalDisc = durationDiscVal + payDiscVal
  const totalDiscPct = contractTotal > 0 ? (totalDisc / contractTotal) * 100 : 0

  let installCount: number | null = null
  if (payGroup === 'cartao') {
    if (cardInst === '1x') installCount = 1
    else if (cardInst === '6x') installCount = 6
    else if (cardInst === '12x') installCount = 12
    else if (cardInst === 'recorrente') installCount = months
  }
  if (payGroup === 'pix-boleto') {
    if (pixInst === '1x') installCount = 1
    else if (pixInst === '6x') installCount = 6
    else if (pixInst === '12x') installCount = 12
  }
  if (payGroup === 'cheque' && chequeInst) installCount = parseInt(chequeInst)
  const installVal = installCount && installCount > 1 ? finalTotal / installCount : null

  const resetPayment = () => { setPayGroup(null); setCardInst(null); setPixInst(null); setChequeInst(null) }

  const CARD_STYLE: React.CSSProperties = { background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px', cursor: 'pointer', textAlign: 'left', transition: 'all .15s', width: '100%' }
  const CARD_ACTIVE: React.CSSProperties = { ...CARD_STYLE, border: `1.5px solid ${R}50`, background: `${R}06` }

  return (
    <div style={{ marginTop: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ width: 4, height: 28, background: R, borderRadius: 2 }} />
        <h2 style={{ fontSize: 20, fontWeight: 800, color: GRAY1, margin: 0 }}>Resumo da Proposta</h2>
      </div>

      {/* Line items */}
      <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, padding: '10px 16px', background: GRAY4, fontSize: 10, fontWeight: 700, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          <span>Serviço</span><span>Volume</span><span>Preço/mês</span>
        </div>
        {selected.map(({ service, dedication }) => (
          <div key={service.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, padding: '12px 16px', borderTop: `1px solid ${BORDER}`, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: GRAY1 }}>{service.name}</div>
              <div style={{ fontSize: 11, color: GRAY3, marginTop: 2 }}>{dedication.percentage} · {dedication.hoursMonth}</div>
            </div>
            <div style={{ fontSize: 11, color: GRAY2, maxWidth: 200, textAlign: 'right' }}>{dedication.volume}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: GRAY1, whiteSpace: 'nowrap' }}>{fmtCur(dedication.priceMonth)}</div>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderTop: `1px solid ${BORDER}`, background: GRAY4 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: GRAY1 }}>Total mensal</span>
          <span style={{ fontSize: 20, fontWeight: 900, color: R }}>{fmtCur(monthlyTotal)}</span>
        </div>
      </div>

      {/* Contract Duration */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Calendar size={16} color={R} />
          <span style={{ fontSize: 15, fontWeight: 700, color: GRAY1 }}>Comprometimento do Contrato</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {([6, 12] as const).map(d => {
            const sel = duration === d
            const disc = d === 6 ? 15 : 30
            return (
              <button key={d} onClick={() => { if (sel) { setDuration(null); resetPayment() } else setDuration(d) }} style={sel ? { ...CARD_ACTIVE } : { ...CARD_STYLE }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 20, fontWeight: 900, color: GRAY1 }}>{d} meses</span>
                  {sel && <Check size={16} color={R} />}
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: `${R}15`, color: R }}>{disc}% de desconto</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Payment Method */}
      {duration && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <CreditCard size={16} color={R} />
            <span style={{ fontSize: 15, fontWeight: 700, color: GRAY1 }}>Forma de Pagamento</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            {[
              { id: 'cartao' as PaymentGroup, label: 'Cartão de Crédito', icon: <CreditCard size={15} /> },
              { id: 'pix-boleto' as PaymentGroup, label: 'Pix ou Boleto', icon: <QrCode size={15} /> },
              { id: 'cheque' as PaymentGroup, label: 'Cheque', icon: <FileText size={15} />, note: 'até 25% de desconto' },
            ].map(g => {
              const sel = payGroup === g.id
              return (
                <button key={g.id} onClick={() => { if (sel) resetPayment(); else { setPayGroup(g.id); setCardInst(null); setPixInst(null); setChequeInst(null) } }} style={sel ? CARD_ACTIVE : CARD_STYLE}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: GRAY1 }}>{g.icon}{g.label}</div>
                    {sel && <Check size={14} color={R} />}
                  </div>
                  {g.note && <div style={{ fontSize: 11, color: R, fontWeight: 700, marginTop: 4 }}>{g.note}</div>}
                </button>
              )
            })}
          </div>

          {payGroup === 'cartao' && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, color: GRAY2, marginBottom: 8 }}>Parcelamento:</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {CARD_INSTS.map(o => {
                  const sel = cardInst === o.id
                  return (
                    <button key={o.id} onClick={() => setCardInst(sel ? null : o.id)} style={sel ? { ...CARD_ACTIVE, padding: '10px 12px', textAlign: 'center' } : { ...CARD_STYLE, padding: '10px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: GRAY1 }}>{o.label}</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: R, marginTop: 2 }}>{o.discount * 100}% desc.</div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          {payGroup === 'pix-boleto' && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, color: GRAY2, marginBottom: 8 }}>Parcelamento:</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {PIX_INSTS.map(o => {
                  const sel = pixInst === o.id
                  return (
                    <button key={o.id} onClick={() => setPixInst(sel ? null : o.id)} style={sel ? { ...CARD_ACTIVE, padding: '10px 12px', textAlign: 'center' } : { ...CARD_STYLE, padding: '10px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: GRAY1 }}>{o.label}</div>
                      <div style={{ fontSize: 11, fontWeight: 700, marginTop: 2, color: o.discount > 0 ? R : GRAY3 }}>{o.discount > 0 ? `${o.discount * 100}% desc.` : 'sem desconto'}</div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          {payGroup === 'cheque' && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, color: GRAY2, marginBottom: 8 }}>Parcelamento:</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                {CHEQUE_INSTS.map(o => {
                  const sel = chequeInst === o.id
                  return (
                    <button key={o.id} onClick={() => setChequeInst(sel ? null : o.id)} style={sel ? { ...CARD_ACTIVE, padding: '10px 12px', textAlign: 'center' } : { ...CARD_STYLE, padding: '10px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: GRAY1 }}>{o.label}</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: R, marginTop: 2 }}>{o.discount * 100}% desc.</div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Final total */}
      {duration && (
        <div style={{ background: WHITE, border: `1.5px solid ${R}30`, borderRadius: 14, padding: 22, boxShadow: `0 0 0 4px ${R}08, 0 4px 20px rgba(0,0,0,.07)` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: GRAY3, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Serviços contratados</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {selected.map(({ service, dedication }) => (
              <div key={service.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: GRAY1 }}>{service.name}</div>
                  <div style={{ fontSize: 11, color: GRAY3 }}>{dedication.percentage} · {dedication.hoursMonth} · {dedication.volume}</div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: GRAY1, whiteSpace: 'nowrap', marginLeft: 12 }}>{fmtCur(dedication.priceMonth)}/mês</div>
              </div>
            ))}
          </div>
          <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: GRAY2 }}>
              <span>Contrato de {months} meses ({fmtCur(monthlyTotal)}/mês)</span>
              <span>{fmtCur(contractTotal)}</span>
            </div>
            {durationDisc > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: R }}>
                <span>Desconto comprometimento ({durationDisc * 100}%)</span>
                <span>-{fmtCur(durationDiscVal)}</span>
              </div>
            )}
            {payDisc > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: R }}>
                <span>Desconto pagamento ({payDisc * 100}%)</span>
                <span>-{fmtCur(payDiscVal)}</span>
              </div>
            )}
          </div>
          <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 14, marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <div style={{ fontSize: 13, color: GRAY2 }}>Valor final do contrato</div>
              {totalDisc > 0 && <div style={{ fontSize: 12, fontWeight: 700, color: R, marginTop: 2 }}>Economia total: {fmtCur(totalDisc)} ({totalDiscPct.toFixed(1)}%)</div>}
            </div>
            {installVal ? (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: GRAY1 }}>{installCount}x de {fmtCur(installVal)}</div>
                <div style={{ fontSize: 12, color: GRAY2 }}>Total: {fmtCur(finalTotal)}</div>
              </div>
            ) : (
              <div style={{ fontSize: 28, fontWeight: 900, color: GRAY1 }}>{fmtCur(finalTotal)}</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function CalculadoraExecutarPage() {
  const router = useRouter()
  const [selections, setSelections] = useState<Record<string, DedicationOption | null>>({})

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push('/login')
    })
  }, [])

  const handleSelect = (id: string, ded: DedicationOption | null) => setSelections(p => ({ ...p, [id]: ded }))
  const selectedServices = SERVICES.filter(s => selections[s.id]).map(s => ({ service: s, dedication: selections[s.id]! }))

  return (
    <CRMLayout>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: R, textTransform: 'uppercase', letterSpacing: '0.18em', marginBottom: 6 }}>Calculadoras</div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: GRAY1, margin: 0, letterSpacing: '-0.02em' }}>Calculadora Executar</h1>
          <p style={{ fontSize: 14, color: GRAY2, marginTop: 6 }}>
            Selecione os profissionais e nível de dedicação para compor o escopo ideal.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {SERVICES.map(s => (
            <ServiceCard key={s.id} service={s} selectedDedication={selections[s.id] || null} onSelect={ded => handleSelect(s.id, ded)} />
          ))}
        </div>

        <PricingSummary selected={selectedServices} />
        <div style={{ height: 40 }} />
      </div>
    </CRMLayout>
  )
}
