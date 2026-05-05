'use client'
import React, { useState, useEffect, Suspense, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Lead } from '@/lib/supabase'
import { Building2, AlertCircle, CheckCircle2, ExternalLink, Lock, ChevronRight, Mic, Upload, X, Loader2, ChevronDown, ChevronUp, Sparkles, FileText } from 'lucide-react'
import Sidebar from '../../Sidebar'
import { toast } from '@/lib/toast'
import { Toaster } from '@/components/Toaster'
import { UserSelect } from '@/components/UserSelect'
import { useUserRole } from '@/lib/useUserRole'

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

// ─── Audio Analysis Component ─────────────────────────────────────────────────
type BantResult = { budget: boolean; authority: boolean; need: boolean; timing: boolean }
type AnalysisResult = {
  bant: BantResult
  score: number
  justificativas: Record<string, string>
  resumo: string
  pontos_atencao: string[]
  recomendacao: string
}

type AudioAnalysisProps = { onApplyBant: (bant: BantResult) => void }

function AudioAnalysis({ onApplyBant }: AudioAnalysisProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<'idle' | 'transcribing' | 'analyzing' | 'done' | 'error'>('idle')
  const [transcription, setTranscription] = useState('')
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [showTranscription, setShowTranscription] = useState(false)
  const [customPrompt, setCustomPrompt] = useState('')
  const [showCustomPrompt, setShowCustomPrompt] = useState(false)
  const [applied, setApplied] = useState(false)

  const BANT_LABELS: Record<string, string> = { budget: 'Budget', authority: 'Authority', need: 'Need', timing: 'Timing' }

  const handleFile = (f: File) => {
    setFile(f)
    setStatus('idle')
    setAnalysis(null)
    setTranscription('')
    setApplied(false)
    setErrorMsg('')
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  const run = async () => {
    if (!file) return
    setStatus('transcribing')
    setErrorMsg('')
    setApplied(false)

    try {
      // Step 1: Transcribe
      const fd = new FormData()
      fd.append('audio', file)
      const t1 = await fetch('/api/transcribe', { method: 'POST', body: fd })
      const d1 = await t1.json()
      if (!t1.ok || d1.error) throw new Error(d1.error || 'Erro na transcrição')
      setTranscription(d1.transcription)

      // Step 2: Analyze BANT
      setStatus('analyzing')
      const t2 = await fetch('/api/analyze-bant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcription: d1.transcription, customPrompt: customPrompt.trim() || undefined }),
      })
      const d2 = await t2.json()
      if (!t2.ok || d2.error) throw new Error(d2.error || 'Erro na análise')
      setAnalysis(d2.analysis)
      setStatus('done')
    } catch (e: any) {
      setErrorMsg(e?.message || 'Erro desconhecido')
      setStatus('error')
    }
  }

  const applyBant = () => {
    if (!analysis) return
    onApplyBant(analysis.bant)
    setApplied(true)
  }

  const reset = () => {
    setFile(null)
    setStatus('idle')
    setAnalysis(null)
    setTranscription('')
    setApplied(false)
    setErrorMsg('')
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', ...sectionLabelStyle }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Mic size={13} />
          <span>Análise de Ligação (IA)</span>
        </div>
        <span style={{ fontSize: 10, fontWeight: 600, color: '#7C3AED', background: '#EDE9FE', padding: '2px 8px', borderRadius: 20 }}>Groq + Claude</span>
      </div>

      {status === 'idle' && !file && (
        <div
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
          style={{ border: `2px dashed ${BORDER}`, borderRadius: 12, padding: '20px 16px', textAlign: 'center', cursor: 'pointer', transition: 'border-color .15s' }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = '#7C3AED')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = BORDER)}
        >
          <Upload size={22} color={GRAY3} style={{ marginBottom: 8 }} />
          <div style={{ fontSize: 13, fontWeight: 600, color: GRAY2 }}>Arraste o MP3 aqui ou clique para selecionar</div>
          <div style={{ fontSize: 11, color: GRAY3, marginTop: 4 }}>Formatos: MP3, M4A, WAV, OGG · Máx. 25MB</div>
          <input ref={fileRef} type="file" accept=".mp3,.m4a,.wav,.ogg,.webm,.mp4" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }} />
        </div>
      )}

      {(file || status !== 'idle') && (
        <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
          {/* File header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#F8F9FB', borderBottom: `1px solid ${BORDER}` }}>
            <Mic size={14} color='#7C3AED' />
            <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: GRAY1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file?.name || 'Arquivo'}</span>
            {file && <span style={{ fontSize: 11, color: GRAY3 }}>{(file.size / 1024 / 1024).toFixed(1)}MB</span>}
            {status !== 'transcribing' && status !== 'analyzing' && (
              <button onClick={reset} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: GRAY3, display: 'flex' }}><X size={14} /></button>
            )}
          </div>

          {/* Custom prompt toggle */}
          {status === 'idle' && (
            <div style={{ padding: '10px 14px', borderBottom: `1px solid ${BORDER}` }}>
              <button onClick={() => setShowCustomPrompt(p => !p)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#7C3AED', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5, padding: 0 }}>
                <Sparkles size={12} />{showCustomPrompt ? 'Ocultar' : 'Adicionar'} critérios de avaliação personalizados
              </button>
              {showCustomPrompt && (
                <textarea
                  rows={3}
                  style={{ ...inputStyle, marginTop: 8, resize: 'none', fontSize: 12, lineHeight: 1.6 }}
                  value={customPrompt}
                  onChange={e => setCustomPrompt(e.target.value)}
                  placeholder="Ex: Considere o lead qualificado em Timing apenas se mencionar prazo em menos de 3 meses. Penalize se mencionar concorrente X..."
                />
              )}
            </div>
          )}

          {/* Status / action */}
          <div style={{ padding: '12px 14px' }}>
            {status === 'idle' && (
              <button onClick={run} style={{ width: '100%', padding: '10px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg, #7C3AED, #5B21B6)', color: WHITE, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
                Transcrever e Analisar BANT
              </button>
            )}

            {(status === 'transcribing' || status === 'analyzing') && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '8px 0' }}>
                <Loader2 size={22} color='#7C3AED' style={{ animation: 'spin 1s linear infinite' }} />
                <div style={{ fontSize: 13, fontWeight: 600, color: '#7C3AED' }}>
                  {status === 'transcribing' ? 'Transcrevendo com Groq Whisper...' : 'Analisando BANT com Claude...'}
                </div>
                <div style={{ fontSize: 11, color: GRAY3 }}>
                  {status === 'transcribing' ? 'Aguarde, isso pode levar alguns segundos' : 'Quase pronto...'}
                </div>
              </div>
            )}

            {status === 'error' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: R, fontWeight: 600 }}>
                  <AlertCircle size={14} />{errorMsg}
                </div>
                <button onClick={run} style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${R}`, background: `${R}08`, color: R, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  Tentar novamente
                </button>
              </div>
            )}

            {status === 'done' && analysis && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* BANT chips */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {(['budget', 'authority', 'need', 'timing'] as const).map(k => (
                    <div key={k} style={{ padding: '9px 12px', borderRadius: 9, border: `1.5px solid ${analysis.bant[k] ? `${GREEN}50` : `${R}40`}`, background: analysis.bant[k] ? `${GREEN}08` : `${R}06` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <div style={{ width: 16, height: 16, borderRadius: 4, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: analysis.bant[k] ? GREEN : R }}>
                          {analysis.bant[k] ? <CheckCircle2 size={10} color={WHITE} strokeWidth={3} /> : <X size={10} color={WHITE} strokeWidth={3} />}
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 800, color: analysis.bant[k] ? GREEN : R }}>{BANT_LABELS[k]}</span>
                      </div>
                      <div style={{ fontSize: 11, color: GRAY2, lineHeight: 1.5 }}>{analysis.justificativas?.[k] || '—'}</div>
                    </div>
                  ))}
                </div>

                {/* Score */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: analysis.score >= 3 ? `${GREEN}08` : `${R}06`, border: `1px solid ${analysis.score >= 3 ? `${GREEN}30` : `${R}25`}` }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 900, background: analysis.score >= 3 ? GREEN : R, color: WHITE, flexShrink: 0 }}>{analysis.score}</div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: analysis.score >= 3 ? GREEN : R }}>{analysis.score >= 3 ? 'Lead Qualificado ✓' : 'Lead Não Qualificado'}</div>
                    <div style={{ fontSize: 11, color: GRAY2 }}>Score BANT: {analysis.score}/4</div>
                  </div>
                </div>

                {/* Resumo */}
                {analysis.resumo && (
                  <div style={{ padding: '10px 14px', borderRadius: 10, background: '#F5F3FF', border: '1px solid #DDD6FE' }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: '#7C3AED', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Resumo da Ligação</div>
                    <div style={{ fontSize: 12, color: GRAY1, lineHeight: 1.6 }}>{analysis.resumo}</div>
                  </div>
                )}

                {/* Pontos de atenção */}
                {analysis.pontos_atencao?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 800, color: GRAY3, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Pontos de Atenção</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {analysis.pontos_atencao.map((p, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 11, color: GRAY1, lineHeight: 1.5 }}>
                          <span style={{ color: '#F59E0B', fontWeight: 800, flexShrink: 0 }}>⚠</span>{p}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recomendação */}
                {analysis.recomendacao && (
                  <div style={{ padding: '8px 12px', borderRadius: 9, background: '#F0FDF4', border: '1px solid #BBF7D0', fontSize: 12, color: '#15803D', lineHeight: 1.5 }}>
                    <strong>Próximo passo: </strong>{analysis.recomendacao}
                  </div>
                )}

                {/* Transcription toggle */}
                <button onClick={() => setShowTranscription(p => !p)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: GRAY3, fontWeight: 600, padding: '2px 0' }}>
                  {showTranscription ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  {showTranscription ? 'Ocultar' : 'Ver'} transcrição completa
                </button>
                {showTranscription && (
                  <div style={{ maxHeight: 200, overflowY: 'auto', padding: '10px 12px', borderRadius: 9, background: '#F8F9FB', border: `1px solid ${BORDER}`, fontSize: 12, color: GRAY1, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                    {transcription}
                  </div>
                )}

                {/* Apply BANT button */}
                <button onClick={applyBant} disabled={applied} style={{ width: '100%', padding: '10px', borderRadius: 9, border: 'none', background: applied ? `${GREEN}20` : GREEN, color: applied ? GREEN : WHITE, fontSize: 13, fontWeight: 800, cursor: applied ? 'default' : 'pointer', transition: 'all .15s' }}>
                  {applied ? '✓ BANT Aplicado' : 'Aplicar BANT ao Lead'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

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
  tcv: undefined, venda: 'NÃO', data_fup: null, tier: null, faturamento: null, cargo: null,
  urgencia: null, bant: undefined, data_entrada: null, data_ra: null, data_rr: null,
  data_assinatura: null, data_ativacao: null, anotacoes_pre_vendas: '', cadencia: null,
  contato_agendado: false, link_qualificacao: '', link_transcricao: '',
  link_site: '', link_instagram: '', link_biblioteca_anuncios: '', link_outros: '',
  historico_proximos_passos: [], historico_anotacoes_pre_vendas: [], custo_broker: null,
  motivo_perda_pre_vendas: null, motivo_perda_closer: null,
  link_gravacao: '', link_plano_roi: '', link_contrato: '',
}

function LeadPageInner() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const id = params.id as string
  const isNew = id === 'new'
  const fromView = searchParams.get('from') || 'leads'   // 'leads' or 'pipeline'
  const fromLabel = fromView === 'pipeline' ? 'Pipeline' : 'Leads'

  const { canEdit, isLoading: roleLoading } = useUserRole()

  const [pageLoading, setPageLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [activeTab, setActiveTab] = useState<'pre-vendas' | 'vendas'>('pre-vendas')
  const [novoPassoTexto, setNovoPassoTexto] = useState('')
  const [novaAnotacaoTexto, setNovaAnotacaoTexto] = useState('')
  const [form, setFormState] = useState<any>(initForm)
  const [nomeUsuario, setNomeUsuario] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      const { data: u } = await supabase.from('usuarios_permitidos').select('nome').eq('email', session.user.email).single()
      if (u?.nome) setNomeUsuario(u.nome)
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
    toast.success(isNew ? 'Lead criado com sucesso!' : 'Lead salvo com sucesso!')
    setTimeout(() => router.push(fromView === 'pipeline' ? '/pipeline' : '/'), 900)
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
    <div style={{ height: '100vh', display: 'flex', overflow: 'hidden', fontFamily: 'var(--font-jakarta, sans-serif)' }}>

      {/* ── Sidebar ── */}
      <Sidebar activeView={null} onNavigate={v => router.push(`/?view=${v}`)} />

      {/* ── Main content ── */}
      <div style={{ flex: 1, background: PANEL_BG, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* ── Breadcrumb bar ── */}
        <div style={{ background: WHITE, borderBottom: `1px solid ${BORDER}`, padding: '0 28px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, boxShadow: '0 1px 6px rgba(0,0,0,.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, minWidth: 0 }}>
            <button onClick={() => router.push('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: GRAY2, fontWeight: 600, fontSize: 13, padding: 0 }}>CRM</button>
            <ChevronRight size={13} color={GRAY3} />
            <button onClick={() => router.push(`/?view=${fromView}`)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: GRAY2, fontWeight: 600, fontSize: 13, padding: 0 }}>{fromLabel}</button>
            <ChevronRight size={13} color={GRAY3} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <div style={{ width: 22, height: 22, borderRadius: 6, background: 'linear-gradient(135deg, #E8001C, #B91C1C)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Building2 size={12} color={WHITE} />
              </div>
              <span style={{ fontWeight: 800, color: GRAY1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 260 }}>
                {isNew ? 'Novo Lead' : (form.empresa || 'Editar Lead')}
              </span>
              <div style={{ display: 'flex', gap: 4 }}>
                {form.origem && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#EFF6FF', color: '#3B82F6' }}>{form.origem}</span>}
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
            <input style={{ ...inputStyle, borderColor: errors.telefone ? R : BORDER }} value={form.telefone || ''} onChange={e => set('telefone', formatPhone(e.target.value))} placeholder="(43) 99999-9999" />
          </InfoField>

          <InfoField label="E-mail do Lead" error={errors.email}>
            <input type="email" style={{ ...inputStyle, borderColor: errors.email ? R : BORDER }} value={form.email || ''} onChange={e => set('email', e.target.value)} placeholder="email@exemplo.com" />
          </InfoField>

          {form.origem === 'Recomendação' && (
            <InfoField label="Quem Recomendou">
              <input style={inputStyle} value={form.recomendacoes || ''} onChange={e => set('recomendacoes', e.target.value)} placeholder="Nome de quem indicou" />
            </InfoField>
          )}

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
          <div style={{ flex: 1, overflowY: 'auto', padding: '22px 24px', pointerEvents: !canEdit ? 'none' : undefined }}>

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

                <AudioAnalysis
                  onApplyBant={(bant) => {
                    setFormState((f: any) => ({
                      ...f,
                      bant_budget: bant.budget,
                      bant_authority: bant.authority,
                      bant_need: bant.need,
                      bant_timing: bant.timing,
                      bant: [bant.budget, bant.authority, bant.need, bant.timing].filter(Boolean).length,
                    }))
                  }}
                />

                <div>
                  <SectionTitle>Link da Qualificação</SectionTitle>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input style={{ ...inputStyle, flex: 1 }} value={form.link_qualificacao || ''} onChange={e => set('link_qualificacao', e.target.value)} placeholder="https://..." />
                    {form.link_qualificacao && (
                      <button type="button" onClick={() => window.open(form.link_qualificacao, '_blank')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 14px', borderRadius: 8, border: `1px solid ${BORDER}`, background: WHITE, cursor: 'pointer', color: '#3B82F6', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0, pointerEvents: 'auto' }}>
                        <ExternalLink size={13} />Abrir
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <SectionTitle>Links do Lead</SectionTitle>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {([
                      { key: 'link_site', label: 'Site', placeholder: 'https://site.com.br' },
                      { key: 'link_instagram', label: 'Instagram', placeholder: 'https://instagram.com/...' },
                      { key: 'link_biblioteca_anuncios', label: 'Biblioteca de Anúncios', placeholder: 'https://facebook.com/ads/library/...' },
                      { key: 'link_outros', label: 'Outros', placeholder: 'https://...' },
                    ] as { key: string; label: string; placeholder: string }[]).map(({ key, label, placeholder }) => (
                      <div key={key}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: GRAY2, marginBottom: 5 }}>{label}</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input style={{ ...inputStyle, flex: 1 }} value={form[key] || ''} onChange={e => set(key, e.target.value)} placeholder={placeholder} />
                          {form[key] && (
                            <button type="button" onClick={() => window.open(form[key], '_blank')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 14px', borderRadius: 8, border: `1px solid ${BORDER}`, background: WHITE, cursor: 'pointer', color: '#3B82F6', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0, pointerEvents: 'auto' }}>
                              <ExternalLink size={13} />Abrir
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
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
                  {Array.isArray(form.historico_anotacoes_pre_vendas) && form.historico_anotacoes_pre_vendas.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {form.historico_anotacoes_pre_vendas.map((entry: any, i: number) => {
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
                  {form.situacao_closer === 'PERDIDO CLOSER' && (
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
                      <button type="button" onClick={() => window.open(form.link_transcricao, '_blank')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 14px', borderRadius: 8, border: `1px solid ${BORDER}`, background: WHITE, cursor: 'pointer', color: '#3B82F6', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0, pointerEvents: 'auto' }}>
                        <ExternalLink size={13} />Abrir
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <SectionTitle>Link da Gravação da Reunião</SectionTitle>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input style={{ ...inputStyle, flex: 1 }} value={form.link_gravacao || ''} onChange={e => set('link_gravacao', e.target.value)} placeholder="https://..." />
                    {form.link_gravacao && (
                      <button type="button" onClick={() => window.open(form.link_gravacao, '_blank')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 14px', borderRadius: 8, border: `1px solid ${BORDER}`, background: WHITE, cursor: 'pointer', color: '#3B82F6', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0, pointerEvents: 'auto' }}>
                        <ExternalLink size={13} />Abrir
                      </button>
                    )}
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
                  <SectionTitle>Link do Plano de ROI</SectionTitle>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input style={{ ...inputStyle, flex: 1 }} value={form.link_plano_roi || ''} onChange={e => set('link_plano_roi', e.target.value)} placeholder="https://..." />
                    {form.link_plano_roi && (
                      <button type="button" onClick={() => window.open(form.link_plano_roi, '_blank')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 14px', borderRadius: 8, border: `1px solid ${BORDER}`, background: WHITE, cursor: 'pointer', color: '#3B82F6', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0, pointerEvents: 'auto' }}>
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
