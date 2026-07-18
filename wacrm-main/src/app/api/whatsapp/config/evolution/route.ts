import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { encrypt, decrypt } from '@/lib/whatsapp/encryption'

/**
 * Evolution API config route.
 *
 * Unlike W-API (one global instance for the whole app, see
 * ../wapi/route.ts), Evolution API is self-hosted by us, so each
 * account gets its own instance created on demand — the server URL and
 * admin key are global env vars, but the instance name and per-instance
 * key are generated and stored per account in `whatsapp_config`.
 */

const EVOLUTION_SERVER_URL = (process.env.EVOLUTION_SERVER_URL ?? '').replace(/\/$/, '')
const EVOLUTION_GLOBAL_API_KEY = process.env.EVOLUTION_GLOBAL_API_KEY ?? ''
const EVOLUTION_WEBHOOK_URL = process.env.NEXT_PUBLIC_APP_URL
  ? `${process.env.NEXT_PUBLIC_APP_URL}/api/whatsapp/webhook/evolution`
  : null

function instanceNameFor(accountId: string): string {
  return `wacrm-${accountId}`
}

async function evolutionRequest(
  path: string,
  apiKey: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown>; raw: string }> {
  const url = `${EVOLUTION_SERVER_URL}${path}`
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        apikey: apiKey,
        'Content-Type': 'application/json',
        ...(init?.headers as Record<string, string> ?? {}),
      },
    })
    const raw = await res.text()
    console.log(`[evolution] ${init?.method ?? 'GET'} ${path} → ${res.status} | ${raw.slice(0, 300)}`)
    let data: Record<string, unknown>
    try { data = JSON.parse(raw) } catch { data = { _raw_text: raw.slice(0, 300) } }
    return { ok: res.ok, status: res.status, data, raw }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.log(`[evolution] NETWORK ERROR ${path}: ${msg}`)
    return { ok: false, status: 0, data: { _network_error: msg }, raw: '' }
  }
}

async function resolveAccountId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', userId)
    .maybeSingle()
  return (data?.account_id as string | undefined) ?? null
}

// GET — check Evolution instance connection status
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const accountId = await resolveAccountId(supabase, user.id)
    if (!accountId) return NextResponse.json({ error: 'No account' }, { status: 403 })

    if (!EVOLUTION_SERVER_URL || !EVOLUTION_GLOBAL_API_KEY) {
      return NextResponse.json({
        connected: false,
        reason: 'not_configured',
        message: 'EVOLUTION_SERVER_URL and EVOLUTION_GLOBAL_API_KEY must be set as server environment variables.',
      })
    }

    const { data: config } = await supabase
      .from('whatsapp_config')
      .select('provider, evolution_connected, evolution_connected_phone, evolution_instance_name, evolution_api_key')
      .eq('account_id', accountId)
      .maybeSingle()

    if (!config || config.provider !== 'evolution' || !config.evolution_instance_name) {
      return NextResponse.json({ connected: false, reason: 'not_activated' })
    }

    const instanceKey = config.evolution_api_key ? decrypt(config.evolution_api_key) : EVOLUTION_GLOBAL_API_KEY

    const { data, status: httpStatus } = await evolutionRequest(
      `/instance/connectionState/${config.evolution_instance_name}`,
      instanceKey,
    )

    if (httpStatus >= 400) {
      return NextResponse.json({ connected: false, reason: 'api_error', debug: data }, { status: 200 })
    }

    const instanceInfo = (data.instance ?? data) as Record<string, unknown>
    const state = String(instanceInfo.state ?? '').toLowerCase()
    const connected = state === 'open'

    await supabase
      .from('whatsapp_config')
      .update({ evolution_connected: connected })
      .eq('account_id', accountId)

    return NextResponse.json({ connected, phone: config.evolution_connected_phone, raw: data })
  } catch (err) {
    console.error('[evolution/config] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST — activate | qr | disconnect
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const accountId = await resolveAccountId(supabase, user.id)
    if (!accountId) return NextResponse.json({ error: 'No account' }, { status: 403 })

    const body = await request.json()
    const { action } = body as { action: string }

    if (!EVOLUTION_SERVER_URL || !EVOLUTION_GLOBAL_API_KEY) {
      return NextResponse.json(
        { error: 'EVOLUTION_SERVER_URL and EVOLUTION_GLOBAL_API_KEY must be set as server environment variables.' },
        { status: 503 },
      )
    }

    // ── activate ── create (or reuse) the account's own instance
    if (action === 'activate') {
      const instanceName = instanceNameFor(accountId)

      // Reuse if it already exists on the Evolution server (e.g. re-activating
      // after switching providers away and back) instead of erroring on create.
      const existingCheck = await evolutionRequest(
        `/instance/connectionState/${instanceName}`,
        EVOLUTION_GLOBAL_API_KEY,
      )

      let instanceApiKey: string | null = null

      if (existingCheck.status === 404) {
        const created = await evolutionRequest('/instance/create', EVOLUTION_GLOBAL_API_KEY, {
          method: 'POST',
          body: JSON.stringify({
            instanceName,
            qrcode: false,
            integration: 'WHATSAPP-BAILEYS',
            ...(EVOLUTION_WEBHOOK_URL
              ? { webhook: { url: EVOLUTION_WEBHOOK_URL, byEvents: false, base64: true, events: ['MESSAGES_UPSERT'] } }
              : {}),
          }),
        })
        if (!created.ok) {
          return NextResponse.json({ error: 'Failed to create Evolution instance', debug: created.data }, { status: 502 })
        }
        const hash = created.data.hash as Record<string, unknown> | string | undefined
        instanceApiKey = typeof hash === 'string' ? hash : (hash?.apikey as string | undefined) ?? null
      }

      const { data: existingRow } = await supabase
        .from('whatsapp_config')
        .select('id')
        .eq('account_id', accountId)
        .maybeSingle()

      const payload = {
        provider: 'evolution' as const,
        evolution_server_url: EVOLUTION_SERVER_URL,
        evolution_instance_name: instanceName,
        ...(instanceApiKey ? { evolution_api_key: encrypt(instanceApiKey) } : {}),
        evolution_connected: false,
        updated_at: new Date().toISOString(),
      }

      if (existingRow) {
        const { error, data: updated } = await supabase
          .from('whatsapp_config')
          .update(payload)
          .eq('account_id', accountId)
          .select('id')
        console.log('[evolution/config] update result:', { error, rowsAffected: updated?.length ?? 0 })
        if (error) {
          return NextResponse.json({ error: 'DB update failed', debug: error }, { status: 500 })
        }
        if (!updated || updated.length === 0) {
          return NextResponse.json(
            { error: 'DB update affected 0 rows (likely blocked by RLS — check auth.uid()/account role)' },
            { status: 500 },
          )
        }
      } else {
        const { error, data: inserted } = await supabase
          .from('whatsapp_config')
          .insert({
            account_id: accountId,
            user_id: user.id,
            status: 'connected',
            ...payload,
          })
          .select('id')
        console.log('[evolution/config] insert result:', { error, rowsAffected: inserted?.length ?? 0 })
        if (error) {
          return NextResponse.json({ error: 'DB insert failed', debug: error }, { status: 500 })
        }
      }

      return NextResponse.json({ ok: true, activated: true })
    }

    // For qr/disconnect we need the stored instance name + key
    const { data: config } = await supabase
      .from('whatsapp_config')
      .select('evolution_instance_name, evolution_api_key')
      .eq('account_id', accountId)
      .maybeSingle()

    if (!config?.evolution_instance_name) {
      return NextResponse.json({ error: 'Instance not activated yet' }, { status: 400 })
    }
    const instanceKey = config.evolution_api_key ? decrypt(config.evolution_api_key) : EVOLUTION_GLOBAL_API_KEY

    // ── qr ── get QR code for scanning
    if (action === 'qr') {
      const { data, status: qrStatus } = await evolutionRequest(
        `/instance/connect/${config.evolution_instance_name}`,
        instanceKey,
      )
      const alreadyConnected = qrStatus === 200 && !data.base64 && !data.code
      return NextResponse.json({ ...data, already_connected: alreadyConnected, http_status: qrStatus })
    }

    // ── disconnect ── log out from WhatsApp (keeps the instance, just unpairs it)
    if (action === 'disconnect') {
      const { data } = await evolutionRequest(
        `/instance/logout/${config.evolution_instance_name}`,
        instanceKey,
        { method: 'DELETE' },
      )

      await supabase
        .from('whatsapp_config')
        .update({ evolution_connected: false, evolution_connected_phone: null })
        .eq('account_id', accountId)

      return NextResponse.json(data)
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('[evolution/config] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
