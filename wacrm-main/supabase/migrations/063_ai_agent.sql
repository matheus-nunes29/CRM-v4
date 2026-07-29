-- ============================================================
-- 063_ai_agent.sql
--
-- Claude-based AI agent: WhatsApp autoresponder fallback + data for
-- the internal copilot. Gated behind the 'ai_agent' feature flag
-- (src/lib/auth/platform-accounts.ts), off by default per account.
--
-- ai_agent_configs      — one row per account: behavior/scope config.
-- ai_knowledge_items     — RAG-lite: text injected into the system
--                          prompt (manual entries + auto-created from
--                          corrections).
-- ai_agent_config_history — append-only snapshot on every config save,
--                          so a bad prompt edit can be reviewed/reverted.
-- ai_agent_corrections   — staff-flagged bad replies + the fix; each
--                          insert also creates a knowledge item so the
--                          same mistake doesn't repeat.
-- ai_agent_runs          — audit log of every agent turn (what it read,
--                          what it replied, whether it handed off).
--
-- Plus two additive columns:
--   conversations.owner_type — 'human' | 'ai'. Whoever is allowed to
--     answer next. Flips to 'ai' when the agent takes a conversation,
--     back to 'human' the instant a real agent sends a manual message
--     (see src/app/api/whatsapp/send/route.ts) or clicks "Assumir".
--   messages.ai_generated — marks a message as authored by the AI
--     agent specifically (as opposed to a Flow/Automation 'bot'
--     message), so the Inbox can render a distinct badge and offer
--     the "Corrigir resposta" action.
--
-- Idempotent — safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_agent_configs (
  account_id           UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  enabled              BOOLEAN NOT NULL DEFAULT FALSE,
  system_prompt        TEXT NOT NULL DEFAULT '',
  allow_pricing        BOOLEAN NOT NULL DEFAULT FALSE,
  price_list           TEXT NOT NULL DEFAULT '',
  allow_deal_updates   BOOLEAN NOT NULL DEFAULT TRUE,
  escalation_notes     TEXT NOT NULL DEFAULT '',
  updated_by           UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ai_agent_configs IS
  'Per-account behavior config for the Claude-based AI agent (WhatsApp autoresponder + copilot). One row per account, created on first save.';
COMMENT ON COLUMN ai_agent_configs.system_prompt IS
  'Free-text tone/persona instructions, prepended to the built-in scope guardrails.';
COMMENT ON COLUMN ai_agent_configs.price_list IS
  'Free-text price list injected into the prompt only when allow_pricing=true.';
COMMENT ON COLUMN ai_agent_configs.escalation_notes IS
  'Free-text description of when the agent should hand off to a human, beyond the built-in defaults (business hours, medical questions).';

CREATE TABLE IF NOT EXISTS ai_knowledge_items (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id   UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  content      TEXT NOT NULL,
  source       TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'correction')),
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ai_knowledge_items IS
  'RAG-lite knowledge base for the AI agent — active items are concatenated into the system prompt (cached). source=correction rows are auto-created from ai_agent_corrections.';

CREATE INDEX IF NOT EXISTS idx_ai_knowledge_items_account ON ai_knowledge_items(account_id, is_active);

CREATE TABLE IF NOT EXISTS ai_agent_config_history (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id   UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  changed_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  summary      TEXT NOT NULL DEFAULT '',
  snapshot     JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ai_agent_config_history IS
  'Append-only snapshot of ai_agent_configs written on every save — lets staff see/revert what changed in the agent behavior over time.';

CREATE INDEX IF NOT EXISTS idx_ai_agent_config_history_account ON ai_agent_config_history(account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_agent_corrections (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id          UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  conversation_id     UUID REFERENCES conversations(id) ON DELETE SET NULL,
  message_id          UUID REFERENCES messages(id) ON DELETE SET NULL,
  original_response   TEXT NOT NULL,
  corrected_response  TEXT NOT NULL,
  note                TEXT NOT NULL DEFAULT '',
  knowledge_item_id    UUID REFERENCES ai_knowledge_items(id) ON DELETE SET NULL,
  created_by          UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ai_agent_corrections IS
  'Staff-flagged bad AI replies with the intended correction. Each insert also creates a linked ai_knowledge_items row (source=correction) so future replies use the fix.';

CREATE INDEX IF NOT EXISTS idx_ai_agent_corrections_account ON ai_agent_corrections(account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_agent_runs (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id          UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  conversation_id     UUID REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id          UUID REFERENCES contacts(id) ON DELETE CASCADE,
  trigger_message_id  TEXT,
  response_text       TEXT,
  tool_calls          JSONB NOT NULL DEFAULT '[]'::jsonb,
  outcome             TEXT NOT NULL CHECK (outcome IN ('replied', 'handoff', 'error', 'skipped')),
  error_message       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ai_agent_runs IS
  'Audit log of every AI agent turn — what it was asked to answer, what tools it called, what it replied (or why it handed off / errored).';

CREATE INDEX IF NOT EXISTS idx_ai_agent_runs_account ON ai_agent_runs(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_agent_runs_conversation ON ai_agent_runs(conversation_id, created_at DESC);

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS owner_type TEXT NOT NULL DEFAULT 'human' CHECK (owner_type IN ('human', 'ai'));

COMMENT ON COLUMN conversations.owner_type IS
  'Who is allowed to answer next: human (default) or ai. Flips to ai when the agent takes the conversation, back to human the instant a real agent replies manually.';

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN messages.ai_generated IS
  'True for messages authored by the AI agent specifically (distinct from Flow/Automation bot messages) — drives the Inbox badge and the "Corrigir resposta" action.';

-- ── RLS ───────────────────────────────────────────────────────────────

ALTER TABLE ai_agent_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_knowledge_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_agent_config_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_agent_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_agent_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_agent_configs_select ON ai_agent_configs;
CREATE POLICY ai_agent_configs_select ON ai_agent_configs
  FOR SELECT USING (is_account_member(account_id));
DROP POLICY IF EXISTS ai_agent_configs_write ON ai_agent_configs;
CREATE POLICY ai_agent_configs_write ON ai_agent_configs
  FOR ALL USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS ai_knowledge_items_select ON ai_knowledge_items;
CREATE POLICY ai_knowledge_items_select ON ai_knowledge_items
  FOR SELECT USING (is_account_member(account_id));
DROP POLICY IF EXISTS ai_knowledge_items_write ON ai_knowledge_items;
CREATE POLICY ai_knowledge_items_write ON ai_knowledge_items
  FOR ALL USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS ai_agent_config_history_select ON ai_agent_config_history;
CREATE POLICY ai_agent_config_history_select ON ai_agent_config_history
  FOR SELECT USING (is_account_member(account_id));
-- No client-side insert policy — history rows are written by the
-- service-role config API route only, never directly by a client.

DROP POLICY IF EXISTS ai_agent_corrections_select ON ai_agent_corrections;
CREATE POLICY ai_agent_corrections_select ON ai_agent_corrections
  FOR SELECT USING (is_account_member(account_id));
DROP POLICY IF EXISTS ai_agent_corrections_insert ON ai_agent_corrections;
CREATE POLICY ai_agent_corrections_insert ON ai_agent_corrections
  FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS ai_agent_runs_select ON ai_agent_runs;
CREATE POLICY ai_agent_runs_select ON ai_agent_runs
  FOR SELECT USING (is_account_member(account_id));
-- No client-side insert policy — runs are written by the webhook
-- handler via the service-role client only.
