import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const { transcricao } = await req.json()
    if (!transcricao) return NextResponse.json({ error: 'transcricao obrigatória' }, { status: 400 })

    const groqKey = process.env.GROQ_API_KEY
    if (!groqKey) return NextResponse.json({ error: 'GROQ_API_KEY não configurada' }, { status: 500 })

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{
          role: 'user',
          content: `Formate a transcrição abaixo identificando os interlocutores: o SDR (pré-vendedor da V4 Company — faz perguntas de qualificação, fala sobre marketing, resultados e investimento) e o Lead (empresário prospectado — fala sobre seu negócio, dores, orçamento).

Use EXATAMENTE este formato, uma fala por linha:
SDR: [fala completa]
Lead: [fala completa]

Regras:
- Preserve as falas na íntegra, sem resumir nem cortar
- Se houver terceira pessoa, use o nome ou "Outro:"
- Não adicione explicações, comentários ou texto fora do formato acima

Transcrição:
${transcricao}`,
        }],
        temperature: 0.1,
        max_tokens: 8192,
      }),
    })

    if (!res.ok) throw new Error('Groq error: ' + await res.text())
    const data = await res.json()
    const formatada = data.choices[0]?.message?.content?.trim()

    return NextResponse.json({ transcricao: formatada || transcricao })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
