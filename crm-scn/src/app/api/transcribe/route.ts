import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'GROQ_API_KEY não configurada no servidor.' }, { status: 500 })
    }

    const contentType = req.headers.get('content-type') || ''
    let fileBlob: Blob
    let fileName = 'audio.mp3'

    if (contentType.includes('application/json')) {
      // Receive URL, fetch audio server-side (bypasses Vercel 4.5MB body limit)
      const { audioUrl } = await req.json()
      if (!audioUrl) return NextResponse.json({ error: 'Forneça audioUrl.' }, { status: 400 })
      const fetched = await fetch(audioUrl)
      if (!fetched.ok) throw new Error('Falha ao buscar áudio da URL')
      fileBlob = await fetched.blob()
      const urlParts = audioUrl.split('/')
      fileName = urlParts[urlParts.length - 1] || 'audio.mp3'
    } else {
      // Legacy: FormData (only works for files ≤ 4.5MB)
      const formData = await req.formData()
      const file = formData.get('audio') as File | null
      if (!file) return NextResponse.json({ error: 'Nenhum arquivo de áudio enviado.' }, { status: 400 })
      fileBlob = file
      fileName = file.name
    }

    if (fileBlob.size > 25 * 1024 * 1024) {
      return NextResponse.json({ error: 'Arquivo muito grande. Máximo: 25MB.' }, { status: 400 })
    }

    const groqForm = new FormData()
    groqForm.append('file', fileBlob, fileName)
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
