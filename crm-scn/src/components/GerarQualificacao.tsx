'use client'
import React, { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { R, WHITE, GRAY1, GRAY2, GRAY3, GRAY4, GRAY5, GREEN, BLUE, PURPLE } from '@/lib/crm-constants'

interface QualificacaoData {
  dadosBasicos: { nomeLead: string; cargo: string; empresa: string; segmento: string; tamanho: string }
  links: { site: string; instagram: string; bibAnunciosMeta: string; bibAnunciosGoogle: string }
  bant: { budget: string; authority: string; need: string; timing: string }
  spiced: { situation: string; pain: string; impact: string; criticalEvent: string; decision: string }
  insights: { termometro: string; gatilhoDeOuro: string; sugestaoAbordagem: string }
  informacoesExtras: { nicho: string; historico: string; pontoRapport: string; produtos: string; regiao: string; tempoAtiva: string; nivelConsciencia: string; importanciaMarketing: string; objecoes: string[] }
  personalidade: string[]
}

function gerarHTMLPDF(d: QualificacaoData): string {
  const secTitle = (t: string) => `<div style="font-size:10px;font-weight:900;color:#E8001C;text-transform:uppercase;letter-spacing:0.15em;border-bottom:2px solid #E8001C;padding-bottom:4px;margin:20px 0 12px;">${t}</div>`
  const item = (label: string, val: string) => val ? `<div style="margin-bottom:10px;"><div style="font-size:9px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:3px;">${label}</div><div style="font-size:12px;color:#111827;line-height:1.6;">${val}</div></div>` : ''
  const bantLabel: Record<string, string> = { budget: 'Budget (Orçamento)', authority: 'Authority (Autoridade)', need: 'Need (Necessidade)', timing: 'Timeline (Prazo)' }
  const spicedLabel: Record<string, string> = { situation: 'Situation (Situação)', pain: 'Pain (Dor)', impact: 'Impact (Impacto)', criticalEvent: 'Critical Event (Evento Crítico)', decision: 'Decision (Decisão)' }

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>Qualificação — ${d.dadosBasicos.empresa || 'Lead'}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color:#111827; background:#fff; padding:40px; }
  .header { background:#E8001C; color:white; padding:14px 24px; margin:-40px -40px 28px; display:flex; justify-content:space-between; align-items:center; }
  .header-title { font-size:18px; font-weight:900; letter-spacing:0.12em; }
  .header-sub { font-size:11px; opacity:0.85; }
  .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:0 32px; }
  .tag { display:inline-block; background:#FEE2E2; color:#E8001C; border:1px solid #FECACA; border-radius:20px; padding:3px 10px; font-size:10px; font-weight:700; margin:3px 3px 0 0; }
  .footer { margin-top:40px; background:#E8001C; color:white; text-align:center; padding:10px; font-size:10px; font-weight:900; letter-spacing:0.18em; }
  @media print {
    body { padding:30px; }
    .header { margin:-30px -30px 24px; }
    @page { margin:15mm; }
  }
</style>
</head>
<body>
<div class="header">
  <div class="header-title">QUALIFICAÇÃO DE LEAD</div>
  <div class="header-sub">${d.dadosBasicos.empresa || ''} · Gerado por CRM V4</div>
</div>

${secTitle('1. Dados Básicos')}
<div class="grid2">
  ${item('Nome do Lead', d.dadosBasicos.nomeLead)}
  ${item('Cargo', d.dadosBasicos.cargo)}
  ${item('Empresa', d.dadosBasicos.empresa)}
  ${item('Segmento / Nicho', d.dadosBasicos.segmento)}
  ${item('Tamanho da Empresa', d.dadosBasicos.tamanho)}
</div>

${(d.links?.site || d.links?.instagram || d.links?.bibAnunciosMeta) ? `
${secTitle('Links Úteis')}
<div class="grid2">
  ${item('Site', d.links.site ? `<a href="${d.links.site}" style="color:#3B82F6;">${d.links.site}</a>` : '')}
  ${item('Instagram', d.links.instagram ? `<a href="${d.links.instagram}" style="color:#E1306C;">${d.links.instagram}</a>` : '')}
  ${item('Bib. Anúncios Meta', d.links.bibAnunciosMeta)}
  ${item('Bib. Anúncios Google', d.links.bibAnunciosGoogle)}
</div>` : ''}

${secTitle('2. Metodologia BANT (Qualificação)')}
${Object.entries(d.bant).map(([k, v]) => item(bantLabel[k] || k, v)).join('')}

${secTitle('3. Metodologia SPICED (Contexto e Urgência)')}
${Object.entries(d.spiced).map(([k, v]) => item(spicedLabel[k] || k, v)).join('')}

${secTitle('4. Insights para o Closer (A Cereja do Bolo)')}
${item('Termômetro do Lead', d.insights.termometro)}
${item('Gatilho de Ouro', d.insights.gatilhoDeOuro)}
${item('Sugestão de Abordagem', d.insights.sugestaoAbordagem)}

${secTitle('Informações Extras')}
<div class="grid2">
  ${item('Qual nicho da empresa?', d.informacoesExtras.nicho)}
  ${item('Região / Estado / Cidade', d.informacoesExtras.regiao)}
  ${item('Resumo da história do negócio', d.informacoesExtras.historico)}
  ${item('Produtos / Serviços', d.informacoesExtras.produtos)}
  ${item('Quanto tempo está ativa?', d.informacoesExtras.tempoAtiva)}
  ${item('Ponto de rapport', d.informacoesExtras.pontoRapport)}
  ${item('Nível de consciência do lead', d.informacoesExtras.nivelConsciencia)}
  ${item('Importância do marketing e vendas', d.informacoesExtras.importanciaMarketing)}
</div>
${d.informacoesExtras.objecoes?.length ? `
${item('Prováveis objeções', '')}
<ul style="margin:4px 0 0 18px;">
  ${d.informacoesExtras.objecoes.map(o => `<li style="font-size:12px;color:#111827;line-height:1.6;margin-bottom:4px;font-style:italic;">"${o}"</li>`).join('')}
</ul>` : ''}

${d.personalidade?.length ? `
${secTitle('Personalidade do Lead')}
<div>${d.personalidade.map(p => `<span class="tag">${p}</span>`).join('')}</div>` : ''}

<div class="footer">QUALIFICAÇÃO DE LEAD · V4 COMPANY</div>
</body>
</html>`
}

interface Props {
  leadId: string
  empresa?: string
  onSaved?: (data: QualificacaoData) => void
}

export default function GerarQualificacao({ leadId, empresa, onSaved }: Props) {
  const [modo, setModo] = useState<'audio' | 'texto'>('audio')
  const [file, setFile] = useState<File | null>(null)
  const [transcricao, setTranscricao] = useState('')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState('')
  const [resultado, setResultado] = useState<QualificacaoData | null>(null)
  const [erro, setErro] = useState('')
  const [saved, setSaved] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function gerar() {
    setErro('')
    setResultado(null)
    setSaved(false)
    setLoading(true)

    try {
      let body: any

      if (modo === 'audio' && file) {
        setProgress('Transcrevendo áudio com Groq Whisper...')
        const ext = file.name.split('.').pop()
        const path = `${leadId}/${Date.now()}.${ext}`
        const { data: uploaded, error: uploadErr } = await supabase.storage
          .from('qualificacoes-audio')
          .upload(path, file, { contentType: file.type, upsert: false })
        if (uploadErr) throw new Error('Falha no upload: ' + uploadErr.message)

        const { data: { publicUrl } } = supabase.storage
          .from('qualificacoes-audio')
          .getPublicUrl(uploaded.path)

        body = { audioUrl: publicUrl }
        setProgress('Analisando com Gemini AI...')
      } else if (modo === 'texto' && transcricao.trim()) {
        setProgress('Analisando transcrição com Gemini AI...')
        body = { transcricao }
      } else {
        throw new Error(modo === 'audio' ? 'Selecione um arquivo de áudio' : 'Cole a transcrição')
      }

      const res = await fetch('/api/gerar-qualificacao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erro na API')

      setProgress('Salvando no lead...')
      const { error: saveErr } = await supabase
        .from('leads')
        .update({ qualificacao_ia: json })
        .eq('id', leadId)
      if (saveErr) console.error('Erro ao salvar qualificacao_ia:', saveErr)
      else setSaved(true)

      setResultado(json)
      onSaved?.(json)
    } catch (e: any) {
      setErro(e.message)
    } finally {
      setLoading(false)
      setProgress('')
    }
  }

  function baixarPDF() {
    if (!resultado) return
    const html = gerarHTMLPDF(resultado)
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.onload = () => {
      setTimeout(() => { win.focus(); win.print() }, 300)
    }
  }

  const inp = { padding: '9px 12px', background: GRAY4, border: `1px solid ${GRAY5}`, borderRadius: 8, color: GRAY1, fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const }
  const bantLabel: Record<string, string> = { budget: 'Budget', authority: 'Authority', need: 'Need', timing: 'Timeline' }
  const spicedLabel: Record<string, string> = { situation: 'Situation', pain: 'Pain', impact: 'Impact', criticalEvent: 'Critical Event', decision: 'Decision' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Tabs */}
      <div style={{ display: 'flex', background: GRAY4, borderRadius: 10, padding: 3, gap: 2 }}>
        {(['audio', 'texto'] as const).map(m => (
          <button key={m} onClick={() => setModo(m)}
            style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, transition: 'all .15s',
              background: modo === m ? WHITE : 'transparent', color: modo === m ? GRAY1 : GRAY3,
              boxShadow: modo === m ? '0 1px 4px rgba(0,0,0,.08)' : 'none' }}>
            {m === 'audio' ? '🎙️ Upload de Áudio' : '📝 Colar Transcrição'}
          </button>
        ))}
      </div>

      {/* Input */}
      {modo === 'audio' ? (
        <div>
          <input ref={fileRef} type="file" accept="audio/*" style={{ display: 'none' }}
            onChange={e => setFile(e.target.files?.[0] || null)} />
          <div onClick={() => fileRef.current?.click()}
            style={{ border: `2px dashed ${file ? GREEN : GRAY5}`, borderRadius: 10, padding: '20px 16px', textAlign: 'center', cursor: 'pointer', background: file ? `${GREEN}06` : GRAY4, transition: 'all .15s' }}
            onMouseEnter={e => { if (!file) (e.currentTarget as HTMLElement).style.borderColor = R }}
            onMouseLeave={e => { if (!file) (e.currentTarget as HTMLElement).style.borderColor = GRAY5 }}>
            {file ? (
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: GREEN }}>✓ {file.name}</div>
                <div style={{ fontSize: 11, color: GRAY3, marginTop: 3 }}>{(file.size / 1024 / 1024).toFixed(1)} MB</div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 22, marginBottom: 6 }}>🎙️</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: GRAY2 }}>Clique para selecionar o áudio</div>
                <div style={{ fontSize: 11, color: GRAY3, marginTop: 4 }}>MP3, M4A, WAV, OGG — até 50MB</div>
              </div>
            )}
          </div>
          {file && (
            <button onClick={() => setFile(null)}
              style={{ marginTop: 6, fontSize: 11, color: GRAY3, background: 'none', border: 'none', cursor: 'pointer' }}>
              × Remover arquivo
            </button>
          )}
        </div>
      ) : (
        <textarea
          value={transcricao}
          onChange={e => setTranscricao(e.target.value)}
          placeholder="Cole aqui a transcrição da ligação (Fireflies, Otter, etc.)..."
          rows={8}
          style={{ ...inp, resize: 'vertical', fontFamily: 'inherit', fontSize: 12, lineHeight: 1.6 }} />
      )}

      {erro && (
        <div style={{ padding: '10px 14px', background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 8, fontSize: 12, color: '#991B1B' }}>
          ⚠️ {erro}
        </div>
      )}

      <button onClick={gerar} disabled={loading || (modo === 'audio' ? !file : !transcricao.trim())}
        style={{ padding: '11px 0', borderRadius: 10, border: 'none', fontSize: 13, fontWeight: 800, cursor: loading || (modo === 'audio' ? !file : !transcricao.trim()) ? 'not-allowed' : 'pointer',
          background: loading || (modo === 'audio' ? !file : !transcricao.trim()) ? GRAY3 : R, color: WHITE, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        {loading ? (
          <>
            <div style={{ width: 14, height: 14, border: `2px solid ${WHITE}44`, borderTopColor: WHITE, borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
            {progress || 'Processando...'}
          </>
        ) : '✨ Gerar Qualificação com IA'}
      </button>

      {/* Resultado */}
      {resultado && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: GREEN }}>✓ Qualificação gerada!</div>
              {saved && <span style={{ fontSize: 10, fontWeight: 700, color: GREEN, background: `${GREEN}15`, padding: '2px 8px', borderRadius: 20 }}>salvo no lead</span>}
            </div>
            <button onClick={baixarPDF}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none', background: R, color: WHITE, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              📄 Baixar PDF
            </button>
          </div>

          {/* Preview */}
          {[
            { title: 'BANT', items: Object.entries(resultado.bant).map(([k,v]) => ({ l: bantLabel[k]||k, v })) },
            { title: 'SPICED', items: Object.entries(resultado.spiced).map(([k,v]) => ({ l: spicedLabel[k]||k, v })) },
            { title: 'Insights para o Closer', items: [
              { l: 'Termômetro', v: resultado.insights.termometro },
              { l: 'Gatilho de Ouro', v: resultado.insights.gatilhoDeOuro },
              { l: 'Sugestão de Abordagem', v: resultado.insights.sugestaoAbordagem },
            ]},
          ].map(sec => (
            <div key={sec.title} style={{ background: GRAY4, borderRadius: 10, padding: '14px 16px', border: `1px solid ${GRAY5}` }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: R, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 10 }}>{sec.title}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sec.items.filter(i => i.v).map(i => (
                  <div key={i.l}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: GRAY3, marginBottom: 2 }}>{i.l}</div>
                    <div style={{ fontSize: 12, color: GRAY1, lineHeight: 1.5 }}>{i.v}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {resultado.personalidade?.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {resultado.personalidade.map(p => (
                <span key={p} style={{ padding: '4px 12px', borderRadius: 20, background: `${R}12`, border: `1px solid ${R}30`, fontSize: 11, fontWeight: 700, color: R }}>{p}</span>
              ))}
            </div>
          )}

          {resultado.informacoesExtras?.objecoes?.length > 0 && (
            <div style={{ background: `${R}06`, borderRadius: 10, padding: '12px 14px', border: `1px solid ${R}20` }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: R, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 8 }}>Prováveis Objeções</div>
              {resultado.informacoesExtras.objecoes.map((o, i) => (
                <div key={i} style={{ fontSize: 12, color: GRAY1, lineHeight: 1.5, marginBottom: 4, fontStyle: 'italic' }}>"{o}"</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
