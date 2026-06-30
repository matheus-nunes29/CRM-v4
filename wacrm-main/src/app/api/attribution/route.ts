import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('account_id').eq('user_id', user.id).single()
  if (!profile?.account_id) return NextResponse.json({ error: 'No account' }, { status: 400 })

  const since = new Date()
  since.setDate(since.getDate() - 30)
  const sinceIso = since.toISOString()

  // Contacts by source (last 30 days)
  const { data: contacts } = await supabase
    .from('contacts')
    .select('utm_source, gclid, created_at')
    .eq('account_id', profile.account_id)
    .gte('created_at', sinceIso)

  // CAPI events by name + status (last 30 days)
  const { data: events } = await supabase
    .from('capi_dispatch_log')
    .select('event_name, status, utm_source, utm_campaign, created_at')
    .eq('account_id', profile.account_id)
    .gte('created_at', sinceIso)

  // Aggregate contacts by source
  const sourceMap: Record<string, number> = {}
  for (const c of contacts ?? []) {
    const src = c.utm_source ?? (c.gclid ? 'Google Ads (gclid)' : 'Orgânico')
    sourceMap[src] = (sourceMap[src] ?? 0) + 1
  }

  // Aggregate CAPI events by event name
  const eventMap: Record<string, { success: number; failed: number }> = {}
  for (const e of events ?? []) {
    if (!eventMap[e.event_name]) eventMap[e.event_name] = { success: 0, failed: 0 }
    if (e.status === 'success') eventMap[e.event_name].success++
    else eventMap[e.event_name].failed++
  }

  // Daily contacts for last 14 days
  const daily: Record<string, number> = {}
  const now = new Date()
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    daily[d.toISOString().slice(0, 10)] = 0
  }
  for (const c of contacts ?? []) {
    const day = c.created_at.slice(0, 10)
    if (day in daily) daily[day]++
  }

  return NextResponse.json({
    bySource: Object.entries(sourceMap)
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count),
    byCapiEvent: Object.entries(eventMap)
      .map(([event, counts]) => ({ event, ...counts }))
      .sort((a, b) => b.success - a.success),
    daily: Object.entries(daily).map(([date, count]) => ({ date, count })),
    totals: {
      contacts: contacts?.length ?? 0,
      capiSuccess: events?.filter((e) => e.status === 'success').length ?? 0,
      capiFailed: events?.filter((e) => e.status === 'failed').length ?? 0,
    },
  })
}
