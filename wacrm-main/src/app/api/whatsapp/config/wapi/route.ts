import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const WAPI_INSTANCE_ID = process.env.WAPI_INSTANCE_ID ?? ''
const WAPI_TOKEN = process.env.WAPI_TOKEN ?? ''
const WAPI_BASE_URL = 'https://api.w-api.app'
const WAPI_WEBHOOK_URL = process.env.NEXT_PUBLIC_APP_URL
  ? `${process.env.NEXT_PUBLIC_APP_URL}/api/whatsapp/webhook/wapi`
  : 'https://wacrm-bice.vercel.app/api/whatsapp/webhook/wapi'

const wapiHeaders = () => ({
  Authorization: `Bearer ${WAPI_TOKEN}`,
  'Content-Type': 'application/json',
})

async function wapiRequest(
  url: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; data: unknown; raw: string }> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { ...wapiHeaders(), ...(init?.headers as Record<string, string> ?? {}) },
    })
    const raw = await res.text()
    console.log(`[wapi] ${init?.method ?? 'GET'} ${url} → ${res.status} | ${raw.slice(0, 300)}`)
    let data: unknown
    try { data = JSON.parse(raw) } catch { data = { _raw_text: raw.slice(0, 300) } }
    return { ok: res.ok, status: res.status, data, raw }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.log(`[wapi] NETWORK ERROR ${url}: ${msg}`)
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

// GET — check W-API connection status
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const accountId = await resolveAccountId(supabase, user.id)
    if (!accountId) return NextResponse.json({ error: 'No account' }, { status: 403 })

    if (!WAPI_TOKEN || !WAPI_INSTANCE_ID) {
      return NextResponse.json({
        connected: false,
        reason: 'not_configured',
        message: 'WAPI_TOKEN and WAPI_INSTANCE_ID must be set as server environment variables.',
      })
    }

    const { data: config } = await supabase
      .from('whatsapp_config')
      .select('provider, wapi_connected, wapi_connected_phone, wapi_instance_id')
      .eq('account_id', accountId)
      .maybeSingle()

    if (!config || config.provider !== 'wapi') {
      return NextResponse.json({ connected: false, reason: 'not_activated' })
    }

    const { data, status: httpStatus } = await wapiRequest(
      `${WAPI_BASE_URL}/v1/instance/status-instance?instanceId=${WAPI_INSTANCE_ID}`,
    )

    if (httpStatus >= 400) {
      return NextResponse.json({ connected: false, reason: 'api_error', debug: data }, { status: 200 })
    }

    const d = data as Record<string, unknown>
    const statusStr = String(d.status ?? d.state ?? d.message ?? '').toLowerCase()
    const connected: boolean =
      d.connected === true ||
      statusStr === 'connected' ||
      statusStr === 'open' ||
      statusStr === 'inuse'

    const phone: string | null =
      (d.phone ?? d.phoneNumber ?? (d.wid as Record<string, unknown>)?.user ?? null) as string | null

    await supabase
      .from('whatsapp_config')
      .update({ wapi_connected: connected, wapi_connected_phone: phone })
      .eq('account_id', accountId)

    return NextResponse.json({ connected, phone, raw: d })
  } catch (err) {
    console.error('[wapi/config] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST — activate | qr | disconnect | setup-webhooks
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const accountId = await resolveAccountId(supabase, user.id)
    if (!accountId) return NextResponse.json({ error: 'No account' }, { status: 403 })

    const body = await request.json()
    const { action } = body as { action: string }

    // ── activate ── save wapi row, switch provider
    if (action === 'activate') {
      if (!WAPI_TOKEN || !WAPI_INSTANCE_ID) {
        return NextResponse.json(
          { error: 'WAPI_TOKEN and WAPI_INSTANCE_ID must be set as server environment variables.' },
          { status: 503 },
        )
      }

      const { data: existing } = await supabase
        .from('whatsapp_config')
        .select('id')
        .eq('account_id', accountId)
        .maybeSingle()

      if (existing) {
        await supabase
          .from('whatsapp_config')
          .update({
            provider: 'wapi',
            wapi_instance_id: WAPI_INSTANCE_ID,
            wapi_connected: false,
            updated_at: new Date().toISOString(),
          })
          .eq('account_id', accountId)
      } else {
        await supabase.from('whatsapp_config').insert({
          account_id: accountId,
          user_id: user.id,
          provider: 'wapi',
          wapi_instance_id: WAPI_INSTANCE_ID,
          wapi_connected: false,
          status: 'connected',
        })
      }

      return NextResponse.json({ ok: true, activated: true })
    }

    // ── qr ── get QR code for scanning
    if (action === 'qr') {
      const { data, status: qrStatus } = await wapiRequest(
        `${WAPI_BASE_URL}/v1/instance/qr-code?instanceId=${WAPI_INSTANCE_ID}`,
      )
      const d = data as Record<string, unknown>
      const alreadyConnected = qrStatus === 200 && !d.qrcode && !d.qr && !d.base64 && !d._raw_text
      return NextResponse.json({ ...d, already_connected: alreadyConnected, http_status: qrStatus })
    }

    // ── disconnect ── log out from WhatsApp
    if (action === 'disconnect') {
      const { data } = await wapiRequest(
        `${WAPI_BASE_URL}/v1/instance/disconnect?instanceId=${WAPI_INSTANCE_ID}`,
      )

      await supabase
        .from('whatsapp_config')
        .update({ wapi_connected: false, wapi_connected_phone: null })
        .eq('account_id', accountId)

      return NextResponse.json(data)
    }

    // ── setup-webhooks ── configure all W-API webhook URLs at once
    if (action === 'setup-webhooks') {
      const webhookEndpoints = [
        'update-webhook-received',
        'update-webhook-delivery',
        'update-webhook-connected',
        'update-webhook-disconnected',
        'update-webhook-message-status',
      ]
      const results = await Promise.all(
        webhookEndpoints.map(async (endpoint) => {
          const r = await wapiRequest(
            `${WAPI_BASE_URL}/v1/webhook/${endpoint}?instanceId=${WAPI_INSTANCE_ID}`,
            { method: 'PUT', body: JSON.stringify({ value: WAPI_WEBHOOK_URL }) },
          )
          return { endpoint, status: r.status, ok: r.ok, data: r.data }
        }),
      )
      return NextResponse.json({ results, webhookUrl: WAPI_WEBHOOK_URL })
    }

    // ── logs ── fetch W-API webhook delivery logs
    if (action === 'logs') {
      const { data } = await wapiRequest(
        `${WAPI_BASE_URL}/v1/webhook/fetch-webhook-logs?instanceId=${WAPI_INSTANCE_ID}`,
      )
      return NextResponse.json(data)
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('[wapi/config] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
