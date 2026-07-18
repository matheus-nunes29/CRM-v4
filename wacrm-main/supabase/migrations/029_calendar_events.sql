-- ============================================================
-- 029_calendar_events.sql — Calendar / scheduling table
--
-- Creates calendar_events used by the Agenda feature.
-- All writes go through the service-role API (supabaseAdmin),
-- so only SELECT needs a member-facing RLS policy.
-- ============================================================

CREATE TABLE IF NOT EXISTS calendar_events (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id        UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_by        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id        UUID        REFERENCES contacts(id) ON DELETE SET NULL,
  deal_id           UUID        REFERENCES deals(id) ON DELETE SET NULL,
  provider          TEXT        NOT NULL DEFAULT 'internal',
  provider_event_id TEXT,
  calendar_id       TEXT        NOT NULL DEFAULT 'primary',
  title             TEXT        NOT NULL,
  description       TEXT,
  start_at          TIMESTAMPTZ NOT NULL,
  end_at            TIMESTAMPTZ NOT NULL,
  meet_link         TEXT,
  attendees         JSONB       NOT NULL DEFAULT '[]',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (account_id, provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_account  ON calendar_events(account_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_contact  ON calendar_events(contact_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_deal     ON calendar_events(deal_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_start_at ON calendar_events(start_at);

ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

-- Members can read their own account's events
DROP POLICY IF EXISTS calendar_events_select ON calendar_events;
CREATE POLICY calendar_events_select ON calendar_events
  FOR SELECT USING (is_account_member(account_id, 'viewer'));

-- All writes go through the service-role key (API routes use supabaseAdmin),
-- so regular users have no INSERT / UPDATE / DELETE access via client.
