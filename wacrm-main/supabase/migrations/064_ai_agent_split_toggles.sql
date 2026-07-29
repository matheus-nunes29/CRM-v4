-- ============================================================
-- 064_ai_agent_split_toggles.sql
--
-- Splits the single ai_agent_configs.enabled switch into two
-- independent toggles — the WhatsApp autoresponder and the internal
-- copilot are separate surfaces (src/lib/ai-agent/engine.ts vs.
-- src/lib/ai-agent/copilot.ts) and an account may want one without
-- the other (e.g. copilot on for staff, autoresponder still being
-- tuned before going live on real customer conversations).
--
-- Rename is metadata-only in Postgres (no table rewrite) — safe on a
-- live table. Existing `enabled=true` rows keep the autoresponder on;
-- copilot_enabled defaults to false so nothing silently turns on for
-- accounts that already configured the agent under the old single
-- switch.
--
-- Idempotent — safe to re-run (RENAME COLUMN is not, so it's guarded).
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_agent_configs' AND column_name = 'enabled'
  ) THEN
    ALTER TABLE ai_agent_configs RENAME COLUMN enabled TO autoresponder_enabled;
  END IF;
END $$;

ALTER TABLE ai_agent_configs
  ADD COLUMN IF NOT EXISTS copilot_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN ai_agent_configs.autoresponder_enabled IS
  'Turns the WhatsApp autoresponder fallback on/off (src/lib/ai-agent/engine.ts). Independent from copilot_enabled.';
COMMENT ON COLUMN ai_agent_configs.copilot_enabled IS
  'Turns the internal CRM copilot chat widget on/off (src/lib/ai-agent/copilot.ts). Independent from autoresponder_enabled.';
