/**
 * POST /api/whatsapp/webhook/wapi
 *
 * W-API webhook receiver. W-API POSTs all events here.
 *
 * Register this URL via PUT /v1/webhook/update-webhook-received
 * or by saving the W-API provider config in WhatsApp settings.
 *
 * Supported events:
 *   webhookMessage  — incoming/outgoing message (TODO: verify exact field names against real W-API events)
 *   webhookDelivery — delivery / read status update
 *   webhookConnected — instance connected confirmation
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normalizePhone } from '@/lib/whatsapp/phone-utils'
import { findExistingContact, isUniqueViolation } from '@/lib/contacts/dedupe'
import { runAutomationsForTrigger } from '@/lib/automations/engine'
import { dispatchInboundToFlows } from '@/lib/flows/engine'
import { fireCapiForDeal } from '@/lib/capi/fire-for-deal'
import type { AutomationTriggerType } from '@/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _adminClient: any = null
function supabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _adminClient
}

// ─── Normalised event shape ──────────────────────────────────────────────────

interface WApiMessageEvent {
  kind: 'message'
  messageId: string
  phone: string
  fromMe: boolean
  /** W-API message type: "text" | "image" | "video" | "audio" | "document" | … */
  type: string
  /** Text content (present when type === "text") */
  text: string | null
  /** Media URL (present for media message types) */
  mediaUrl: string | null
  caption: string | null
  /** Sender display name */
  senderName: string | null
  moment: number
}

interface WApiDeliveryEvent {
  kind: 'delivery'
  messageId: string
  phone: string
  /** "RECEIVED" | "READ" or lowercase variants */
  status: string
}

interface WApiConnectedEvent {
  kind: 'connected'
  connectedPhone: string | null
}

interface WApiOtherEvent {
  kind: 'other'
}

type WApiEvent =
  | WApiMessageEvent
  | WApiDeliveryEvent
  | WApiConnectedEvent
  | WApiOtherEvent

// ─── Event normaliser ────────────────────────────────────────────────────────

// TODO: Verify these field names against real W-API webhook events.
// The mapping below is based on the documented best-guess event format.
function normalizeWApiWebhook(raw: unknown): WApiEvent {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = raw as Record<string, any>
  const event = body?.event as string | undefined

  if (!event) return { kind: 'other' }

  if (event === 'webhookConnected') {
    return {
      kind: 'connected',
      connectedPhone: body.connectedPhone ?? null,
    }
  }

  if (event === 'webhookDelivery') {
    return {
      kind: 'delivery',
      messageId: body.messageId ?? '',
      phone: body.phone ?? '',
      status: (body.status as string | undefined) ?? '',
    }
  }

  // TODO: Confirm the exact event name for incoming messages.
  // W-API may use "webhookMessage" or another name — update when verified.
  if (event === 'webhookMessage' || event === 'message') {
    return {
      kind: 'message',
      messageId: body.messageId ?? '',
      phone: body.phone ?? '',
      fromMe: Boolean(body.fromMe),
      type: body.type ?? 'text',
      text: body.type === 'text' ? (body.message ?? null) : null,
      mediaUrl: body.mediaUrl ?? null,
      caption: body.caption ?? null,
      senderName: body.senderName ?? null,
      moment: body.moment ?? Date.now(),
    }
  }

  return { kind: 'other' }
}

// ─── Route handler ───────────────────────────────────────────────────────────

export async function POST(request: Request) {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const event = normalizeWApiWebhook(raw)

  try {
    await processWApiEvent(event)
  } catch (err) {
    console.error('[wapi-webhook] processing error:', err)
  }

  return NextResponse.json({ status: 'received' }, { status: 200 })
}

// ─── Event dispatcher ────────────────────────────────────────────────────────

async function processWApiEvent(event: WApiEvent) {
  if (event.kind === 'other') return

  // For W-API there is only one instance — look up by provider = 'wapi'
  const { data: configs, error: configError } = await supabaseAdmin()
    .from('whatsapp_config')
    .select('*')
    .eq('provider', 'wapi')

  if (configError || !configs || configs.length === 0) {
    console.error('[wapi-webhook] no whatsapp_config row found for provider=wapi')
    return
  }

  if (configs.length > 1) {
    console.error('[wapi-webhook] multiple wapi configs found — event dropped')
    return
  }

  const config = configs[0]
  const accountId: string = config.account_id
  const userId: string = config.user_id

  if (event.kind === 'connected') {
    console.info('[wapi-webhook] instance connected — phone:', event.connectedPhone)
    await supabaseAdmin()
      .from('whatsapp_config')
      .update({ status: 'connected', connected_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('account_id', accountId)
    return
  }

  if (event.kind === 'delivery') {
    await handleStatusUpdate(event)
    return
  }

  if (event.kind === 'message') {
    if (event.fromMe) {
      await handleOutboundEcho(event, accountId, userId)
    } else {
      await handleInboundMessage(event, accountId, userId)
    }
  }
}

// ─── Status updates ──────────────────────────────────────────────────────────

function isForwardMove(current: string, incoming: string): boolean {
  const ladder = ['sent', 'delivered', 'read']
  if (incoming === 'failed') return current === 'sent'
  const ci = ladder.indexOf(current)
  const ni = ladder.indexOf(incoming)
  return ni > ci
}

async function handleStatusUpdate(event: WApiDeliveryEvent) {
  if (!event.messageId) return

  // Normalise W-API status strings to our internal statuses
  // W-API uses "RECEIVED" and "READ" (uppercase) — normalise to lowercase
  const rawStatus = event.status.toLowerCase()
  const statusMap: Record<string, string> = {
    received: 'delivered',
    delivered: 'delivered',
    read: 'read',
    failed: 'failed',
    sent: 'sent',
  }
  const newStatus = statusMap[rawStatus] ?? 'sent'

  // ── Regular conversation message ──────────────────────────────────────────
  const { data: msg } = await supabaseAdmin()
    .from('messages')
    .select('id, status')
    .eq('message_id', event.messageId)
    .maybeSingle()

  if (msg) {
    const current = msg.status as string
    if (isForwardMove(current, newStatus)) {
      await supabaseAdmin()
        .from('messages')
        .update({ status: newStatus })
        .eq('id', msg.id)
    }
    return
  }

  // ── Broadcast message (not in messages table) ─────────────────────────────
  if (newStatus !== 'delivered' && newStatus !== 'read') return

  const { data: recipient } = await supabaseAdmin()
    .from('broadcast_recipients')
    .select('id, status, broadcast_id')
    .eq('whatsapp_message_id', event.messageId)
    .maybeSingle()

  if (!recipient) return

  const current = recipient.status as string
  if (!isForwardMove(current, newStatus)) return

  await supabaseAdmin()
    .from('broadcast_recipients')
    .update({ status: newStatus })
    .eq('id', recipient.id)

  if (newStatus === 'delivered') {
    await supabaseAdmin().rpc('increment_broadcast_delivered', { p_broadcast_id: recipient.broadcast_id })
  } else {
    await supabaseAdmin().rpc('increment_broadcast_read', { p_broadcast_id: recipient.broadcast_id })
  }
}

// ─── Outbound echo (sent from the phone, not from CRM) ────────────────────

async function handleOutboundEcho(
  event: WApiMessageEvent,
  accountId: string,
  userId: string,
) {
  // Deduplicate: skip if CRM already inserted this message
  if (event.messageId) {
    const { data: existing } = await supabaseAdmin()
      .from('messages')
      .select('id')
      .eq('message_id', event.messageId)
      .maybeSingle()
    if (existing) return
  }

  // Skip unsupported message types to avoid ghost conversations
  if (!event.text && !event.mediaUrl) {
    console.warn('[wapi-webhook] echo: unsupported type, skipping:', event.type)
    return
  }

  const rawPhone = event.phone
  if (!rawPhone) return
  const phone = rawPhone.startsWith('+') ? rawPhone : `+${rawPhone}`
  const normalizedPhone = normalizePhone(phone)

  // Find or create contact (do NOT use senderName for fromMe — it's the account owner)
  let contact = await findExistingContact(supabaseAdmin(), accountId, normalizedPhone)
  if (!contact) {
    const { data: newContact, error } = await supabaseAdmin()
      .from('contacts')
      .insert({ account_id: accountId, user_id: userId, phone: normalizedPhone })
      .select()
      .single()
    if (error) {
      if (isUniqueViolation(error)) {
        contact = await findExistingContact(supabaseAdmin(), accountId, normalizedPhone)
      } else {
        console.error('[wapi-webhook] echo: failed to create contact:', error)
        return
      }
    } else {
      contact = newContact
    }
  }
  if (!contact) return

  // Find or create conversation
  let { data: conversation } = await supabaseAdmin()
    .from('conversations')
    .select('id, status')
    .eq('account_id', accountId)
    .eq('contact_id', contact.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!conversation) {
    const { data: newConv, error: convError } = await supabaseAdmin()
      .from('conversations')
      .insert({ account_id: accountId, user_id: userId, contact_id: contact.id, status: 'open', unread_count: 0 })
      .select()
      .single()
    if (convError) {
      console.error('[wapi-webhook] echo: failed to create conversation:', convError)
      return
    }
    conversation = newConv
  }

  // Determine content
  let contentType = 'text'
  let contentText: string | null = null
  const mediaUrl: string | null = event.mediaUrl

  if (event.text) {
    contentType = 'text'
    contentText = event.text
  } else if (event.mediaUrl) {
    contentType = event.type // 'image' | 'video' | 'audio' | 'document'
    contentText = event.caption ?? null
  } else {
    return
  }

  // Insert as agent message
  await supabaseAdmin()
    .from('messages')
    .insert({
      conversation_id: conversation.id,
      sender_type: 'agent',
      content_type: contentType,
      content_text: contentText,
      media_url: mediaUrl,
      message_id: event.messageId,
      status: 'sent',
    })

  await supabaseAdmin()
    .from('conversations')
    .update({
      last_message_text: contentText ?? `[${contentType}]`,
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversation.id)
}

// ─── Inbound messages ────────────────────────────────────────────────────────

async function handleInboundMessage(
  event: WApiMessageEvent,
  accountId: string,
  userId: string,
) {
  // Bail out for unsupported types to avoid ghost conversations
  if (!event.text && !event.mediaUrl) {
    console.warn('[wapi-webhook] unsupported messageType, skipping:', event.type)
    return
  }

  const rawPhone = event.phone
  if (!rawPhone) return

  const phone = rawPhone.startsWith('+') ? rawPhone : `+${rawPhone}`
  const normalizedPhone = normalizePhone(phone)

  // ── Find or create contact ──────────────────────────────────────────────
  let contact = await findExistingContact(supabaseAdmin(), accountId, normalizedPhone)
  let wasCreated = false

  if (!contact) {
    const { data: newContact, error: contactError } = await supabaseAdmin()
      .from('contacts')
      .insert({
        account_id: accountId,
        user_id: userId,
        phone: normalizedPhone,
        name: event.senderName ?? undefined,
      })
      .select()
      .single()

    if (contactError) {
      if (isUniqueViolation(contactError)) {
        contact = await findExistingContact(supabaseAdmin(), accountId, normalizedPhone)
      } else {
        console.error('[wapi-webhook] failed to create contact:', contactError)
        return
      }
    } else {
      contact = newContact
      wasCreated = true
    }
  }

  if (!contact) {
    console.error('[wapi-webhook] contact not found after insert race')
    return
  }

  // ── UTM + GCLID attribution from tracking link ─────────────────────────
  if (event.text) {
    if (!contact.tracking_link_id) {
      const refMatch = event.text.match(/#ref-([a-z0-9]{6})/i)
      if (refMatch) {
        const refCode = refMatch[1].toLowerCase()
        const { data: trackingLink } = await supabaseAdmin()
          .from('tracking_links')
          .select('*')
          .eq('code', refCode)
          .eq('account_id', accountId)
          .maybeSingle()
        if (trackingLink) {
          const contactUpdate: Record<string, unknown> = {
            tracking_link_id: trackingLink.id,
            utm_source: trackingLink.utm_source ?? null,
            utm_medium: trackingLink.utm_medium ?? null,
            utm_campaign: trackingLink.utm_campaign ?? null,
            utm_content: trackingLink.utm_content ?? null,
            utm_term: trackingLink.utm_term ?? null,
            updated_at: new Date().toISOString(),
          }
          const gclidMatch = event.text.match(/#gclid-([A-Za-z0-9_-]+)/)
          if (gclidMatch) contactUpdate.gclid = gclidMatch[1]
          await supabaseAdmin().from('contacts').update(contactUpdate).eq('id', contact.id)
          contact = { ...contact, ...contactUpdate }
        }
      }
    } else if (!contact.gclid) {
      const gclidMatch = event.text.match(/#gclid-([A-Za-z0-9_-]+)/)
      if (gclidMatch) {
        await supabaseAdmin()
          .from('contacts')
          .update({ gclid: gclidMatch[1], updated_at: new Date().toISOString() })
          .eq('id', contact.id)
        contact = { ...contact, gclid: gclidMatch[1] }
      }
    }
  }

  // ── Find or create conversation ─────────────────────────────────────────
  let { data: conversation } = await supabaseAdmin()
    .from('conversations')
    .select('id, status, unread_count')
    .eq('account_id', accountId)
    .eq('contact_id', contact.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!conversation) {
    const { data: newConv, error: convError } = await supabaseAdmin()
      .from('conversations')
      .insert({
        account_id: accountId,
        user_id: userId,
        contact_id: contact.id,
        status: 'open',
        unread_count: 0,
      })
      .select()
      .single()

    if (convError) {
      console.error('[wapi-webhook] failed to create conversation:', convError)
      return
    }
    conversation = newConv
  }

  if (conversation.status === 'closed') {
    await supabaseAdmin()
      .from('conversations')
      .update({ status: 'open', updated_at: new Date().toISOString() })
      .eq('id', conversation.id)
  }

  // ── Content ─────────────────────────────────────────────────────────────
  let contentType: string = 'text'
  let contentText: string | null = null
  const mediaUrl: string | null = event.mediaUrl
  // Note: W-API delivers media already accessible via URL — no decrypt step needed

  if (event.text) {
    contentType = 'text'
    contentText = event.text
  } else if (event.mediaUrl) {
    contentType = event.type // 'image' | 'video' | 'audio' | 'document'
    contentText = event.caption ?? null
  } else {
    console.warn('[wapi-webhook] unsupported messageType:', event.type)
    return
  }

  // ── Insert message ───────────────────────────────────────────────────────
  const { error: msgError } = await supabaseAdmin()
    .from('messages')
    .insert({
      conversation_id: conversation.id,
      sender_type: 'customer',
      content_type: contentType,
      content_text: contentText,
      media_url: mediaUrl,
      message_id: event.messageId,
      status: 'delivered',
    })

  if (msgError) {
    console.error('[wapi-webhook] failed to insert message:', msgError)
    return
  }

  // ── Update conversation ──────────────────────────────────────────────────
  await supabaseAdmin()
    .from('conversations')
    .update({
      last_message_text: contentText ?? `[${contentType}]`,
      last_message_at: new Date().toISOString(),
      unread_count: (conversation.unread_count ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversation.id)

  // ── Stage triggers ──────────────────────────────────────────────────────
  if (contentText) {
    stageTriggerCheck({
      accountId,
      contactId: contact.id,
      messageText: contentText,
    }).catch((err) => console.error('[wapi-webhook] stage trigger error:', err))
  }

  // ── Flows ───────────────────────────────────────────────────────────────
  const { count: msgCount } = await supabaseAdmin()
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversation.id)
    .eq('sender_type', 'customer')
  const isFirstInboundMessage = (msgCount ?? 0) <= 1

  let flowConsumed = false
  try {
    const flowResult = await dispatchInboundToFlows({
      accountId,
      userId,
      contactId: contact.id,
      conversationId: conversation.id,
      message: {
        kind: 'text',
        text: contentText ?? '',
        meta_message_id: event.messageId,
      },
      isFirstInboundMessage,
    })
    flowConsumed = flowResult.consumed
  } catch (e) {
    console.error('[wapi-webhook] flows dispatch error:', e)
  }

  // ── Auto-create deal ────────────────────────────────────────────────────
  if (wasCreated) {
    autoCreateDealForNewContact({ accountId, userId, contactId: contact.id })
      .catch((err) => console.error('[wapi-webhook] auto-create deal error:', err))
  }

  // ── Automations ─────────────────────────────────────────────────────────
  const inboundText = contentText ?? ''
  const triggers: AutomationTriggerType[] = []
  if (wasCreated) triggers.push('new_contact_created')
  if (isFirstInboundMessage) triggers.push('first_inbound_message')
  if (!flowConsumed) {
    triggers.push('new_message_received', 'keyword_match')
  }

  for (const triggerType of triggers) {
    runAutomationsForTrigger({
      accountId,
      triggerType,
      contactId: contact.id,
      context: {
        message_text: inboundText,
        conversation_id: conversation.id,
        contact_name: contact.name ?? event.senderName ?? '',
      },
    }).catch((err) => console.error('[wapi-webhook] automation error:', err))
  }
}

// ─── Stage trigger check ──────────────────────────────────────────────────────

async function stageTriggerCheck({
  accountId,
  contactId,
  messageText,
}: {
  accountId: string
  contactId: string
  messageText: string
}) {
  const admin = supabaseAdmin()
  const lowerMsg = messageText.toLowerCase()

  const { data: triggers } = await admin
    .from('stage_triggers')
    .select('*, pipeline_stages(id, capi_event, pipeline_id)')
    .eq('account_id', accountId)

  if (!triggers || triggers.length === 0) return

  type TriggerRow = {
    id: string; stage_id: string; keyword: string; match_type: string;
    pipeline_stages: { id: string; capi_event: string | null; pipeline_id: string } | null;
  }

  const exactMatches = (triggers as TriggerRow[]).filter(
    (t) => t.match_type === 'exact' && lowerMsg === t.keyword.toLowerCase(),
  )
  const containsMatches = (triggers as TriggerRow[]).filter(
    (t) => t.match_type === 'contains' && lowerMsg.includes(t.keyword.toLowerCase()),
  )
  const matched = [...exactMatches, ...containsMatches][0]
  if (!matched) return

  const targetStageId: string = matched.stage_id
  const capiEvent: string | null = matched.pipeline_stages?.capi_event ?? null
  const pipelineId: string | undefined = matched.pipeline_stages?.pipeline_id

  if (!pipelineId) return
  const { data: deal } = await admin
    .from('deals')
    .select('id, stage_id, value, currency')
    .eq('account_id', accountId)
    .eq('contact_id', contactId)
    .eq('status', 'open')
    .eq('pipeline_id', pipelineId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!deal || deal.stage_id === targetStageId) return

  await admin
    .from('deals')
    .update({ stage_id: targetStageId, updated_at: new Date().toISOString() })
    .eq('id', deal.id)

  if (capiEvent) {
    await fireCapiForDeal({
      accountId,
      contactId,
      eventName: capiEvent,
      value: deal.value ?? 0,
      currency: deal.currency ?? 'BRL',
      stageId: targetStageId,
    })
  }
}

// ─── Auto-create deal for new contacts ───────────────────────────────────────

async function autoCreateDealForNewContact({
  accountId,
  userId,
  contactId,
}: {
  accountId: string
  userId: string
  contactId: string
}) {
  const admin = supabaseAdmin()

  const { data: pipelines } = await admin
    .from('pipelines')
    .select('id, name')
    .eq('user_id', userId)
    .eq('auto_create_deal', true)

  if (!pipelines?.length) return

  const { data: contact } = await admin
    .from('contacts')
    .select('name, phone')
    .eq('id', contactId)
    .maybeSingle()

  for (const pipeline of pipelines) {
    const { data: stage } = await admin
      .from('pipeline_stages')
      .select('id')
      .eq('pipeline_id', pipeline.id)
      .eq('fixed_role', 'new_lead')
      .maybeSingle()

    const stageId = stage?.id
    if (!stageId) continue

    await admin.from('deals').insert({
      account_id: accountId,
      user_id: userId,
      pipeline_id: pipeline.id,
      stage_id: stageId,
      contact_id: contactId,
      title: contact?.name ?? contact?.phone ?? 'Novo Lead',
      value: 0,
      status: 'open',
    })
  }
}
