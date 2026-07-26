-- ============================================================
-- 061_appointment_reminder_automation.sql
--
-- Backs the new 'appointment_upcoming' automation trigger — "send a
-- message N hours before a contact's scheduled calendar_events entry."
-- Fired by a periodic cron route (src/app/api/cron/appointment-reminders),
-- not by any live webhook, since nothing else changes when an
-- appointment's start_at approaches; something has to poll for it.
--
-- Dedup: one row per (automation_id, calendar_event_id) claimed BEFORE
-- dispatching, so a slow tick or an overlapping run window can never
-- send the same reminder twice for the same automation. Deliberately a
-- dedicated table rather than reusing automation_logs — an account can
-- have more than one appointment_upcoming automation (e.g. one 24h
-- before, another 2h before) and each needs to fire independently for
-- the same event.
--
-- Idempotent — safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS automation_fired_events (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  automation_id     UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  calendar_event_id UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  fired_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (automation_id, calendar_event_id)
);

COMMENT ON TABLE automation_fired_events IS
  'Internal bookkeeping for appointment_upcoming automations — claims (automation_id, calendar_event_id) so the reminder cron never double-fires. Not exposed to the app UI; only the service-role cron route touches it.';

-- RLS on, no policies — deny-by-default. Only the service-role client
-- used by the cron route reads/writes this table.
ALTER TABLE automation_fired_events ENABLE ROW LEVEL SECURITY;
