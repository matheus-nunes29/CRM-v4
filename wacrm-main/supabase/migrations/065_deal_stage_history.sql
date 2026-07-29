-- ============================================================
-- 065_deal_stage_history.sql
--
-- Tracks when a deal entered (and left) each pipeline stage. Until now
-- `deals` only stored the *current* stage_id — no way to answer "when
-- did this deal reach Proposta" or "how long has it been won", other
-- than the crude deals.updated_at approximation the AI copilot itself
-- flagged as unreliable (src/lib/ai-agent/copilot.ts, negocios_por_status).
--
-- One row per stage the deal has ever been in; the open row (exited_at
-- IS NULL) is the deal's current stage. A DB trigger populates this
-- automatically on every insert/stage change, regardless of which code
-- path updates the deal (Pipeline drag-drop, deal-modal, API routes,
-- Automations/Flows) — app code never has to remember to log this.
--
-- Backfill: existing deals get one open history row at their current
-- stage, dated to deals.created_at. This is a best-effort baseline —
-- for a deal that has already moved stages before this migration ran,
-- it does NOT reconstruct the real prior transitions (that data was
-- never captured). Everything from this migration forward is exact.
--
-- Idempotent — safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS deal_stage_history (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deal_id     UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  stage_id    UUID NOT NULL REFERENCES pipeline_stages(id) ON DELETE CASCADE,
  entered_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- NULL exited_at = this is the deal's current stage.
  exited_at   TIMESTAMPTZ
);

COMMENT ON TABLE deal_stage_history IS
  'One row per stage a deal has occupied. exited_at IS NULL marks the current stage. Populated by trg_deal_stage_history — never written to directly by app code.';

CREATE INDEX IF NOT EXISTS idx_deal_stage_history_deal ON deal_stage_history(deal_id, entered_at DESC);
CREATE INDEX IF NOT EXISTS idx_deal_stage_history_account_stage ON deal_stage_history(account_id, stage_id);
-- Fast "what's the current stage row for this deal" lookup.
CREATE UNIQUE INDEX IF NOT EXISTS idx_deal_stage_history_open ON deal_stage_history(deal_id) WHERE exited_at IS NULL;

-- SECURITY DEFINER: deals are updated both by the authenticated user's
-- own RLS-scoped session (Pipeline drag-drop) and by service-role API
-- routes (Automations/Flows advancing a deal). Either way this trigger
-- must be able to write the audit row — there is intentionally no
-- client-facing INSERT policy on deal_stage_history (see RLS below),
-- so without DEFINER the trigger would fail under the user-session path.
CREATE OR REPLACE FUNCTION log_deal_stage_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO deal_stage_history (deal_id, account_id, stage_id, entered_at)
    VALUES (NEW.id, NEW.account_id, NEW.stage_id, NOW());
  ELSIF TG_OP = 'UPDATE' AND NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    UPDATE deal_stage_history
      SET exited_at = NOW()
      WHERE deal_id = NEW.id AND exited_at IS NULL;
    INSERT INTO deal_stage_history (deal_id, account_id, stage_id, entered_at)
    VALUES (NEW.id, NEW.account_id, NEW.stage_id, NOW());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deal_stage_history ON deals;
CREATE TRIGGER trg_deal_stage_history
  AFTER INSERT OR UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION log_deal_stage_change();

-- Backfill existing deals (see header note on accuracy).
INSERT INTO deal_stage_history (deal_id, account_id, stage_id, entered_at)
SELECT d.id, d.account_id, d.stage_id, d.created_at
FROM deals d
WHERE NOT EXISTS (
  SELECT 1 FROM deal_stage_history h WHERE h.deal_id = d.id
);

-- ── RLS ───────────────────────────────────────────────────────────────

ALTER TABLE deal_stage_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deal_stage_history_select ON deal_stage_history;
CREATE POLICY deal_stage_history_select ON deal_stage_history
  FOR SELECT USING (is_account_member(account_id));
-- No client-side insert/update policy — this is an audit trail
-- maintained exclusively by trg_deal_stage_history (SECURITY DEFINER).
