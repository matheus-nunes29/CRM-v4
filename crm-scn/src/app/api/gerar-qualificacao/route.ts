import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

export const maxDuration = 60

const PROMPT = `Você é um especialista em qualificação de leads comerciais da V4 Company.
Analise o áudio/transcrição desta ligação de qualificação e extraia as informações estruturadas.

Retorne APENAS um JSON válido, sem markdown nem explicações, com exatamente este formato:

{
  "dadosBasicos": {
    "nomeLead": "",
    "cargo": "",
    "empresa": "",
    "segmento": "",
    "tamanho": ""
  },
  "links": {
    "site": "",
    "instagram": "",
    "bibAnunciosMeta": "",
    "bibAnunciosGoogle": ""
  },
  "bant": {
    "budget": "",
    "authority": "",
    "need": "",
    "timing": ""
  },
  "spiced": {
    "situation": "",
    "pain": "",
    "impact": "",
    "criticalEvent": "",
    "decision": ""
  },
  "insights": {
    "termometro": "",
    "gatilhoDeOuro": "",
    "sugestaoAbordagem": ""
  },
  "informacoesExtras": {
    "nicho": "",
    "historico": "",
    "pontoRapport": "",
    "produtos": "",
    "regiao": "",
    "tempoAtiva": "",
    "nivelConsciencia": "",
    "importanciaMarketing": "",
    "objecoes": []
  },
  "personalidade": []
}

Personalidade deve ser um array com os perfis identificados entre: "Executor", "Comunicador", "Analista", "Planejador".
Objeções deve ser um array de strings.
Use as palavras exatas do lead quando possível. Se uma informação não foi mencionada, deixe como string vazia ou array vazio.`

async function generateWithRetry(model: any, content: any, maxRetries = 3): Promise<any> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await model.generateContent(content)
    } catch (e: any) {
      const is503 = e.message?.includes('503') || e.message?.includes('Service Unavailable') || e.message?.includes('high demand')
      if (is503 && attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, 3000 * (attempt + 1)))
        continue
      }
      throw e
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const { audioUrl, transcricao } = await req.json()

    if (!audioUrl && !transcricao) {
      return NextResponse.json({ error: 'Forneça audioUrl ou transcricao' }, { status: 400 })
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

    let parts: any[]

    if (audioUrl) {
      const res = await fetch(audioUrl)
      if (!res.ok) throw new Error('Falha ao buscar áudio')
      const buffer = await res.arrayBuffer()
      const base64 = Buffer.from(buffer).toString('base64')
      const mimeType = res.headers.get('content-type') || 'audio/mpeg'
      parts = [
        { inlineData: { data: base64, mimeType } },
        { text: PROMPT },
      ]
    } else {
      parts = [{ text: `Transcrição da ligação de qualificação:\n\n${transcricao}\n\n${PROMPT}` }]
    }

    const result = await generateWithRetry(model, { contents: [{ role: 'user', parts }] })
    const text = result.response.text().trim()

    const jsonStr = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
    const data = JSON.parse(jsonStr)

    return NextResponse.json(data)
  } catch (e: any) {
    console.error('gerar-qualificacao error:', e)
    return NextResponse.json({ error: e.message || 'Erro interno' }, { status: 500 })
  }
}
