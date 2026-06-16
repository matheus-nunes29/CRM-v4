import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 120

const GROQ_MAX = 25 * 1024 * 1024 // 25 MB — Groq hard limit

export const DEFAULT_PROMPT = `Você é um especialista em qualificação de leads comerciais da V4 Company.
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
  "estruturaComercial": {
    "canal_aquisicao": "",
    "investimento_midia": "",
    "agencias_ferramentas": "",
    "equipe_comercial": "",
    "faturamento": "",
    "ticket_medio": "",
    "volume_clientes": "",
    "meta_crescimento": ""
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

INSTRUÇÕES DETALHADAS POR CAMPO:

BANT — preencha cada campo com um parágrafo rico e completo:
- budget: Valor ou faixa de investimento mencionada. Se o orçamento está aprovado ou precisa de aprovação interna. Quem tem poder de liberar o dinheiro. Histórico de quanto já investiram em marketing digital. Comparação com o que gastam hoje (agência, mídia, equipe interna).
- authority: Nome e cargo do decisor final. Se o lead tem autonomia para decidir sozinho ou precisa consultar sócios/diretoria. Quem mais está envolvido no processo de compra. Se há um comitê ou alguém que pode travar a decisão.
- need: Principais dores e necessidades em ordem de prioridade, com exemplos concretos citados pelo lead. O que já foi tentado anteriormente (outras agências, estratégias, ferramentas). Qual resultado específico esperam alcançar. Grau de urgência percebido.
- timing: Prazo desejado para início. O que está gerando pressão de tempo (sazonalidade, evento, meta interna, concorrência). Possíveis obstáculos que podem atrasar o fechamento. Condições necessárias para avançar.

SPICED — preencha cada campo com um parágrafo rico e completo:
- situation: Situação atual do negócio (faturamento aproximado, fase de crescimento, tamanho do time). Quais ferramentas, plataformas e agências utilizam hoje. Como estão investindo em marketing (canais, verba, equipe interna). Principal canal de aquisição de clientes atual.
- pain: Dores específicas identificadas em ordem de intensidade, com exemplos concretos e falas do lead. Frequência e recorrência de cada problema. O que o lead já tentou para resolver e por que não funcionou.
- impact: Impacto financeiro estimado dos problemas (vendas perdidas, CAC alto, churn). Consequências operacionais (time sobrecarregado, processos travados). O que acontece se continuar sem resolver — risco da inação. Oportunidade que está deixando na mesa.
- criticalEvent: Evento, prazo ou situação externa que está gerando urgência (lançamento de produto, data comemorativa, meta de crescimento, renovação de contrato, concorrente avançando). Quando ocorre. Qual a consequência concreta de perder esse prazo.
- decision: Como funciona o processo de decisão (etapas, aprovações necessárias). Quem além do lead precisa aprovar. Quais os critérios de escolha (preço, metodologia, cases, equipe). Se estão avaliando outras soluções ou concorrentes. Timeline esperado para tomar a decisão.

ESTRUTURA COMERCIAL — preencha cada campo com detalhes objetivos:
- canal_aquisicao: Principal(is) canal(is) de aquisição de clientes hoje (ex: indicação, Google Ads, Meta Ads, orgânico, prospecção ativa, eventos, parceiros). Qual canal traz mais resultado atualmente.
- investimento_midia: Valor mensal investido em mídia paga (Google Ads, Meta Ads, TikTok Ads, etc.). Se não souber o total, detalhe por plataforma. Se não investe, mencione.
- agencias_ferramentas: Agências de marketing/publicidade com quem trabalham hoje. Ferramentas de CRM (ex: RD Station, HubSpot, Salesforce, Pipedrive). Ferramentas de automação, analytics, gestão (ex: Hotmart, Active Campaign, Google Analytics, ERP).
- equipe_comercial: Estrutura do time de vendas: quantidade de SDRs, closers, representantes, inside/field sales. Como é feita a prospecção. Se há script ou processo estruturado.
- faturamento: Faturamento mensal ou anual mencionado. Se for por faixa (ex: "entre 200k e 400k por mês"), registre a faixa. Inclua se está crescendo ou estagnado.
- ticket_medio: Ticket médio por venda ou por cliente. Se há variação entre produtos/serviços, detalhe os principais. Recorrência ou pontual.
- volume_clientes: Quantidade de clientes ativos ou operações ativas no momento. Se há sazonalidade no volume.
- meta_crescimento: Meta de crescimento ou resultado esperado para os próximos 3-6 meses. O que precisa acontecer para considerar a parceria um sucesso.

INSIGHTS:
- termometro: Nível de interesse e prontidão de compra do lead (Frio / Morno / Quente / Pronto para fechar), com justificativa baseada nos sinais da conversa.
- gatilhoDeOuro: O principal motivador emocional ou racional que pode acelerar o fechamento — a coisa que mais incomoda o lead ou o maior sonho que ele quer realizar.
- sugestaoAbordagem: Como o closer deve conduzir a próxima conversa: qual ângulo explorar, que argumento usar, como contornar possíveis objeções, qual case ou prova social apresentar.

Personalidade deve ser um array com os perfis identificados entre: "Executor", "Comunicador", "Analista", "Planejador".
Objeções deve ser um array de strings com as objeções exatas ou prováveis do lead.
Use as palavras exatas do lead quando possível. Se uma informação não foi mencionada, deixe como string vazia ou array vazio.`

async function getActivePrompt(): Promise<string> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data } = await supabase
      .from('configuracoes_sistema')
      .select('valor')
      .eq('chave', 'prompt_qualificacao')
      .single()
    if (data?.valor) return data.valor
  } catch { /* fallback to default */ }
  return DEFAULT_PROMPT
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
  const prompt = await getActivePrompt()
  return NextResponse.json({ prompt })
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

    const activePrompt = await getActivePrompt()

    const groqKey = process.env.GROQ_API_KEY
    if (!groqKey) throw new Error('GROQ_API_KEY não configurada')
    const analysisRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: `Transcrição da ligação de qualificação:\n\n${texto}\n\n${activePrompt}` }],
        temperature: 0.1,
      }),
    })
    if (!analysisRes.ok) throw new Error('Groq analysis error: ' + await analysisRes.text())
    const analysisData = await analysisRes.json()
    const text = analysisData.choices[0].message.content.trim()

    const jsonStr = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
    const data = JSON.parse(jsonStr)

    return NextResponse.json({ ...data, _transcricao: texto })
  } catch (e: any) {
    console.error('gerar-qualificacao error:', e)
    return NextResponse.json({ error: e.message || 'Erro interno' }, { status: 500 })
  }
}
