import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 120

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL = 'llama-3.1-8b-instant'
// ~25k chars por chunk ≈ 6-7k tokens, bem abaixo do limite de 12k
const CHUNK_CHARS = 25000

const PROMPT_BASE = `Formate a transcrição identificando os interlocutores: SDR (pré-vendedor da V4 Company — qualifica, pergunta sobre marketing, resultados e investimento) e Lead (empresário prospectado — fala do seu negócio, dores, orçamento).

Use EXATAMENTE este formato, uma fala por linha:
SDR: [fala completa]
Lead: [fala completa]

Regras:
- Preserve as falas na íntegra
- Se houver terceira pessoa use o nome ou "Outro:"
- Nenhum texto fora do formato acima`

async function formatarChunk(chunk: string, groqKey: string, lastSpeaker?: string): Promise<string> {
  const contexto = lastSpeaker
    ? `(Continuação — a última fala antes desta parte era do "${lastSpeaker}")\n\n`
    : ''

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: `${PROMPT_BASE}\n\n${contexto}Transcrição:\n${chunk}` }],
      temperature: 0.1,
      max_tokens: 8192,
    }),
  })

  if (!res.ok) throw new Error('Groq error: ' + await res.text())
  const data = await res.json()
  return data.choices[0]?.message?.content?.trim() ?? chunk
}

function splitChunks(texto: string): string[] {
  const chunks: string[] = []
  let rest = texto.trim()

  while (rest.length > 0) {
    if (rest.length <= CHUNK_CHARS) {
      chunks.push(rest)
      break
    }
    const slice = rest.slice(0, CHUNK_CHARS)
    // Corta no último ponto final / nova linha para não quebrar no meio de uma frase
    const cut = Math.max(
      slice.lastIndexOf('\n'),
      slice.lastIndexOf('. '),
      slice.lastIndexOf('? '),
      slice.lastIndexOf('! '),
    )
    const pos = cut > CHUNK_CHARS * 0.6 ? cut + 1 : CHUNK_CHARS
    chunks.push(rest.slice(0, pos).trim())
    rest = rest.slice(pos).trim()
  }

  return chunks
}

function lastSpeakerOf(formatted: string): string | undefined {
  const lines = formatted.split('\n').filter(l => /^[^:]{1,40}:\s/.test(l))
  const last = lines[lines.length - 1]
  return last?.match(/^([^:]+):/)?.[1].trim()
}

export async function POST(req: NextRequest) {
  try {
    const { transcricao } = await req.json()
    if (!transcricao) return NextResponse.json({ error: 'transcricao obrigatória' }, { status: 400 })

    const groqKey = process.env.GROQ_API_KEY
    if (!groqKey) return NextResponse.json({ error: 'GROQ_API_KEY não configurada' }, { status: 500 })

    const chunks = splitChunks(transcricao)
    const results: string[] = []
    let lastSpeaker: string | undefined

    for (let i = 0; i < chunks.length; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, 600)) // evita burst de TPM
      const formatted = await formatarChunk(chunks[i], groqKey, lastSpeaker)
      results.push(formatted)
      lastSpeaker = lastSpeakerOf(formatted)
    }

    return NextResponse.json({ transcricao: results.join('\n') })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
