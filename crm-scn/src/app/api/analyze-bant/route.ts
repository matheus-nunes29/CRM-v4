import { NextRequest, NextResponse } from 'next/server'

const SYSTEM_PROMPT = `Você é um analista especialista em vendas consultivas B2B.
Sua tarefa é analisar a transcrição de uma ligação de pré-vendas e extrair informações de qualificação BANT.

CRITÉRIOS BANT:
- Budget: O lead demonstrou ter orçamento disponível ou capacidade financeira para investir? Mencionou valores, faturamento, disponibilidade de budget?
- Authority: O contato é o decisor ou tem influência direta na decisão? É sócio, diretor, gestor com autonomia?
- Need: Existe uma necessidade ou dor clara identificada? O lead reconhece um problema que a solução resolve?
- Timing: Existe urgência ou um prazo definido? O lead quer resolver isso em breve ou tem um projeto em andamento?

Responda APENAS em JSON válido, sem markdown, sem explicações fora do JSON.`

const USER_PROMPT_TEMPLATE = (transcription: string, customPrompt?: string) => `
Analise esta transcrição de ligação de pré-vendas:

---
${transcription}
---

${customPrompt ? `Critérios adicionais de avaliação:\n${customPrompt}\n\n` : ''}

Responda no formato JSON abaixo (sem markdown):
{
  "bant": {
    "budget": true ou false,
    "authority": true ou false,
    "need": true ou false,
    "timing": true ou false
  },
  "score": número de 0 a 4 (soma dos true),
  "justificativas": {
    "budget": "frase curta explicando por que sim ou não",
    "authority": "frase curta explicando por que sim ou não",
    "need": "frase curta explicando por que sim ou não",
    "timing": "frase curta explicando por que sim ou não"
  },
  "resumo": "2-3 frases resumindo os pontos principais da ligação e o perfil do lead",
  "pontos_atencao": ["ponto 1", "ponto 2"],
  "recomendacao": "próximo passo recomendado para o SDR"
}
`

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY não configurada no servidor.' }, { status: 500 })
    }

    const body = await req.json()
    const { transcription, customPrompt } = body as { transcription: string; customPrompt?: string }

    if (!transcription?.trim()) {
      return NextResponse.json({ error: 'Transcrição vazia.' }, { status: 400 })
    }

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: USER_PROMPT_TEMPLATE(transcription, customPrompt) }],
      }),
    })

    if (!claudeRes.ok) {
      const err = await claudeRes.text()
      console.error('Claude error:', err)
      return NextResponse.json({ error: 'Erro ao analisar BANT: ' + err }, { status: 502 })
    }

    const claudeData = await claudeRes.json()
    const rawText = claudeData.content?.[0]?.text || ''

    let analysis
    try {
      analysis = JSON.parse(rawText)
    } catch {
      // Try to extract JSON from the response if wrapped in something
      const match = rawText.match(/\{[\s\S]*\}/)
      if (match) {
        analysis = JSON.parse(match[0])
      } else {
        throw new Error('Resposta da IA não é JSON válido: ' + rawText)
      }
    }

    return NextResponse.json({ analysis })
  } catch (e: any) {
    console.error('Analyze-bant route error:', e)
    return NextResponse.json({ error: e?.message || 'Erro interno.' }, { status: 500 })
  }
}
