import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  sendTextMessage,
  sendTemplateMessage,
  sendMediaMessage,
  type MediaKind,
} from '@/lib/whatsapp/meta-api'
import { decrypt, encrypt, isLegacyFormat } from '@/lib/whatsapp/encryption'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import {
  sanitizePhoneForMeta,
  isValidE164,
  phoneVariants,
  isRecipientNotAllowedError,
} from '@/lib/whatsapp/phone-utils'
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit'
import type { MessageTemplate } from '@/types'
import { isMessageTemplate } from '@/lib/whatsapp/template-row-guard'

const WAPI_INSTANCE_ID = process.env.WAPI_INSTANCE_ID ?? ''
const WAPI_TOKEN = process.env.WAPI_TOKEN ?? ''
const WAPI_API_KEY = process.env.WAPI_API_KEY ?? ''
const WAPI_BASE_URL = 'https://api.w-api.app'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Per-user rate limit. Bucket key is scoped to this route so
    // `/broadcast` has an independent budget.
    const limit = checkRateLimit(`send:${user.id}`, RATE_LIMITS.send)
    if (!limit.success) {
      return rateLimitResponse(limit)
    }

    // Resolve the caller's account_id. Every downstream lookup
    // (conversation, whatsapp_config, message_templates) is account-
    // scoped post-multi-user, so the previous `user_id` filters
    // returned nothing for teammates who didn't author the row.
    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle()
    const accountId = profile?.account_id as string | undefined
    if (!accountId) {
      return NextResponse.json(
        { error: 'Your profile is not linked to an account.' },
        { status: 403 },
      )
    }

    const body = await request.json()
    const {
      conversation_id,
      message_type,
      content_text,
      media_url,
      filename,
      template_name,
      template_language,
      template_params,
      template_message_params,
      reply_to_message_id,
    } = body

    if (!conversation_id || !message_type) {
      return NextResponse.json(
        { error: 'conversation_id and message_type are required' },
        { status: 400 }
      )
    }

    // Media kinds (image/video/document/audio) are sent to Meta via a
    // public URL the composer already uploaded to the chat-media bucket.
    const MEDIA_KINDS = ['image', 'video', 'document', 'audio'] as const
    const isMediaKind = (MEDIA_KINDS as readonly string[]).includes(message_type)

    // Reject anything outside the known set up front rather than letting
    // an unknown type fall through to the text path with empty content.
    const VALID_MESSAGE_TYPES = ['text', 'template', ...MEDIA_KINDS] as const
    if (!(VALID_MESSAGE_TYPES as readonly string[]).includes(message_type)) {
      return NextResponse.json(
        { error: `Unsupported message_type "${message_type}"` },
        { status: 400 }
      )
    }

    if (message_type === 'text' && !content_text) {
      return NextResponse.json(
        { error: 'content_text is required for text messages' },
        { status: 400 }
      )
    }

    if (message_type === 'template' && !template_name) {
      return NextResponse.json(
        { error: 'template_name is required for template messages' },
        { status: 400 }
      )
    }

    if (isMediaKind && !media_url) {
      return NextResponse.json(
        { error: `media_url is required for ${message_type} messages` },
        { status: 400 }
      )
    }

    // Meta caps media captions at 1024 chars; reject before the upload is
    // wasted at the Meta call. (Audio carries no caption — see meta-api.)
    if (
      isMediaKind &&
      message_type !== 'audio' &&
      typeof content_text === 'string' &&
      content_text.length > 1024
    ) {
      return NextResponse.json(
        { error: 'Caption exceeds the 1024-character limit' },
        { status: 400 }
      )
    }

    // Fetch conversation and contact
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*, contact:contacts(*)')
      .eq('id', conversation_id)
      .eq('account_id', accountId)
      .single()

    if (convError || !conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      )
    }

    const contact = conversation.contact
    if (!contact?.phone) {
      return NextResponse.json(
        { error: 'Contact phone number not found' },
        { status: 400 }
      )
    }

    // Sanitize and validate phone
    const sanitizedPhone = sanitizePhoneForMeta(contact.phone)
    if (!isValidE164(sanitizedPhone)) {
      return NextResponse.json(
        { error: 'Invalid phone number format' },
        { status: 400 }
      )
    }

    // Fetch and decrypt WhatsApp config
    const { data: config, error: configError } = await supabase
      .from('whatsapp_config')
      .select('*')
      .eq('account_id', accountId)
      .single()

    if (configError || !config) {
      return NextResponse.json(
        { error: 'WhatsApp not configured. Please set up your WhatsApp integration first.' },
        { status: 400 }
      )
    }

    // ── W-API path ─────────────────────────────────────────────────────────
    if (config.provider === 'wapi') {
      if (!WAPI_TOKEN || !WAPI_API_KEY || !WAPI_INSTANCE_ID) {
        return NextResponse.json(
          { error: 'W-API credentials not configured on server.' },
          { status: 503 },
        )
      }

      const wapiSendHeaders = {
        Authorization: `Bearer ${WAPI_TOKEN}`,
        'Content-Type': 'application/json',
      }

      // Prefer LID for privacy contacts (stored on the contact row)
      const targetPhone: string =
        (contact as Record<string, unknown>).wapi_lid as string | undefined ??
        sanitizedPhone.replace(/\D/g, '')

      let wapiMessageId = ''
      try {
        let endpoint = `${WAPI_BASE_URL}/v1/message/send-text?instanceId=${WAPI_INSTANCE_ID}`
        let wapiBody: Record<string, unknown> = { phone: targetPhone, message: content_text, delayMessage: 0 }

        if (isMediaKind && media_url) {
          const mediaFieldMap: Record<string, string> = {
            image: 'image',
            video: 'video',
            audio: 'audio',
            document: 'document',
          }
          const mediaField = mediaFieldMap[message_type] ?? 'image'
          endpoint = `${WAPI_BASE_URL}/v1/message/send-${message_type}?instanceId=${WAPI_INSTANCE_ID}`
          wapiBody = {
            phone: targetPhone,
            [mediaField]: media_url,
            caption: content_text || undefined,
            delayMessage: 0,
            ...(message_type === 'document' && filename
              ? { fileName: filename, extension: filename.split('.').pop() ?? '' }
              : {}),
          }
        }

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: wapiSendHeaders,
          body: JSON.stringify(wapiBody),
        })
        const raw = await res.text()
        console.log(`[wapi/send] ${endpoint} → ${res.status} | ${raw.slice(0, 300)}`)
        let data: Record<string, unknown>
        try { data = JSON.parse(raw) as Record<string, unknown> } catch { data = { _raw: raw.slice(0, 200) } }
        if (!res.ok) throw new Error(String(data.message ?? data.error ?? `W-API ${res.status}`))
        wapiMessageId = String(data.messageId ?? data.id ?? data.zapMessageId ?? '')
      } catch (err) {
        const message = err instanceof Error ? err.message : 'W-API error'
        console.error('[wapi/send] failed:', message)
        return NextResponse.json({ error: `W-API error: ${message}` }, { status: 502 })
      }

      const { data: msgRecord, error: msgError } = await supabase
        .from('messages')
        .insert({
          conversation_id,
          sender_type: 'agent',
          content_type: message_type,
          content_text: content_text || null,
          media_url: media_url || null,
          message_id: wapiMessageId || null,
          status: 'sent',
        })
        .select()
        .single()

      if (msgError) {
        console.error('[wapi/send] messages insert error:', msgError)
      }

      // Also write to whatsapp_mensagens for W-API history
      await supabase.from('whatsapp_mensagens').insert({
        account_id: accountId,
        contact_id: contact.id,
        conversation_id,
        body: content_text || null,
        direcao: 'enviada',
        media_url: media_url || null,
        media_type: isMediaKind ? message_type : null,
        wapi_message_id: wapiMessageId || null,
        lida: true,
      })

      await supabase
        .from('conversations')
        .update({
          last_message_text: content_text || `[${message_type}]`,
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversation_id)

      return NextResponse.json({
        success: true,
        message_id: msgRecord?.id,
        whatsapp_message_id: wapiMessageId,
      })
    }

    let waMessageId = ''
    const workingPhone = sanitizedPhone

    {
      // ── Meta API path ───────────────────────────────────────────────────
      const accessToken = decrypt(config.access_token)

      // Self-heal legacy CBC-encrypted tokens.
      if (isLegacyFormat(config.access_token)) {
        void supabase
          .from('whatsapp_config')
          .update({ access_token: encrypt(accessToken) })
          .eq('id', config.id)
          .then(({ error }) => {
            if (error) {
              console.warn('[whatsapp/send] access_token GCM upgrade failed:', error.message)
            }
          })
      }

      // Resolve reply target
      let contextMessageId: string | undefined
      if (reply_to_message_id) {
        const { data: parent, error: parentError } = await supabase
          .from('messages')
          .select('message_id, conversation_id')
          .eq('id', reply_to_message_id)
          .eq('conversation_id', conversation_id)
          .maybeSingle()

        if (parentError || !parent) {
          return NextResponse.json(
            { error: 'reply_to_message_id not found in this conversation' },
            { status: 400 }
          )
        }
        if (!parent.message_id) {
          console.warn('[whatsapp/send] reply target has no Meta message_id; sending without context')
        } else {
          contextMessageId = parent.message_id
        }
      }

      let templateRow: MessageTemplate | null = null
      if (message_type === 'template' && template_name) {
        const { data } = await supabase
          .from('message_templates')
          .select('*')
          .eq('account_id', accountId)
          .eq('name', template_name)
          .eq('language', template_language || 'en_US')
          .maybeSingle()
        if (data && !isMessageTemplate(data)) {
          return NextResponse.json(
            { error: 'Template row is malformed locally — run "Sync from Meta" in Settings to repair it.' },
            { status: 500 },
          )
        }
        templateRow = data ?? null
      }

      // Auto-resolve template params from contact fields when the template
      // has variable_mappings (avoids the caller having to pass params manually).
      const resolvedParams = (() => {
        const mappings = templateRow?.variable_mappings
        if (!mappings || mappings.length === 0) return template_params || []
        return mappings
          .slice()
          .sort((a, b) => a.index - b.index)
          .map(({ source }, i) => {
            switch (source) {
              case 'contact.name': return contact.name ?? ''
              case 'contact.phone': return contact.phone ?? ''
              case 'contact.email': return (contact as Record<string, unknown>).email as string ?? ''
              case 'contact.company': return (contact as Record<string, unknown>).company as string ?? ''
              default: return (template_params || [])[i] ?? ''
            }
          })
      })()

      const attempt = async (phone: string): Promise<string> => {
        if (message_type === 'template') {
          const result = await sendTemplateMessage({
            phoneNumberId: config.phone_number_id,
            accessToken,
            to: phone,
            templateName: template_name,
            language: template_language || 'en_US',
            template: templateRow ?? undefined,
            messageParams: template_message_params ?? undefined,
            params: resolvedParams,
            contextMessageId,
          })
          return result.messageId
        }
        if (isMediaKind) {
          const result = await sendMediaMessage({
            phoneNumberId: config.phone_number_id,
            accessToken,
            to: phone,
            kind: message_type as MediaKind,
            link: media_url,
            caption: content_text || undefined,
            filename: filename || undefined,
            contextMessageId,
          })
          return result.messageId
        }
        const result = await sendTextMessage({
          phoneNumberId: config.phone_number_id,
          accessToken,
          to: phone,
          text: content_text,
          contextMessageId,
        })
        return result.messageId
      }

      try {
        const variants = phoneVariants(sanitizedPhone)
        let lastError: unknown = null

        for (const variant of variants) {
          try {
            waMessageId = await attempt(variant)
            lastError = null
            break
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            if (!isRecipientNotAllowedError(message)) throw err
            lastError = err
            console.warn(`[whatsapp/send] variant "${variant}" rejected by Meta, trying next…`)
          }
        }

        if (lastError) throw lastError
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown Meta API error'
        console.error('Meta API send failed for all variants:', message)
        return NextResponse.json(
          { error: `Meta API error: ${message}` },
          { status: 502 },
        )
      }

      // Auto-correct contact phone if a variant succeeded
      if (workingPhone !== sanitizedPhone) {
        console.log(`[whatsapp/send] Auto-corrected contact phone: ${sanitizedPhone} → ${workingPhone}`)
        await supabase
          .from('contacts')
          .update({ phone: workingPhone })
          .eq('id', contact.id)
      }
    }

    // Insert message into DB — field names MUST match the messages schema
    // (see supabase/migrations/001_initial_schema.sql):
    //   conversation_id, sender_type, content_type, content_text,
    //   media_url, template_name, message_id, status, created_at
    const { data: messageRecord, error: msgError } = await supabase
      .from('messages')
      .insert({
        conversation_id,
        sender_type: 'agent',
        content_type: message_type,
        content_text: content_text || null,
        media_url: media_url || null,
        template_name: template_name || null,
        message_id: waMessageId,
        status: 'sent',
        reply_to_message_id: reply_to_message_id || null,
      })
      .select()
      .single()

    if (msgError) {
      console.error('Error inserting sent message:', msgError)
      return NextResponse.json(
        { error: `Message sent to Meta but failed to save to DB: ${msgError.message}` },
        { status: 500 }
      )
    }

    // Update conversation
    await supabase
      .from('conversations')
      .update({
        last_message_text: content_text || `[${message_type}]`,
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversation_id)

    // Pause any active Flow run for this contact — the agent stepping
    // in is the strongest "yield, human is here" signal. See PR #2
    // plan for why we pause (not end): preserves diagnostic state +
    // lets the agent or the 24h timeout sweep cleanly resolve the
    // run later. For accounts with no active runs the UPDATE matches
    // zero rows — cheap and harmless.
    try {
      const { error: pauseErr } = await supabaseAdmin()
        .from('flow_runs')
        .update({
          status: 'paused_by_agent',
          ended_at: new Date().toISOString(),
          end_reason: 'agent_replied',
        })
        .eq('account_id', accountId)
        .eq('contact_id', contact.id)
        .eq('status', 'active')
      if (pauseErr) {
        // Best-effort — log + continue. The agent's message already
        // landed at Meta; don't fail the response over a bookkeeping
        // miss. Worst case: a stale active run gets caught by the
        // stale-run cron sweep within 24h.
        console.error('[flows] pause-on-agent-send failed:', pauseErr.message)
      }
    } catch (err) {
      console.error(
        '[flows] pause-on-agent-send threw:',
        err instanceof Error ? err.message : err,
      )
    }

    return NextResponse.json({
      success: true,
      message_id: messageRecord.id,
      whatsapp_message_id: waMessageId,
    })
  } catch (error) {
    console.error('Error in WhatsApp send POST:', error)
    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 500 }
    )
  }
}
