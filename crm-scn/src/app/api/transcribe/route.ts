import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'GROQ_API_KEY não configurada no servidor.' }, { status: 500 })
    }

    const formData = await req.formData()
    const file = formData.get('audio') as File | null

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo de áudio enviado.' }, { status: 400 })
    }

    // Max 25MB (Groq limit)
    if (file.size > 25 * 1024 * 1024) {
      return NextResponse.json({ error: 'Arquivo muito grande. Máximo: 25MB.' }, { status: 400 })
    }

    const groqForm = new FormData()
    groqForm.append('file', file)
    groqForm.append('model', 'whisper-large-v3-turbo')
    groqForm.append('language', 'pt')
    groqForm.append('response_format', 'text')

    const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: groqForm,
    })

    if (!groqRes.ok) {
      const err = await groqRes.text()
      console.error('Groq error:', err)
      return NextResponse.json({ error: 'Erro ao transcrever áudio: ' + err }, { status: 502 })
    }

    const transcription = await groqRes.text()
    return NextResponse.json({ transcription: transcription.trim() })
  } catch (e: any) {
    console.error('Transcribe route error:', e)
    return NextResponse.json({ error: e?.message || 'Erro interno.' }, { status: 500 })
  }
}
