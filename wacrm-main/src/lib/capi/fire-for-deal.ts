/**
 * Shared utility: load pixel config + contact data, fire a Meta CAPI event,
 * and write a row to capi_dispatch_log. Used by both the deals API route and
 * the Evolution webhook (stage trigger automation).
 */
import { createClient } from '@supabase/supabase-js'
import { fireCapiEvent } from './fire-event'

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function fireCapiForDeal({
  accountId,
  contactId,
  eventName,
  value = 0,
  currency = 'BRL',
  stageId,
}: {
  accountId: string
  contactId: string
  eventName: string
  value?: number
  currency?: string
  stageId?: string | null
}): Promise<void> {
  const admin = supabaseAdmin()

  const [{ data: pixelConfig }, { data: contact }] = await Promise.all([
    admin.from('meta_pixel_config').select('*').eq('account_id', accountId).maybeSingle(),
    admin.from('contacts').select('phone, name, email, utm_source, utm_medium, utm_campaign, utm_content').eq('id', contactId).single(),
  ])

  if (!pixelConfig?.pixel_id || !pixelConfig?.access_token) return
  if (!contact?.phone) return

  let status: 'success' | 'failed' = 'success'
  let errorMessage: string | null = null

  try {
    await fireCapiEvent({
      pixelId: pixelConfig.pixel_id,
      accessToken: pixelConfig.access_token,
      testEventCode: pixelConfig.test_event_code,
      eventName,
      phone: contact.phone,
      name: contact.name,
      email: contact.email,
      currency,
      value,
      utmSource: contact.utm_source,
      utmMedium: contact.utm_medium,
      utmCampaign: contact.utm_campaign,
      utmContent: contact.utm_content,
    })
  } catch (err) {
    status = 'failed'
    errorMessage = err instanceof Error ? err.message : String(err)
    console.error('[capi] fireCapiForDeal error:', errorMessage)
  }

  // Write to log regardless of success/failure
  admin.from('capi_dispatch_log').insert({
    account_id: accountId,
    contact_id: contactId,
    event_name: eventName,
    status,
    error_message: errorMessage,
    stage_id: stageId ?? null,
    utm_source: contact.utm_source ?? null,
    utm_campaign: contact.utm_campaign ?? null,
  }).then(() => {})
}
