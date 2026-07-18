import { hkdfSync, createDecipheriv } from 'crypto'
import { db } from './inbound-message'

/**
 * WhatsApp (Baileys-protocol) media decryption.
 *
 * Evolution API — like every unofficial/self-hosted WhatsApp API built
 * on Baileys — hands back the *encrypted* CDN URL (`....enc?...`) plus
 * a `mediaKey`, not a ready-to-view file, regardless of the
 * `webhookBase64` setting (that flag only affects whether Evolution
 * inlines its own re-encoded copy for some message types; the raw
 * WhatsApp media URL is still encrypted at rest).
 *
 * Algorithm (same for every media type, standard WhatsApp/Signal
 * protocol derivation — see Baileys' `Utils/messages-media.ts` for the
 * reference implementation this mirrors):
 *   1. HKDF-SHA256(mediaKey, salt=empty, info=<type-specific string>, 112 bytes)
 *   2. Split into iv (16B) / cipherKey (32B) / macKey (32B) / refKey (32B, unused)
 *   3. Downloaded bytes = ciphertext + 10-byte MAC suffix — strip the MAC
 *   4. AES-256-CBC decrypt ciphertext with cipherKey + iv
 */

const MEDIA_KEY_INFO: Record<string, string> = {
  image: 'WhatsApp Image Keys',
  video: 'WhatsApp Video Keys',
  audio: 'WhatsApp Audio Keys',
  document: 'WhatsApp Document Keys',
}

/**
 * Evolution API's JSON encoding of protobuf `bytes` fields (mediaKey,
 * fileSha256, etc.) is inconsistent across message types: sometimes a
 * base64 string, sometimes a `{"0":1,"1":2,...}` array-like object (a
 * JS Buffer serialized field-by-field). Normalise both to a Buffer.
 */
function toBuffer(input: unknown): Buffer {
  if (Buffer.isBuffer(input)) return input
  if (typeof input === 'string') return Buffer.from(input, 'base64')
  if (Array.isArray(input)) return Buffer.from(input)
  if (input && typeof input === 'object') {
    const bytes = Object.keys(input as Record<string, number>)
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => (input as Record<string, number>)[k])
    return Buffer.from(bytes)
  }
  throw new Error(`Cannot convert mediaKey of type ${typeof input} to Buffer`)
}

export async function decryptWhatsAppMedia(
  encryptedUrl: string,
  mediaKeyInput: unknown,
  mediaType: 'image' | 'video' | 'audio' | 'document',
): Promise<Buffer> {
  const res = await fetch(encryptedUrl)
  if (!res.ok) throw new Error(`Failed to download encrypted media: ${res.status}`)
  const encrypted = Buffer.from(await res.arrayBuffer())

  const mediaKey = toBuffer(mediaKeyInput)
  const info = MEDIA_KEY_INFO[mediaType] ?? MEDIA_KEY_INFO.document
  const expanded = Buffer.from(hkdfSync('sha256', mediaKey, Buffer.alloc(0), info, 112))

  const iv = expanded.subarray(0, 16)
  const cipherKey = expanded.subarray(16, 48)

  // Last 10 bytes are a MAC over (iv + ciphertext); not verified here —
  // a corrupt/tampered download simply fails to decrypt cleanly (AES-CBC
  // padding error) or renders as garbage, which is an acceptable failure
  // mode for inbound chat media (not a security boundary).
  const ciphertext = encrypted.subarray(0, encrypted.length - 10)

  const decipher = createDecipheriv('aes-256-cbc', cipherKey, iv)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}

/**
 * Decrypt + re-host inbound WhatsApp media in the `whatsapp-media`
 * Supabase Storage bucket (service-role write, public read — see
 * `034_whatsapp_media_bucket.sql`), returning the public URL to store
 * on the message row. Returns null on any failure — callers should
 * treat that as "message arrived, media unavailable" rather than
 * failing the whole webhook.
 */
export async function decryptAndStoreMedia(
  logPrefix: string,
  encryptedUrl: string,
  mediaKeyInput: unknown,
  mediaType: 'image' | 'video' | 'audio' | 'document',
  mimetype: string | undefined,
  accountId: string,
): Promise<string | null> {
  try {
    const bytes = await decryptWhatsAppMedia(encryptedUrl, mediaKeyInput, mediaType)
    // WhatsApp sends codec params on the mimetype (e.g. "audio/ogg;
    // codecs=opus") that the storage bucket's allow-list doesn't match
    // exactly — strip to the bare type/subtype before storing.
    const bareMimetype = mimetype?.split(';')[0]?.trim()
    const ext = bareMimetype?.split('/')[1] ?? 'bin'
    const path = `${accountId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

    const { error } = await db().storage
      .from('whatsapp-media')
      .upload(path, bytes, { contentType: bareMimetype ?? 'application/octet-stream', upsert: false })

    if (error) {
      console.error(`${logPrefix} media upload error:`, error)
      return null
    }

    const { data: pub } = db().storage.from('whatsapp-media').getPublicUrl(path)
    return pub.publicUrl
  } catch (err) {
    console.error(`${logPrefix} media decrypt/store failed:`, err instanceof Error ? err.message : err)
    return null
  }
}
