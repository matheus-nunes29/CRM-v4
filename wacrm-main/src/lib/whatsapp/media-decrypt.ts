/**
 * WhatsApp media decryption via HKDF-SHA-256 + AES-256-CBC.
 * The mediaKey in the webhook payload encrypts all WhatsApp media.
 * Without decryption the CDN URL is an opaque binary blob — unusable directly.
 */

import { createClient } from '@supabase/supabase-js'

const HKDF_INFO: Record<string, string> = {
  image: 'WhatsApp Image Keys',
  sticker: 'WhatsApp Image Keys',
  video: 'WhatsApp Video Keys',
  audio: 'WhatsApp Audio Keys',
  ptt: 'WhatsApp Audio Keys',
  document: 'WhatsApp Document Keys',
}

/**
 * The mediaKey in Evolution webhooks can arrive in several formats.
 * This normalises them all to a Uint8Array.
 */
export function parseMediaKey(raw: unknown): Uint8Array | null {
  if (!raw) return null

  if (typeof raw === 'string') {
    try {
      const bin = atob(raw)
      const out = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
      return out
    } catch {
      return null
    }
  }

  if (Array.isArray(raw)) return new Uint8Array(raw as number[])

  if (typeof raw === 'object' && raw !== null) {
    const obj = raw as Record<string, unknown>
    // Node.js Buffer serialised as { type: 'Buffer', data: [...] }
    if (obj.type === 'Buffer' && Array.isArray(obj.data)) {
      return new Uint8Array(obj.data as number[])
    }
    // Object with numeric string keys { "0": 1, "1": 2, ... }
    const keys = Object.keys(obj)
    if (keys.length > 0 && !isNaN(Number(keys[0]))) {
      const max = Math.max(...keys.map(Number)) + 1
      const out = new Uint8Array(max)
      for (const k of keys) out[Number(k)] = obj[k] as number
      return out
    }
  }

  return null
}

/**
 * Download the encrypted CDN blob, derive keys via HKDF, decrypt with AES-CBC.
 * Returns the plaintext ArrayBuffer or null on any failure.
 */
export async function decryptWhatsAppMedia(
  encryptedUrl: string,
  mediaKeyRaw: unknown,
  mediaType: string,
): Promise<ArrayBuffer | null> {
  const mediaKeyBytes = parseMediaKey(mediaKeyRaw)
  if (!mediaKeyBytes) return null

  const infoStr = HKDF_INFO[mediaType] ?? 'WhatsApp Image Keys'
  const info = new TextEncoder().encode(infoStr)

  let encData: ArrayBuffer
  try {
    const res = await fetch(encryptedUrl)
    if (!res.ok) return null
    encData = await res.arrayBuffer()
  } catch {
    return null
  }

  // HKDF-SHA-256: derive 112 bytes (IV=16 + cipherKey=32 + macKey=32 + refKey=32)
  const rawKeyBuffer = mediaKeyBytes.buffer.slice(
    mediaKeyBytes.byteOffset,
    mediaKeyBytes.byteOffset + mediaKeyBytes.byteLength,
  ) as ArrayBuffer
  const importedKey = await crypto.subtle.importKey(
    'raw', rawKeyBuffer, 'HKDF', false, ['deriveBits'],
  )
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info },
    importedKey,
    896, // 112 bytes × 8 bits
  )
  const derived = new Uint8Array(derivedBits)

  const iv = derived.slice(0, 16)
  const cipherKey = derived.slice(16, 48)

  // WhatsApp appends a 10-byte HMAC-SHA-256 MAC — strip it before decrypting
  const ciphertext = new Uint8Array(encData).slice(0, -10)

  const cipherKeyBuffer = cipherKey.buffer.slice(
    cipherKey.byteOffset,
    cipherKey.byteOffset + cipherKey.byteLength,
  ) as ArrayBuffer
  const aesKey = await crypto.subtle.importKey(
    'raw', cipherKeyBuffer, { name: 'AES-CBC' }, false, ['decrypt'],
  )

  try {
    return await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, aesKey, ciphertext)
  } catch {
    return null
  }
}

/**
 * Upload a decrypted buffer to Supabase Storage (chat-media bucket, public).
 * Returns the public URL, or null on failure.
 */
export async function uploadChatMedia(
  buffer: ArrayBuffer,
  path: string,
  mimeType: string,
): Promise<string | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return null

  const admin = createClient(supabaseUrl, serviceKey)
  const { error } = await admin.storage
    .from('chat-media')
    .upload(path, buffer, { contentType: mimeType, upsert: true })

  if (error) {
    console.error('[media-decrypt] storage upload failed:', error.message)
    return null
  }

  return `${supabaseUrl}/storage/v1/object/public/chat-media/${path}`
}

/**
 * One-shot helper: decrypt + upload.
 * Returns the permanent public URL or null if anything fails.
 */
export async function processInboundMedia(opts: {
  encryptedUrl: string
  mediaKeyRaw: unknown
  mediaType: string
  mimeType: string | null
  accountId: string
  messageId: string
}): Promise<string | null> {
  const { encryptedUrl, mediaKeyRaw, mediaType, mimeType, accountId, messageId } = opts

  const plaintext = await decryptWhatsAppMedia(encryptedUrl, mediaKeyRaw, mediaType)
  if (!plaintext) return null

  const ext = (mimeType ?? '').split('/')[1]?.split(';')[0] ?? mediaType
  const path = `${accountId}/${messageId}.${ext}`
  const mime = mimeType ?? 'application/octet-stream'

  return uploadChatMedia(plaintext, path, mime)
}
