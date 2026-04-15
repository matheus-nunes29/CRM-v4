'use client'
import React, { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Lead } from '@/lib/supabase'
import { ArrowLeft, Building2, AlertCircle, CheckCircle2, ExternalLink, Lock } from 'lucide-react'

// ─── Design tokens ────────────────────────────────────────────────────────────
const R = '#E8001C'
const GREEN = '#16A34A'
const GRAY1 = '#1A1A1A'
const GRAY2 = '#6B7280'
const GRAY3 = '#9CA3AF'
const WHITE = '#FFFFFF'
const PANEL_BG = '#F8F8FC'
const BORDER = '#EEEEF5'

// ─── Options ──────────────────────────────────────────────────────────────────
const ORIGENS = ['Recovery', 'Lead Broker', 'Recomendação', 'Eventos', 'Indicação']
const SEGMENTOS = ['Serviço', 'Varejo', 'Indústria', 'Saúde', 'Educação', 'Tecnologia', 'Imobiliário', 'Agronegócio', 'Outro']
const CARGOS = ['Não identificado', 'Sócio', 'Diretor', 'Gerente', 'Coordenador', 'Analista', 'Assistente', 'Outro']
const CLOSERS = ['MATHEUS', 'VITOR']
const CLOSER_EMAILS: Record<string, string> = {
  'MATHEUS': 'matheus.nunes@v4company.com',
  'VITOR': 'vitor@v4company.com',
}
const TEMPERATURAS = ['FRIO', 'MORNO', 'QUENTE', 'FECHADO']
const SITUACOES_PRE_VENDAS = ['TENTANDO CONTATO', 'EM QUALIFICAÇÃO', 'REUNIÃO AGENDADA', 'NO SHOW/REMARCANDO', 'REUNIÃO REALIZADA', 'PERDIDO SDR', 'REEMBOLSO', 'AGENDA FUTURA']
const SITUACOES = ['EM FOLLOW UP', 'REUNIAO EXTRA AGENDADA', 'VENDA', 'PERDIDO CLOSER', 'AGENDA FUTURA']
const FATURAMENTOS = ['Até 100k', '100-200k', '200-400k', '400k-1M', '1M-3M', 'Acima de 3M']

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fatToTier = (f: string) => {
  if (!f) return null
  if (f === 'Até 100k') return 'TINY'
  if (f === '100-200k' || f === '200-400k') return 'SMALL'
  if (f === '400k-1M') return 'MEDIUM'
  if (f === '1M-3M') return 'LARGE'
  return 'ENTERPRISE'
}

const tempColor = (t: string | null) => {
  if (t === 'FRIO') return '#3B82F6'
  if (t === 'MORNO') return '#F59E0B'
  if (t === 'QUENTE') return R
  if (t === 'FECHADO') return GREEN
  return GRAY3
}

const formatPhone = (value: string) => {
  const d = value.replace(/\D/g, '').slice(0, 11)
  if (d.length === 0) return ''
  if (d.length <= 2) return `(${d}`
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

// ─── Shared styles ────────────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 11px', borderRadius: 8, border: `1px solid ${BORDER}`,
  fontSize: 13, color: GRAY1, background: WHITE, boxSizing: 'border-box', outline: 'none',
  fontFamily: 'inherit', transition: 'border-color .15s',
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 800, color: GRAY3, textTransform: 'uppercase',
  letterSpacing: '0.1em', borderBottom: `1px solid ${BORDER}`, paddingBottom: 8, marginBottom: 14,
}

// ─── Sub-components ───────────────────────────────────────────────────────────
type InfoFieldProps = { label: string; required?: boolean; error?: string; children: React.ReactNode }
const InfoField = ({ label, required, error, children }: InfoFieldProps) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{ fontSize: 10, fontWeight: 700, color: error ? R : GRAY3, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>
      {label}{required && <span style={{ color: R, marginLeft: 2 }}>*</span>}
    </div>
    {children}
    {error && (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 11, color: R }}>
        <AlertCircle size={11} /><span>{error}</span>
      </div>
    )}
  </div>
)

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <div style={sectionLabelStyle}>{children}</div>
)

const LockedField = ({ message }: { message: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 11px', borderRadius: 8, border: `1px dashed ${BORDER}`, background: '#FAFAFA', fontSize: 12, color: GRAY3 }}>
    <Lock size={11} color={GRAY3} /><span>{message}</span>
  </div>
)

type BantCheckProps = { bantKey: string; label: string; desc: string; checked: boolean; onToggle: () => void }
const BantCheck = ({ bantKey: _k, label, desc, checked, onToggle }: BantCheckProps) => (
  <div
    onClick={onToggle}
    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 9, cursor: 'pointer', border: `1.5px solid ${checked ? GREEN : BORDER}`, background: checked ? `${GREEN}08` : WHITE, transition: 'all .15s' }}
  >
    <div style={{ width: 20, height: 20, borderRadius: 5, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${checked ? GREEN : GRAY3}`, background: checked ? GREEN : WHITE, transition: 'all .15s' }}>
      {checked && <CheckCircle2 size={12} color={WHITE} strokeWidth={3} />}
    </div>
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: checked ? GREEN : GRAY1 }}>{label}</div>
      <div style={{ fontSize: 10, color: GRAY2, marginTop: 1 }}>{desc}</div>
    </div>
  </div>
)

// ─── Main page ────────────────────────────────────────────────────────────────
const initForm = {
  empresa: '', nome_lead: '', telefone: '', email: '', origem: null, segmento: null, closer: null,
  temperatura: null, situacao_pre_vendas: null, bant_budget: false, bant_authority: false,
  bant_need: false, bant_timing: false, situacao_closer: null, proximos_passos: '',
  tcv: undefined, venda: 'NÃO', data_fup: null, tier: null, faturamento: null, cargo: null,
  urgencia: null, bant: undefined, data_entrada: null, data_ra: null, data_rr: null,
  data_assinatura: null, data_ativacao: null, anotacoes_pre_vendas: '', cadencia: null,
  contato_agendado: false, link_qualificacao: '', link_transcricao: '',
  historico_proximos_passos: [], custo_broker: null,
}

export default function LeadPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const isNew = id === 'new'

  const [pageLoading, setPageLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [activeTab, setActiveTab] = useState<'pre-vendas' | 'vendas'>('pre-vendas')
  const [novoPassoTexto, setNovoPassoTexto] = useState('')
  const [form, setFormState] = useState<any>(initForm)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
    })
    if (!isNew) {
      supabase.from('leads').select('*').eq('id', id).single().then(({ data, error }) => {
        if (error || !data) { setNotFound(true); setPageLoading(false); return }
        setFormState({ ...initForm, ...data })
        setPageLoading(false)
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const set = (k: string, v: any) => {
    setFormState((f: any) => {
      const updated = { ...f, [k]: v === '' ? null : v }
      if (k === 'data_ra' && v) updated.situacao_pre_vendas = 'REUNIÃO AGENDADA'
      if (k === 'data_ra' && !v && f.situacao_pre_vendas === 'REUNIÃO AGENDADA') updated.situacao_pre_vendas = null
      if (k === 'faturamento') updated.tier = fatToTier(v)
      return updated
    })
    setErrors((e: any) => ({ ...e, [k]: '' }))
  }

  const toggleBant = (k: string) => {
    setFormState((f: any) => {
      const nf = { ...f, [k]: !f[k] }
      nf.bant = ['bant_budget', 'bant_authority', 'bant_need', 'bant_timing'].filter(key => nf[key]).length
      return nf
    })
  }

  const bantScore = [form.bant_budget, form.bant_authority, form.bant_need, form.bant_timing].filter(Boolean).length

  const handleSave = async () => {
    const errs: Record<string, string> = {}
    if (!form.empresa?.trim()) errs.empresa = 'Obrigatório'
    if (!form.nome_lead?.trim()) errs.nome_lead = 'Obrigatório'
    if (!form.telefone?.trim()) errs.telefone = 'Obrigatório'
    if (!form.origem) errs.origem = 'Obrigatório'
    if (!form.data_entrada) errs.data_entrada = 'Obrigatório'
    if (form.situacao_pre_vendas === 'REUNIÃO AGENDADA') {
      if (!form.data_ra) errs.data_ra = 'Obrigatório para Reunião Agendada'
      if (!form.closer) errs.closer = 'Obrigatório para Reunião Agendada'
      if (bantScore < 3) errs.bant = 'BANT mínimo 3 para Reunião Agendada'
    }
    if (form.data_ra) {
      if (!form.email?.trim()) errs.email = 'Obrigatório quando há data de RA'
      if (!form.segmento) errs.segmento = 'Obrigatório quando há data de RA'
      if (!form.faturamento) errs.faturamento = 'Obrigatório quando há data de RA'
      if (!form.cargo) errs.cargo = 'Obrigatório quando há data de RA'
    }
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      if (errs.data_ra || errs.bant) setActiveTab('pre-vendas')
      else if (errs.closer) setActiveTab('vendas')
      return
    }
    setSaving(true)
    const { id: formId, created_at, updated_at, ...data } = form as any
    if (!isNew && formId) {
      const { error } = await supabase.from('leads').update(data).eq('id', formId)
      if (error) { alert('Erro ao salvar: ' + error.message); setSaving(false); return }
    } else {
      const clean: Record<string, any> = {}
      Object.entries(data).forEach(([k, v]) => { clean[k] = (v === '' || v === undefined) ? null : v })
      const { error } = await supabase.from('leads').insert(clean)
      if (error) { alert('Erro ao salvar: ' + error.message); setSaving(false); return }
    }
    setSaving(false)
    router.push('/')
  }

  const hasErrors = Object.values(errors).some(Boolean)

  if (pageLoading) {
    return (
      <div style={{ minHeight: '100vh', background: PANEL_BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 14, color: GRAY2 }}>Carregando lead...</div>
      </div>
    )
  }

  if (notFound) {
    return (
      <div style={{ minHeight: '100vh', background: PANEL_BG, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: GRAY1 }}>Lead não encontrado</div>
        <button onClick={() => router.push('/')} style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: R, color: WHITE, fontWeight: 700, cursor: 'pointer' }}>← Voltar ao CRM</button>
      </div>
    )
  }

  // Google Calendar URL
  const calendarUrl = (() => {
    const date = form.data_ra || new Date().toISOString().split('T')[0]
    const [y, m, d] = date.split('-')
    const start = `${y}${m}${d}T090000`
    const end   = `${y}${m}${d}T100000`
    const guests: string[] = []
    if (form.email) guests.push(form.email)
    if (form.closer && CLOSER_EMAILS[form.closer]) guests.push(CLOSER_EMAILS[form.closer])
    const empresa = form.empresa || 'Lead'
    const descricao = `Nosso especialista com todo know how e expertise estará com vocês via videoconferência para apresentar nossa Assessoria com foco na geração de demanda.\n\nApresentaremos como a V4 Company poderá contribuir com a operação da ${empresa} e quais estratégias iremos utilizar para compor na sua empresa quanto a performance e processos de marketing e vendas.\n\n\n✅ Para acessar a reunião basta clicar no link abaixo e depois no botão azul de "Entrar com Google Meet" ou se estiver em inglês "Login with Google Meet". Algumas informações sobre a nossa reunião:\n\n💻 1) É fundamental acessar de um computador ou notebook com câmera, para visualizar melhor as informações;\n\n🎥 2) Não é obrigatório, mas é melhor usar uma webcam;\n\n🎧 3) Fundamental você ter microfone e de preferência um fone de ouvido, também;\n\n📶 4) É importante ter uma boa conexão de 'internet'. Se possível, com cabo.`
    const p = new URLSearchParams({ action: 'TEMPLATE', text: `V4 Company + ${empresa}`, dates: `${start}/${end}`, details: descricao })
    if (guests.length) p.set('add', guests.join(','))
    return `https://calendar.google.com/calendar/render?${p.toString()}`
  })()

  return (
    <div style={{ minHeight: '100vh', background: PANEL_BG, display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-jakarta, sans-serif)' }}>

      {/* ── Top header ── */}
      <div style={{ background: WHITE, borderBottom: `1px solid ${BORDER}`, padding: '0 28px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 1px 8px rgba(0,0,0,.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
          <button onClick={() => router.back()}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, border: `1px solid ${BORDER}`, background: WHITE, color: GRAY2, fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
            <ArrowLeft size={15} /> Voltar
          </button>
          <div style={{ width: 1, height: 28, background: BORDER, flexShrink: 0 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, flexShrink: 0, background: 'linear-gradient(135deg, #E8001C, #B91C1C)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(232,0,28,0.25)' }}>
              <Building2 size={17} color={WHITE} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: GRAY1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {isNew ? 'Novo Lead' : (form.empresa || 'Editar Lead')}
              </div>
              <div style={{ display: 'flex', gap: 5, marginTop: 3, flexWrap: 'wrap' }}>
                {form.origem && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#EFF6FF', color: '#3B82F6' }}>{form.origem}</span>}
                {form.temperatura && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: `${tempColor(form.temperatura)}18`, color: tempColor(form.temperatura) }}>{form.temperatura}</span>}
                {form.cadencia && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#FEF3C7', color: '#D97706' }}>Dia {form.cadencia}</span>}
                {form.contato_agendado && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#F0FDF4', color: GREEN }}>Contato Agendado</span>}
              </div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {!isNew && (
            <a href={calendarUrl} target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, border: '1px solid #BBF7D0', background: '#F0FDF4', color: '#15803D', fontSize: 12, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              Agendar no Google Agenda
            </a>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: 'flex', maxWidth: 1120, width: '100%', margin: '24px auto', padding: '0 24px', gap: 0, boxSizing: 'border-box', alignItems: 'flex-start' }}>

        {/* ── Left Panel ── */}
        <div style={{ width: 280, flexShrink: 0, background: WHITE, borderRadius: '16px 0 0 16px', border: `1px solid ${BORDER}`, borderRight: 'none', padding: '20px 18px', alignSelf: 'stretch', overflowY: 'auto' }}>

          <InfoField label="Empresa" required error={errors.empresa}>
            <input style={{ ...inputStyle, borderColor: errors.empresa ? R : BORDER, fontWeight: 600, fontSize: 14 }} value={form.empresa || ''} onChange={e => set('empresa', e.target.value)} placeholder="Nome da empresa" />
          </InfoField>

          <InfoField label="Nome do Lead" required error={errors.nome_lead}>
            <input style={{ ...inputStyle, borderColor: errors.nome_lead ? R : BORDER }} value={form.nome_lead || ''} onChange={e => set('nome_lead', e.target.value)} placeholder="Nome completo" />
          </InfoField>

          <InfoField label="Telefone" required error={errors.telefone}>
            <input style={{ ...inputStyle, borderColor: errors.telefone ? R : BORDER }} value={form.telefone || ''} onChange={e => set('telefone', formatPhone(e.target.value))} placeholder="(43) 99999-9999" />
          </InfoField>

          <InfoField label="E-mail do Lead" error={errors.email}>
            <input type="email" style={{ ...inputStyle, borderColor: errors.email ? R : BORDER }} value={form.email || ''} onChange={e => set('email', e.target.value)} placeholder="email@exemplo.com" />
          </InfoField>

          <InfoField label="Data de Entrada" required error={errors.data_entrada}>
            <input type="date" style={{ ...inputStyle, borderColor: errors.data_entrada ? R : BORDER }} value={form.data_entrada || ''} onChange={e => { set('data_entrada', e.target.value); if (!e.target.value) { set('data_ra', null); set('data_rr', null); set('data_assinatura', null); set('data_ativacao', null) } }} />
          </InfoField>

          <InfoField label="Origem" required error={errors.origem}>
            <select style={{ ...inputStyle, borderColor: errors.origem ? R : BORDER }} value={form.origem || ''} onChange={e => set('origem', e.target.value)}>
              <option value="">Selecione</option>
              {ORIGENS.map(o => <option key={o}>{o}</option>)}
            </select>
          </InfoField>

          <InfoField label="Segmento" error={errors.segmento}>
            <select style={{ ...inputStyle, borderColor: errors.segmento ? R : BORDER }} value={form.segmento || ''} onChange={e => set('segmento', e.target.value)}>
              <option value="">Selecione</option>
              {SEGMENTOS.map(o => <option key={o}>{o}</option>)}
            </select>
          </InfoField>

          <InfoField label="Faturamento" error={errors.faturamento}>
            <select style={{ ...inputStyle, borderColor: errors.faturamento ? R : BORDER }} value={form.faturamento || ''} onChange={e => set('faturamento', e.target.value)}>
              <option value="">Selecione</option>
              {FATURAMENTOS.map(o => <option key={o}>{o}</option>)}
            </select>
          </InfoField>

          <InfoField label="Tier (automático)">
            <div style={{ ...inputStyle, background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: form.tier ? GRAY1 : GRAY3, fontWeight: form.tier ? 700 : 400 }}>
              <span>{form.tier || '—'}</span>
              {form.tier && <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 20, background: `${R}15`, color: R }}>{form.tier}</span>}
            </div>
          </InfoField>

          <InfoField label="Cargo" error={errors.cargo}>
            <select style={{ ...inputStyle, borderColor: errors.cargo ? R : BORDER }} value={form.cargo || ''} onChange={e => set('cargo', e.target.value)}>
              <option value="">Selecione</option>
              {CARGOS.map(o => <option key={o}>{o}</option>)}
            </select>
          </InfoField>

          <InfoField label="Urgência">
            <input style={inputStyle} value={form.urgencia || ''} onChange={e => set('urgencia', e.target.value)} placeholder="Ex: Alta" />
          </InfoField>

          {form.origem === 'Lead Broker' && (
            <InfoField label="Custo de Broker (R$)" required>
              <input type="number" style={inputStyle} value={form.custo_broker ?? ''} onChange={e => set('custo_broker', e.target.value ? Number(e.target.value) : null)} placeholder="Ex: 500" min={0} />
            </InfoField>
          )}
        </div>

        {/* ── Right Panel ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: WHITE, borderRadius: '0 16px 16px 0', border: `1px solid ${BORDER}`, minWidth: 0, overflow: 'hidden' }}>

          {/* Tab bar */}
          <div style={{ display: 'flex', borderBottom: `1px solid ${BORDER}`, flexShrink: 0, padding: '0 24px' }}>
            {(['pre-vendas', 'vendas'] as const).map(tab => {
              const active = activeTab === tab
              return (
                <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: '14px 4px', marginRight: 24, border: 'none', background: 'transparent', fontSize: 13, fontWeight: 700, cursor: 'pointer', color: active ? R : GRAY2, borderBottom: `2px solid ${active ? R : 'transparent'}`, transition: 'all .15s', marginBottom: -1 }}>
                  {tab === 'pre-vendas' ? 'Pré-Vendas' : 'Vendas'}
                </button>
              )
            })}
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '22px 24px' }}>

            {/* ─── PRÉ-VENDAS ─── */}
            {activeTab === 'pre-vendas' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                <div>
                  <SectionTitle>Tags do Lead</SectionTitle>
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: GRAY2, marginBottom: 8 }}>Cadência</div>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {Array.from({ length: 10 }, (_, i) => i + 1).map(d => (
                        <button key={d} type="button" onClick={() => set('cadencia', form.cadencia === d ? null : d)}
                          style={{ width: 36, height: 36, borderRadius: 8, border: `2px solid ${form.cadencia === d ? R : BORDER}`, background: form.cadencia === d ? R : WHITE, color: form.cadencia === d ? WHITE : GRAY2, fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all .12s' }}>
                          {d}
                        </button>
                      ))}
                    </div>
                    {form.cadencia && <div style={{ marginTop: 6, fontSize: 11, color: GRAY2 }}>Dia {form.cadencia} da cadência</div>}
                  </div>
                  <div onClick={() => set('contato_agendado', !form.contato_agendado)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderRadius: 10, cursor: 'pointer', border: `1.5px solid ${form.contato_agendado ? GREEN : BORDER}`, background: form.contato_agendado ? `${GREEN}08` : WHITE, transition: 'all .15s' }}>
                    <div style={{ width: 20, height: 20, borderRadius: 5, flexShrink: 0, border: `2px solid ${form.contato_agendado ? GREEN : GRAY3}`, background: form.contato_agendado ? GREEN : WHITE, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s' }}>
                      {form.contato_agendado && <CheckCircle2 size={12} color={WHITE} strokeWidth={3} />}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: form.contato_agendado ? GREEN : GRAY1 }}>Contato Agendado</div>
                      <div style={{ fontSize: 11, color: GRAY2, marginTop: 1 }}>Marque quando agendado</div>
                    </div>
                  </div>
                </div>

                <div>
                  <SectionTitle>Qualificação BDR</SectionTitle>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: GRAY2, marginBottom: 5 }}>Situação BDR</div>
                      <select style={inputStyle} value={form.situacao_pre_vendas || ''} onChange={e => set('situacao_pre_vendas', e.target.value)}>
                        <option value="">Selecione</option>
                        {SITUACOES_PRE_VENDAS.map(o => <option key={o}>{o}</option>)}
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: errors.data_ra ? R : GRAY2, marginBottom: 5 }}>
                        Data RA{form.situacao_pre_vendas === 'REUNIÃO AGENDADA' && <span style={{ color: R }}> *</span>}
                      </div>
                      {!form.data_entrada
                        ? <LockedField message="Preencha Data de Entrada primeiro" />
                        : <input type="date" style={{ ...inputStyle, borderColor: errors.data_ra ? R : BORDER }} value={form.data_ra || ''} onChange={e => { set('data_ra', e.target.value); if (!e.target.value) { set('data_rr', null); set('data_assinatura', null); set('data_ativacao', null) } }} />
                      }
                      {errors.data_ra && <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 11, color: R }}><AlertCircle size={11} /><span>{errors.data_ra}</span></div>}
                    </div>
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', ...sectionLabelStyle }}>
                    <span>BANT</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900, background: bantScore >= 3 ? `${GREEN}15` : `${R}12`, color: bantScore >= 3 ? GREEN : R, border: `2px solid ${bantScore >= 3 ? GREEN : R}` }}>{bantScore}</div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: bantScore >= 3 ? GREEN : R }}>{bantScore >= 3 ? 'Qualificado' : 'Mín. 3 para RA'}</span>
                    </div>
                  </div>
                  {errors.bant && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, background: `${R}08`, border: `1px solid ${R}30`, marginBottom: 12, fontSize: 12, color: R, fontWeight: 600 }}>
                      <AlertCircle size={13} /><span>{errors.bant}</span>
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <BantCheck bantKey="bant_budget"    label="Budget"    desc="Possui orçamento?" checked={!!form.bant_budget}    onToggle={() => toggleBant('bant_budget')} />
                    <BantCheck bantKey="bant_authority" label="Authority" desc="É o decisor?"       checked={!!form.bant_authority} onToggle={() => toggleBant('bant_authority')} />
                    <BantCheck bantKey="bant_need"      label="Need"      desc="Necessidade clara?" checked={!!form.bant_need}      onToggle={() => toggleBant('bant_need')} />
                    <BantCheck bantKey="bant_timing"    label="Timing"    desc="Momento adequado?"  checked={!!form.bant_timing}    onToggle={() => toggleBant('bant_timing')} />
                  </div>
                </div>

                <div>
                  <SectionTitle>Link da Qualificação</SectionTitle>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input style={{ ...inputStyle, flex: 1 }} value={form.link_qualificacao || ''} onChange={e => set('link_qualificacao', e.target.value)} placeholder="https://..." />
                    {form.link_qualificacao && (
                      <button type="button" onClick={() => window.open(form.link_qualificacao, '_blank')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 14px', borderRadius: 8, border: `1px solid ${BORDER}`, background: WHITE, cursor: 'pointer', color: '#3B82F6', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
                        <ExternalLink size={13} />Abrir
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <SectionTitle>Anotações</SectionTitle>
                  <textarea rows={6} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.7 }} value={form.anotacoes_pre_vendas || ''} onChange={e => set('anotacoes_pre_vendas', e.target.value)} placeholder="Registre objeções, histórico de contato, pontos de atenção..." />
                </div>
              </div>
            )}

            {/* ─── VENDAS ─── */}
            {activeTab === 'vendas' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                <div>
                  <SectionTitle>Closer</SectionTitle>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: errors.closer ? R : GRAY2, marginBottom: 5 }}>
                        Closer{form.situacao_pre_vendas === 'REUNIÃO AGENDADA' && <span style={{ color: R }}> *</span>}
                      </div>
                      <select style={{ ...inputStyle, borderColor: errors.closer ? R : BORDER }} value={form.closer || ''} onChange={e => set('closer', e.target.value)}>
                        <option value="">Selecione</option>
                        {CLOSERS.map(o => <option key={o}>{o}</option>)}
                      </select>
                      {errors.closer && <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 11, color: R }}><AlertCircle size={11} /><span>{errors.closer}</span></div>}
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: GRAY2, marginBottom: 5 }}>Temperatura</div>
                      <select style={inputStyle} value={form.temperatura || ''} onChange={e => set('temperatura', e.target.value)}>
                        <option value="">Selecione</option>
                        {TEMPERATURAS.map(o => <option key={o}>{o}</option>)}
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: GRAY2, marginBottom: 5 }}>Situação Closer</div>
                      <select style={inputStyle} value={form.situacao_closer || ''} onChange={e => set('situacao_closer', e.target.value)}>
                        <option value="">Selecione</option>
                        {SITUACOES.map(o => <option key={o}>{o}</option>)}
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: GRAY2, marginBottom: 5 }}>TCV (R$)</div>
                      <input type="number" style={inputStyle} value={form.tcv || ''} onChange={e => set('tcv', e.target.value ? Number(e.target.value) : null)} placeholder="0" />
                    </div>
                  </div>
                </div>

                <div>
                  <SectionTitle>Datas</SectionTitle>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: GRAY2, marginBottom: 5 }}>Data RR</div>
                      {!form.data_ra ? <LockedField message="Preencha Data RA primeiro" /> : <input type="date" style={inputStyle} value={form.data_rr || ''} onChange={e => { set('data_rr', e.target.value); if (!e.target.value) { set('data_assinatura', null); set('data_ativacao', null) } }} />}
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: GRAY2, marginBottom: 5 }}>Data FUP</div>
                      <input type="date" style={inputStyle} value={form.data_fup || ''} onChange={e => set('data_fup', e.target.value)} />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: GRAY2, marginBottom: 5 }}>Data Venda</div>
                      {!form.data_rr ? <LockedField message="Preencha Data RR primeiro" /> : <input type="date" style={inputStyle} value={form.data_assinatura || ''} onChange={e => { set('data_assinatura', e.target.value); if (!e.target.value) set('data_ativacao', null) }} />}
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: GRAY2, marginBottom: 5 }}>Data Ativação</div>
                      {!form.data_assinatura ? <LockedField message="Preencha Data Venda primeiro" /> : <input type="date" style={inputStyle} value={form.data_ativacao || ''} onChange={e => set('data_ativacao', e.target.value)} />}
                    </div>
                  </div>
                </div>

                <div>
                  <SectionTitle>Link da Transcrição da Reunião</SectionTitle>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input style={{ ...inputStyle, flex: 1 }} value={form.link_transcricao || ''} onChange={e => set('link_transcricao', e.target.value)} placeholder="https://..." />
                    {form.link_transcricao && (
                      <button type="button" onClick={() => window.open(form.link_transcricao, '_blank')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 14px', borderRadius: 8, border: `1px solid ${BORDER}`, background: WHITE, cursor: 'pointer', color: '#3B82F6', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
                        <ExternalLink size={13} />Abrir
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <SectionTitle>Fechamento</SectionTitle>
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: GRAY2, marginBottom: 8 }}>Venda?</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {['NÃO', 'SIM'].map(opt => (
                        <button key={opt} type="button" onClick={() => set('venda', opt)} style={{ padding: '8px 20px', borderRadius: 8, border: `2px solid ${(form.venda || 'NÃO') === opt ? (opt === 'SIM' ? GREEN : R) : BORDER}`, background: (form.venda || 'NÃO') === opt ? (opt === 'SIM' ? `${GREEN}12` : `${R}08`) : WHITE, color: (form.venda || 'NÃO') === opt ? (opt === 'SIM' ? GREEN : R) : GRAY2, fontSize: 13, fontWeight: 800, cursor: 'pointer', transition: 'all .15s' }}>
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: GRAY2, marginBottom: 8 }}>Próximos Passos</div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                      <textarea rows={2} style={{ ...inputStyle, flex: 1, resize: 'none', lineHeight: 1.6 }} value={novoPassoTexto} onChange={e => setNovoPassoTexto(e.target.value)} placeholder="Descreva a próxima ação..."
                        onKeyDown={e => {
                          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                            e.preventDefault()
                            const txt = novoPassoTexto.trim()
                            if (!txt) return
                            const hoje = new Date().toLocaleDateString('pt-BR')
                            const hist = Array.isArray(form.historico_proximos_passos) ? form.historico_proximos_passos : []
                            set('historico_proximos_passos', [{ data: hoje, texto: txt }, ...hist])
                            setNovoPassoTexto('')
                          }
                        }}
                      />
                      <button type="button" onClick={() => {
                        const txt = novoPassoTexto.trim()
                        if (!txt) return
                        const hoje = new Date().toLocaleDateString('pt-BR')
                        const hist = Array.isArray(form.historico_proximos_passos) ? form.historico_proximos_passos : []
                        set('historico_proximos_passos', [{ data: hoje, texto: txt }, ...hist])
                        setNovoPassoTexto('')
                      }} style={{ padding: '0 16px', borderRadius: 8, border: 'none', background: R, color: WHITE, fontSize: 12, fontWeight: 800, cursor: 'pointer', flexShrink: 0, alignSelf: 'stretch' }}>
                        + Adicionar
                      </button>
                    </div>
                    {Array.isArray(form.historico_proximos_passos) && form.historico_proximos_passos.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {form.historico_proximos_passos.map((entry: { data: string; texto: string }, i: number) => (
                          <div key={i} style={{ background: '#F8F9FB', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '9px 12px' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: GRAY3, marginBottom: 4 }}>{entry.data}</div>
                            <div style={{ fontSize: 12, color: GRAY1, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{entry.texto}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Footer ── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 24px', borderTop: `1px solid ${BORDER}`, flexShrink: 0, background: WHITE }}>
            <div>
              {hasErrors && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: R, fontWeight: 600 }}>
                  <AlertCircle size={14} /><span>Corrija os erros antes de salvar</span>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => router.back()} style={{ padding: '10px 20px', borderRadius: 10, border: `1px solid ${BORDER}`, background: WHITE, color: GRAY2, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={handleSave} disabled={saving} style={{ padding: '10px 28px', borderRadius: 10, border: 'none', background: saving ? GRAY3 : 'linear-gradient(135deg, #E8001C, #B91C1C)', color: WHITE, fontSize: 13, fontWeight: 800, cursor: saving ? 'default' : 'pointer', boxShadow: saving ? 'none' : '0 4px 14px rgba(232,0,28,0.3)' }}>
                {saving ? 'Salvando...' : 'SALVAR'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
