import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Receives the redirect from Supabase Auth email links (password
// recovery, invite, magic link — anything using the PKCE `code` flow).
// Exchanges the code for a session server-side so the cookies land on
// this response, then forwards the user to `next` (the page the link
// was originally meant for, e.g. /reset-password).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
