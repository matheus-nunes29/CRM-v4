import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  exchangeMicrosoftCode,
  getMicrosoftUserEmail,
  encrypt,
} from '@/lib/calendar/microsoft'
import { syncMicrosoftCalendar } from '@/lib/calendar/sync-microsoft'

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  const redirectBase = `${process.env.NEXT_PUBLIC_APP_URL}/settings?tab=calendar`

  if (error || !code || !state) {
    return NextResponse.redirect(`${redirectBase}&error=${error ?? 'missing_code'}`)
  }

  let accountId: string
  let userId: string
  try {
    const parsed = JSON.parse(Buffer.from(state, 'base64url').toString())
    accountId = parsed.accountId
    userId = parsed.userId
  } catch {
    return NextResponse.redirect(`${redirectBase}&error=invalid_state`)
  }

  try {
    const tokens = await exchangeMicrosoftCode(code)
    const email = await getMicrosoftUserEmail(tokens.access_token)
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    await supabaseAdmin()
      .from('calendar_integrations')
      .upsert(
        {
          account_id: accountId,
          user_id: userId,
          provider: 'microsoft',
          access_token: encrypt(tokens.access_token),
          refresh_token: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
          token_expires_at: expiresAt,
          connected_email: email,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'account_id,provider' },
      )

    // Kick off initial sync in background — don't await, redirect immediately
    syncMicrosoftCalendar(accountId).catch((err) =>
      console.error('[calendar/callback-microsoft] initial sync failed:', err),
    )

    return NextResponse.redirect(`${redirectBase}&connected=1&provider=microsoft`)
  } catch (err) {
    console.error('[calendar/callback-microsoft] error:', err)
    return NextResponse.redirect(`${redirectBase}&error=exchange_failed`)
  }
}
