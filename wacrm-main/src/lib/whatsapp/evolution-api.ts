/**
 * Evolution API adapter.
 *
 * Evolution API is an unofficial WhatsApp gateway that uses the Baileys
 * (WhatsApp Web) protocol. It does not require Meta approval and connects
 * via QR code scan.
 *
 * All functions accept a config object rather than reading from the DB,
 * keeping them pure and testable.
 */

export interface EvolutionConfig {
  serverUrl: string
  instanceName: string
  apiKey: string
}

// ─── Connection / instance management ──────────────────────────────────────

export type EvolutionConnectionState =
  | 'open'       // connected and ready
  | 'connecting' // QR pending / authenticating
  | 'close'      // disconnected

export interface EvolutionInstanceState {
  state: EvolutionConnectionState
  /** Base64-encoded QR code image (data URI) — only present when state=connecting */
  qrcode?: string
}

/** Check connection state of an existing instance. */
export async function getInstanceState(
  cfg: EvolutionConfig,
): Promise<EvolutionInstanceState> {
  const res = await fetch(
    `${cfg.serverUrl}/instance/connectionState/${cfg.instanceName}`,
    { headers: evolutionHeaders(cfg) },
  )

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Evolution API error ${res.status}: ${body}`)
  }

  const data = await res.json()
  // v1 shape: { instance: { state: 'open' } }
  // v2 shape: { state: 'open' }
  const state: EvolutionConnectionState =
    data?.instance?.state ?? data?.state ?? 'close'
  return { state }
}

/** Create a new instance. Idempotent — returns existing if name already taken. */
export async function createInstance(cfg: EvolutionConfig): Promise<void> {
  const res = await fetch(`${cfg.serverUrl}/instance/create`, {
    method: 'POST',
    headers: { ...evolutionHeaders(cfg), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instanceName: cfg.instanceName,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    // 409 = instance already exists (v1); 403 with "already in use" = same on v2.
    const alreadyExists =
      res.status === 409 ||
      (res.status === 403 && body.toLowerCase().includes('already in use'))
    if (!alreadyExists) {
      throw new Error(`Evolution create instance error ${res.status}: ${body}`)
    }
  }
}

/** Fetch the current QR code. Returns null when already connected. */
export async function getQrCode(
  cfg: EvolutionConfig,
): Promise<string | null> {
  const res = await fetch(
    `${cfg.serverUrl}/instance/connect/${cfg.instanceName}`,
    { headers: evolutionHeaders(cfg) },
  )

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Evolution QR error ${res.status}: ${body}`)
  }

  const data = await res.json()
  // v1 shape: { code: '...', base64: 'data:image/png;base64,...' }
  // v2 shape: { base64: '...' }
  return data?.base64 ?? data?.code ?? null
}

/** Delete / logout an instance. */
export async function deleteInstance(cfg: EvolutionConfig): Promise<void> {
  const res = await fetch(
    `${cfg.serverUrl}/instance/delete/${cfg.instanceName}`,
    { method: 'DELETE', headers: evolutionHeaders(cfg) },
  )
  if (!res.ok && res.status !== 404) {
    const body = await res.text().catch(() => '')
    throw new Error(`Evolution delete instance error ${res.status}: ${body}`)
  }
}

// ─── Sending messages ───────────────────────────────────────────────────────

export interface EvolutionSendResult {
  messageId: string
}

/** Send a plain-text message. */
export async function sendTextMessage(
  cfg: EvolutionConfig,
  to: string,
  text: string,
): Promise<EvolutionSendResult> {
  const res = await fetch(
    `${cfg.serverUrl}/message/sendText/${cfg.instanceName}`,
    {
      method: 'POST',
      headers: { ...evolutionHeaders(cfg), 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: toEvolutionPhone(to), text }),
    },
  )

  const data = await res.json()
  if (!res.ok) {
    throw new Error(
      data?.message ?? data?.error ?? `Evolution send error ${res.status}`,
    )
  }

  return { messageId: data?.key?.id ?? data?.id ?? '' }
}

export type EvolutionMediaType = 'image' | 'video' | 'document' | 'audio'

/** Send an image, video, document, or audio file via public URL. */
export async function sendMediaMessage(
  cfg: EvolutionConfig,
  to: string,
  mediaType: EvolutionMediaType,
  mediaUrl: string,
  caption?: string,
  filename?: string,
): Promise<EvolutionSendResult> {
  const body: Record<string, unknown> = {
    number: toEvolutionPhone(to),
    mediatype: mediaType,
    media: mediaUrl,
  }
  if (caption) body.caption = caption
  if (filename) body.fileName = filename

  const endpoint =
    mediaType === 'audio'
      ? `${cfg.serverUrl}/message/sendWhatsAppAudio/${cfg.instanceName}`
      : `${cfg.serverUrl}/message/sendMedia/${cfg.instanceName}`

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { ...evolutionHeaders(cfg), 'Content-Type': 'application/json' },
    body: JSON.stringify(
      mediaType === 'audio'
        ? { number: toEvolutionPhone(to), audio: mediaUrl, encoding: true }
        : body,
    ),
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(
      data?.message ?? data?.error ?? `Evolution media send error ${res.status}`,
    )
  }

  return { messageId: data?.key?.id ?? data?.id ?? '' }
}

// ─── Webhook normalisation ───────────────────────────────────────────────────

export type EvolutionWebhookEvent =
  | EvolutionUpsertEvent
  | EvolutionUpdateEvent
  | EvolutionOtherEvent

export interface EvolutionUpsertEvent {
  kind: 'upsert'
  instanceName: string
  messageId: string
  fromMe: boolean
  remoteJid: string
  /** Digits-only phone number extracted from remoteJid */
  phone: string
  pushName: string | null
  messageType: string
  text: string | null
  mediaUrl: string | null
  mediaType: 'image' | 'video' | 'document' | 'audio' | null
  mimeType: string | null
  filename: string | null
  caption: string | null
  timestamp: number
  quotedMessageId: string | null
}

export interface EvolutionUpdateEvent {
  kind: 'update'
  instanceName: string
  messageId: string
  status: 'sent' | 'delivered' | 'read' | 'failed'
}

export interface EvolutionOtherEvent {
  kind: 'other'
  event: string
}

/** Parse a raw Evolution webhook POST body into a typed event. */
export function normalizeEvolutionWebhook(raw: unknown): EvolutionWebhookEvent {
  if (!raw || typeof raw !== 'object') {
    return { kind: 'other', event: 'unknown' }
  }

  const payload = raw as Record<string, unknown>
  const event = String(payload.event ?? '')
  const instanceName = String(payload.instance ?? '')

  // ── messages.upsert ──────────────────────────────────────────────────
  if (event === 'messages.upsert') {
    const data = payload.data as Record<string, unknown>
    if (!data) return { kind: 'other', event }

    const key = data.key as Record<string, unknown>
    const messageId = String(key?.id ?? '')
    const fromMe = Boolean(key?.fromMe)
    const remoteJid = String(key?.remoteJid ?? '')
    const phone = jidToPhone(remoteJid)
    const pushName = (data.pushName as string) ?? null
    const messageType = String(data.messageType ?? 'unknown')
    const timestamp =
      typeof data.messageTimestamp === 'number'
        ? data.messageTimestamp
        : parseInt(String(data.messageTimestamp ?? 0), 10)

    const msg = data.message as Record<string, unknown> | undefined
    const contextMsgId =
      ((data.contextInfo as Record<string, unknown>)?.stanzaId as string) ??
      ((msg?.extendedTextMessage as Record<string, unknown>)?.contextInfo as Record<string, unknown>)?.stanzaId as string ?? null

    let text: string | null = null
    let mediaUrl: string | null = null
    let mediaType: EvolutionUpsertEvent['mediaType'] = null
    let mimeType: string | null = null
    let filename: string | null = null
    let caption: string | null = null

    if (messageType === 'conversation') {
      text = (msg?.conversation as string) ?? null
    } else if (messageType === 'extendedTextMessage') {
      const ext = msg?.extendedTextMessage as Record<string, unknown> | undefined
      text = (ext?.text as string) ?? null
    } else if (messageType === 'imageMessage') {
      const img = msg?.imageMessage as Record<string, unknown> | undefined
      mediaUrl = (img?.url as string) ?? null
      mediaType = 'image'
      mimeType = (img?.mimetype as string) ?? null
      caption = (img?.caption as string) ?? null
    } else if (messageType === 'videoMessage') {
      const vid = msg?.videoMessage as Record<string, unknown> | undefined
      mediaUrl = (vid?.url as string) ?? null
      mediaType = 'video'
      mimeType = (vid?.mimetype as string) ?? null
      caption = (vid?.caption as string) ?? null
    } else if (messageType === 'audioMessage') {
      const aud = msg?.audioMessage as Record<string, unknown> | undefined
      mediaUrl = (aud?.url as string) ?? null
      mediaType = 'audio'
      mimeType = (aud?.mimetype as string) ?? null
    } else if (messageType === 'documentMessage') {
      const doc = msg?.documentMessage as Record<string, unknown> | undefined
      mediaUrl = (doc?.url as string) ?? null
      mediaType = 'document'
      mimeType = (doc?.mimetype as string) ?? null
      filename = (doc?.title as string) ?? (doc?.fileName as string) ?? null
      caption = (doc?.caption as string) ?? null
    }

    return {
      kind: 'upsert',
      instanceName,
      messageId,
      fromMe,
      remoteJid,
      phone,
      pushName,
      messageType,
      text,
      mediaUrl,
      mediaType,
      mimeType,
      filename,
      caption,
      timestamp,
      quotedMessageId: contextMsgId ?? null,
    }
  }

  // ── messages.update ──────────────────────────────────────────────────
  if (event === 'messages.update') {
    const updates = Array.isArray(payload.data) ? payload.data : [payload.data]
    const first = (updates[0] as Record<string, unknown>) ?? {}
    const key = first.key as Record<string, unknown> | undefined
    const messageId = String(key?.id ?? '')
    const rawStatus = String(
      (first.update as Record<string, unknown>)?.status ?? '',
    ).toUpperCase()

    const statusMap: Record<string, EvolutionUpdateEvent['status']> = {
      PENDING: 'sent',
      SERVER_ACK: 'sent',
      DELIVERY_ACK: 'delivered',
      READ: 'read',
      PLAYED: 'read',
      ERROR: 'failed',
    }
    const status = statusMap[rawStatus] ?? 'sent'

    return { kind: 'update', instanceName, messageId, status }
  }

  return { kind: 'other', event }
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function evolutionHeaders(cfg: EvolutionConfig): Record<string, string> {
  return { apikey: cfg.apiKey }
}

/**
 * Convert an E.164 phone ("+5511999999999") to the digits-only format
 * Evolution API expects ("5511999999999").
 */
export function toEvolutionPhone(e164: string): string {
  return e164.replace(/\D/g, '')
}

/**
 * Extract the digits-only phone number from a WhatsApp JID.
 * "5511999999999@s.whatsapp.net" → "5511999999999"
 * Group JIDs (ending @g.us) return the full JID so callers can detect them.
 */
function jidToPhone(jid: string): string {
  return jid.split('@')[0] ?? jid
}
