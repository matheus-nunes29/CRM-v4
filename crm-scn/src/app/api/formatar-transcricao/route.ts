import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

export const maxDuration = 60

const PROMPT = (transcricao: string) => `Formate a transcrição abaixo identificando os interlocutores: o SDR (pré-vendedor da V4 Company — faz perguntas de qualificação, fala sobre marketing, resultados e investimento) e o Lead (empresário prospectado — fala sobre seu negócio, dores, orçamento).

Use EXATAMENTE este formato, uma fala por linha:
SDR: [fala completa]
Lead: [fala completa]

Regras:
- Preserve as falas na íntegra, sem resumir nem cortar
- Se houver terceira pessoa, use o nome ou "Outro:"
- Não adicione explicações, comentários ou texto fora do formato acima

Transcrição:
${transcricao}`

export async function POST(req: NextRequest) {
  try {
    const { transcricao } = await req.json()
    if (!transcricao) return NextResponse.json({ error: 'transcricao obrigatória' }, { status: 400 })

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY não configurada' }, { status: 500 })

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
    const result = await model.generateContent(PROMPT(transcricao))
    const formatada = result.response.text().trim()

    return NextResponse.json({ transcricao: formatada || transcricao })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
