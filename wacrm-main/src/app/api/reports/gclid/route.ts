/**
 * GET /api/reports/gclid
 *
 * Generates a Google Ads Offline Conversions CSV for contacts that have a
 * GCLID and at least one won deal or a CAPI Purchase event on their record.
 *
 * Format required by Google Ads:
 * Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('account_id').eq('user_id', user.id).single()
  if (!profile?.account_id) return NextResponse.json({ error: 'No account' }, { status: 400 })

  // Contacts with GCLID + a won deal
  const { data: rows } = await supabase
    .from('contacts')
    .select('id, gclid, deals(id, value, currency, status, updated_at)')
    .eq('account_id', profile.account_id)
    .not('gclid', 'is', null)

  const header = 'Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency'
  const lines: string[] = []

  for (const contact of rows ?? []) {
    if (!contact.gclid) continue
    const wonDeals = ((contact.deals as { status: string; value: number; currency: string; updated_at: string }[]) ?? []).filter(
      (d) => d.status === 'won',
    )
    for (const deal of wonDeals) {
      const convTime = new Date(deal.updated_at).toISOString().replace('T', ' ').slice(0, 19)
      lines.push(`"${contact.gclid}","Purchase","${convTime}",${deal.value ?? 0},${deal.currency ?? 'BRL'}`)
    }
  }

  const csv = [header, ...lines].join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="google_ads_conversions_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
