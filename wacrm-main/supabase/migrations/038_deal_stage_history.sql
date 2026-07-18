-- ============================================================
-- 038_deal_stage_history.sql
--
-- Tracks when a deal entered / exited each pipeline stage.
-- Works for any pipeline or stage — existing or created in the future.
--
-- Two triggers fire on the `deals` table:
--   INSERT → records the initial stage entry.
--   UPDATE → when stage_id changes, closes the previous row
--            (sets exited_at) and opens a new one.
-- ============================================================

CREATE TABLE IF NOT EXISTS deal_stage_history (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  deal_id     UUID        NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  stage_id    UUID        NOT NULL REFERENCES pipeline_stages(id) ON DELETE CASCADE,
  pipeline_id UUID        NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  account_id  UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  entered_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  exited_at   TIMESTAMPTZ          -- NULL means the deal is currently in this stage
);

CREATE INDEX IF NOT EXISTS idx_deal_stage_history_deal    ON deal_stage_history(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_stage_history_account ON deal_stage_history(account_id);

ALTER TABLE deal_stage_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY dsh_select ON deal_stage_history FOR SELECT USING (is_account_member(account_id));
CREATE POLICY dsh_insert ON deal_stage_history FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY dsh_update ON deal_stage_history FOR UPDATE USING (is_account_member(account_id, 'agent'));

-- ── Trigger function ────────────────────────────────────────

CREATE OR REPLACE FUNCTION record_deal_stage_history()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO deal_stage_history (deal_id, stage_id, pipeline_id, account_id, entered_at)
    VALUES (NEW.id, NEW.stage_id, NEW.pipeline_id, NEW.account_id,
            COALESCE(NEW.created_at, NOW()));

  ELSIF TG_OP = 'UPDATE' AND OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
    -- Close the row for the stage the deal is leaving
    UPDATE deal_stage_history
       SET exited_at = NOW()
     WHERE deal_id = NEW.id
       AND stage_id = OLD.stage_id
       AND exited_at IS NULL;

    -- Open a row for the stage the deal is entering
    INSERT INTO deal_stage_history (deal_id, stage_id, pipeline_id, account_id, entered_at)
    VALUES (NEW.id, NEW.stage_id, NEW.pipeline_id, NEW.account_id, NOW());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deal_stage_history ON deals;
CREATE TRIGGER trg_deal_stage_history
AFTER INSERT OR UPDATE ON deals
FOR EACH ROW EXECUTE FUNCTION record_deal_stage_history();
