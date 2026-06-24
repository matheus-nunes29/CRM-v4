'use client'
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { X, Search, ChevronUp, ChevronDown, FileText, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const R = '#E8001C'
const GRAY1 = '#1A1A1A'
const GRAY2 = '#6B7280'
const GRAY3 = '#9CA3AF'
const WHITE = '#FFFFFF'

type Turn = { speaker: string; text: string; isRight: boolean }

function escapeRegex(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

function parseTurns(raw: string): { turns: Turn[]; hasSpeakers: boolean } {
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean)
  const speakerLines = lines.filter(l => /^[^:]{1,40}:\s+\S/.test(l))
  const hasSpeakers = speakerLines.length > lines.length * 0.35

  if (!hasSpeakers) {
    const paras = raw.split(/\n{2,}/).filter(p => p.trim())
    const blocks = paras.length > 1 ? paras : raw.split('\n').filter(l => l.trim())
    return {
      turns: blocks.length > 0
        ? blocks.map(t => ({ speaker: '', text: t.trim(), isRight: false }))
        : [{ speaker: '', text: raw.trim(), isRight: false }],
      hasSpeakers: false,
    }
  }

  const speakers: string[] = []
  const turns: Turn[] = []
  for (const line of lines) {
    const m = line.match(/^([^:]{1,40}):\s+(.+)$/)
    if (m) {
      const speaker = m[1].trim()
      const text = m[2].trim()
      if (!speakers.includes(speaker)) speakers.push(speaker)
      turns.push({ speaker, text, isRight: speakers.indexOf(speaker) === 0 })
    } else if (turns.length > 0) {
      turns[turns.length - 1].text += ' ' + line
    }
  }
  return { turns, hasSpeakers: true }
}

function buildHighlighted(text: string, query: string, globalStart: number, activeIdx: number): React.ReactNode {
  if (!query) return text
  const regex = new RegExp(escapeRegex(query), 'gi')
  const parts: React.ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  let i = globalStart

  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const isActive = i === activeIdx
    parts.push(
      <mark key={i} data-match-idx={i} style={{
        background: isActive ? '#FCD34D' : '#FEF9C3',
        color: '#713F12',
        borderRadius: 2,
        padding: '0 2px',
        outline: isActive ? '2px solid #F59E0B' : 'none',
      }}>
        {m[0]}
      </mark>
    )
    i++
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}

const SPEAKER_PALETTES = [
  { bg: '#FEF2F2', border: '#FECACA', nameColor: R },
  { bg: '#EFF6FF', border: '#BFDBFE', nameColor: '#1D4ED8' },
  { bg: '#F0FDF4', border: '#BBF7D0', nameColor: '#15803D' },
  { bg: '#FAFAF9', border: '#E7E5E4', nameColor: GRAY2 },
]

interface Props {
  transcricao: string
  empresa?: string
  leadId?: string
  qualificacaoData?: Record<string, unknown>
  onTranscricaoFormatada?: (formatada: string) => void
  onClose: () => void
}

export default function TranscricaoModal({ transcricao, empresa, leadId, qualificacaoData, onTranscricaoFormatada, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const [rawText, setRawText] = useState(transcricao)
  const [autoFormatting, setAutoFormatting] = useState(false)
  const [formatErr, setFormatErr] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const didAutoFormat = useRef(false)

  const { turns, hasSpeakers } = useMemo(() => parseTurns(rawText), [rawText])

  // Auto-formata na primeira abertura se não tiver interlocutores
  useEffect(() => {
    const { hasSpeakers: hs } = parseTurns(rawText)
    if (hs || didAutoFormat.current) return
    didAutoFormat.current = true

    async function autoFormat() {
      setAutoFormatting(true)
      setFormatErr('')
      try {
        const res = await fetch('/api/formatar-transcricao', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcricao: rawText }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Erro na API')
        const formatada: string = json.transcricao
        setRawText(formatada)
        onTranscricaoFormatada?.(formatada)
        if (leadId && qualificacaoData) {
          await supabase
            .from('leads')
            .update({ qualificacao_ia: { ...qualificacaoData, _transcricao: formatada } })
            .eq('id', leadId)
        }
      } catch (e: any) {
        setFormatErr(e.message)
      } finally {
        setAutoFormatting(false)
      }
    }
    autoFormat()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const matchCount = useMemo(() => {
    if (!query) return 0
    const regex = new RegExp(escapeRegex(query), 'gi')
    return turns.reduce((acc, t) => acc + (t.text.match(regex)?.length ?? 0), 0)
  }, [query, turns])

  const turnStarts = useMemo(() => {
    if (!query) return turns.map(() => 0)
    const regex = new RegExp(escapeRegex(query), 'gi')
    let acc = 0
    return turns.map(t => {
      const s = acc
      acc += t.text.match(regex)?.length ?? 0
      return s
    })
  }, [query, turns])

  useEffect(() => { setActiveIdx(0) }, [query])

  useEffect(() => {
    if (!query || matchCount === 0) return
    const el = containerRef.current?.querySelector(`[data-match-idx="${activeIdx}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [activeIdx, query, matchCount])

  const nav = useCallback((dir: 1 | -1) => {
    if (matchCount < 2) return
    setActiveIdx(prev => (prev + dir + matchCount) % matchCount)
  }, [matchCount])

  const speakerColors = useMemo(() => {
    if (!hasSpeakers) return {}
    const seen: string[] = []
    turns.forEach(t => { if (!seen.includes(t.speaker)) seen.push(t.speaker) })
    const map: Record<string, typeof SPEAKER_PALETTES[0]> = {}
    seen.forEach((s, i) => { map[s] = SPEAKER_PALETTES[i % SPEAKER_PALETTES.length] })
    return map
  }, [turns, hasSpeakers])

  const wordCount = rawText.split(/\s+/).filter(Boolean).length

  const uniqueSpeakers = useMemo(() => {
    if (!hasSpeakers) return []
    const seen: string[] = []
    turns.forEach(t => { if (!seen.includes(t.speaker)) seen.push(t.speaker) })
    return seen
  }, [turns, hasSpeakers])

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <style>{`@keyframes modal-spin { to { transform: rotate(360deg); } }`}</style>
      <div onClick={e => e.stopPropagation()} style={{ background: '#F8FAFC', borderRadius: 18, width: '100%', maxWidth: 720, height: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,.35)', overflow: 'hidden' }}>

        {/* ── Header ── */}
        <div style={{ padding: '16px 20px', background: GRAY1, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <FileText size={16} color={WHITE} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: WHITE, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Transcrição da Chamada</div>
            {empresa && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{empresa}</div>}
          </div>
          {hasSpeakers && (
            <div style={{ display: 'flex', gap: 6, marginRight: 8 }}>
              {uniqueSpeakers.map(s => (
                <span key={s} style={{ fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 20, background: speakerColors[s]?.bg, color: speakerColors[s]?.nameColor, border: `1px solid ${speakerColors[s]?.border}` }}>
                  {s}
                </span>
              ))}
            </div>
          )}
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,.12)', border: 'none', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: WHITE, flexShrink: 0 }}>
            <X size={14} />
          </button>
        </div>

        {/* ── Search bar ── */}
        <div style={{ padding: '10px 16px', background: WHITE, borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <Search size={14} color={GRAY3} style={{ flexShrink: 0 }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') nav(e.shiftKey ? -1 : 1) }}
            placeholder="Buscar termos ou palavras-chave na transcrição..."
            autoFocus
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13, color: GRAY1, background: 'transparent', fontFamily: 'inherit' }}
          />
          {query && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: matchCount > 0 ? GRAY2 : R, minWidth: 64, textAlign: 'right' }}>
                {matchCount > 0 ? `${activeIdx + 1} / ${matchCount}` : '0 resultados'}
              </span>
              <button onClick={() => nav(-1)} disabled={matchCount < 2} style={{ background: 'none', border: 'none', cursor: matchCount >= 2 ? 'pointer' : 'default', padding: '2px 3px', display: 'flex', opacity: matchCount >= 2 ? 1 : 0.3 }}>
                <ChevronUp size={15} color={GRAY2} />
              </button>
              <button onClick={() => nav(1)} disabled={matchCount < 2} style={{ background: 'none', border: 'none', cursor: matchCount >= 2 ? 'pointer' : 'default', padding: '2px 3px', display: 'flex', opacity: matchCount >= 2 ? 1 : 0.3 }}>
                <ChevronDown size={15} color={GRAY2} />
              </button>
              <button onClick={() => setQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', display: 'flex' }}>
                <X size={13} color={GRAY3} />
              </button>
            </div>
          )}
        </div>

        {/* ── Transcript / loading overlay ── */}
        {autoFormatting ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, background: '#F8FAFC' }}>
            <Loader2 size={28} color={R} style={{ animation: 'modal-spin .8s linear infinite' }} />
            <div style={{ fontSize: 13, fontWeight: 600, color: GRAY2 }}>Identificando interlocutores...</div>
            <div style={{ fontSize: 11, color: GRAY3 }}>A IA está separando SDR e Lead na transcrição</div>
          </div>
        ) : (
          <div ref={containerRef} style={{ flex: 1, overflowY: 'auto', padding: hasSpeakers ? '20px 24px' : '20px', display: 'flex', flexDirection: 'column', gap: hasSpeakers ? 14 : 0 }}>

            {formatErr && (
              <div style={{ marginBottom: 12, padding: '10px 14px', background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 10, fontSize: 12, color: '#991B1B' }}>
                ⚠️ Não foi possível identificar os interlocutores automaticamente: {formatErr}
              </div>
            )}

            {hasSpeakers ? (
              turns.map((turn, i) => {
                const colors = speakerColors[turn.speaker] || SPEAKER_PALETTES[3]
                return (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: turn.isRight ? 'flex-end' : 'flex-start', gap: 4 }}>
                    <div style={{ fontSize: 9, fontWeight: 800, color: colors.nameColor, textTransform: 'uppercase', letterSpacing: '0.1em', paddingInline: 4 }}>
                      {turn.speaker}
                    </div>
                    <div style={{
                      maxWidth: '80%', padding: '10px 15px',
                      borderRadius: turn.isRight ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                      background: colors.bg, border: `1px solid ${colors.border}`,
                      fontSize: 13, color: GRAY1, lineHeight: 1.75,
                    }}>
                      {buildHighlighted(turn.text, query, turnStarts[i], activeIdx)}
                    </div>
                  </div>
                )
              })
            ) : (
              <div style={{ fontSize: 13, color: GRAY1, lineHeight: 1.85 }}>
                {turns.map((turn, i) => (
                  <p key={i} style={{ marginBottom: 14 }}>
                    {buildHighlighted(turn.text, query, turnStarts[i], activeIdx)}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Footer ── */}
        <div style={{ padding: '10px 20px', background: WHITE, borderTop: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: GRAY3 }}>
            {hasSpeakers ? `${turns.length} falas · ` : ''}{wordCount.toLocaleString('pt-BR')} palavras
          </span>
          {query ? (
            <span style={{ fontSize: 11, color: matchCount > 0 ? GRAY2 : R }}>
              {matchCount > 0 ? `${matchCount} ocorrência${matchCount !== 1 ? 's' : ''} de "${query}"` : `Nenhuma ocorrência de "${query}"`}
            </span>
          ) : (
            <span style={{ fontSize: 11, color: GRAY3 }}>Enter para navegar entre resultados</span>
          )}
        </div>
      </div>
    </div>
  )
}
