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
import {
  normalizeEvolutionWebhook,
  type EvolutionUpsertEvent,
  type EvolutionUpdateEvent,
} from '@/lib/whatsapp/evolution-api'
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
    await handleStatusUpdate(event)
    return
  }

  if (event.kind === 'upsert') {
    await handleInboundMessage(event, accountId, userId)
  }
}

// ── Status updates ─────────────────────────────────────────────────────────

async function handleStatusUpdate(event: EvolutionUpdateEvent) {
  if (!event.messageId) return

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

function isForwardMove(current: string, incoming: string): boolean {
  const ladder = ['sent', 'delivered', 'read']
  if (incoming === 'failed') return current === 'sent'
  const ci = ladder.indexOf(current)
  const ni = ladder.indexOf(incoming)
  return ni > ci
}

// ── Inbound messages ────────────────────────────────────────────────────────

async function handleInboundMessage(
  event: EvolutionUpsertEvent,
  accountId: string,
  userId: string,
) {
  // Skip echoes of outbound messages
  if (event.fromMe) return
  // Skip group messages
  if (event.remoteJid.endsWith('@g.us')) return

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
  const mediaUrl: string | null = event.mediaUrl

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
      },
    }).catch((err) => console.error('[evolution-webhook] automation error:', err))
  }
}
