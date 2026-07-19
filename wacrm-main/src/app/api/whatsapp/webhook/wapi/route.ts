import { NextResponse } from 'next/server'
import {
  db,
  findOrCreateContact,
  findOrCreateGroupContact,
  maybeAutoCreateDeal,
  findOrCreateConversation,
  insertMessage,
  normalisePhone,
} from '@/lib/whatsapp/inbound-message'

const LOG = '[wapi/webhook]'

// ---------------------------------------------------------------------------
// W-API webhook payload shape (actual format from api.w-api.app)
//
// Confirmed from live webhook logs. Key fields:
//   chat.id   = group JID (e.g. "120363XXX@g.us") or contact LID for DMs
//   sender.id = sender phone without "+" (e.g. "5511996145335")
//   sender.pushName = display name
//   moment    = Unix timestamp in SECONDS
//   msgContent = union of typed message objects
// ---------------------------------------------------------------------------

interface WApiPayload {
  event?: string
  instanceId?: string
  isGroup?: boolean
  messageId?: string
  fromMe?: boolean
  chat?: {
    id?: string             // group JID or "status" (for WhatsApp Status)
    profilePicture?: string
  }
  sender?: {
    id?: string             // phone number (no "+", e.g. "5511996145335")
    senderLid?: string
    profilePicture?: string
    pushName?: string
    verifiedBizName?: string
  }
  moment?: number           // Unix timestamp in SECONDS
  fromApi?: boolean
  connectedPhone?: string
  connectedLid?: string
  groupName?: string        // group display name (may be top-level)
  msgContent?: {
    conversation?: string
    extendedTextMessage?: { text?: string; canonicalUrl?: string }
    imageMessage?: { caption?: string; url?: string; mimetype?: string; JPEGThumbnail?: string }
    videoMessage?: { caption?: string; url?: string; mimetype?: string }
    audioMessage?: { url?: string; mimetype?: string; ptt?: boolean }
    documentMessage?: { title?: string; fileName?: string; url?: string; mimetype?: string; caption?: string }
    stickerMessage?: { url?: string; mimetype?: string }
    locationMessage?: { degreesLatitude?: number; degreesLongitude?: number; name?: string; address?: string }
    contactMessage?: { displayName?: string; vcard?: string }
    reactionMessage?: { text?: string }
    groupMetadata?: { subject?: string; id?: string }
  }
}

// ---------------------------------------------------------------------------
// GET – not used by W-API but handle gracefully
// ---------------------------------------------------------------------------

export async function GET() {
  return NextResponse.json({ ok: true })
}

// ---------------------------------------------------------------------------
// POST – main webhook handler
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  let payload: WApiPayload
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Log for debugging
  const payloadStr = JSON.stringify(payload)
  console.log('[wapi/webhook] payload_len:', payloadStr.length)
  console.log('[wapi/webhook] payload_1:', payloadStr.slice(0, 500))
  if (payloadStr.length > 500) console.log('[wapi/webhook] payload_2:', payloadStr.slice(500, 1000))

  const event = (payload.event ?? '').toLowerCase()

  // Skip outbound echoes
  if (payload.fromMe === true) {
    console.log('[wapi/webhook] skipped: fromMe')
    return NextResponse.json({ status: 'skipped_fromMe' })
  }

  // Skip WhatsApp Status updates
  if (payload.chat?.id === 'status') {
    console.log('[wapi/webhook] skipped: status broadcast')
    return NextResponse.json({ status: 'skipped_status' })
  }

  // Skip reactions (they update a message, not create one)
  if (payload.msgContent?.reactionMessage) {
    console.log('[wapi/webhook] skipped: reaction')
    return NextResponse.json({ status: 'skipped_reaction' })
  }

  // Accept any message-like event, or no event field at all
  const isMessageEvent = event === '' ||
    event.includes('message') ||
    event.includes('receive') ||
    event.includes('upsert')
  if (!isMessageEvent) {
    console.log('[wapi/webhook] skipped event:', event)
    return NextResponse.json({ status: 'skipped_event', event })
  }

  const instanceId = payload.instanceId ?? ''
  console.log('[wapi/webhook] instanceId from payload:', instanceId)

  // Find wapi account
  let config: { account_id: string; user_id: string } | null = null

  if (instanceId) {
    const { data } = await db()
      .from('whatsapp_config')
      .select('account_id, user_id')
      .eq('wapi_instance_id', instanceId)
      .eq('provider', 'wapi')
      .maybeSingle()
    config = data
  }

  if (!config) {
    const { data } = await db()
      .from('whatsapp_config')
      .select('account_id, user_id')
      .eq('provider', 'wapi')
      .limit(1)
      .maybeSingle()
    config = data
    if (config) console.log('[wapi/webhook] resolved config via fallback')
  }

  if (!config) {
    console.warn('[wapi/webhook] no wapi config found. instanceId:', instanceId)
    return NextResponse.json({ error: 'No wapi config found' }, { status: 404 })
  }

  console.log('[wapi/webhook] resolved account_id:', config.account_id)

  const { account_id: accountId, user_id: configOwnerUserId } = config

  try {
    await processWApiMessage(payload, accountId, configOwnerUserId)
    console.log('[wapi/webhook] processMessage OK')
  } catch (err) {
    console.error('[wapi/webhook] processMessage error:', err)
  }

  return NextResponse.json({ status: 'received' })
}

// ---------------------------------------------------------------------------
// Core message processor — field mapping for actual W-API payload format
// ---------------------------------------------------------------------------

async function processWApiMessage(
  p: WApiPayload,
  accountId: string,
  configOwnerUserId: string,
) {
  const isGroup = p.isGroup === true

  // Extract content from msgContent union
  const { contentText, mediaUrl, contentType } = extractContent(p.msgContent)

  // Message ID and timestamp
  const msgId = p.messageId ?? ''
  const timestamp = p.moment
    ? new Date(p.moment * 1000).toISOString()
    : new Date().toISOString()

  if (isGroup) {
    // Group JID is in chat.id (e.g. "120363280382729387@g.us")
    const groupJid = p.chat?.id ?? ''
    if (!groupJid || !groupJid.endsWith('@g.us')) {
      console.warn('[wapi/webhook] group message missing valid chat.id:', groupJid)
      return
    }

    // Group name: may be in top-level groupName or msgContent.groupMetadata
    const groupName = p.groupName
      ?? p.msgContent?.groupMetadata?.subject
      ?? groupJid

    // Sender inside the group
    const senderPhone = p.sender?.id ? normalisePhone(p.sender.id) : ''
    const senderName = p.sender?.pushName ?? senderPhone

    console.log('[wapi/webhook] group msg groupJid:', groupJid, 'sender:', senderPhone, 'name:', senderName)

    await processGroupMessage({
      accountId,
      configOwnerUserId,
      groupJid,
      groupName,
      senderPhone,
      senderName,
      contentType,
      contentText,
      mediaUrl,
      msgId,
      timestamp,
    })
  } else {
    // Direct message: sender phone in sender.id
    const senderPhone = p.sender?.id ? normalisePhone(p.sender.id) : ''
    if (!senderPhone) {
      console.warn('[wapi/webhook] DM missing sender.id')
      return
    }
    const senderName = p.sender?.pushName ?? ''

    console.log('[wapi/webhook] DM sender:', senderPhone, 'name:', senderName)

    await processDirectMessage({
      accountId,
      configOwnerUserId,
      senderPhone,
      senderName,
      contentType,
      contentText,
      mediaUrl,
      msgId,
      timestamp,
    })
  }
}

// ---------------------------------------------------------------------------
// Content extraction from W-API msgContent
// ---------------------------------------------------------------------------

function extractContent(msgContent?: WApiPayload['msgContent']): {
  contentText: string | null
  mediaUrl: string | null
  contentType: string
} {
  if (!msgContent) return { contentText: null, mediaUrl: null, contentType: 'text' }

  if (msgContent.conversation) {
    return { contentText: msgContent.conversation, mediaUrl: null, contentType: 'text' }
  }
  if (msgContent.extendedTextMessage) {
    return { contentText: msgContent.extendedTextMessage.text ?? null, mediaUrl: null, contentType: 'text' }
  }
  if (msgContent.imageMessage) {
    return {
      contentText: msgContent.imageMessage.caption ?? null,
      mediaUrl: msgContent.imageMessage.url ?? null,
      contentType: 'image',
    }
  }
  if (msgContent.videoMessage) {
    return {
      contentText: msgContent.videoMessage.caption ?? null,
      mediaUrl: msgContent.videoMessage.url ?? null,
      contentType: 'video',
    }
  }
  if (msgContent.audioMessage) {
    return {
      contentText: null,
      mediaUrl: msgContent.audioMessage.url ?? null,
      contentType: 'audio',
    }
  }
  if (msgContent.documentMessage) {
    return {
      contentText: msgContent.documentMessage.fileName ?? msgContent.documentMessage.title ?? null,
      mediaUrl: msgContent.documentMessage.url ?? null,
      contentType: 'document',
    }
  }
  if (msgContent.stickerMessage) {
    return {
      contentText: null,
      mediaUrl: msgContent.stickerMessage.url ?? null,
      contentType: 'sticker',
    }
  }
  if (msgContent.locationMessage) {
    const { degreesLatitude: lat, degreesLongitude: lng, name, address } = msgContent.locationMessage
    const text = name ?? address ?? (lat != null && lng != null ? `${lat},${lng}` : 'Localização')
    return { contentText: text, mediaUrl: null, contentType: 'location' }
  }

  // Unknown content — store as generic text
  return { contentText: null, mediaUrl: null, contentType: 'text' }
}

// ---------------------------------------------------------------------------
// Direct (1-on-1) message
// ---------------------------------------------------------------------------

async function processDirectMessage({
  accountId, configOwnerUserId, senderPhone, senderName,
  contentType, contentText, mediaUrl, msgId, timestamp,
}: {
  accountId: string
  configOwnerUserId: string
  senderPhone: string
  senderName: string
  contentType: string
  contentText: string | null
  mediaUrl: string | null
  msgId: string
  timestamp: string
}) {
  const contact = await findOrCreateContact(LOG, accountId, configOwnerUserId, senderPhone, senderName)
  if (!contact) return

  const conversation = await findOrCreateConversation(LOG, accountId, configOwnerUserId, contact.id)
  if (!conversation) return

  await insertMessage(LOG, conversation.id, {
    contentType, contentText, mediaUrl, msgId, timestamp,
  })

  await maybeAutoCreateDeal(LOG, accountId, configOwnerUserId, contact.id, contact.name || senderPhone)
}

// ---------------------------------------------------------------------------
// Group message
// ---------------------------------------------------------------------------

async function processGroupMessage({
  accountId, configOwnerUserId, groupJid, groupName,
  senderPhone, senderName,
  contentType, contentText, mediaUrl, msgId, timestamp,
}: {
  accountId: string
  configOwnerUserId: string
  groupJid: string
  groupName: string
  senderPhone: string
  senderName: string
  contentType: string
  contentText: string | null
  mediaUrl: string | null
  msgId: string
  timestamp: string
}) {
  const groupContact = await findOrCreateGroupContact(
    LOG, accountId, configOwnerUserId, groupJid, groupName,
    () => fetchGroupNameFromWApi(groupJid),
  )
  if (!groupContact) return

  // Update group name if it changed and we now have a real name
  if (groupName && groupName !== groupJid && groupName !== groupContact.name) {
    await db()
      .from('contacts')
      .update({ name: groupName, updated_at: new Date().toISOString() })
      .eq('id', groupContact.id)
  }

  const conversation = await findOrCreateConversation(LOG, accountId, configOwnerUserId, groupContact.id)
  if (!conversation) return

  await insertMessage(LOG, conversation.id, {
    contentType,
    contentText,
    mediaUrl,
    msgId,
    timestamp,
    groupSenderName: senderName || senderPhone || undefined,
    groupSenderPhone: senderPhone || undefined,
  })
}

// ---------------------------------------------------------------------------
// DB helpers — group name resolution is W-API-specific; contact/
// conversation/message CRUD lives in @/lib/whatsapp/inbound-message
// (shared with the Evolution API webhook).
// ---------------------------------------------------------------------------

/**
 * Fetch the group display name (subject) from W-API.
 * Only called when the webhook payload doesn't include a name.
 * Returns null if the request fails or env vars are missing.
 */
async function fetchGroupNameFromWApi(groupJid: string): Promise<string | null> {
  const token = process.env.WAPI_TOKEN
  const instanceId = process.env.WAPI_INSTANCE_ID
  if (!token || !instanceId) {
    console.warn('[wapi/webhook] fetchGroupName: missing WAPI_TOKEN/WAPI_INSTANCE_ID env vars')
    return null
  }
  const url = `https://api.w-api.app/v1/group/get-group-info?instanceId=${instanceId}&groupId=${encodeURIComponent(groupJid)}`
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    const bodyText = await res.text()
    if (!res.ok) {
      console.warn('[wapi/webhook] fetchGroupName: non-OK response', res.status, bodyText.slice(0, 300))
      return null
    }
    let data: Record<string, unknown>
    try {
      data = JSON.parse(bodyText) as Record<string, unknown>
    } catch {
      console.warn('[wapi/webhook] fetchGroupName: response not JSON:', bodyText.slice(0, 300))
      return null
    }
    const name = (data.subject ?? data.name ?? data.groupName ?? data.title) as string | undefined
    console.log('[wapi/webhook] fetchGroupName: resolved', groupJid, '->', name ?? '(none)', '| raw keys:', Object.keys(data).join(','))
    return name ?? null
  } catch (err) {
    console.error('[wapi/webhook] fetchGroupName: request failed', err instanceof Error ? err.message : err)
    return null
  }
}
