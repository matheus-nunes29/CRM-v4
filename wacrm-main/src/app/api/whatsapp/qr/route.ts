import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/whatsapp/encryption'
import { getQrCode, type EvolutionConfig } from '@/lib/whatsapp/evolution-api'

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

    if (!config || config.provider !== 'evolution') {
      return NextResponse.json({ error: 'Evolution API not configured' }, { status: 400 })
    }

    if (!config.evolution_server_url || !config.evolution_instance_name || !config.evolution_api_key) {
      return NextResponse.json({ error: 'Evolution credentials incomplete' }, { status: 400 })
    }

    const apiKey = decrypt(config.evolution_api_key)
    const evoCfg: EvolutionConfig = {
      serverUrl: config.evolution_server_url,
      instanceName: config.evolution_instance_name,
      apiKey,
    }

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
