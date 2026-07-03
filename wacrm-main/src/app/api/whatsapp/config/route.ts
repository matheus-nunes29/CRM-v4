import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import {
  registerPhoneNumber,
  subscribeWabaToApp,
  verifyPhoneNumber,
} from '@/lib/whatsapp/meta-api'
import { encrypt, decrypt } from '@/lib/whatsapp/encryption'
import {
  getInstanceState,
  createInstance,
  logoutInstance,
  setWebhook,
  getSystemEvolutionConfig,
  instanceNameForAccount,
} from '@/lib/whatsapp/evolution-api'
import {
  getSystemWApiConfig,
  getWApiInstanceStatus,
  configureWApiWebhook,
} from '@/lib/whatsapp/wapi'

async function resolveAccountId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data?.account_id) return null
  return data.account_id as string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _adminClient: any = null
function supabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _adminClient
}

/**
 * GET /api/whatsapp/config
 *
 * Returns connection health for whichever provider is configured.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const accountId = await resolveAccountId(supabase, user.id)
    if (!accountId) {
      return NextResponse.json(
        { connected: false, reason: 'no_account', message: 'Your profile is not linked to an account.' },
        { status: 200 },
      )
    }

    const { data: config, error: configError } = await supabase
      .from('whatsapp_config')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle()

    if (configError) {
      return NextResponse.json(
        { connected: false, reason: 'db_error', message: 'Failed to fetch configuration' },
        { status: 200 },
      )
    }

    if (!config) {
      return NextResponse.json(
        { connected: false, reason: 'no_config', message: 'No WhatsApp configuration saved yet.' },
        { status: 200 },
      )
    }

    const provider = config.provider ?? 'meta'

    // ── W-API provider ──────────────────────────────────────────────────
    if (provider === 'wapi') {
      try {
        const wapiCfg = getSystemWApiConfig()
        const status = await getWApiInstanceStatus(wapiCfg)
        return NextResponse.json({ connected: status.connected, provider: 'wapi' })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        return NextResponse.json(
          { connected: false, reason: 'wapi_error', message },
          { status: 200 },
        )
      }
    }

    // ── Evolution provider ──────────────────────────────────────────────
    if (provider === 'evolution') {
      if (!config.evolution_instance_name) {
        return NextResponse.json(
          { connected: false, reason: 'no_config', message: 'WhatsApp não configurado ainda.' },
          { status: 200 },
        )
      }

      try {
        const evoCfg = getSystemEvolutionConfig(config.evolution_instance_name)
        const state = await getInstanceState(evoCfg)
        return NextResponse.json({
          connected: state.state === 'open',
          provider: 'evolution',
          instance_state: state.state,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        return NextResponse.json(
          { connected: false, reason: 'evolution_api_error', message },
          { status: 200 },
        )
      }
    }

    // ── Meta provider ───────────────────────────────────────────────────
    let accessToken: string
    try {
      accessToken = decrypt(config.access_token)
    } catch {
      return NextResponse.json(
        {
          connected: false,
          reason: 'token_corrupted',
          needs_reset: true,
          message: 'The stored access token cannot be decrypted with the current ENCRYPTION_KEY.',
        },
        { status: 200 },
      )
    }

    try {
      const phoneInfo = await verifyPhoneNumber({ phoneNumberId: config.phone_number_id, accessToken })
      return NextResponse.json({ connected: true, provider: 'meta', phone_info: phoneInfo })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown Meta API error'
      return NextResponse.json(
        { connected: false, reason: 'meta_api_error', message: `Meta API rejected the credentials: ${message}` },
        { status: 200 },
      )
    }
  } catch (error) {
    console.error('Error in WhatsApp config GET:', error)
    return NextResponse.json(
      { connected: false, reason: 'unknown', message: 'Internal server error' },
      { status: 500 },
    )
  }
}

/**
 * POST /api/whatsapp/config
 *
 * Save or update the WhatsApp config. Body must include `provider`.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const accountId = await resolveAccountId(supabase, user.id)
    if (!accountId) {
      return NextResponse.json({ error: 'Your profile is not linked to an account.' }, { status: 403 })
    }

    const body = await request.json()
    const provider: string = body.provider ?? 'meta'

    if (provider === 'evolution') {
      return await handleEvolutionSave({ supabase, user, accountId })
    }

    if (provider === 'wapi') {
      return await handleWApiSave({ supabase, user, accountId })
    }

    return await handleMetaSave({ supabase, user, accountId, body })
  } catch (error) {
    console.error('Error in WhatsApp config POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── Meta save ──────────────────────────────────────────────────────────────

async function handleMetaSave({
  supabase,
  user,
  accountId,
  body,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  user: any
  accountId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any
}) {
  const { phone_number_id, waba_id, access_token, verify_token, pin } = body

  if (!access_token || !phone_number_id) {
    return NextResponse.json(
      { error: 'access_token and phone_number_id are required' },
      { status: 400 },
    )
  }

  if (pin !== undefined && pin !== null && pin !== '') {
    if (typeof pin !== 'string' || !/^\d{6}$/.test(pin)) {
      return NextResponse.json({ error: 'PIN must be exactly 6 digits.' }, { status: 400 })
    }
  }

  const { data: claimed } = await supabaseAdmin()
    .from('whatsapp_config')
    .select('account_id')
    .eq('phone_number_id', phone_number_id)
    .neq('account_id', accountId)
    .maybeSingle()

  if (claimed) {
    return NextResponse.json(
      { error: 'This WhatsApp phone number is already linked to another account on this instance.' },
      { status: 409 },
    )
  }

  let phoneInfo
  try {
    phoneInfo = await verifyPhoneNumber({ phoneNumberId: phone_number_id, accessToken: access_token })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown Meta API error'
    return NextResponse.json({ error: `Meta API error: ${message}` }, { status: 400 })
  }

  let encryptedAccessToken: string
  let encryptedVerifyToken: string | null
  try {
    encryptedAccessToken = encrypt(access_token)
    encryptedVerifyToken = verify_token ? encrypt(verify_token) : null
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown encryption error'
    console.error('Encryption failed:', message)
    return NextResponse.json(
      { error: 'Failed to encrypt token. Check that ENCRYPTION_KEY is valid.' },
      { status: 500 },
    )
  }

  const { data: existing } = await supabase
    .from('whatsapp_config')
    .select('id, registered_at, phone_number_id')
    .eq('account_id', accountId)
    .maybeSingle()

  const sameNumber = existing?.phone_number_id === phone_number_id && existing?.registered_at != null

  let registeredAt: string | null = existing?.registered_at ?? null
  let registrationError: string | null = null
  let registrationSkipped = false

  const needsRegistration = !sameNumber || (typeof pin === 'string' && pin.length > 0)
  if (needsRegistration) {
    if (!pin) {
      registrationSkipped = true
    } else {
      try {
        await registerPhoneNumber({ phoneNumberId: phone_number_id, accessToken: access_token, pin })
        registeredAt = new Date().toISOString()
      } catch (err) {
        registrationError = err instanceof Error ? err.message : 'Unknown Meta API error'
        console.error('Phone number /register failed:', registrationError)
      }
    }
  }

  let subscribedAppsAt: string | null = null
  if (waba_id) {
    try {
      await subscribeWabaToApp({ wabaId: waba_id, accessToken: access_token })
      subscribedAppsAt = new Date().toISOString()
    } catch (err) {
      console.warn('WABA subscribed_apps failed (non-fatal):', err instanceof Error ? err.message : err)
    }
  }

  const baseRow = {
    provider: 'meta',
    phone_number_id,
    waba_id: waba_id || null,
    access_token: encryptedAccessToken,
    verify_token: encryptedVerifyToken,
    status: registrationError ? 'disconnected' : 'connected',
    connected_at: registrationError ? null : new Date().toISOString(),
    registered_at: registrationError ? null : registeredAt,
    subscribed_apps_at: subscribedAppsAt ?? null,
    last_registration_error: registrationError,
    evolution_server_url: null,
    evolution_instance_name: null,
    evolution_api_key: null,
    updated_at: new Date().toISOString(),
  }

  if (existing) {
    const { error: updateError } = await supabase
      .from('whatsapp_config')
      .update(baseRow)
      .eq('account_id', accountId)
    if (updateError) {
      return NextResponse.json({ error: 'Failed to update configuration' }, { status: 500 })
    }
  } else {
    const { error: insertError } = await supabase
      .from('whatsapp_config')
      .insert({ account_id: accountId, user_id: user.id, ...baseRow })
    if (insertError) {
      return NextResponse.json({ error: 'Failed to save configuration' }, { status: 500 })
    }
  }

  if (registrationError) {
    return NextResponse.json({
      success: false, saved: true, registered: false,
      registration_error: registrationError, phone_info: phoneInfo,
    })
  }

  return NextResponse.json({
    success: true, saved: true,
    registered: registeredAt != null,
    registration_skipped: registrationSkipped,
    phone_info: phoneInfo,
  })
}

// ── Evolution save ─────────────────────────────────────────────────────────

async function handleEvolutionSave({
  supabase,
  user,
  accountId,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  user: any
  accountId: string
}) {
  // Preserve the existing instance name if one is already configured.
  // Only fall back to the auto-generated name on first-ever setup.
  const { data: existingConfig } = await supabase
    .from('whatsapp_config')
    .select('evolution_instance_name')
    .eq('account_id', accountId)
    .maybeSingle()

  let evoCfg
  try {
    const instanceName =
      existingConfig?.evolution_instance_name || instanceNameForAccount(accountId)
    evoCfg = getSystemEvolutionConfig(instanceName)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: `Servidor Evolution não configurado: ${message}` }, { status: 503 })
  }

  try {
    await createInstance(evoCfg)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: `Erro ao criar instância: ${message}` }, { status: 400 })
  }

  // Logout any existing session so a fresh QR is always generated.
  // This is safe — it only disconnects the WhatsApp session, not the instance.
  try {
    await logoutInstance(evoCfg)
  } catch (err) {
    console.warn('[evolution] logout before reconnect failed (non-fatal):', err)
  }

  // Auto-configure webhook
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (siteUrl) {
    try {
      await setWebhook(evoCfg, `${siteUrl}/api/whatsapp/webhook/evolution`)
    } catch (err) {
      console.warn('[evolution] webhook setup failed (non-fatal):', err)
    }
  }

  // After logout the instance is always in 'close' state, so QR is always needed.
  const connected = false

  const { data: existing } = await supabase
    .from('whatsapp_config')
    .select('id, phone_number_id, access_token')
    .eq('account_id', accountId)
    .maybeSingle()

  const baseRow = {
    provider: 'evolution',
    evolution_instance_name: evoCfg.instanceName,
    evolution_server_url: null,
    evolution_api_key: null,
    status: 'disconnected',
    connected_at: null,
    phone_number_id: existing?.phone_number_id ?? '',
    waba_id: null,
    access_token: existing?.access_token ?? '',
    verify_token: null,
    registered_at: null,
    subscribed_apps_at: null,
    last_registration_error: null,
    updated_at: new Date().toISOString(),
  }

  if (existing) {
    const { error: updateError } = await supabase
      .from('whatsapp_config')
      .update(baseRow)
      .eq('account_id', accountId)
    if (updateError) {
      return NextResponse.json({ error: 'Failed to update configuration' }, { status: 500 })
    }
  } else {
    const { error: insertError } = await supabase
      .from('whatsapp_config')
      .insert({ account_id: accountId, user_id: user.id, ...baseRow })
    if (insertError) {
      return NextResponse.json({ error: 'Failed to save configuration' }, { status: 500 })
    }
  }

  return NextResponse.json({
    success: true,
    provider: 'evolution',
    instance_state: 'connecting',
    connected,
    needs_qr: true,
  })
}

// ── W-API save ─────────────────────────────────────────────────────────────

async function handleWApiSave({
  supabase,
  user,
  accountId,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  user: any
  accountId: string
}) {
  let wapiCfg
  try {
    wapiCfg = getSystemWApiConfig()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: `W-API não configurado: ${message}` }, { status: 503 })
  }

  // Auto-configure webhook
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (siteUrl) {
    try {
      await configureWApiWebhook(wapiCfg, `${siteUrl}/api/whatsapp/webhook/wapi`)
    } catch (err) {
      console.warn('[wapi] webhook setup failed (non-fatal):', err)
    }
  }

  // Check current connection status
  let connected = false
  try {
    const status = await getWApiInstanceStatus(wapiCfg)
    connected = status.connected
  } catch (err) {
    console.warn('[wapi] status check failed (non-fatal):', err)
  }

  const { data: existing } = await supabase
    .from('whatsapp_config')
    .select('id, phone_number_id, access_token')
    .eq('account_id', accountId)
    .maybeSingle()

  const baseRow = {
    provider: 'wapi',
    // Reuse evolution_instance_name column to store the W-API instance ID for reference
    evolution_instance_name: wapiCfg.instanceId,
    evolution_server_url: null,
    evolution_api_key: null,
    status: connected ? 'connected' : 'disconnected',
    connected_at: connected ? new Date().toISOString() : null,
    phone_number_id: existing?.phone_number_id ?? '',
    waba_id: null,
    access_token: existing?.access_token ?? '',
    verify_token: null,
    registered_at: null,
    subscribed_apps_at: null,
    last_registration_error: null,
    updated_at: new Date().toISOString(),
  }

  if (existing) {
    const { error: updateError } = await supabase
      .from('whatsapp_config')
      .update(baseRow)
      .eq('account_id', accountId)
    if (updateError) {
      return NextResponse.json({ error: 'Failed to update configuration' }, { status: 500 })
    }
  } else {
    const { error: insertError } = await supabase
      .from('whatsapp_config')
      .insert({ account_id: accountId, user_id: user.id, ...baseRow })
    if (insertError) {
      return NextResponse.json({ error: 'Failed to save configuration' }, { status: 500 })
    }
  }

  return NextResponse.json({
    success: true,
    provider: 'wapi',
    connected,
    needs_qr: !connected,
  })
}

/**
 * DELETE /api/whatsapp/config
 */
export async function DELETE() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const accountId = await resolveAccountId(supabase, user.id)
    if (!accountId) {
      return NextResponse.json({ error: 'Your profile is not linked to an account.' }, { status: 403 })
    }

    const { error: deleteError } = await supabase
      .from('whatsapp_config')
      .delete()
      .eq('account_id', accountId)

    if (deleteError) {
      console.error('Error deleting whatsapp_config:', deleteError)
      return NextResponse.json({ error: 'Failed to delete configuration' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in WhatsApp config DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
