import { createClient } from '@supabase/supabase-js'

/**
 * Shared inbound-message pipeline for unofficial/self-hosted WhatsApp
 * providers (W-API, Evolution API — anything that isn't the Meta Cloud
 * API webhook, which has its own contact/conversation model in
 * `src/app/api/whatsapp/webhook/route.ts`). Each provider's webhook
 * route normalises its own payload shape, then calls into these
 * shared helpers so contact/conversation/message creation stays
 * identical across providers.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _admin: any = null
export function db() {
  if (!_admin) {
    _admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
  }
  return _admin
}

export async function findOrCreateContact(
  logPrefix: string,
  accountId: string,
  configOwnerUserId: string,
  phone: string,
  name: string,
) {
  const { data: existing } = await db()
    .from('contacts')
    .select('*')
    .eq('account_id', accountId)
    .eq('phone', phone)
    .eq('is_group', false)
    .maybeSingle()

  if (existing) {
    if (name && name !== existing.name) {
      await db()
        .from('contacts')
        .update({ name, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
    }
    return existing
  }

  const { data: created, error } = await db()
    .from('contacts')
    .insert({ account_id: accountId, user_id: configOwnerUserId, phone, name: name || phone, is_group: false })
    .select()
    .single()

  if (error) {
    console.error(`${logPrefix} create contact error:`, error)
    const { data: raced } = await db()
      .from('contacts')
      .select('*')
      .eq('account_id', accountId)
      .eq('phone', phone)
      .maybeSingle()
    return raced ?? null
  }
  return created
}

/**
 * `resolveName` is called only when the webhook payload didn't include
 * a real group name (falls back to the JID) — each provider passes its
 * own "fetch group info from the provider's API" implementation.
 */
export async function findOrCreateGroupContact(
  logPrefix: string,
  accountId: string,
  configOwnerUserId: string,
  groupJid: string,
  groupName: string,
  resolveName: () => Promise<string | null>,
) {
  const { data: existing } = await db()
    .from('contacts')
    .select('*')
    .eq('account_id', accountId)
    .eq('phone', groupJid)
    .eq('is_group', true)
    .maybeSingle()

  if (existing) {
    if (existing.name === groupJid) {
      console.log(`${logPrefix} group contact still has JID as name, retrying resolution for`, groupJid)
      const realName = groupName !== groupJid ? groupName : await resolveName()
      if (realName) {
        await db()
          .from('contacts')
          .update({ name: realName, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
        return { ...existing, name: realName }
      }
    }
    return existing
  }

  let resolvedName = groupName !== groupJid ? groupName : null
  if (!resolvedName) {
    resolvedName = await resolveName()
  }

  const { data: created, error } = await db()
    .from('contacts')
    .insert({
      account_id: accountId,
      user_id: configOwnerUserId,
      phone: groupJid,
      name: resolvedName || groupJid,
      is_group: true,
    })
    .select()
    .single()

  if (error) {
    console.error(`${logPrefix} create group contact error:`, error)
    const { data: raced } = await db()
      .from('contacts')
      .select('*')
      .eq('account_id', accountId)
      .eq('phone', groupJid)
      .maybeSingle()
    return raced ?? null
  }
  return created
}

export async function findOrCreateConversation(
  logPrefix: string,
  accountId: string,
  configOwnerUserId: string,
  contactId: string,
) {
  const { data: existing } = await db()
    .from('conversations')
    .select('*')
    .eq('account_id', accountId)
    .eq('contact_id', contactId)
    .maybeSingle()

  if (existing) return existing

  const { data: created, error } = await db()
    .from('conversations')
    .insert({ account_id: accountId, user_id: configOwnerUserId, contact_id: contactId })
    .select()
    .single()

  if (error) {
    console.error(`${logPrefix} create conversation error:`, error)
    return null
  }
  return created
}

export async function insertMessage(
  logPrefix: string,
  conversationId: string,
  opts: {
    contentType: string
    contentText: string | null
    mediaUrl: string | null
    msgId: string
    timestamp: string
    groupSenderName?: string
    groupSenderPhone?: string
  },
) {
  if (opts.msgId) {
    const { data: dup } = await db()
      .from('messages')
      .select('id')
      .eq('message_id', opts.msgId)
      .eq('conversation_id', conversationId)
      .maybeSingle()
    if (dup) {
      console.log(`${logPrefix} duplicate message_id, skipping:`, opts.msgId)
      return
    }
  }

  const { error } = await db()
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_type: 'customer',
      content_type: opts.contentType,
      content_text: opts.contentText,
      media_url: opts.mediaUrl,
      message_id: opts.msgId || null,
      status: 'delivered',
      created_at: opts.timestamp,
      group_sender_name: opts.groupSenderName ?? null,
      group_sender_phone: opts.groupSenderPhone ?? null,
    })

  if (error) {
    console.error(`${logPrefix} insert message error:`, error)
    return
  }

  console.log(`${logPrefix} message inserted for conversation:`, conversationId)

  await db()
    .from('conversations')
    .update({
      last_message_text: opts.contentText || `[${opts.contentType}]`,
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId)

  await db().rpc('increment_unread_count', { conv_id: conversationId })
    .then(({ error: rpcErr }: { error: unknown }) => {
      if (rpcErr) console.error(`${logPrefix} increment_unread_count error:`, rpcErr)
    })
}

/**
 * Normalise a raw WhatsApp phone/JID: strip provider-specific suffixes,
 * add "+" prefix for plain numbers. Group JIDs (ending @g.us) are
 * returned as-is.
 */
export function normalisePhone(raw: string): string {
  if (!raw) return ''
  if (raw.endsWith('@g.us')) return raw
  const stripped = raw.replace(/@(s\.whatsapp\.net|c\.us|lid)$/, '')
  if (!stripped.startsWith('+') && /^\d+$/.test(stripped)) {
    return '+' + stripped
  }
  return stripped
}
