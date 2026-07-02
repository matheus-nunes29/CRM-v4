import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'

const MIN_DELAY_MS = 300

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', user.id)
    .maybeSingle()
  const accountId = profile?.account_id as string | undefined
  if (!accountId) {
    return NextResponse.json({ error: 'Profile not linked to an account' }, { status: 403 })
  }

  const { id: broadcastId } = await params
  const { action } = (await request.json()) as { action: 'pause' | 'resume' | 'cancel' }

  if (!['pause', 'resume', 'cancel'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const db = supabaseAdmin()

  // Verify ownership
  const { data: broadcast, error: bcErr } = await db
    .from('broadcasts')
    .select('id, status, broadcast_type')
    .eq('id', broadcastId)
    .eq('account_id', accountId)
    .maybeSingle()

  if (bcErr || !broadcast) {
    return NextResponse.json({ error: 'Broadcast not found' }, { status: 404 })
  }

  if (action === 'pause') {
    if (broadcast.status !== 'sending') {
      return NextResponse.json({ error: 'Broadcast is not sending' }, { status: 409 })
    }
    await db.from('broadcasts').update({ status: 'paused' }).eq('id', broadcastId)
    return NextResponse.json({ ok: true, status: 'paused' })
  }

  if (action === 'cancel') {
    if (!['sending', 'paused', 'scheduled'].includes(broadcast.status)) {
      return NextResponse.json({ error: 'Broadcast cannot be cancelled in its current state' }, { status: 409 })
    }
    await db.from('broadcast_recipients')
      .update({ status: 'cancelled' })
      .eq('broadcast_id', broadcastId)
      .eq('status', 'pending')
    await db.from('broadcasts')
      .update({ status: 'cancelled' })
      .eq('id', broadcastId)
    return NextResponse.json({ ok: true, status: 'cancelled' })
  }

  // resume
  if (broadcast.status !== 'paused') {
    return NextResponse.json({ error: 'Broadcast is not paused' }, { status: 409 })
  }

  // Reschedule all still-pending recipients from now
  const { data: pending } = await db
    .from('broadcast_recipients')
    .select('id')
    .eq('broadcast_id', broadcastId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  if (pending?.length) {
    const baseTime = Date.now()
    // Batch into chunks of 50 concurrent updates
    const CHUNK = 50
    for (let chunk = 0; chunk < pending.length; chunk += CHUNK) {
      await Promise.all(
        pending.slice(chunk, chunk + CHUNK).map((r: { id: string }, idx: number) => {
          const i = chunk + idx
          const jitter = i === 0 ? 0 : (Math.random() * 10 - 5) * 1000
          const scheduledMs = baseTime + i * MIN_DELAY_MS + jitter
          return db.from('broadcast_recipients')
            .update({ scheduled_at: new Date(scheduledMs).toISOString() })
            .eq('id', r.id)
        }),
      )
    }
  }

  await db.from('broadcasts').update({ status: 'sending' }).eq('id', broadcastId)
  return NextResponse.json({ ok: true, status: 'sending' })
}
