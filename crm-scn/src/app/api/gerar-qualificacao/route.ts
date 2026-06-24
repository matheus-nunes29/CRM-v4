import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@supabase/supabase-js'
import { PROMPT_HEADER, DEFAULT_INSTRUCTIONS } from '@/lib/qualificacao-prompt'

export const maxDuration = 120

const GROQ_MAX = 25 * 1024 * 1024 // 25 MB — Groq hard limit

async function getActiveInstructions(): Promise<string> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data } = await supabase
      .from('configuracoes_sistema')
      .select('valor')
      .eq('chave', 'instrucoes_qualificacao')
      .single()
    if (data?.valor) return data.valor
  } catch { /* fallback to default */ }
  return DEFAULT_INSTRUCTIONS
}

async function transcreverComGroq(blob: Blob, filename: string): Promise<string> {
  const groqKey = process.env.GROQ_API_KEY
  if (!groqKey) throw new Error('GROQ_API_KEY não configurada')

  const form = new FormData()
  form.append('file', blob, filename)
  form.append('model', 'whisper-large-v3-turbo')
  form.append('language', 'pt')
  form.append('response_format', 'text')

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${groqKey}` },
    body: form,
  })

  if (!res.ok) throw new Error('Groq Whisper error: ' + await res.text())
  return (await res.text()).trim()
}

async function formatarComInterlocutores(texto: string, groqKey: string): Promise<string> {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{
          role: 'user',
          content: `Formate a transcrição abaixo identificando os dois interlocutores: o SDR (pré-vendedor da V4 Company — faz perguntas de qualificação, fala sobre investimento em marketing, resultados) e o Lead (empresário prospectado — fala sobre seu negócio, dores, orçamento).

Use EXATAMENTE este formato, uma fala por linha:
SDR: [fala completa]
Lead: [fala completa]

Regras:
- Preserve as falas na íntegra, sem resumir
- Se houver terceira pessoa, use o nome ou "Outro:"
- Não adicione comentários ou texto fora do formato acima

Transcrição:
${texto}`,
        }],
        temperature: 0.1,
        max_tokens: 8192,
      }),
    })
    if (!res.ok) return texto
    const data = await res.json()
    return data.choices[0]?.message?.content?.trim() || texto
  } catch {
    return texto
  }
}

async function transcreverComGemini(blob: Blob, mimeType: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY!

  const startRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(blob.size),
        'X-Goog-Upload-Header-Content-Type': mimeType,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file: { display_name: 'audio' } }),
    }
  )
  if (!startRes.ok) {
    const errBody = await startRes.text()
    if (errBody.includes('RESOURCE_EXHAUSTED') || errBody.includes('credits are depleted')) {
      throw new Error(`Arquivo muito grande para o Groq (${(blob.size / 1024 / 1024).toFixed(1)} MB > 25 MB) e os créditos do Gemini estão esgotados. Comprima o áudio para menos de 25 MB e tente novamente.`)
    }
    throw new Error('Gemini Files upload start failed: ' + errBody)
  }

  const uploadUrl = startRes.headers.get('X-Goog-Upload-URL')
  if (!uploadUrl) throw new Error('Gemini não retornou URL de upload')

  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(blob.size),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: blob,
  })
  if (!uploadRes.ok) throw new Error('Gemini Files upload data failed: ' + await uploadRes.text())

  const fileInfo = await uploadRes.json()
  const fileUri = fileInfo.file?.uri
  if (!fileUri) throw new Error('Gemini não retornou URI do arquivo')

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const result = await model.generateContent({
    contents: [{
      role: 'user',
      parts: [
        { fileData: { mimeType, fileUri } },
        { text: 'Transcreva este áudio na íntegra em português. Retorne apenas o texto transcrito, sem comentários, sem timestamps, sem formatação.' },
      ],
    }],
  })

  return result.response.text().trim()
}

export async function GET() {
  const instructions = await getActiveInstructions()
  return NextResponse.json({ instructions })
}

export async function POST(req: NextRequest) {
  try {
    const { audioUrl, transcricao } = await req.json()

    if (!audioUrl && !transcricao) {
      return NextResponse.json({ error: 'Forneça audioUrl ou transcricao' }, { status: 400 })
    }

    let texto: string

    if (audioUrl) {
      const audioRes = await fetch(audioUrl)
      if (!audioRes.ok) throw new Error('Falha ao buscar áudio')
      const blob = await audioRes.blob()

      const filename = decodeURIComponent(audioUrl.split('/').pop() || 'audio.mp3')
      const mimeType = blob.type || 'audio/mpeg'

      if (blob.size <= GROQ_MAX) {
        texto = await transcreverComGroq(blob, filename)
      } else {
        if (!process.env.GEMINI_API_KEY) {
          throw new Error(`Arquivo muito grande (${(blob.size / 1024 / 1024).toFixed(1)} MB). O limite é 25 MB. Comprima o áudio e tente novamente.`)
        }
        texto = await transcreverComGemini(blob, mimeType)
      }
    } else {
      texto = transcricao
    }

    const instructions = await getActiveInstructions()
    const fullPrompt = PROMPT_HEADER + '\n\n' + instructions

    const groqKey = process.env.GROQ_API_KEY
    if (!groqKey) throw new Error('GROQ_API_KEY não configurada')

    // Análise BANT/SPICED e formatação de interlocutores rodam em paralelo
    const [analysisRes, transcricaoFormatada] = await Promise.all([
      fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: `Transcrição da ligação de qualificação:\n\n${texto}\n\n${fullPrompt}` }],
          temperature: 0.1,
        }),
      }),
      formatarComInterlocutores(texto, groqKey),
    ])

    if (!analysisRes.ok) throw new Error('Groq analysis error: ' + await analysisRes.text())
    const analysisData = await analysisRes.json()
    const text = analysisData.choices[0].message.content.trim()

    const jsonStr = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
    const data = JSON.parse(jsonStr)

    return NextResponse.json({ ...data, _transcricao: transcricaoFormatada })
  } catch (e: any) {
    console.error('gerar-qualificacao error:', e)
    return NextResponse.json({ error: e.message || 'Erro interno' }, { status: 500 })
  }
}
