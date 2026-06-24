import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
// llama-3.3-70b-versatile: limite 12.000 tokens/min
// 22.000 chars ÷ 2 chars/token ≈ 11.000 tokens de transcrição + ~200 de prompt = 11.200 total → seguro
const MAX_CHARS = 22000

const PROMPT = (texto: string) =>
  `Formate a transcrição identificando os interlocutores: SDR (pré-vendedor da V4 Company) e Lead (empresário prospectado).

Formato EXATO, uma fala por linha:
SDR: [fala completa]
Lead: [fala completa]

Regras: preserve as falas na íntegra, sem comentários nem texto extra.

Transcrição:
${texto}`

export async function POST(req: NextRequest) {
  try {
    const { transcricao } = await req.json()
    if (!transcricao) return NextResponse.json({ error: 'transcricao obrigatória' }, { status: 400 })

    const groqKey = process.env.GROQ_API_KEY
    if (!groqKey) return NextResponse.json({ error: 'GROQ_API_KEY não configurada' }, { status: 500 })

    // Limita ao que cabe dentro do limite de tokens do modelo
    let toFormat = transcricao as string
    let remainder = ''

    if (toFormat.length > MAX_CHARS) {
      const slice = toFormat.slice(0, MAX_CHARS)
      const cut = Math.max(slice.lastIndexOf('\n'), slice.lastIndexOf('. '), slice.lastIndexOf('? '))
      const pos = cut > MAX_CHARS * 0.75 ? cut + 1 : MAX_CHARS
      remainder = toFormat.slice(pos).trim()
      toFormat = toFormat.slice(0, pos).trim()
    }

    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: PROMPT(toFormat) }],
        temperature: 0.1,
        max_tokens: 4096,
      }),
    })

    if (!res.ok) throw new Error(await res.text())
    const data = await res.json()
    const formatted: string = data.choices[0]?.message?.content?.trim() ?? toFormat

    const result = remainder
      ? `${formatted}\n\n---\n${remainder}`
      : formatted

    return NextResponse.json({ transcricao: result })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
