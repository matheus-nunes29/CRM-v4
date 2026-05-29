import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

export const maxDuration = 60

const PROMPT = `Você é um especialista em qualificação de leads comerciais da V4 Company.
Analise a transcrição desta ligação de qualificação e extraia as informações estruturadas.

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

async function transcreverComGroq(audioUrl: string): Promise<string> {
  const groqKey = process.env.GROQ_API_KEY
  if (!groqKey) throw new Error('GROQ_API_KEY não configurada')

  // Fetch audio from Supabase Storage
  const audioRes = await fetch(audioUrl)
  if (!audioRes.ok) throw new Error('Falha ao buscar áudio')
  const audioBlob = await audioRes.blob()

  // Send to Groq Whisper
  const form = new FormData()
  form.append('file', audioBlob, 'audio.mp3')
  form.append('model', 'whisper-large-v3-turbo')
  form.append('language', 'pt')
  form.append('response_format', 'text')

  const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${groqKey}` },
    body: form,
  })

  if (!groqRes.ok) {
    const err = await groqRes.text()
    throw new Error('Groq Whisper error: ' + err)
  }

  return (await groqRes.text()).trim()
}

export async function POST(req: NextRequest) {
  try {
    const { audioUrl, transcricao } = await req.json()

    if (!audioUrl && !transcricao) {
      return NextResponse.json({ error: 'Forneça audioUrl ou transcricao' }, { status: 400 })
    }

    // Step 1: Get transcription (Groq Whisper for audio, or use provided text)
    const texto = audioUrl ? await transcreverComGroq(audioUrl) : transcricao

    // Step 2: Analyze with Gemini
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

    const parts = [{ text: `Transcrição da ligação de qualificação:\n\n${texto}\n\n${PROMPT}` }]
    const result = await model.generateContent({ contents: [{ role: 'user', parts }] })
    const text = result.response.text().trim()

    const jsonStr = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
    const data = JSON.parse(jsonStr)

    return NextResponse.json({ ...data, _transcricao: texto })
  } catch (e: any) {
    console.error('gerar-qualificacao error:', e)
    return NextResponse.json({ error: e.message || 'Erro interno' }, { status: 500 })
  }
}
