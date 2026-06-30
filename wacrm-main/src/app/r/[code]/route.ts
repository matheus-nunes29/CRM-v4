import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params
  const db = supabase()

  const { data: link } = await db
    .from('tracking_links')
    .select('*')
    .eq('code', code)
    .maybeSingle()

  if (!link) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 })
  }

  db
    .from('tracking_links')
    .update({ click_count: link.click_count + 1, updated_at: new Date().toISOString() })
    .eq('id', link.id)
    .then(() => {})

  // Capture GCLID if present (Google Ads click ID)
  const url = new URL(req.url)
  const gclid = url.searchParams.get('gclid')

  // Build pre-filled message: append #ref-CODE and optionally #gclid-VALUE
  // so the Evolution webhook can extract both for attribution.
  let message = `${link.initial_message} #ref-${code}`
  if (gclid) message += ` #gclid-${gclid}`

  const phone = link.destination_phone.replace(/\D/g, '')
  const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`

  return NextResponse.redirect(waUrl, { status: 302 })
}
