import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// `new URL(request.url).origin` reflects whatever host the Node
// process itself thinks it's bound to — behind Coolify's proxy that's
// the container's internal address, not the public domain, so it
// silently resolves to http://localhost:3000 in production. The proxy
// does forward the real host correctly (confirmed via the
// x-forwarded-host header), so prefer that; NEXT_PUBLIC_SITE_URL is a
// second fallback for setups that strip forwarded headers entirely.
function resolveOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto') ?? 'https'
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL
  return new URL(request.url).origin
}

// Receives the redirect from Supabase Auth email links (password
// recovery, invite, magic link — anything using the PKCE `code` flow).
// Exchanges the code for a session server-side so the cookies land on
// this response, then forwards the user to `next` (the page the link
// was originally meant for, e.g. /reset-password).
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const origin = resolveOrigin(request)
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
