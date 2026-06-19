'use client'
import React, { useState, useEffect, Suspense, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Lead } from '@/lib/supabase'
import { Building2, AlertCircle, CheckCircle2, ExternalLink, Lock, ChevronRight, Mic, Upload, X, Loader2, ChevronDown, ChevronUp, FileText, MessageCircle, Globe, Link2, TrendingUp, AtSign, Layers } from 'lucide-react'
import Sidebar from '../../Sidebar'
import { toast } from '@/lib/toast'
import { Toaster } from '@/components/Toaster'
import { UserSelect } from '@/components/UserSelect'
import { useUserRole } from '@/lib/useUserRole'
import { TractorLoader } from '@/components/tractor-loader'
import { useCloserUsers } from '@/lib/useCloserUsers'
import { getPipelineStage, PIPELINE_STAGES } from '@/lib/crm-pipeline'
import { SEGMENTOS } from '@/lib/crm-constants'
import GerarQualificacao from '@/components/GerarQualificacao'
import AudioPlayer from '@/components/AudioPlayer'

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
const CARGOS = ['Não identificado', 'Sócio', 'Diretor', 'Gerente', 'Coordenador', 'Analista', 'Assistente', 'Outro']
const CLOSERS = ['MATHEUS', 'VITOR']
const CLOSER_EMAILS: Record<string, string> = {
  'MATHEUS': 'matheus.nunes@v4company.com',
  'VITOR': 'vitor@v4company.com',
}
const TEMPERATURAS = ['FRIO', 'MORNO', 'QUENTE', 'FECHADO']
const SITUACOES_PRE_VENDAS = ['TENTANDO CONTATO', 'EM QUALIFICAÇÃO', 'REUNIÃO AGENDADA', 'NO SHOW/REMARCANDO', 'REUNIÃO REALIZADA', 'PERDIDO SDR', 'REEMBOLSO', 'AGENDA FUTURA']
const SITUACOES = ['EM FOLLOW UP', 'REUNIAO EXTRA AGENDADA', 'VENDA', 'PERDIDO CLOSER', 'AGENDA FUTURA']
const MOTIVOS_PERDA_PRE_VENDAS = ['Sem perfil (fora do ICP)', 'Sem interesse', 'Incontactável', 'Já tem solução / concorrente', 'Sem budget declarado', 'Timing ruim', 'Não chegou ao decisor', 'No-show repetido', 'Agenda futura sem data']
const MOTIVOS_PERDA_CLOSER = ['Preço alto / sem budget aprovado', 'Perdeu para concorrente', 'Sem urgência', 'Sócio/Diretor vetou', 'Ghost / parou de responder', 'Proposta não encaixou na necessidade', 'Timing ruim', 'Negociação travada', 'Reembolso / cancelamento']
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
  if (t === 'FRIO') return '#64748B'
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


// ─── Contrato Upload ──────────────────────────────────────────────────────────
type ContratoUploadProps = { leadId: string; url: string | null; onUploaded: (url: string) => void }

function ContratoUpload({ leadId, url, onUploaded }: ContratoUploadProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const handleFile = async (file: File) => {
    if (file.type !== 'application/pdf') {
      setError('Apenas arquivos PDF são aceitos.')
      return
    }
    setUploading(true)
    setError('')
    const path = `${leadId}.pdf`
    const { error: upErr } = await supabase.storage.from('contratos').upload(path, file, { upsert: true, contentType: 'application/pdf' })
    if (upErr) {
      setError('Erro ao fazer upload: ' + upErr.message)
      setUploading(false)
      return
    }
    const { data } = supabase.storage.from('contratos').getPublicUrl(path)
    onUploaded(data.publicUrl)
    setUploading(false)
  }

  return (
    <div>
      {url && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, border: `1px solid ${GREEN}50`, background: `${GREEN}08`, marginBottom: 10 }}>
          <FileText size={16} color={GREEN} />
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: GREEN }}>Contrato anexado</span>
          <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7, border: `1px solid ${GREEN}50`, background: WHITE, color: GREEN, fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
            <ExternalLink size={12} />Ver PDF
          </a>
        </div>
      )}
      <div
        onClick={() => !uploading && fileRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); if (!uploading && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]) }}
        style={{ border: `2px dashed ${BORDER}`, borderRadius: 10, padding: '16px', textAlign: 'center', cursor: uploading ? 'default' : 'pointer', transition: 'border-color .15s' }}
        onMouseEnter={e => { if (!uploading) e.currentTarget.style.borderColor = R }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER }}
      >
        {uploading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13, color: GRAY2 }}>
            <Loader2 size={16} color={R} style={{ animation: 'spin 1s linear infinite' }} />Enviando...
          </div>
        ) : (
          <>
            <Upload size={18} color={GRAY3} style={{ marginBottom: 6 }} />
            <div style={{ fontSize: 12, fontWeight: 600, color: GRAY2 }}>{url ? 'Clique para substituir o contrato' : 'Arraste ou clique para enviar o contrato'}</div>
            <div style={{ fontSize: 11, color: GRAY3, marginTop: 3 }}>Apenas PDF</div>
          </>
        )}
        <input ref={fileRef} type="file" accept=".pdf,application/pdf" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); e.target.value = '' }} />
      </div>
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: 11, color: R }}>
          <AlertCircle size={11} />{error}
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
const initForm = {
  empresa: '', nome_lead: '', telefone: '', email: '', origem: null, segmento: null, closer: null,
  temperatura: null, situacao_pre_vendas: null, bant_budget: false, bant_authority: false,
  bant_need: false, bant_timing: false, situacao_closer: null, proximos_passos: '',
  tcv: undefined, tcv_saber: null, tcv_ter: null, tcv_executar: null, tcv_executar_meses: 12,
  venda: 'NÃO', data_fup: null, tier: null, faturamento: null, cargo: null,
  urgencia: null, bant: undefined, data_entrada: null, data_ra: null, data_rr: null,
  data_assinatura: null, data_ativacao: null, anotacoes_pre_vendas: '', cadencia: null,
  contato_agendado: false, link_qualificacao: '', link_transcricao: '',
  link_site: '', link_instagram: '', link_biblioteca_anuncios: '', link_outros: '',
  historico_proximos_passos: [], historico_anotacoes_pre_vendas: [], custo_broker: null,
  motivo_perda_pre_vendas: null, motivo_perda_closer: null,
  link_gravacao: '', link_plano_roi: '', link_contrato: '',
  responsavel_bdr: null, data_perdido: null,
  qualificacao_ia: null,
}

const LOGGED_FIELDS: Record<string, string> = {
  situacao_pre_vendas:    'Situação BDR',
  situacao_closer:        'Situação Closer',
  closer:                 'Closer',
  data_ra:                'Data RA',
  data_rr:                'Data RR',
  data_assinatura:        'Data de Venda',
  data_ativacao:          'Data de Ativação',
  data_fup:               'FUP',
  temperatura:            'Temperatura',
  venda:                  'Venda',
  motivo_perda_pre_vendas:'Motivo de perda (BDR)',
  motivo_perda_closer:    'Motivo de perda (Closer)',
  responsavel_bdr:        'Responsável BDR',
}

const LINK_DEFS = [
  { key: 'link_site',                 label: 'Site',                   placeholder: 'https://site.com.br',              icon: Globe,       color: '#7C3AED' },
  { key: 'link_instagram',            label: 'Instagram',              placeholder: 'https://instagram.com/...',         icon: AtSign,      color: '#E1306C' },
  { key: 'link_biblioteca_anuncios',  label: 'Biblioteca de Anúncios', placeholder: 'https://facebook.com/ads/library/', icon: Layers,      color: '#1877F2' },
  { key: 'link_qualificacao',         label: 'Qualificação',           placeholder: 'https://...',                       icon: CheckCircle2,color: '#7C3AED' },
  { key: 'link_transcricao',          label: 'Transcrição',            placeholder: 'https://...',                       icon: FileText,    color: '#0D9488' },
  { key: 'link_gravacao',             label: 'Gravação',               placeholder: 'https://...',                       icon: Mic,         color: '#DC2626' },
  { key: 'link_plano_roi',            label: 'Plano de ROI',           placeholder: 'https://...',                       icon: TrendingUp,  color: '#059669' },
  { key: 'link_outros',               label: 'Outros',                 placeholder: 'https://...',                       icon: Link2,       color: '#6B7280' },
] as const

function LeadPageInner() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const id = params.id as string
  const isNew = id === 'new'
  const fromView = searchParams.get('from') || 'leads'   // 'leads' or 'pipeline'
  const fromLabel = fromView === 'pipeline' ? 'Pipeline' : 'Leads'

  const { canEdit, isLoading: roleLoading } = useUserRole()
  const closerUsers = useCloserUsers()

  const [pageLoading, setPageLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [activeTab, setActiveTab] = useState<'qualificacao' | 'negociacao' | 'historico'>('qualificacao')
  const [novoPassoTexto, setNovoPassoTexto] = useState('')
  const [novaAnotacaoTexto, setNovaAnotacaoTexto] = useState('')
  const [form, setFormState] = useState<any>(initForm)
  const [initialForm, setInitialForm] = useState<any>(initForm)
  const [nomeUsuario, setNomeUsuario] = useState('')
  const [linksExpanded, setLinksExpanded] = useState(false)
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'pending' | 'saving' | 'saved'>('idle')
  const autoSaveTimer = useRef<any>(null)
  const formRef = useRef<any>(initForm)
  const [cockpitClienteId, setCockpitClienteId] = useState<string | null | 'loading'>('loading')
  const [showQaModal, setShowQaModal] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      const { data: u } = await supabase.from('usuarios_permitidos').select('nome').eq('email', session.user.email).single()
      if (u?.nome) setNomeUsuario(u.nome)
    })
    if (!isNew) {
      supabase.from('leads').select('*').eq('id', id).single().then(({ data, error }) => {
        if (error || !data) { setNotFound(true); setPageLoading(false); return }
        const loaded = { ...initForm, ...data }
        setFormState(loaded)
        setInitialForm(loaded)
        setPageLoading(false)
      })
      supabase.from('clientes').select('id').eq('lead_id', id).maybeSingle().then(({ data }) => {
        setCockpitClienteId(data?.id ?? null)
      })
    } else {
      setCockpitClienteId(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => { formRef.current = form }, [form])

  // Sync situacao_pre_vendas with dates on load (fix leads out of sync)
  useEffect(() => {
    if (isNew || !form.id) return
    const spv = form.situacao_pre_vendas
    const noCloserStage = !form.data_assinatura && !['EM FOLLOW UP','REUNIAO EXTRA AGENDADA','AGENDA FUTURA','VENDA','PERDIDO CLOSER'].includes(form.situacao_closer || '')
    if (noCloserStage && spv !== 'PERDIDO SDR' && spv !== 'REEMBOLSO' && spv !== 'NO SHOW/REMARCANDO') {
      if (form.data_rr && spv !== 'REUNIÃO REALIZADA') {
        setFormState((f: any) => ({ ...f, situacao_pre_vendas: 'REUNIÃO REALIZADA' }))
      } else if (form.data_ra && !form.data_rr && spv !== 'REUNIÃO AGENDADA') {
        setFormState((f: any) => ({ ...f, situacao_pre_vendas: 'REUNIÃO AGENDADA' }))
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.id])

  const triggerAutoSave = () => {
    if (isNew) return
    setAutoSaveStatus('pending')
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(async () => {
      const current = formRef.current
      const { id: formId, created_at, updated_at, ...data } = current as any
      if (!formId) return
      setAutoSaveStatus('saving')
      const { error } = await supabase.from('leads').update({ ...data, updated_at: new Date().toISOString() }).eq('id', formId)
      if (error) {
        toast.error('Erro ao salvar: ' + error.message)
        setAutoSaveStatus('idle')
      } else {
        setInitialForm({ ...current })
        setAutoSaveStatus('saved')
        setTimeout(() => setAutoSaveStatus('idle'), 3000)
      }
    }, 2000)
  }

  const makeLogEntry = (texto: string) => {
    const agora = new Date()
    const dataStr = `${agora.toLocaleDateString('pt-BR')} ${String(agora.getHours()).padStart(2,'0')}:${String(agora.getMinutes()).padStart(2,'0')}`
    return { data: dataStr, texto, tipo: 'log', usuario: nomeUsuario || null }
  }

  const set = (k: string, v: any) => {
    const newVal = v === '' ? null : v
    if (k === 'data_rr' && newVal) {
      const f = formRef.current
      const hasTcv = (f.tcv_saber || 0) + (f.tcv_ter || 0) + (f.tcv_executar || 0) > 0
      if (!hasTcv) {
        toast.warning('Preencha o TCV (Saber, Ter ou Executar) antes de registrar a Reunião Realizada.')
        return
      }
    }
    const oldVal = formRef.current[k]
    let logEntry: any = null

    if (!isNew && k in LOGGED_FIELDS && oldVal !== newVal) {
      const label = LOGGED_FIELDS[k]
      let texto = ''
      if (k.startsWith('data_')) {
        texto = newVal
          ? `${label}: ${new Date(newVal + 'T12:00:00').toLocaleDateString('pt-BR')}`
          : `${label} removida`
      } else if (oldVal && newVal) {
        texto = `${label}: ${oldVal} → ${newVal}`
      } else if (newVal) {
        texto = `${label}: ${newVal}`
      } else {
        texto = `${label} removido`
      }
      logEntry = makeLogEntry(texto)
    }

    setFormState((f: any) => {
      const updated = { ...f, [k]: newVal }
      if (k === 'data_ra' && v && !updated.data_rr) updated.situacao_pre_vendas = 'REUNIÃO AGENDADA'
      if (k === 'data_ra' && !v && f.situacao_pre_vendas === 'REUNIÃO AGENDADA') updated.situacao_pre_vendas = null
      if (k === 'data_rr' && v) updated.situacao_pre_vendas = 'REUNIÃO REALIZADA'
      if (k === 'data_rr' && !v && updated.data_ra) updated.situacao_pre_vendas = 'REUNIÃO AGENDADA'
      if (k === 'faturamento') updated.tier = fatToTier(v)
      const isPerdidoSituacao = k === 'situacao_pre_vendas' && (newVal === 'PERDIDO SDR' || newVal === 'REEMBOLSO')
      const isPerdidoCloser   = k === 'situacao_closer'     && newVal === 'PERDIDO CLOSER'
      if ((isPerdidoSituacao || isPerdidoCloser) && !f.data_perdido) {
        updated.data_perdido = new Date().toISOString().slice(0, 10)
      }
      if (logEntry) {
        const hist = Array.isArray(f.historico_anotacoes_pre_vendas) ? f.historico_anotacoes_pre_vendas : []
        updated.historico_anotacoes_pre_vendas = [logEntry, ...hist]
      }
      return updated
    })
    setErrors((e: any) => ({ ...e, [k]: '' }))
    triggerAutoSave()
  }

  const getStageBDR = (f: any): { label: string; color: string } | null => {
    if (f.data_rr) return { label: 'Reunião Realizada', color: '#8B5CF6' }
    if (f.data_ra)  return { label: 'Reunião Agendada',  color: '#0D9488' }
    if (f.situacao_pre_vendas === 'NO SHOW/REMARCANDO') return { label: 'No-Show / Remarcando', color: '#D97706' }
    if (f.situacao_pre_vendas === 'PERDIDO SDR')        return { label: 'Perdido SDR',           color: GRAY2 }
    if (f.situacao_pre_vendas === 'REEMBOLSO')          return { label: 'Reembolso',              color: GRAY2 }
    return null
  }

  const getStageCloser = (f: any): { label: string; color: string } | null => {
    if (f.data_ativacao)                              return { label: 'Ativado',        color: '#0EA5E9' }
    if (f.data_assinatura)                            return { label: 'Venda',          color: GREEN }
    if (f.situacao_closer === 'PERDIDO CLOSER')       return { label: 'Perdido Closer', color: GRAY2 }
    return null
  }

  const toggleBant = (k: string) => {
    const bantNames: Record<string, string> = { bant_budget: 'Budget', bant_authority: 'Authority', bant_need: 'Need', bant_timing: 'Timing' }
    setFormState((f: any) => {
      const nf = { ...f, [k]: !f[k] }
      nf.bant = ['bant_budget', 'bant_authority', 'bant_need', 'bant_timing'].filter(key => nf[key]).length
      if (!isNew) {
        const entry = makeLogEntry(`BANT: ${bantNames[k]} ${nf[k] ? '✓ confirmado' : '✗ removido'}`)
        const hist = Array.isArray(f.historico_anotacoes_pre_vendas) ? f.historico_anotacoes_pre_vendas : []
        nf.historico_anotacoes_pre_vendas = [entry, ...hist]
      }
      return nf
    })
    triggerAutoSave()
  }

  const bantScore = [form.bant_budget, form.bant_authority, form.bant_need, form.bant_timing].filter(Boolean).length

  const TRACKABLE = ['empresa', 'nome_lead', 'telefone', 'email', 'origem', 'segmento', 'cargo', 'faturamento',
    'temperatura', 'situacao_pre_vendas', 'situacao_closer', 'closer', 'data_entrada', 'data_ra', 'data_rr',
    'data_assinatura', 'data_ativacao', 'data_fup', 'tcv', 'tcv_saber', 'tcv_ter', 'tcv_executar', 'tcv_executar_meses', 'venda', 'bant_budget', 'bant_authority',
    'bant_need', 'bant_timing', 'cadencia', 'urgencia', 'link_qualificacao', 'link_site', 'link_instagram',
    'link_biblioteca_anuncios', 'link_outros', 'link_transcricao', 'link_gravacao', 'link_plano_roi',
    'custo_broker', 'motivo_perda_pre_vendas', 'motivo_perda_closer', 'contato_agendado', 'responsavel_bdr', 'data_perdido']
  const hasUnsavedChanges = !isNew && !saved && autoSaveStatus === 'idle' && TRACKABLE.some(k => form[k] !== initialForm[k])

  const diasNoFunil = form.data_entrada
    ? Math.floor((Date.now() - new Date(form.data_entrada + 'T12:00:00').getTime()) / 86400000)
    : null
  const isClosedLead = ['VENDA', 'ATIVADO', 'PERDIDO'].includes(getPipelineStage(form))
  const fupVencido = !isClosedLead && !!form.data_fup && new Date(form.data_fup + 'T23:59:59') < new Date()
  const fupDias = form.data_fup ? Math.ceil((new Date(form.data_fup + 'T12:00:00').getTime() - Date.now()) / 86400000) : null
  const ultimaAtividade = (() => {
    const all = [...(Array.isArray(form.historico_anotacoes_pre_vendas) ? form.historico_anotacoes_pre_vendas : []),
                 ...(Array.isArray(form.historico_proximos_passos) ? form.historico_proximos_passos : [])]
    return all.length > 0 ? all[0] : null
  })()
  const proximoPasso = Array.isArray(form.historico_proximos_passos) && form.historico_proximos_passos.length > 0
    ? form.historico_proximos_passos[0] : null

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasUnsavedChanges])

  const registrarAtividade = async (tipo: string, label: string) => {
    if (isNew) return
    const agora = new Date()
    const dataStr = `${agora.toLocaleDateString('pt-BR')} ${String(agora.getHours()).padStart(2,'0')}:${String(agora.getMinutes()).padStart(2,'0')}`
    const hoje = agora.toLocaleDateString('pt-BR')

    const hist = Array.isArray(form.historico_anotacoes_pre_vendas) ? form.historico_anotacoes_pre_vendas : []
    const hojeAtivs = hist.filter((e: any) => e.tipo === 'cadencia' && e.data?.startsWith(hoje))
    const ct = (t: string) => hojeAtivs.filter((e: any) => e.atividade === t).length

    const nApi    = ct('ligacao_api')
    const nWaCall = ct('ligacao_whatsapp')
    const nWaMsg  = ct('mensagem_whatsapp')

    const newApi    = tipo === 'ligacao_api'          ? nApi    + 1 : nApi
    const newWaCall = tipo === 'ligacao_whatsapp'     ? nWaCall + 1 : nWaCall
    const newWaMsg  = tipo === 'mensagem_whatsapp'    ? nWaMsg  + 1 : nWaMsg
    const diaCompleto = newApi >= 2 && newWaCall >= 2 && newWaMsg >= 1
    const jaEraCompleto = nApi >= 2 && nWaCall >= 2 && nWaMsg >= 1

    const novaEntrada = { data: dataStr, texto: label, tipo: 'cadencia', atividade: tipo, dia: form.cadencia || 1, usuario: nomeUsuario || null }
    let novaHist: any[] = [novaEntrada, ...hist]
    let novaCadencia: number = form.cadencia || 1

    if (diaCompleto && !jaEraCompleto) {
      novaCadencia = Math.min((form.cadencia || 0) + 1, 10)
      const conclusao = { data: dataStr, texto: `Cadência Dia ${form.cadencia || 1} concluída → avançou para Dia ${novaCadencia}`, tipo: 'cadencia_completa', dia: form.cadencia || 1, usuario: nomeUsuario || null }
      novaHist = [conclusao, novaEntrada, ...hist]
    }

    setFormState((f: any) => ({ ...f, historico_anotacoes_pre_vendas: novaHist, cadencia: novaCadencia }))
    await supabase.from('leads').update({ historico_anotacoes_pre_vendas: novaHist, cadencia: novaCadencia, updated_at: new Date().toISOString() }).eq('id', id)
  }

  const handleSave = async () => {
    const errs: Record<string, string> = {}
    if (!form.empresa?.trim()) errs.empresa = 'Obrigatório'
    if (!form.nome_lead?.trim()) errs.nome_lead = 'Obrigatório'
    if (!form.telefone?.trim()) errs.telefone = 'Obrigatório'
    if (!form.email?.trim()) errs.email = 'Obrigatório'
    if (!form.origem) errs.origem = 'Obrigatório'
    if (!form.data_entrada) errs.data_entrada = 'Obrigatório'
    if (!form.responsavel_bdr) errs.responsavel_bdr = 'Obrigatório'
    if (form.situacao_pre_vendas === 'REUNIÃO AGENDADA') {
      if (!form.data_ra) errs.data_ra = 'Obrigatório para Reunião Agendada'
      if (!form.closer) errs.closer = 'Obrigatório para Reunião Agendada'
      if (!form.segmento) errs.segmento = 'Obrigatório para Reunião Agendada'
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
      if (errs.data_ra || errs.bant) setActiveTab('qualificacao')
      else if (errs.closer) setActiveTab('negociacao')
      return
    }
    setSaving(true)
    const { id: formId, created_at, updated_at, ...data } = form as any
    if (!isNew && formId) {
      const { error } = await supabase.from('leads').update({ ...data, updated_at: new Date().toISOString() }).eq('id', formId)
      if (error) { toast.error('Erro ao salvar: ' + error.message); setSaving(false); return }
    } else {
      const clean: Record<string, any> = {}
      Object.entries(data).forEach(([k, v]) => { clean[k] = (v === '' || v === undefined) ? null : v })
      const { error } = await supabase.from('leads').insert(clean)
      if (error) { toast.error('Erro ao salvar: ' + error.message); setSaving(false); return }
    }
    setSaving(false)
    setSaved(true)
    setInitialForm({ ...form })
    toast.success(isNew ? 'Lead criado com sucesso!' : 'Lead salvo com sucesso!')
    setTimeout(() => router.push(fromView === 'pipeline' ? '/pipeline' : '/'), 900)
  }

  const hasErrors = Object.values(errors).some(Boolean)

  if (pageLoading) {
    return (
      <div style={{ minHeight: '100vh', background: PANEL_BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <TractorLoader text="Carregando lead..." />
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
    <div style={{ height: '100vh', display: 'flex', overflow: 'hidden', fontFamily: 'var(--font-jakarta, sans-serif)' }}>

      {/* ── Sidebar ── */}
      <Sidebar activeView={null} onNavigate={v => router.push(v === 'dashboard' ? '/' : `/${v}`)} />

      {/* ── Main content ── */}
      <div style={{ flex: 1, background: PANEL_BG, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* ── Breadcrumb bar ── */}
        <div style={{ background: WHITE, borderBottom: `1px solid ${BORDER}`, padding: '0 28px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, boxShadow: '0 1px 6px rgba(0,0,0,.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, minWidth: 0 }}>
            <button onClick={() => router.push('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: GRAY2, fontWeight: 600, fontSize: 13, padding: 0 }}>CRM</button>
            <ChevronRight size={13} color={GRAY3} />
            <button onClick={() => router.push(fromView === 'pipeline' ? '/pipeline' : '/')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: GRAY2, fontWeight: 600, fontSize: 13, padding: 0 }}>{fromLabel}</button>
            <ChevronRight size={13} color={GRAY3} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <div style={{ width: 22, height: 22, borderRadius: 6, background: 'linear-gradient(135deg, #E8001C, #B91C1C)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Building2 size={12} color={WHITE} />
              </div>
              <span style={{ fontWeight: 800, color: GRAY1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 260 }}>
                {isNew ? 'Novo Lead' : (form.empresa || 'Editar Lead')}
              </span>
              <div style={{ display: 'flex', gap: 4 }}>
                {form.origem && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#F5F3FF', color: '#7C3AED' }}>{form.origem}</span>}
                {form.temperatura && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: `${tempColor(form.temperatura)}18`, color: tempColor(form.temperatura) }}>{form.temperatura}</span>}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            {!isNew && (
              <a href={calendarUrl} target="_blank" rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 13px', borderRadius: 9, border: '1px solid #BBF7D0', background: '#F0FDF4', color: '#15803D', fontSize: 12, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                Agendar no Google Agenda
              </a>
            )}
            {!isNew && ['VENDA', 'ATIVADO'].includes(getPipelineStage(form)) && cockpitClienteId !== 'loading' && (
              <button
                onClick={async () => {
                  if (cockpitClienteId) { router.push(`/cockpit/${cockpitClienteId}`); return }
                  const { data } = await supabase.from('clientes').insert({
                    lead_id: id,
                    empresa: form.empresa || 'Cliente',
                    segmento: form.segmento || null,
                    stack: [],
                    links: {},
                  }).select('id').single()
                  if (data) {
                    if (form.nome_lead || form.telefone || form.email) {
                      await supabase.from('contatos').insert({ cliente_id: data.id, nome: form.nome_lead || form.empresa, cargo: form.cargo || null, email: form.email || null, telefone: form.telefone || null, is_primary: true })
                    }
                    if (form.tcv_saber || form.tcv_ter || form.tcv_executar) {
                      const projetos = []
                      if (form.tcv_saber) projetos.push({ cliente_id: data.id, nome: `Saber — ${form.empresa}`, tipo: 'saber', valor_tipo: 'pontual', valor: form.tcv_saber, data_inicio: form.data_assinatura })
                      if (form.tcv_ter) projetos.push({ cliente_id: data.id, nome: `Ter — ${form.empresa}`, tipo: 'ter', valor_tipo: 'pontual', valor: form.tcv_ter, data_inicio: form.data_assinatura })
                      if (form.tcv_executar) projetos.push({ cliente_id: data.id, nome: `Executar — ${form.empresa}`, tipo: 'executar', valor_tipo: 'mensalidade', valor: form.tcv_executar, data_inicio: form.data_assinatura })
                      if (projetos.length) await supabase.from('projetos').insert(projetos)
                    }
                    setCockpitClienteId(data.id)
                    router.push(`/cockpit/${data.id}`)
                  }
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 13px', borderRadius: 9, border: `1px solid ${cockpitClienteId ? '#DDD6FE' : '#FCA5A5'}`, background: cockpitClienteId ? '#F5F3FF' : '#FEF2F2', color: cockpitClienteId ? '#5B21B6' : '#B91C1C', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                <Layers size={13} />
                {cockpitClienteId ? 'Ver no Cockpit' : 'Criar no Cockpit'}
              </button>
            )}
          </div>
        </div>

        {/* ── Body (scrollable) ── */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex' }}>
      <div style={{ flex: 1, display: 'flex', maxWidth: 1100, width: '100%', margin: '24px auto', padding: '0 24px', gap: 0, boxSizing: 'border-box', alignItems: 'flex-start' }}>

        {/* ── Left Panel ── */}
        <div style={{ width: 280, flexShrink: 0, background: WHITE, borderRadius: '16px 0 0 16px', border: `1px solid ${BORDER}`, borderRight: 'none', padding: '20px 18px', alignSelf: 'stretch', overflowY: 'auto', pointerEvents: !canEdit ? 'none' : undefined }}>

          <InfoField label="Empresa" required error={errors.empresa}>
            <input style={{ ...inputStyle, borderColor: errors.empresa ? R : BORDER, fontWeight: 600, fontSize: 14 }} value={form.empresa || ''} onChange={e => set('empresa', e.target.value)} placeholder="Nome da empresa" />
          </InfoField>

          <InfoField label="Nome do Lead" required error={errors.nome_lead}>
            <input style={{ ...inputStyle, borderColor: errors.nome_lead ? R : BORDER }} value={form.nome_lead || ''} onChange={e => set('nome_lead', e.target.value)} placeholder="Nome completo" />
          </InfoField>

          <InfoField label="Telefone" required error={errors.telefone}>
            <div style={{ display: 'flex', gap: 6 }}>
              <input style={{ ...inputStyle, borderColor: errors.telefone ? R : BORDER, flex: 1 }} value={form.telefone || ''} onChange={e => set('telefone', formatPhone(e.target.value))} placeholder="(43) 99999-9999" />
              {form.telefone && (
                <a href={`https://wa.me/55${form.telefone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" title="Abrir WhatsApp"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, flexShrink: 0, borderRadius: 8, border: '1px solid #25D36660', background: '#F0FFF4', color: '#25D366', textDecoration: 'none', pointerEvents: 'auto' }}>
                  <MessageCircle size={14} />
                </a>
              )}
            </div>
          </InfoField>

          <InfoField label="E-mail do Lead" required error={errors.email}>
            <input type="email" style={{ ...inputStyle, borderColor: errors.email ? R : BORDER }} value={form.email || ''} onChange={e => set('email', e.target.value)} placeholder="email@exemplo.com" />
          </InfoField>

          {form.origem === 'Recomendação' && (
            <InfoField label="Quem Recomendou">
              <input style={inputStyle} value={form.recomendacoes || ''} onChange={e => set('recomendacoes', e.target.value)} placeholder="Nome de quem indicou" />
            </InfoField>
          )}

          <div style={{ borderTop: `1px solid ${BORDER}`, margin: '4px 0 16px' }}>
            <div style={{ marginTop: 12, fontSize: 9, fontWeight: 900, color: GRAY3, textTransform: 'uppercase', letterSpacing: '0.14em' }}>Perfil & ICP</div>
          </div>

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

          <InfoField label="Responsável BDR" required error={errors.responsavel_bdr}>
            <UserSelect
              value={form.responsavel_bdr || null}
              onChange={v => set('responsavel_bdr', v)}
              placeholder="Selecione o BDR"
              borderColor={errors.responsavel_bdr ? '#E8001C' : BORDER}
              papeis={['closer', 'sdr', 'admin']}
            />
          </InfoField>

          {/* ── Links compactos ── */}
          <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 14, marginTop: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: 9, fontWeight: 900, color: GRAY3, textTransform: 'uppercase', letterSpacing: '0.14em' }}>Links</div>
              <button onClick={() => setLinksExpanded(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: GRAY2, padding: 0, fontWeight: 700, pointerEvents: 'auto' }}>
                {linksExpanded ? 'Recolher' : 'Editar'}
              </button>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: linksExpanded ? 12 : 0 }}>
              {LINK_DEFS.map(({ key, label, icon: Icon, color }) => {
                const url = (form as any)[key]
                return url ? (
                  <a key={key} href={url} target="_blank" rel="noopener noreferrer" title={label}
                    style={{ width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${color}18`, border: `1px solid ${color}50`, color, textDecoration: 'none', pointerEvents: 'auto', flexShrink: 0 }}>
                    <Icon size={13} />
                  </a>
                ) : (
                  <div key={key} title={label}
                    style={{ width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F3F4F6', border: `1px solid ${BORDER}`, color: GRAY3, flexShrink: 0 }}>
                    <Icon size={13} />
                  </div>
                )
              })}
            </div>
            {linksExpanded && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {LINK_DEFS.map(({ key, label, placeholder, icon: Icon, color }) => (
                  <div key={key}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: GRAY2, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Icon size={10} color={color} />{label}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input style={{ ...inputStyle, flex: 1, fontSize: 11 }} value={(form as any)[key] || ''} onChange={e => set(key, e.target.value)} placeholder={placeholder} />
                      {(form as any)[key] && (
                        <a href={(form as any)[key]} target="_blank" rel="noopener noreferrer"
                          style={{ display: 'flex', alignItems: 'center', padding: '0 8px', borderRadius: 6, border: `1px solid ${BORDER}`, color: '#7C3AED', background: WHITE, textDecoration: 'none', pointerEvents: 'auto' }}>
                          <ExternalLink size={11} />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Right Panel ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: WHITE, borderRadius: '0 16px 16px 0', border: `1px solid ${BORDER}`, minWidth: 0, overflow: 'hidden' }}>

          {/* ── Timeline de datas ── */}
          {!isNew && (() => {
            const fmt = (d: string | null) => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—'
            const isPerdido = getPipelineStage(form) === 'PERDIDO'
            const TIMELINE = isPerdido ? [
              { label: 'Entrada', key: 'data_entrada'   },
              { label: 'Reu. AG', key: 'data_ra'        },
              { label: 'Reu. RR', key: 'data_rr'        },
              { label: 'Perdido', key: 'data_perdido'   },
            ] as const : [
              { label: 'Entrada',  key: 'data_entrada'   },
              { label: 'Reu. AG',  key: 'data_ra'        },
              { label: 'Reu. RR',  key: 'data_rr'        },
              { label: 'Venda',    key: 'data_assinatura' },
              { label: 'Ativação', key: 'data_ativacao'  },
            ] as const
            return (
              <div style={{ padding: '12px 24px 14px', borderBottom: `1px solid ${BORDER}`, background: '#FAFAFA', flexShrink: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: GRAY3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Timeline</span>
                  {diasNoFunil !== null && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: diasNoFunil > 30 ? R : diasNoFunil > 14 ? '#F59E0B' : GRAY2 }}>
                      {diasNoFunil}d no funil
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                  {TIMELINE.map(({ label, key }, idx) => {
                    const hasDate = !!form[key]
                    const nextHas = idx < TIMELINE.length - 1 && !!form[TIMELINE[idx + 1].key]
                    return (
                      <React.Fragment key={key}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                          {(() => {
                            const dotColor = hasDate ? (key === 'data_perdido' ? R : GREEN) : '#D1D5DB'
                            return <>
                              <div style={{ width: 10, height: 10, borderRadius: '50%', background: dotColor, border: `2px solid ${dotColor}` }} />
                              <div style={{ fontSize: 9, fontWeight: hasDate ? 700 : 500, color: hasDate ? (key === 'data_perdido' ? R : GRAY1) : GRAY3, marginTop: 4, textAlign: 'center', whiteSpace: 'nowrap' }}>{label}</div>
                              <div style={{ fontSize: 9, color: hasDate ? (key === 'data_perdido' ? R : GREEN) : GRAY3, fontWeight: 600, marginTop: 1 }}>{fmt(form[key])}</div>
                            </>
                          })()}
                        </div>
                        {idx < TIMELINE.length - 1 && (
                          <div style={{ flex: 1, height: 2, background: hasDate && nextHas ? GREEN : '#E5E7EB', marginTop: 4, minWidth: 6 }} />
                        )}
                      </React.Fragment>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* ── Card de resumo ── */}
          {!isNew && (
            <div style={{ padding: '10px 24px 12px', borderBottom: `1px solid ${BORDER}`, background: WHITE, flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                {/* FUP */}
                <div style={{ flex: 1, background: fupVencido ? `${R}06` : '#FAFAFA', borderRadius: 9, border: `1px solid ${fupVencido ? R + '40' : BORDER}`, padding: '8px 10px', minWidth: 0 }}>
                  <div style={{ fontSize: 9, fontWeight: 800, color: GRAY3, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>FUP</div>
                  {isClosedLead
                    ? <div style={{ fontSize: 11, color: GRAY3 }}>—</div>
                    : !form.data_fup
                      ? <div style={{ fontSize: 11, color: GRAY3 }}>Sem data</div>
                      : fupVencido
                        ? <div style={{ fontSize: 11, fontWeight: 700, color: R }}>⚠ Vencido {Math.abs(fupDias!)}d</div>
                        : <div style={{ fontSize: 11, fontWeight: 600, color: fupDias! <= 2 ? '#F59E0B' : GREEN }}>Em {fupDias}d · {new Date(form.data_fup + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</div>
                  }
                </div>
                {/* Último registro */}
                <div style={{ flex: 2, background: '#FAFAFA', borderRadius: 9, border: `1px solid ${BORDER}`, padding: '8px 10px', minWidth: 0 }}>
                  <div style={{ fontSize: 9, fontWeight: 800, color: GRAY3, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>Último Registro</div>
                  {!ultimaAtividade
                    ? <div style={{ fontSize: 11, color: GRAY3 }}>Nenhum</div>
                    : <>
                        <div style={{ fontSize: 11, fontWeight: 600, color: GRAY1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ultimaAtividade.texto}</div>
                        <div style={{ fontSize: 9, color: GRAY3, marginTop: 2 }}>{ultimaAtividade.data}</div>
                      </>
                  }
                </div>
                {/* Próximo passo */}
                <div style={{ flex: 2, background: proximoPasso ? `${GREEN}06` : '#FAFAFA', borderRadius: 9, border: `1px solid ${proximoPasso ? GREEN + '40' : BORDER}`, padding: '8px 10px', minWidth: 0 }}>
                  <div style={{ fontSize: 9, fontWeight: 800, color: GRAY3, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>Próx. Passo</div>
                  {!proximoPasso
                    ? <div style={{ fontSize: 11, color: GRAY3 }}>Nenhum</div>
                    : <>
                        <div style={{ fontSize: 11, fontWeight: 600, color: GREEN, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{proximoPasso.texto}</div>
                        <div style={{ fontSize: 9, color: GRAY3, marginTop: 2 }}>{proximoPasso.data}</div>
                      </>
                  }
                </div>
              </div>
            </div>
          )}

          {/* Tab bar */}
          <div style={{ display: 'flex', borderBottom: `1px solid ${BORDER}`, flexShrink: 0, padding: '0 24px' }}>
            {(['qualificacao', 'negociacao', 'historico'] as const).map(tab => {
              const active = activeTab === tab
              const labels = { qualificacao: 'Qualificação', negociacao: 'Negociação', historico: 'Histórico' }
              return (
                <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: '14px 4px', marginRight: 24, border: 'none', background: 'transparent', fontSize: 13, fontWeight: 700, cursor: 'pointer', color: active ? R : GRAY2, borderBottom: `2px solid ${active ? R : 'transparent'}`, transition: 'all .15s', marginBottom: -1 }}>
                  {labels[tab]}
                </button>
              )
            })}
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '22px 24px', pointerEvents: !canEdit ? 'none' : undefined }}>

            {/* ─── QUALIFICAÇÃO ─── */}
            {activeTab === 'qualificacao' && (
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

                {!isNew && (() => {
                  const hoje = new Date().toLocaleDateString('pt-BR')
                  const hist = Array.isArray(form.historico_anotacoes_pre_vendas) ? form.historico_anotacoes_pre_vendas : []
                  const hojeAtivs = hist.filter((e: any) => e.tipo === 'cadencia' && e.data?.startsWith(hoje))
                  const ct = (t: string) => hojeAtivs.filter((e: any) => e.atividade === t).length
                  const nApi = ct('ligacao_api'), nWaCall = ct('ligacao_whatsapp'), nWaMsg = ct('mensagem_whatsapp')
                  const total = nApi + nWaCall + nWaMsg
                  const completo = nApi >= 2 && nWaCall >= 2 && nWaMsg >= 1
                  const ATIVS = [
                    { tipo: 'ligacao_api',       icon: '📞', label: 'Lig. API',    count: nApi,    max: 2 },
                    { tipo: 'ligacao_whatsapp',   icon: '📱', label: 'Lig. WA',    count: nWaCall, max: 2 },
                    { tipo: 'mensagem_whatsapp',  icon: '💬', label: 'Msg. WA',    count: nWaMsg,  max: 1 },
                  ]
                  const LABELS: Record<string, string> = {
                    ligacao_api: '📞 Ligação via API',
                    ligacao_whatsapp: '📱 Ligação via WhatsApp',
                    mensagem_whatsapp: '💬 Mensagem via WhatsApp',
                  }
                  return (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <SectionTitle>Atividades de Cadência — Dia {form.cadencia || 1}</SectionTitle>
                        <span style={{ fontSize: 11, fontWeight: 700, color: completo ? GREEN : GRAY2 }}>
                          {completo ? '✓ Dia concluído!' : `${total}/5 hoje`}
                        </span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                        {ATIVS.map(a => {
                          const done = a.count >= a.max
                          return (
                            <button key={a.tipo} type="button"
                              onClick={() => !done && registrarAtividade(a.tipo, LABELS[a.tipo])}
                              style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                                padding: '16px 8px', borderRadius: 12,
                                border: `2px solid ${done ? GREEN : a.count > 0 ? '#FCD34D' : BORDER}`,
                                background: done ? `${GREEN}10` : a.count > 0 ? '#FFFBEB' : WHITE,
                                cursor: done ? 'default' : 'pointer', transition: 'all .15s',
                              }}
                              onMouseEnter={e => { if (!done) (e.currentTarget as HTMLElement).style.borderColor = '#6B7280' }}
                              onMouseLeave={e => { if (!done) (e.currentTarget as HTMLElement).style.borderColor = a.count > 0 ? '#FCD34D' : BORDER }}
                            >
                              <span style={{ fontSize: 26 }}>{a.icon}</span>
                              <div style={{ display: 'flex', gap: 4 }}>
                                {Array.from({ length: a.max }, (_, i) => (
                                  <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: i < a.count ? GREEN : '#E5E7EB' }} />
                                ))}
                              </div>
                              <span style={{ fontSize: 10, fontWeight: 800, color: done ? GREEN : GRAY2, textAlign: 'center', lineHeight: 1.3 }}>
                                {a.label}<br />{a.count}/{a.max}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()}

                <div>
                  <SectionTitle>Qualificação BDR</SectionTitle>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: GRAY2, marginBottom: 5 }}>Situação BDR</div>
                      {(() => {
                        const badge = getStageBDR(form)
                        if (badge) return (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, border: `1px solid ${BORDER}`, background: '#F9FAFB' }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: GRAY1 }}>{badge.label}</span>
                            <span style={{ fontSize: 10, color: GRAY3 }}>automático</span>
                          </div>
                        )
                        return (
                          <select style={inputStyle} value={form.situacao_pre_vendas || ''} onChange={e => set('situacao_pre_vendas', e.target.value)}>
                            <option value="">Selecione</option>
                            {['TENTANDO CONTATO', 'EM QUALIFICAÇÃO'].map(o => <option key={o}>{o}</option>)}
                          </select>
                        )
                      })()}
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
                  {(form.situacao_pre_vendas === 'PERDIDO SDR' || form.situacao_pre_vendas === 'REEMBOLSO') && !form.data_rr && (
                    <div style={{ marginTop: 12, padding: '12px 14px', background: `${GRAY2}08`, borderRadius: 10, border: `1px solid ${GRAY2}30` }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: GRAY2, marginBottom: 6 }}>MOTIVO DE PERDA — PRÉ-VENDAS</div>
                      <select style={inputStyle} value={form.motivo_perda_pre_vendas || ''} onChange={e => set('motivo_perda_pre_vendas', e.target.value)}>
                        <option value="">Selecione o motivo</option>
                        {MOTIVOS_PERDA_PRE_VENDAS.map(o => <option key={o}>{o}</option>)}
                      </select>
                    </div>
                  )}
                  {(form.situacao_pre_vendas === 'PERDIDO SDR' || form.situacao_pre_vendas === 'REEMBOLSO') && !!form.data_rr && (
                    <div style={{ marginTop: 12, padding: '12px 14px', background: `${GRAY2}08`, borderRadius: 10, border: `1px solid ${GRAY2}30` }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: GRAY2, marginBottom: 6 }}>MOTIVO DE PERDA — CLOSER</div>
                      <select style={inputStyle} value={form.motivo_perda_closer || ''} onChange={e => set('motivo_perda_closer', e.target.value)}>
                        <option value="">Selecione o motivo</option>
                        {MOTIVOS_PERDA_CLOSER.map(o => <option key={o}>{o}</option>)}
                      </select>
                    </div>
                  )}
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
                  <SectionTitle>Anotações</SectionTitle>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <textarea rows={2} style={{ ...inputStyle, flex: 1, resize: 'none', lineHeight: 1.6 }} value={novaAnotacaoTexto} onChange={e => setNovaAnotacaoTexto(e.target.value)} placeholder="Registre objeções, histórico de contato, pontos de atenção..."
                      onKeyDown={e => {
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                          e.preventDefault()
                          const txt = novaAnotacaoTexto.trim()
                          if (!txt) return
                          const agora = new Date(); const hoje = `${agora.toLocaleDateString('pt-BR')} ${String(agora.getHours()).padStart(2,'0')}:${String(agora.getMinutes()).padStart(2,'0')}`
                          const hist = Array.isArray(form.historico_anotacoes_pre_vendas) ? form.historico_anotacoes_pre_vendas : []
                          set('historico_anotacoes_pre_vendas', [{ data: hoje, texto: txt, usuario: nomeUsuario || null }, ...hist])
                          setNovaAnotacaoTexto('')
                        }
                      }}
                    />
                    <button type="button" onClick={() => {
                      const txt = novaAnotacaoTexto.trim()
                      if (!txt) return
                      const agora = new Date(); const hoje = `${agora.toLocaleDateString('pt-BR')} ${String(agora.getHours()).padStart(2,'0')}:${String(agora.getMinutes()).padStart(2,'0')}`
                      const hist = Array.isArray(form.historico_anotacoes_pre_vendas) ? form.historico_anotacoes_pre_vendas : []
                      set('historico_anotacoes_pre_vendas', [{ data: hoje, texto: txt, usuario: nomeUsuario || null }, ...hist])
                      setNovaAnotacaoTexto('')
                    }} style={{ padding: '0 16px', borderRadius: 8, border: 'none', background: R, color: WHITE, fontSize: 12, fontWeight: 800, cursor: 'pointer', flexShrink: 0, alignSelf: 'stretch' }}>
                      + Adicionar
                    </button>
                  </div>
                  {Array.isArray(form.historico_anotacoes_pre_vendas) && form.historico_anotacoes_pre_vendas.filter((e: any) => e.tipo !== 'log').length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {form.historico_anotacoes_pre_vendas.filter((e: any) => e.tipo !== 'log').map((entry: any, i: number) => {
                        if (entry.tipo === 'cadencia_completa') return (
                          <div key={i} style={{ background: `${GREEN}10`, border: `1px solid ${GREEN}40`, borderRadius: 8, padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 16 }}>✅</span>
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 700, color: GRAY3, marginBottom: 2 }}>{entry.data}</div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: GREEN }}>{entry.texto}</div>
                            </div>
                          </div>
                        )
                        if (entry.tipo === 'cadencia') {
                          const icons: Record<string, string> = { ligacao_api: '📞', ligacao_whatsapp: '📱', mensagem_whatsapp: '💬' }
                          return (
                            <div key={i} style={{ background: '#F0F9FF', border: '1px solid #BAE6FD', borderLeft: '3px solid #0EA5E9', borderRadius: 8, padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 14 }}>{icons[entry.atividade] || '📋'}</span>
                              <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 1 }}>
                                  <div style={{ fontSize: 10, fontWeight: 700, color: GRAY3 }}>{entry.data} · Dia {entry.dia}</div>
                                  {entry.usuario && <div style={{ fontSize: 10, fontWeight: 700, color: '#0EA5E9', background: '#E0F2FE', padding: '1px 7px', borderRadius: 20 }}>{entry.usuario.split(' ')[0]}</div>}
                                </div>
                                <div style={{ fontSize: 12, color: '#0369A1', fontWeight: 600 }}>{entry.texto}</div>
                              </div>
                            </div>
                          )
                        }
                        return (
                          <div key={i} style={{ background: '#F8F9FB', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '9px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: GRAY3 }}>{entry.data}</div>
                              {entry.usuario && <div style={{ fontSize: 10, fontWeight: 700, color: GRAY2, background: '#E5E7EB', padding: '1px 7px', borderRadius: 20 }}>{entry.usuario.split(' ')[0]}</div>}
                            </div>
                            <div style={{ fontSize: 12, color: GRAY1, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{entry.texto}</div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {!isNew && <GerarQualificacao leadId={id} empresa={form.empresa} onSaved={qa => setFormState((f: any) => ({ ...f, qualificacao_ia: qa }))} />}
              </div>
            )}

            {/* ─── HISTÓRICO ─── */}
            {activeTab === 'historico' && (() => {
              const anotacoes = (Array.isArray(form.historico_anotacoes_pre_vendas) ? form.historico_anotacoes_pre_vendas : [])
                .map((e: any) => ({ ...e, source: 'anotacao' as const }))
              const passos = (Array.isArray(form.historico_proximos_passos) ? form.historico_proximos_passos : [])
                .map((e: any) => ({ ...e, source: 'passo' as const }))
              const feed = [...anotacoes, ...passos].sort((a, b) => {
                const parse = (d: string) => {
                  if (!d) return 0
                  const [date, time] = d.split(' ')
                  if (!date) return 0
                  const [dd, mm, yyyy] = date.split('/')
                  return new Date(`${yyyy}-${mm}-${dd}T${time || '00:00'}`).getTime()
                }
                return parse(b.data) - parse(a.data)
              })
              const icons: Record<string, string> = { ligacao_api: '📞', ligacao_whatsapp: '📱', mensagem_whatsapp: '💬' }
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {feed.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: GRAY3, fontSize: 13 }}>Nenhum histórico registrado</div>
                  )}
                  {feed.map((entry: any, i: number) => {
                    if (entry.source === 'passo') return (
                      <div key={`p-${i}`} style={{ background: '#F0FDF4', border: `1px solid #BBF7D0`, borderLeft: '3px solid #16A34A', borderRadius: 8, padding: '9px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 7px', borderRadius: 20, background: '#BBF7D0', color: '#15803D', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Próx. Passo</span>
                            <span style={{ fontSize: 10, fontWeight: 600, color: GRAY3 }}>{entry.data}</span>
                          </div>
                        </div>
                        <div style={{ fontSize: 12, color: '#15803D', lineHeight: 1.6, whiteSpace: 'pre-wrap', fontWeight: 600 }}>{entry.texto}</div>
                      </div>
                    )
                    if (entry.tipo === 'cadencia_completa') return (
                      <div key={`a-${i}`} style={{ background: `${GREEN}10`, border: `1px solid ${GREEN}40`, borderRadius: 8, padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 16 }}>✅</span>
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: GRAY3, marginBottom: 2 }}>{entry.data}</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: GREEN }}>{entry.texto}</div>
                        </div>
                      </div>
                    )
                    if (entry.tipo === 'cadencia') return (
                      <div key={`a-${i}`} style={{ background: '#F0F9FF', border: '1px solid #BAE6FD', borderLeft: '3px solid #0EA5E9', borderRadius: 8, padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 14 }}>{icons[entry.atividade] || '📋'}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 1 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: GRAY3 }}>{entry.data} · Dia {entry.dia}</div>
                            {entry.usuario && <div style={{ fontSize: 10, fontWeight: 700, color: '#0EA5E9', background: '#E0F2FE', padding: '1px 7px', borderRadius: 20 }}>{entry.usuario.split(' ')[0]}</div>}
                          </div>
                          <div style={{ fontSize: 12, color: '#0369A1', fontWeight: 600 }}>{entry.texto}</div>
                        </div>
                      </div>
                    )
                    if (entry.tipo === 'log') return (
                      <div key={`a-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderRadius: 7, border: `1px solid ${BORDER}`, background: WHITE }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#D1D5DB', flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 11, color: GRAY2, fontWeight: 500 }}>{entry.texto}</div>
                          <div style={{ fontSize: 9, color: GRAY3, marginTop: 1, display: 'flex', gap: 6 }}>
                            <span>{entry.data}</span>
                            {entry.usuario && <span style={{ fontWeight: 700 }}>{entry.usuario.split(' ')[0]}</span>}
                          </div>
                        </div>
                      </div>
                    )
                    return (
                      <div key={`a-${i}`} style={{ background: '#F8F9FB', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '9px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 7px', borderRadius: 20, background: '#E5E7EB', color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Anotação</span>
                            <span style={{ fontSize: 10, fontWeight: 700, color: GRAY3 }}>{entry.data}</span>
                          </div>
                          {entry.usuario && <div style={{ fontSize: 10, fontWeight: 700, color: GRAY2, background: '#E5E7EB', padding: '1px 7px', borderRadius: 20 }}>{entry.usuario.split(' ')[0]}</div>}
                        </div>
                        <div style={{ fontSize: 12, color: GRAY1, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{entry.texto}</div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}

            {/* ─── NEGOCIAÇÃO ─── */}
            {activeTab === 'negociacao' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

                {/* ── Botão Resumo da Qualificação ── */}
                {form.qualificacao_ia && (() => {
                  const qa = form.qualificacao_ia as any
                  const bantKeys = ['budget', 'authority', 'need', 'timing'] as const
                  const score = bantKeys.filter(k => !!qa.bant?.[k]).length
                  const scoreColor = score >= 3 ? GREEN : score >= 2 ? '#F59E0B' : R
                  return (
                    <button onClick={() => setShowQaModal(true)}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '12px 16px', borderRadius: 10, border: `1.5px solid ${BORDER}`, background: WHITE, cursor: 'pointer', textAlign: 'left' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 16 }}>📋</span>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 800, color: GRAY1 }}>Ver Resumo da Qualificação</div>
                          <div style={{ fontSize: 11, color: GRAY2, marginTop: 1 }}>BANT · SPICED · Insights · Objeções</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ display: 'flex', gap: 3 }}>
                          {bantKeys.map(k => (
                            <div key={k} style={{ width: 8, height: 8, borderRadius: '50%', background: qa.bant?.[k] ? GREEN : '#E5E7EB' }} />
                          ))}
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 800, color: scoreColor }}>{score}/4</span>
                        <ChevronRight size={14} color={GRAY3} />
                      </div>
                    </button>
                  )
                })()}

                {/* ── Modal Resumo da Qualificação ── */}
                {showQaModal && form.qualificacao_ia && (() => {
                  const qa = form.qualificacao_ia as any
                  const bantKeys = ['budget', 'authority', 'need', 'timing'] as const
                  const bantLabel: Record<string, string> = { budget: 'Budget', authority: 'Authority', need: 'Need', timing: 'Timing' }
                  const score = bantKeys.filter(k => !!qa.bant?.[k]).length
                  const scoreColor = score >= 3 ? GREEN : score >= 2 ? '#F59E0B' : R
                  const spicedLabel: Record<string, string> = { situation: 'Situation', pain: 'Pain', impact: 'Impact', criticalEvent: 'Critical Event', decision: 'Decision' }
                  const spicedColor: Record<string, string> = { situation: '#7C3AED', pain: '#EF4444', impact: '#8B5CF6', criticalEvent: '#F59E0B', decision: '#10B981' }
                  return (
                    <div onClick={() => setShowQaModal(false)}
                      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                      <div onClick={e => e.stopPropagation()}
                        style={{ background: WHITE, borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>

                        {/* Header */}
                        <div style={{ position: 'sticky', top: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', background: GRAY1, borderRadius: '16px 16px 0 0', zIndex: 1 }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 800, color: WHITE, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Resumo da Qualificação</div>
                            {qa.dadosBasicos?.empresa && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{qa.dadosBasicos.empresa}</div>}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ width: 32, height: 32, borderRadius: '50%', background: scoreColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 900, color: WHITE }}>{score}</div>
                              <div style={{ fontSize: 9, color: '#9CA3AF', marginTop: 2 }}>BANT</div>
                            </div>
                            <button onClick={() => setShowQaModal(false)}
                              style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: WHITE, fontSize: 16 }}>✕</button>
                          </div>
                        </div>

                        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 20 }}>

                          {/* BANT */}
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 800, color: R, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>BANT</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                              {bantKeys.map(k => {
                                const ok = !!qa.bant?.[k]
                                return (
                                  <div key={k} style={{ padding: '10px 12px', borderRadius: 10, background: ok ? `${GREEN}08` : `${R}06`, border: `1px solid ${ok ? `${GREEN}30` : `${R}25`}` }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: qa.bant?.[k] ? 4 : 0 }}>
                                      <div style={{ width: 16, height: 16, borderRadius: 4, background: ok ? GREEN : R, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        <span style={{ fontSize: 9, color: WHITE, fontWeight: 900 }}>{ok ? '✓' : '✗'}</span>
                                      </div>
                                      <span style={{ fontSize: 12, fontWeight: 800, color: ok ? GREEN : R }}>{bantLabel[k]}</span>
                                    </div>
                                    {qa.bant?.[k] && <div style={{ fontSize: 11, color: GRAY2, lineHeight: 1.5, paddingLeft: 22 }}>{qa.bant[k]}</div>}
                                  </div>
                                )
                              })}
                            </div>
                          </div>

                          {/* SPICED */}
                          {qa.spiced && Object.values(qa.spiced).some(Boolean) && (
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 800, color: '#6B21A8', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>SPICED</div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {(['situation', 'pain', 'impact', 'criticalEvent', 'decision'] as const).filter(k => !!qa.spiced?.[k]).map((k) => { const v = qa.spiced[k]; return (
                                  <div key={k} style={{ display: 'flex', gap: 10 }}>
                                    <span style={{ fontSize: 11, fontWeight: 800, color: spicedColor[k] || GRAY3, flexShrink: 0, paddingTop: 1, minWidth: 90 }}>{spicedLabel[k] || k}</span>
                                    <span style={{ fontSize: 12, color: GRAY1, lineHeight: 1.6 }}>{v as string}</span>
                                  </div>
                                )})}
                              </div>
                            </div>
                          )}

                          {/* Insights */}
                          {(qa.insights?.termometro || qa.insights?.gatilhoDeOuro || qa.insights?.sugestaoAbordagem) && (
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 800, color: '#0369A1', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>Insights para o Closer</div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {qa.insights?.termometro && (
                                  <div style={{ display: 'flex', gap: 10 }}>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: GRAY3, flexShrink: 0, paddingTop: 1, minWidth: 90 }}>Termômetro</span>
                                    <span style={{ fontSize: 12, color: GRAY1, lineHeight: 1.5 }}>{qa.insights.termometro}</span>
                                  </div>
                                )}
                                {qa.insights?.gatilhoDeOuro && (
                                  <div style={{ padding: '10px 12px', borderRadius: 10, background: '#FFF7ED', border: '1px solid #FED7AA' }}>
                                    <div style={{ fontSize: 9, fontWeight: 800, color: '#EA580C', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Gatilho de Ouro</div>
                                    <div style={{ fontSize: 12, color: '#9A3412', lineHeight: 1.6 }}>{qa.insights.gatilhoDeOuro}</div>
                                  </div>
                                )}
                                {qa.insights?.sugestaoAbordagem && (
                                  <div style={{ padding: '10px 12px', borderRadius: 10, background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
                                    <div style={{ fontSize: 9, fontWeight: 800, color: GREEN, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Sugestão de Abordagem</div>
                                    <div style={{ fontSize: 12, color: '#14532D', lineHeight: 1.6 }}>{qa.insights.sugestaoAbordagem}</div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Personalidade + Objeções */}
                          {((qa.personalidade?.length > 0) || (qa.informacoesExtras?.objecoes?.length > 0)) && (
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 800, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>Perfil e Objeções</div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {qa.personalidade?.map((p: string) => (
                                  <span key={p} style={{ fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 20, background: `${R}10`, border: `1px solid ${R}25`, color: R }}>{p}</span>
                                ))}
                                {qa.informacoesExtras?.objecoes?.map((o: string, i: number) => (
                                  <span key={i} style={{ fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 20, background: '#FEF3C7', border: '1px solid #FDE68A', color: '#92400E' }}>⚠ {o}</span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Gravação */}
                          {qa._audioUrl && (
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 800, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>Gravação da Ligação</div>
                              <AudioPlayer url={qa._audioUrl} title="Gravação da Ligação" />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })()}

                <div>
                  <SectionTitle>Closer</SectionTitle>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: errors.closer ? R : GRAY2, marginBottom: 5 }}>
                        Closer{form.situacao_pre_vendas === 'REUNIÃO AGENDADA' && <span style={{ color: R }}> *</span>}
                      </div>
                      <UserSelect
                        value={form.closer || null}
                        onChange={v => { set('closer', v); }}
                        placeholder="Selecione o closer"
                        borderColor={errors.closer ? R : BORDER}
                      />
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
                      {(() => {
                        const badge = getStageCloser(form)
                        if (badge) return (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, border: `1px solid ${BORDER}`, background: '#F9FAFB' }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: GRAY1 }}>{badge.label}</span>
                            <span style={{ fontSize: 10, color: GRAY3 }}>automático</span>
                          </div>
                        )
                        return (
                          <select style={inputStyle} value={form.situacao_closer || ''} onChange={e => set('situacao_closer', e.target.value)}>
                            <option value="">Selecione</option>
                            {['EM FOLLOW UP', 'REUNIAO EXTRA AGENDADA', 'AGENDA FUTURA'].map(o => <option key={o}>{o}</option>)}
                            <option value="PERDIDO CLOSER">PERDIDO</option>
                          </select>
                        )
                      })()}
                    </div>
                    {form.situacao_closer === 'PERDIDO CLOSER' && (
                      <div style={{ gridColumn: '1 / -1', padding: '12px 14px', background: `${R}06`, borderRadius: 10, border: `1px solid ${R}25` }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: R, marginBottom: 6 }}>MOTIVO DE PERDA — CLOSER</div>
                        <select style={inputStyle} value={form.motivo_perda_closer || ''} onChange={e => set('motivo_perda_closer', e.target.value)}>
                          <option value="">Selecione o motivo</option>
                          {MOTIVOS_PERDA_CLOSER.map(o => <option key={o}>{o}</option>)}
                        </select>
                      </div>
                    )}
                    <div style={{ gridColumn: '1 / -1' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: GRAY2, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>TCV — Total Contract Value</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 600, color: GRAY2, marginBottom: 4 }}>Saber (consultoria)</div>
                          <input type="number" style={inputStyle} placeholder="R$ 0" value={form.tcv_saber ?? ''}
                            onChange={e => {
                              const v = e.target.value ? Number(e.target.value) : null
                              const total = (v||0) + (form.tcv_ter||0) + (form.tcv_executar||0) * (form.tcv_executar_meses||12)
                              set('tcv_saber', v); set('tcv', total || null)
                            }} />
                        </div>
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 600, color: GRAY2, marginBottom: 4 }}>Ter (implementação)</div>
                          <input type="number" style={inputStyle} placeholder="R$ 0" value={form.tcv_ter ?? ''}
                            onChange={e => {
                              const v = e.target.value ? Number(e.target.value) : null
                              const total = (form.tcv_saber||0) + (v||0) + (form.tcv_executar||0) * (form.tcv_executar_meses||12)
                              set('tcv_ter', v); set('tcv', total || null)
                            }} />
                        </div>
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 600, color: GRAY2, marginBottom: 4 }}>Executar (mensal)</div>
                          <input type="number" style={inputStyle} placeholder="R$ 0/mês" value={form.tcv_executar ?? ''}
                            onChange={e => {
                              const v = e.target.value ? Number(e.target.value) : null
                              const total = (form.tcv_saber||0) + (form.tcv_ter||0) + (v||0) * (form.tcv_executar_meses||12)
                              set('tcv_executar', v); set('tcv', total || null)
                            }} />
                        </div>
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 600, color: GRAY2, marginBottom: 4 }}>Período Executar</div>
                          <select style={inputStyle} value={form.tcv_executar_meses ?? 12}
                            onChange={e => {
                              const nm = Number(e.target.value)
                              const total = (form.tcv_saber||0) + (form.tcv_ter||0) + (form.tcv_executar||0) * nm
                              set('tcv_executar_meses', nm); set('tcv', total || null)
                            }}>
                            <option value={6}>6 meses</option>
                            <option value={12}>12 meses</option>
                          </select>
                        </div>
                      </div>
                      {(form.tcv_saber || form.tcv_ter || form.tcv_executar) ? (
                        <div style={{ marginTop: 10, padding: '8px 12px', background: `${GREEN}10`, borderRadius: 8, border: `1px solid ${GREEN}30`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: GRAY2 }}>TCV Total</span>
                          <span style={{ fontSize: 15, fontWeight: 900, color: GREEN }}>
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 }).format(
                              (form.tcv_saber||0) + (form.tcv_ter||0) + (form.tcv_executar||0) * (form.tcv_executar_meses||12)
                            )}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div>
                  <SectionTitle>Datas</SectionTitle>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {isClosedLead && getPipelineStage(form) === 'PERDIDO' && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: R, marginBottom: 5 }}>Data de Perda</div>
                        <input type="date" style={{ ...inputStyle, borderColor: `${R}60` }} value={form.data_perdido || ''} onChange={e => set('data_perdido', e.target.value)} />
                      </div>
                    )}
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
                  <SectionTitle>Contrato (PDF)</SectionTitle>
                  {isNew ? (
                    <LockedField message="Salve o lead primeiro para anexar o contrato" />
                  ) : (
                    <ContratoUpload
                      leadId={id}
                      url={form.link_contrato || null}
                      onUploaded={async (url) => {
                        set('link_contrato', url)
                        await supabase.from('leads').update({ link_contrato: url, updated_at: new Date().toISOString() }).eq('id', id)
                        toast.success('Contrato enviado!')
                      }}
                    />
                  )}
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
                            const agora = new Date(); const hoje = `${agora.toLocaleDateString('pt-BR')} ${String(agora.getHours()).padStart(2,'0')}:${String(agora.getMinutes()).padStart(2,'0')}`
                            const hist = Array.isArray(form.historico_proximos_passos) ? form.historico_proximos_passos : []
                            set('historico_proximos_passos', [{ data: hoje, texto: txt }, ...hist])
                            setNovoPassoTexto('')
                          }
                        }}
                      />
                      <button type="button" onClick={() => {
                        const txt = novoPassoTexto.trim()
                        if (!txt) return
                        const agora = new Date(); const hoje = `${agora.toLocaleDateString('pt-BR')} ${String(agora.getHours()).padStart(2,'0')}:${String(agora.getMinutes()).padStart(2,'0')}`
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
              {!canEdit && !roleLoading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: GRAY2, fontWeight: 600, background: '#F3F4F6', padding: '6px 12px', borderRadius: 8 }}>
                  <Lock size={13} /><span>Acesso somente visualização</span>
                </div>
              )}
              {canEdit && hasErrors && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: R, fontWeight: 600 }}>
                  <AlertCircle size={14} /><span>Corrija os erros antes de salvar</span>
                </div>
              )}
              {canEdit && !hasErrors && autoSaveStatus === 'saving' && (
                <div style={{ fontSize: 11, color: GRAY2, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />Salvando...
                </div>
              )}
              {canEdit && !hasErrors && autoSaveStatus === 'saved' && (
                <div style={{ fontSize: 11, color: GREEN, fontWeight: 700 }}>✓ Salvo automaticamente</div>
              )}
              {canEdit && !hasErrors && (autoSaveStatus === 'idle' || autoSaveStatus === 'pending') && (autoSaveStatus === 'pending' || hasUnsavedChanges) && (
                <div style={{ fontSize: 12, color: '#F59E0B', fontWeight: 700 }}>● Mudanças não salvas</div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => router.back()} style={{ padding: '10px 20px', borderRadius: 10, border: `1px solid ${BORDER}`, background: WHITE, color: GRAY2, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Voltar</button>
              {canEdit && (
                <button onClick={handleSave} disabled={saving || saved} style={{ padding: '10px 28px', borderRadius: 10, border: 'none', background: saved ? GREEN : saving ? GRAY3 : 'linear-gradient(135deg, #E8001C, #B91C1C)', color: WHITE, fontSize: 13, fontWeight: 800, cursor: (saving || saved) ? 'default' : 'pointer', boxShadow: saved ? '0 4px 14px rgba(22,163,74,0.3)' : saving ? 'none' : '0 4px 14px rgba(232,0,28,0.3)', transition: 'background .2s, box-shadow .2s' }}>
                  {saved ? '✓ SALVO!' : saving ? 'Salvando...' : 'SALVAR'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
        </div>{/* end scrollable body */}
      </div>{/* end main content */}
      <Toaster />
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

export default function LeadPage() {
  return (
    <Suspense>
      <LeadPageInner />
    </Suspense>
  )
}
