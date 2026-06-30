import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', user.id)
    .single()
  if (!profile?.account_id) return NextResponse.json({ error: 'No account' }, { status: 400 })

  const { capi_event } = await req.json() as { capi_event: string | null }

  // Verify the stage belongs to a pipeline owned by this account
  const { data: stage } = await supabase
    .from('pipeline_stages')
    .select('id, pipeline_id')
    .eq('id', id)
    .maybeSingle()

  if (!stage) return NextResponse.json({ error: 'Stage not found' }, { status: 404 })

  const { data: pipeline } = await supabase
    .from('pipelines')
    .select('account_id')
    .eq('id', stage.pipeline_id)
    .maybeSingle()

  if (pipeline?.account_id !== profile.account_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await supabase
    .from('pipeline_stages')
    .update({ capi_event: capi_event ?? null })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
