import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { fireCapiForDeal } from '@/lib/capi/fire-for-deal'
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

  const body = await req.json()
  const { status, stage_id, loss_reason_id } = body as { status?: 'open' | 'won' | 'lost'; stage_id?: string; loss_reason_id?: string | null }

  if (!status && !stage_id) {
    return NextResponse.json({ error: 'status or stage_id required' }, { status: 400 })
  }

  const admin = supabaseAdmin()

  const { data: deal } = await admin
    .from('deals')
    .select('id, contact_id, value, currency, status, stage_id, pipeline_id, account_id')
    .eq('id', id)
    .eq('account_id', profile.account_id)
    .single()

  if (!deal) return NextResponse.json({ error: 'Deal not found' }, { status: 404 })

  // ── Resolve the target stage and effective status ──────────────────────────

  let resolvedStageId = stage_id
  let fixedStageId: string | undefined
  let targetStageFixedRole: string | null = null
  let targetStageCapi: string | null = null

  if (status === 'won' || status === 'lost') {
    // "Marcar como Ganho/Perdido" button — move to the pipeline's fixed stage
    const fixedRole = status === 'won' ? 'won' : 'lost'
    const { data: fixedStage } = await admin
      .from('pipeline_stages')
      .select('id, fixed_role, capi_event')
      .eq('pipeline_id', deal.pipeline_id)
      .eq('fixed_role', fixedRole)
      .maybeSingle()
    if (fixedStage) {
      fixedStageId = fixedStage.id
      targetStageFixedRole = fixedStage.fixed_role ?? null
      targetStageCapi = fixedStage.capi_event ?? null
      if (fixedStage.id !== deal.stage_id) resolvedStageId = fixedStage.id
    }
  } else if (stage_id) {
    // Drag-and-drop — look up the target stage to auto-sync status + CAPI
    const { data: targetStage } = await admin
      .from('pipeline_stages')
      .select('fixed_role, capi_event')
      .eq('id', stage_id)
      .maybeSingle()
    targetStageFixedRole = targetStage?.fixed_role ?? null
    targetStageCapi = targetStage?.capi_event ?? null
  }

  // When dragging, auto-sync status from the target stage's fixed_role.
  // Dragging to a non-fixed stage reopens a previously won/lost deal.
  const effectiveStatus: 'open' | 'won' | 'lost' | undefined =
    status ??
    (targetStageFixedRole === 'lost' ? 'lost' :
     targetStageFixedRole === 'won'  ? 'won'  :
     (deal.status === 'won' || deal.status === 'lost') ? 'open' : undefined)

  // ── Apply update ───────────────────────────────────────────────────────────

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (effectiveStatus) update.status = effectiveStatus
  if (resolvedStageId) update.stage_id = resolvedStageId
  if (effectiveStatus === 'lost' && loss_reason_id !== undefined) update.loss_reason_id = loss_reason_id
  if (effectiveStatus === 'open') update.loss_reason_id = null

  const { error } = await admin.from('deals').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ── CAPI ───────────────────────────────────────────────────────────────────

  const stageChanged = resolvedStageId != null && resolvedStageId !== deal.stage_id
  const statusChanged = effectiveStatus != null && effectiveStatus !== deal.status
  const statusMovedToFinal = statusChanged && (effectiveStatus === 'won' || effectiveStatus === 'lost')

  if (deal.contact_id) {
    let capiEventName = stageChanged ? targetStageCapi : null
    if (!capiEventName && effectiveStatus === 'won') capiEventName = 'Purchase'
    if (capiEventName) {
      fireCapiForDeal({
        accountId: profile.account_id,
        contactId: deal.contact_id,
        eventName: capiEventName,
        value: deal.value ?? 0,
        currency: deal.currency ?? 'BRL',
        stageId: resolvedStageId ?? null,
      }).catch((err) => console.error('[capi] fire error:', err))
    }
  }

  // ── Automations ────────────────────────────────────────────────────────────

  const automationStageId = resolvedStageId ?? fixedStageId
  if (deal.contact_id) {
    // Entrou na Etapa
    if (automationStageId && (stageChanged || statusMovedToFinal)) {
      runAutomationsForTrigger({
        accountId: profile.account_id,
        triggerType: 'deal_stage_entered',
        contactId: deal.contact_id,
        context: { deal_stage_id: automationStageId, deal_id: deal.id },
      }).catch((err) => console.error('[automations] deal_stage_entered error:', err))
    }

    // Saiu da Etapa (o stage anterior, quando há mudança real de etapa)
    if (stageChanged && deal.stage_id) {
      runAutomationsForTrigger({
        accountId: profile.account_id,
        triggerType: 'deal_stage_left',
        contactId: deal.contact_id,
        context: { deal_stage_id: deal.stage_id as string, deal_id: deal.id },
      }).catch((err) => console.error('[automations] deal_stage_left error:', err))
    }

    // Negócio Ganho
    if (effectiveStatus === 'won' && statusChanged) {
      runAutomationsForTrigger({
        accountId: profile.account_id,
        triggerType: 'deal_won',
        contactId: deal.contact_id,
        context: { deal_id: deal.id },
      }).catch((err) => console.error('[automations] deal_won error:', err))
    }

    // Negócio Perdido
    if (effectiveStatus === 'lost' && statusChanged) {
      runAutomationsForTrigger({
        accountId: profile.account_id,
        triggerType: 'deal_lost',
        contactId: deal.contact_id,
        context: { deal_id: deal.id },
      }).catch((err) => console.error('[automations] deal_lost error:', err))
    }
  }

  // ── Close conversations when deal enters Perdido ───────────────────────────
  // Guaranteed built-in behavior — independent of automations configuration.

  if (effectiveStatus === 'lost' && statusChanged && deal.contact_id) {
    admin
      .from('conversations')
      .update({ status: 'closed', updated_at: new Date().toISOString() })
      .eq('account_id', deal.account_id)
      .eq('contact_id', deal.contact_id)
      .then(({ error: closeErr }) => {
        if (closeErr) console.error('[deals] close conversation error:', closeErr.message)
      })
  }

  return NextResponse.json({ ok: true })
}
