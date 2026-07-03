import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getQrCode, getSystemEvolutionConfig } from '@/lib/whatsapp/evolution-api'
import { getSystemWApiConfig, getWApiQrCode } from '@/lib/whatsapp/wapi'

async function resolveAccountId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', userId)
    .maybeSingle()
  return data?.account_id ?? null
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const accountId = await resolveAccountId(supabase, user.id)
    if (!accountId) {
      return NextResponse.json({ error: 'No account found' }, { status: 403 })
    }

    const { data: config } = await supabase
      .from('whatsapp_config')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle()

    if (!config) {
      return NextResponse.json({ error: 'WhatsApp not configured' }, { status: 400 })
    }

    // ── W-API QR ──────────────────────────────────────────────────────────
    if (config.provider === 'wapi') {
      const wapiCfg = getSystemWApiConfig()
      const qr = await getWApiQrCode(wapiCfg)
      if (!qr) {
        return NextResponse.json({ qr: null, message: 'QR unavailable or already connected' })
      }
      return NextResponse.json({ qr })
    }

    // ── Evolution QR ──────────────────────────────────────────────────────
    if (config.provider !== 'evolution' || !config.evolution_instance_name) {
      return NextResponse.json({ error: 'Evolution API not configured' }, { status: 400 })
    }

    const evoCfg = getSystemEvolutionConfig(config.evolution_instance_name)

    const qr = await getQrCode(evoCfg)
    if (!qr) {
      return NextResponse.json({ qr: null, message: 'Instance already connected or QR unavailable' })
    }

    return NextResponse.json({ qr })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
