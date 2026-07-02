/**
 * POST /api/whatsapp/webhook/evolution
 *
 * Evolution API webhook receiver. Evolution sends all events here via
 * HTTP POST with the instance name in the payload.
 *
 * Register this URL in Evolution:
 *   Webhooks → set URL to https://yourdomain.com/api/whatsapp/webhook/evolution
 *   Events: messages.upsert, messages.update
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normalizePhone } from '@/lib/whatsapp/phone-utils'
import { findExistingContact, isUniqueViolation } from '@/lib/contacts/dedupe'
import { runAutomationsForTrigger } from '@/lib/automations/engine'
import { dispatchInboundToFlows } from '@/lib/flows/engine'
import { fireCapiForDeal } from '@/lib/capi/fire-for-deal'
import {
  normalizeEvolutionWebhook,
  jidToPhone,
  type EvolutionUpsertEvent,
  type EvolutionUpdateEvent,
  type EvolutionChatsUpdateEvent,
} from '@/lib/whatsapp/evolution-api'
import { processInboundMedia } from '@/lib/whatsapp/media-decrypt'
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

export async function POST(request: Request) {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const event = normalizeEvolutionWebhook(raw)

  try {
    await processEvolutionEvent(event)
  } catch (err) {
    console.error('[evolution-webhook] processing error:', err)
  }

  return NextResponse.json({ status: 'received' }, { status: 200 })
}

async function processEvolutionEvent(
  event: ReturnType<typeof normalizeEvolutionWebhook>,
) {
  if (event.kind === 'other') return

  // Find config row by instance name
  const { data: configs, error: configError } = await supabaseAdmin()
    .from('whatsapp_config')
    .select('*')
    .eq('evolution_instance_name', event.instanceName)
    .eq('provider', 'evolution')

  if (configError || !configs || configs.length === 0) {
    console.error('[evolution-webhook] no config found for instance:', event.instanceName)
    return
  }

  if (configs.length > 1) {
    console.error('[evolution-webhook] multiple configs for instance:', event.instanceName, '— event dropped')
    return
  }

  const config = configs[0]
  const accountId: string = config.account_id
  const userId: string = config.user_id

  if (event.kind === 'update') {
    await handleStatusUpdate(event, accountId)
    return
  }

  if (event.kind === 'chats_update') {
    await handleChatsUpdate(event, accountId)
    return
  }

  if (event.kind === 'upsert') {
    if (event.fromMe) {
      await handleOutboundEcho(event, accountId, userId)
    } else {
      await handleInboundMessage(event, accountId, userId)
    }
  }
}

// ── Status updates ─────────────────────────────────────────────────────────

async function handleStatusUpdate(event: EvolutionUpdateEvent, accountId: string) {
  if (!event.messageId) return

  // Agent read a customer message on their phone → zero out unread count
  if (!event.fromMe && event.status === 'read' && event.remoteJid) {
    const phone = jidToPhone(event.remoteJid)
    if (phone && !event.remoteJid.endsWith('@g.us')) {
      await zeroUnreadByPhone(accountId, phone)
    }
    return
  }

  const statusMap: Record<string, string> = {
    sent: 'sent',
    delivered: 'delivered',
    read: 'read',
    failed: 'failed',
  }
  const newStatus = statusMap[event.status] ?? 'sent'

  const { data: msg } = await supabaseAdmin()
    .from('messages')
    .select('id, status')
    .eq('message_id', event.messageId)
    .maybeSingle()

  if (!msg) return

  const current = msg.status as string
  if (!isForwardMove(current, newStatus)) return

  await supabaseAdmin()
    .from('messages')
    .update({ status: newStatus })
    .eq('id', msg.id)
}

// ── Chats update (phone marked conversation as read) ───────────────────────

async function handleChatsUpdate(event: EvolutionChatsUpdateEvent, accountId: string) {
  if (!event.jid || event.jid.endsWith('@g.us')) return
  if (event.unreadCount !== 0) return

  const phone = jidToPhone(event.jid)
  if (!phone) return
  await zeroUnreadByPhone(accountId, phone)
}

// ── Helper: set unread_count = 0 for all conversations with this phone ─────

async function zeroUnreadByPhone(accountId: string, phone: string) {
  const normalized = phone.startsWith('+') ? phone : `+${phone}`

  const { data: contact } = await supabaseAdmin()
    .from('contacts')
    .select('id')
    .eq('account_id', accountId)
    .eq('phone', normalized)
    .maybeSingle()

  if (!contact) return

  await supabaseAdmin()
    .from('conversations')
    .update({ unread_count: 0, updated_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('contact_id', contact.id)
    .gt('unread_count', 0)
}

function isForwardMove(current: string, incoming: string): boolean {
  const ladder = ['sent', 'delivered', 'read']
  if (incoming === 'failed') return current === 'sent'
  const ci = ladder.indexOf(current)
  const ni = ladder.indexOf(incoming)
  return ni > ci
}

// ── Outbound echo (sent from the phone, not from CRM) ──────────────────────

async function handleOutboundEcho(
  event: EvolutionUpsertEvent,
  accountId: string,
  userId: string,
) {
  // Skip group messages
  if (event.remoteJid.endsWith('@g.us')) return

  // Deduplicate: if the CRM already inserted this message (via /api/whatsapp/send),
  // the message_id will already exist in the DB — skip to avoid duplicate rows.
  if (event.messageId) {
    const { data: existing } = await supabaseAdmin()
      .from('messages')
      .select('id')
      .eq('message_id', event.messageId)
      .maybeSingle()
    if (existing) return
  }

  // Bail out before creating any contact/conversation rows for message types
  // we don't persist (stickers, polls, location, view-once, etc.) — otherwise
  // we leave behind an empty "ghost" conversation with no message.
  if (!event.text && !event.mediaType) {
    console.warn('[evolution-webhook] echo: unsupported messageType, skipping:', event.messageType)
    return
  }

  const rawPhone = event.phone
  if (!rawPhone) return
  const phone = rawPhone.startsWith('+') ? rawPhone : `+${rawPhone}`
  const normalizedPhone = normalizePhone(phone)

  // Find or create contact
  // Do NOT use pushName here — when fromMe=true, pushName is the account owner's
  // own name, not the contact's name. Leave name undefined so the contact is
  // created with just the phone number and can be named later.
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
        console.error('[evolution-webhook] echo: failed to create contact:', error)
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
      console.error('[evolution-webhook] echo: failed to create conversation:', convError)
      return
    }
    conversation = newConv
  }

  // Determine content
  let contentType = 'text'
  let contentText: string | null = null
  let mediaUrl: string | null = event.mediaUrl
  if (event.mediaUrl && event.mediaKey && event.mediaType) {
    const decrypted = await processInboundMedia({
      encryptedUrl: event.mediaUrl,
      mediaKeyRaw: event.mediaKey,
      mediaType: event.mediaType,
      mimeType: event.mimeType,
      accountId,
      messageId: event.messageId,
    })
    if (decrypted) mediaUrl = decrypted
  }

  if (event.text) {
    contentType = 'text'
    contentText = event.text
  } else if (event.mediaType) {
    contentType = event.mediaType
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

  // Update conversation last message (no unread increment for agent messages)
  await supabaseAdmin()
    .from('conversations')
    .update({
      last_message_text: contentText ?? `[${contentType}]`,
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversation.id)
}

// ── Inbound messages ────────────────────────────────────────────────────────

async function handleInboundMessage(
  event: EvolutionUpsertEvent,
  accountId: string,
  userId: string,
) {
  // Skip group messages
  if (event.remoteJid.endsWith('@g.us')) return

  // Bail out before creating any contact/conversation rows for message types
  // we don't persist (stickers, polls, location, view-once, etc.) — otherwise
  // we leave behind an empty "ghost" conversation with no message.
  if (!event.text && !event.mediaType) {
    console.warn('[evolution-webhook] unsupported messageType, skipping:', event.messageType)
    return
  }

  const rawPhone = event.phone
  if (!rawPhone) return

  const phone = rawPhone.startsWith('+') ? rawPhone : `+${rawPhone}`
  const normalizedPhone = normalizePhone(phone)

  // ── Find or create contact ──────────────────────────────────────────
  let contact = await findExistingContact(supabaseAdmin(), accountId, normalizedPhone)
  let wasCreated = false

  if (!contact) {
    const { data: newContact, error: contactError } = await supabaseAdmin()
      .from('contacts')
      .insert({
        account_id: accountId,
        user_id: userId,
        phone: normalizedPhone,
        name: event.pushName ?? undefined,
      })
      .select()
      .single()

    if (contactError) {
      if (isUniqueViolation(contactError)) {
        contact = await findExistingContact(supabaseAdmin(), accountId, normalizedPhone)
      } else {
        console.error('[evolution-webhook] failed to create contact:', contactError)
        return
      }
    } else {
      contact = newContact
      wasCreated = true
    }
  }

  if (!contact) {
    console.error('[evolution-webhook] contact not found after insert race')
    return
  }

  // ── UTM + GCLID attribution from tracking link ─────────────────────
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
          // Extract GCLID embedded in the message (#gclid-VALUE)
          const gclidMatch = event.text.match(/#gclid-([A-Za-z0-9_-]+)/)
          if (gclidMatch) contactUpdate.gclid = gclidMatch[1]
          await supabaseAdmin().from('contacts').update(contactUpdate).eq('id', contact.id)
          // Refresh local contact so trigger checks below see updated fields
          contact = { ...contact, ...contactUpdate }
        }
      }
    } else if (!contact.gclid) {
      // Contact already attributed — still capture GCLID if not yet set
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

  // ── Find or create conversation ─────────────────────────────────────
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
      console.error('[evolution-webhook] failed to create conversation:', convError)
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

  // ── Content ──────────────────────────────────────────────────────────
  let contentType: string = 'text'
  let contentText: string | null = null
  let mediaUrl: string | null = event.mediaUrl
  if (event.mediaUrl && event.mediaKey && event.mediaType) {
    const decrypted = await processInboundMedia({
      encryptedUrl: event.mediaUrl,
      mediaKeyRaw: event.mediaKey,
      mediaType: event.mediaType,
      mimeType: event.mimeType,
      accountId,
      messageId: event.messageId,
    })
    if (decrypted) mediaUrl = decrypted
  }

  if (event.text) {
    contentType = 'text'
    contentText = event.text
  } else if (event.mediaType) {
    contentType = event.mediaType
    contentText = event.caption ?? null
  } else {
    console.warn('[evolution-webhook] unsupported messageType:', event.messageType)
    return
  }

  // ── Insert message ───────────────────────────────────────────────────
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
    console.error('[evolution-webhook] failed to insert message:', msgError)
    return
  }

  // ── Update conversation ──────────────────────────────────────────────
  await supabaseAdmin()
    .from('conversations')
    .update({
      last_message_text: contentText ?? `[${contentType}]`,
      last_message_at: new Date().toISOString(),
      unread_count: (conversation.unread_count ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversation.id)

  // ── Stage triggers (frases gatilho) ──────────────────────────────────
  // When the message text matches a configured keyword, advance the contact's
  // open deal to the associated stage and fire the corresponding CAPI event.
  if (contentText) {
    stageTriggerCheck({
      accountId,
      contactId: contact.id,
      messageText: contentText,
    }).catch((err) => console.error('[evolution-webhook] stage trigger error:', err))
  }

  // ── Flows ─────────────────────────────────────────────────────────────
  // Check if this contact's first inbound message
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
    console.error('[evolution-webhook] flows dispatch error:', e)
  }

  // ── Auto-create deal (per-pipeline setting) ──────────────────────────
  if (wasCreated) {
    autoCreateDealForNewContact({ accountId, userId, contactId: contact.id })
      .catch((err) => console.error('[evolution-webhook] auto-create deal error:', err))
  }

  // ── Automations ───────────────────────────────────────────────────────
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
        contact_name: contact.name ?? event.pushName ?? '',
      },
    }).catch((err) => console.error('[evolution-webhook] automation error:', err))
  }
}

// ── Stage trigger check ─────────────────────────────────────────────────────

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

  // Fetch all triggers for the account with their stage CAPI event
  const { data: triggers } = await admin
    .from('stage_triggers')
    .select('*, pipeline_stages(id, capi_event, pipeline_id)')
    .eq('account_id', accountId)

  if (!triggers || triggers.length === 0) return

  type TriggerRow = {
    id: string; stage_id: string; keyword: string; match_type: string;
    pipeline_stages: { id: string; capi_event: string | null; pipeline_id: string } | null;
  }

  // Match: exact first, then contains
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

  // Find the contact's open deal in the same pipeline
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

// ── Auto-create deal for new contacts ──────────────────────────────────────

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

  // Find pipelines with auto_create_deal enabled for this account
  const { data: pipelines } = await admin
    .from('pipelines')
    .select('id, name')
    .eq('user_id', userId)
    .eq('auto_create_deal', true)

  if (!pipelines?.length) return

  // Get the contact name for the deal title
  const { data: contact } = await admin
    .from('contacts')
    .select('name, phone')
    .eq('id', contactId)
    .maybeSingle()

  for (const pipeline of pipelines) {
    // Find the "new_lead" fixed stage (first entry in funnel)
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
