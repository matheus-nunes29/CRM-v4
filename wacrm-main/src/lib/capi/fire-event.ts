import crypto from 'crypto'

export interface CapiEventPayload {
  pixelId: string
  accessToken: string
  testEventCode?: string | null
  /** Meta standard or custom event name, e.g. 'Purchase', 'Lead', 'Contact'. */
  eventName: string
  phone: string
  name?: string | null
  email?: string | null
  /** Required for Purchase; optional for other events. */
  currency?: string
  /** Required for Purchase; optional for other events. */
  value?: number
  utmSource?: string | null
  utmMedium?: string | null
  utmCampaign?: string | null
  utmContent?: string | null
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex')
}

function hashPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  const normalized = digits.length <= 11 ? `55${digits.replace(/^0/, '')}` : digits
  return sha256(normalized)
}

export async function fireCapiEvent(payload: CapiEventPayload): Promise<void> {
  const {
    pixelId, accessToken, testEventCode,
    eventName, phone, name, email, currency, value,
    utmSource, utmMedium, utmCampaign, utmContent,
  } = payload

  const userData: Record<string, string[]> = {
    ph: [hashPhone(phone)],
  }
  if (name?.trim()) userData.fn = [sha256(name.trim())]
  if (email?.trim()) userData.em = [sha256(email.trim())]

  const customData: Record<string, unknown> = {}
  if (currency) customData.currency = currency.toUpperCase()
  if (value != null) customData.value = Number(value)

  const eventData: Record<string, unknown> = {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    action_source: 'other',
    user_data: userData,
  }
  if (Object.keys(customData).length > 0) eventData.custom_data = customData

  if (utmSource || utmMedium || utmCampaign || utmContent) {
    eventData.app_data = {
      campaign: {
        source: utmSource ?? undefined,
        medium: utmMedium ?? undefined,
        name: utmCampaign ?? undefined,
        content: utmContent ?? undefined,
      },
    }
  }

  const body: Record<string, unknown> = { data: [eventData] }
  if (testEventCode) body.test_event_code = testEventCode

  const url = `https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Meta CAPI error ${res.status}: ${text}`)
  }
}

/** Convenience alias kept for backward compatibility. */
export async function fireCapiPurchase(payload: Omit<CapiEventPayload, 'eventName'> & { currency: string; value: number }): Promise<void> {
  return fireCapiEvent({ ...payload, eventName: 'Purchase' })
}
