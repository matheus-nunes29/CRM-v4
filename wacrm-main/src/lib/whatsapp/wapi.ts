/**
 * W-API adapter.
 *
 * W-API is a managed WhatsApp gateway (third-party hosted) that connects
 * via QR code scan, similar to Evolution API but externally hosted.
 *
 * Base URL: https://api.w-api.app
 * Auth: Authorization: Bearer {token} header + ?instanceId={id} query param
 *
 * All functions accept a config object rather than reading from env/DB,
 * keeping them pure and testable.
 */

export interface WApiConfig {
  instanceId: string
  token: string
}

const BASE_URL = 'https://api.w-api.app'

/** Read WAPI_INSTANCE_ID + WAPI_TOKEN from env. Throws if missing. */
export function getSystemWApiConfig(): WApiConfig {
  const instanceId = process.env.WAPI_INSTANCE_ID
  const token = process.env.WAPI_TOKEN
  if (!instanceId) throw new Error('WAPI_INSTANCE_ID env var is not set')
  if (!token) throw new Error('WAPI_TOKEN env var is not set')
  return { instanceId, token }
}

/** Build Authorization header */
function wapiHeaders(cfg: WApiConfig): Record<string, string> {
  return {
    Authorization: `Bearer ${cfg.token}`,
    'Content-Type': 'application/json',
  }
}

/** Append ?instanceId= query param to a URL */
function withInstanceId(url: string, cfg: WApiConfig): string {
  return `${url}?instanceId=${encodeURIComponent(cfg.instanceId)}`
}

/**
 * Strip non-digit characters from a phone number.
 * W-API expects digits only (no leading +).
 * e.g. "+5511999999999" → "5511999999999"
 */
export function toWApiPhone(e164: string): string {
  return e164.replace(/\D/g, '')
}

// ─── Instance status ────────────────────────────────────────────────────────

/**
 * GET /v1/instance/status-instance
 * Returns { instanceId, connected: boolean }
 */
export async function getWApiInstanceStatus(
  cfg: WApiConfig,
): Promise<{ connected: boolean }> {
  const res = await fetch(
    withInstanceId(`${BASE_URL}/v1/instance/status-instance`, cfg),
    { headers: wapiHeaders(cfg) },
  )

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`W-API status error ${res.status}: ${body}`)
  }

  const data = await res.json()
  return { connected: Boolean(data?.connected) }
}

// ─── QR code ────────────────────────────────────────────────────────────────

/**
 * GET /v1/instance/qr-code
 * Returns the qrcode data URI or null if already connected / error.
 * Note: QR expires every 20 seconds.
 */
export async function getWApiQrCode(
  cfg: WApiConfig,
): Promise<string | null> {
  const res = await fetch(
    withInstanceId(`${BASE_URL}/v1/instance/qr-code`, cfg),
    { headers: wapiHeaders(cfg) },
  )

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`W-API QR error ${res.status}: ${body}`)
  }

  const data = await res.json()
  if (data?.error) return null
  return data?.qrcode ?? null
}

// ─── Webhook ─────────────────────────────────────────────────────────────────

/**
 * PUT /v1/webhook/update-webhook-received
 * Configures the URL W-API will POST incoming-message events to.
 */
export async function configureWApiWebhook(
  cfg: WApiConfig,
  webhookUrl: string,
): Promise<void> {
  const res = await fetch(
    withInstanceId(`${BASE_URL}/v1/webhook/update-webhook-received`, cfg),
    {
      method: 'PUT',
      headers: wapiHeaders(cfg),
      body: JSON.stringify({ webhookReceivedUrl: webhookUrl }),
    },
  )

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`W-API webhook config error ${res.status}: ${body}`)
  }
}

// ─── Sending messages ────────────────────────────────────────────────────────

/**
 * POST /v1/message/send-text
 * Returns { messageId } extracted from the W-API response.
 */
export async function sendWApiTextMessage(
  cfg: WApiConfig,
  phone: string,
  text: string,
  quotedMessageId?: string,
): Promise<{ messageId: string }> {
  const body: Record<string, unknown> = {
    phone: toWApiPhone(phone),
    message: text,
    delayMessage: 1,
  }
  if (quotedMessageId) body.messageId = quotedMessageId

  const res = await fetch(
    withInstanceId(`${BASE_URL}/v1/message/send-text`, cfg),
    {
      method: 'POST',
      headers: wapiHeaders(cfg),
      body: JSON.stringify(body),
    },
  )

  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    throw new Error(`W-API send-text error ${res.status}: ${errBody}`)
  }

  const data = await res.json()
  return { messageId: data.messageId ?? data.insertedId ?? '' }
}

export type WApiMediaType = 'image' | 'video' | 'audio' | 'document'

/**
 * Send an image, video, audio, or document via W-API.
 * Dispatches to the correct endpoint based on `type`.
 * For documents, extracts the file extension from the URL.
 */
export async function sendWApiMediaMessage(
  cfg: WApiConfig,
  phone: string,
  type: WApiMediaType,
  url: string,
  caption?: string,
  quotedMessageId?: string,
): Promise<{ messageId: string }> {
  const endpoint = `${BASE_URL}/v1/message/send-${type}`

  const body: Record<string, unknown> = {
    phone: toWApiPhone(phone),
    delayMessage: 1,
  }

  // Map the media field name to the type
  body[type] = url

  if (caption && type !== 'audio') body.caption = caption
  if (quotedMessageId) body.messageId = quotedMessageId

  if (type === 'document') {
    // Extract extension from URL (e.g. ".pdf" from "https://…/file.pdf")
    const extMatch = url.match(/\.([a-zA-Z0-9]+)(?:\?|$)/)
    body.extension = extMatch ? extMatch[1].toLowerCase() : 'bin'
    body.fileName = url.split('/').pop()?.split('?')[0] ?? 'file'
  }

  const res = await fetch(withInstanceId(endpoint, cfg), {
    method: 'POST',
    headers: wapiHeaders(cfg),
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    throw new Error(`W-API send-${type} error ${res.status}: ${errBody}`)
  }

  const data = await res.json()
  return { messageId: data.messageId ?? data.insertedId ?? '' }
}
