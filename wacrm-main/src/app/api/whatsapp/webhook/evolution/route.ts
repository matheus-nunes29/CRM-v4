import { NextResponse } from 'next/server'
import {
  findOrCreateContact,
  findOrCreateGroupContact,
  findOrCreateConversation,
  insertMessage,
  normalisePhone,
} from '@/lib/whatsapp/inbound-message'

const LOG = '[evolution/webhook]'

const EVOLUTION_SERVER_URL = (process.env.EVOLUTION_SERVER_URL ?? '').replace(/\/$/, '')
const EVOLUTION_GLOBAL_API_KEY = process.env.EVOLUTION_GLOBAL_API_KEY ?? ''

// ---------------------------------------------------------------------------
// Evolution API webhook payload shape (Baileys-based, MESSAGES_UPSERT event).
//
// NOT yet confirmed against a live instance — Evolution API's exact field
// names have drifted across major versions. Verify this against real
// webhook logs once the self-hosted instance is receiving traffic
// (Fase 5 of the migration plan) and adjust field lookups here if they
// don't match; the defensive `??` fallbacks below are there so a shape
// mismatch degrades to "skip the field" rather than throwing.
// ---------------------------------------------------------------------------

interface EvolutionMessageContent {
  conversation?: string
  extendedTextMessage?: { text?: string }
  imageMessage?: { caption?: string; url?: string; base64?: string; mimetype?: string }
  videoMessage?: { caption?: string; url?: string; base64?: string; mimetype?: string }
  audioMessage?: { url?: string; base64?: string; mimetype?: string }
  documentMessage?: { title?: string; fileName?: string; url?: string; base64?: string; mimetype?: string }
  stickerMessage?: { url?: string; base64?: string }
  locationMessage?: { degreesLatitude?: number; degreesLongitude?: number; name?: string; address?: string }
}

interface EvolutionPayload {
  event?: string
  instance?: string
  data?: {
    key?: {
      remoteJid?: string     // group JID (@g.us) or contact JID (@s.whatsapp.net)
      participant?: string   // actual sender JID, only present for group messages
      fromMe?: boolean
      id?: string
    }
    pushName?: string
    messageTimestamp?: number | string
    message?: EvolutionMessageContent
    // Present when the webhook config was created with `base64: true` —
    // Evolution decrypts the media and includes it inline instead of a URL.
    base64?: string
  }
}

export async function GET() {
  return NextResponse.json({ ok: true })
}

export async function POST(request: Request) {
  let payload: EvolutionPayload
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const payloadStr = JSON.stringify(payload)
  console.log(`${LOG} payload_len:`, payloadStr.length)
  console.log(`${LOG} payload:`, payloadStr.slice(0, 800))

  const event = (payload.event ?? '').toLowerCase()
  if (event && !event.includes('messages.upsert') && !event.includes('messages_upsert')) {
    console.log(`${LOG} skipped event:`, event)
    return NextResponse.json({ status: 'skipped_event', event })
  }

  const data = payload.data
  if (!data?.key) {
    console.warn(`${LOG} missing data.key`)
    return NextResponse.json({ status: 'skipped_no_key' })
  }

  if (data.key.fromMe === true) {
    console.log(`${LOG} skipped: fromMe`)
    return NextResponse.json({ status: 'skipped_fromMe' })
  }

  const remoteJid = data.key.remoteJid ?? ''
  const isGroup = remoteJid.endsWith('@g.us')

  const instanceName = payload.instance ?? ''
  if (!instanceName) {
    console.warn(`${LOG} missing instance name in payload`)
    return NextResponse.json({ status: 'skipped_no_instance' })
  }

  const { accountId, configOwnerUserId } = await resolveAccountByInstance(instanceName)
  if (!accountId || !configOwnerUserId) {
    console.warn(`${LOG} no whatsapp_config found for instance:`, instanceName)
    return NextResponse.json({ error: 'No account for this instance' }, { status: 404 })
  }

  const { contentText, mediaUrl, contentType } = extractContent(data.message, data.base64)
  const msgId = data.key.id ?? ''
  const rawTimestamp = data.messageTimestamp
  const timestamp = rawTimestamp
    ? new Date(Number(rawTimestamp) * 1000).toISOString()
    : new Date().toISOString()

  if (isGroup) {
    const senderPhone = data.key.participant ? normalisePhone(data.key.participant) : ''
    const senderName = payload.data?.pushName ?? senderPhone

    const groupContact = await findOrCreateGroupContact(
      LOG, accountId, configOwnerUserId, remoteJid, remoteJid,
      () => fetchGroupNameFromEvolution(instanceName, remoteJid),
    )
    if (!groupContact) return NextResponse.json({ status: 'error_group_contact' })

    const conversation = await findOrCreateConversation(LOG, accountId, configOwnerUserId, groupContact.id)
    if (!conversation) return NextResponse.json({ status: 'error_conversation' })

    await insertMessage(LOG, conversation.id, {
      contentType, contentText, mediaUrl, msgId, timestamp,
      groupSenderName: senderName || senderPhone || undefined,
      groupSenderPhone: senderPhone || undefined,
    })
  } else {
    const senderPhone = normalisePhone(remoteJid)
    if (!senderPhone) {
      console.warn(`${LOG} DM missing remoteJid`)
      return NextResponse.json({ status: 'skipped_no_sender' })
    }
    const senderName = payload.data?.pushName ?? ''

    const contact = await findOrCreateContact(LOG, accountId, configOwnerUserId, senderPhone, senderName)
    if (!contact) return NextResponse.json({ status: 'error_contact' })

    const conversation = await findOrCreateConversation(LOG, accountId, configOwnerUserId, contact.id)
    if (!conversation) return NextResponse.json({ status: 'error_conversation' })

    await insertMessage(LOG, conversation.id, { contentType, contentText, mediaUrl, msgId, timestamp })
  }

  return NextResponse.json({ status: 'received' })
}

// ---------------------------------------------------------------------------
// Content extraction
// ---------------------------------------------------------------------------

function extractContent(
  message: EvolutionMessageContent | undefined,
  topLevelBase64?: string,
): { contentText: string | null; mediaUrl: string | null; contentType: string } {
  if (!message) return { contentText: null, mediaUrl: null, contentType: 'text' }

  if (message.conversation) {
    return { contentText: message.conversation, mediaUrl: null, contentType: 'text' }
  }
  if (message.extendedTextMessage) {
    return { contentText: message.extendedTextMessage.text ?? null, mediaUrl: null, contentType: 'text' }
  }
  if (message.imageMessage) {
    return {
      contentText: message.imageMessage.caption ?? null,
      mediaUrl: message.imageMessage.url ?? mediaDataUrl(message.imageMessage.base64 ?? topLevelBase64, message.imageMessage.mimetype),
      contentType: 'image',
    }
  }
  if (message.videoMessage) {
    return {
      contentText: message.videoMessage.caption ?? null,
      mediaUrl: message.videoMessage.url ?? mediaDataUrl(message.videoMessage.base64 ?? topLevelBase64, message.videoMessage.mimetype),
      contentType: 'video',
    }
  }
  if (message.audioMessage) {
    return {
      contentText: null,
      mediaUrl: message.audioMessage.url ?? mediaDataUrl(message.audioMessage.base64 ?? topLevelBase64, message.audioMessage.mimetype),
      contentType: 'audio',
    }
  }
  if (message.documentMessage) {
    return {
      contentText: message.documentMessage.fileName ?? message.documentMessage.title ?? null,
      mediaUrl: message.documentMessage.url ?? mediaDataUrl(message.documentMessage.base64 ?? topLevelBase64, message.documentMessage.mimetype),
      contentType: 'document',
    }
  }
  if (message.stickerMessage) {
    return {
      contentText: null,
      mediaUrl: message.stickerMessage.url ?? mediaDataUrl(message.stickerMessage.base64 ?? topLevelBase64, 'image/webp'),
      contentType: 'image',
    }
  }
  if (message.locationMessage) {
    const { degreesLatitude: lat, degreesLongitude: lng, name, address } = message.locationMessage
    const text = name ?? address ?? (lat != null && lng != null ? `${lat},${lng}` : 'Localização')
    return { contentText: text, mediaUrl: null, contentType: 'location' }
  }

  return { contentText: null, mediaUrl: null, contentType: 'text' }
}

/**
 * `base64: true` in the instance webhook config makes Evolution API
 * inline decrypted media instead of a fetchable URL — encode it as a
 * data: URL so it renders the same way a hosted URL would, without
 * needing a separate storage-upload step. Revisit if inline base64
 * proves too large for typical media (data: URLs bypass CDN caching).
 */
function mediaDataUrl(base64: string | undefined, mimetype: string | undefined): string | null {
  if (!base64) return null
  return `data:${mimetype ?? 'application/octet-stream'};base64,${base64}`
}

// ---------------------------------------------------------------------------
// Account resolution
// ---------------------------------------------------------------------------

async function resolveAccountByInstance(
  instanceName: string,
): Promise<{ accountId: string | null; configOwnerUserId: string | null }> {
  const { db } = await import('@/lib/whatsapp/inbound-message')
  const { data } = await db()
    .from('whatsapp_config')
    .select('account_id, user_id')
    .eq('evolution_instance_name', instanceName)
    .eq('provider', 'evolution')
    .maybeSingle()
  return {
    accountId: (data?.account_id as string | undefined) ?? null,
    configOwnerUserId: (data?.user_id as string | undefined) ?? null,
  }
}

// ---------------------------------------------------------------------------
// Group name resolution (fallback when the webhook payload doesn't
// include it — mirrors fetchGroupNameFromWApi in ../wapi/route.ts)
// ---------------------------------------------------------------------------

async function fetchGroupNameFromEvolution(instanceName: string, groupJid: string): Promise<string | null> {
  if (!EVOLUTION_SERVER_URL || !EVOLUTION_GLOBAL_API_KEY) {
    console.warn(`${LOG} fetchGroupName: missing EVOLUTION_SERVER_URL/EVOLUTION_GLOBAL_API_KEY env vars`)
    return null
  }
  const url = `${EVOLUTION_SERVER_URL}/group/fetchAllGroups/${instanceName}?getParticipants=false`
  try {
    const res = await fetch(url, { headers: { apikey: EVOLUTION_GLOBAL_API_KEY } })
    const bodyText = await res.text()
    if (!res.ok) {
      console.warn(`${LOG} fetchGroupName: non-OK response`, res.status, bodyText.slice(0, 300))
      return null
    }
    let groups: Array<Record<string, unknown>>
    try {
      const parsed = JSON.parse(bodyText)
      groups = Array.isArray(parsed) ? parsed : []
    } catch {
      console.warn(`${LOG} fetchGroupName: response not JSON array:`, bodyText.slice(0, 300))
      return null
    }
    const match = groups.find((g) => g.id === groupJid)
    const name = (match?.subject ?? match?.name) as string | undefined
    console.log(`${LOG} fetchGroupName: resolved`, groupJid, '->', name ?? '(none)')
    return name ?? null
  } catch (err) {
    console.error(`${LOG} fetchGroupName: request failed`, err instanceof Error ? err.message : err)
    return null
  }
}
