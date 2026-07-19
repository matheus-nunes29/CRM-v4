/**
 * Shared Evolution API message-send helper. Used by the interactive
 * Inbox send route (src/app/api/whatsapp/send/route.ts) and the quick
 * broadcast cron worker (src/app/api/cron/broadcast-worker/route.ts)
 * so both paths hit the exact same endpoint-selection logic.
 */

export type EvolutionMessageType = 'text' | 'image' | 'video' | 'audio' | 'document'

export interface SendEvolutionMessageParams {
  serverUrl: string
  apiKey: string
  instanceName: string
  /** Digits-only phone number, no "+" or JID suffix. */
  phone: string
  messageType: EvolutionMessageType
  text?: string | null
  mediaUrl?: string | null
  filename?: string | null
}

export interface SendEvolutionMessageResult {
  ok: boolean
  messageId?: string
  error?: string
}

export async function sendEvolutionMessage(
  params: SendEvolutionMessageParams,
): Promise<SendEvolutionMessageResult> {
  const { serverUrl, apiKey, instanceName, phone, messageType, text, mediaUrl, filename } = params

  let endpoint: string
  let body: Record<string, unknown>

  if (messageType === 'audio' && mediaUrl) {
    // Dedicated endpoint for voice notes — /message/sendMedia with
    // mediatype:'audio' gets accepted (200) but Baileys builds it
    // without the PTT flag, so WhatsApp silently drops the delivery.
    endpoint = `${serverUrl}/message/sendWhatsAppAudio/${instanceName}`
    body = { number: phone, audio: mediaUrl }
  } else if (messageType !== 'text' && mediaUrl) {
    const mediaTypeMap: Record<string, string> = { image: 'image', video: 'video', document: 'document' }
    endpoint = `${serverUrl}/message/sendMedia/${instanceName}`
    body = {
      number: phone,
      mediatype: mediaTypeMap[messageType] ?? 'image',
      media: mediaUrl,
      caption: text || undefined,
      ...(messageType === 'document' && filename ? { fileName: filename } : {}),
    }
  } else {
    endpoint = `${serverUrl}/message/sendText/${instanceName}`
    body = { number: phone, text: text ?? '' }
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { apikey: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const raw = await res.text()
    console.log(`[evolution/send] ${endpoint} → ${res.status} | ${raw.slice(0, 300)}`)
    let data: Record<string, unknown>
    try { data = JSON.parse(raw) as Record<string, unknown> } catch { data = { _raw: raw.slice(0, 200) } }
    if (!res.ok) {
      return { ok: false, error: String(data.message ?? data.error ?? `Evolution API ${res.status}`) }
    }
    const key = data.key as Record<string, unknown> | undefined
    return { ok: true, messageId: String(key?.id ?? data.id ?? '') }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Evolution API network error' }
  }
}
