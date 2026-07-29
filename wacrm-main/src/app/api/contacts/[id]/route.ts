import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { runAutomationsForTrigger } from '@/lib/automations/engine'

function supabaseAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: contactId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', user.id)
    .single()
  if (!profile?.account_id) return NextResponse.json({ error: 'No account' }, { status: 400 })

  const body = await req.json() as {
    name?: string | null
    email?: string | null
    company?: string | null
    phone?: string | null
    assigned_to?: string | null
    /** Which fields the caller actually changed (not just which ones it
     *  sent) — lets contact_field_changed fire once per real change
     *  instead of always reporting the first key in the payload. */
    changed_fields?: string[]
  }

  const admin = supabaseAdmin()

  const { data: contact } = await admin
    .from('contacts')
    .select('id')
    .eq('id', contactId)
    .eq('account_id', profile.account_id)
    .maybeSingle()
  if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })

  const { changed_fields, ...fields } = body
  const update = { ...fields, updated_at: new Date().toISOString() }

  const { error } = await admin
    .from('contacts')
    .update(update)
    .eq('id', contactId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // One dispatch per field that actually changed, so an automation
  // configured for e.g. "email" only matches when the email itself
  // changed — not whenever any field in the same save happened to change.
  const fieldsToReport = changed_fields?.length ? changed_fields : Object.keys(fields)
  for (const changed_field of fieldsToReport) {
    runAutomationsForTrigger({
      accountId: profile.account_id,
      triggerType: 'contact_field_changed',
      contactId,
      context: { changed_field },
    }).catch((err) => console.error('[automations] contact_field_changed error:', err))
  }

  return NextResponse.json({ ok: true })
}
