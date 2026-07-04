-- Each recipient now has a scheduled_at so processing is time-driven, not sleep-driven
ALTER TABLE broadcast_recipients
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;

-- Store W-API credentials on the broadcast so the background cron can access them
-- (Vercel env vars are not available in Supabase Edge Functions)
ALTER TABLE broadcasts
  ADD COLUMN IF NOT EXISTS wapi_instance_id text,
  ADD COLUMN IF NOT EXISTS wapi_token text;

-- Fast lookup: pending recipients for a given broadcast that are due now
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_due
  ON broadcast_recipients (broadcast_id, scheduled_at)
  WHERE status = 'pending';

-- pg_cron: fire tick-broadcasts every minute to send due recipients
SELECT cron.schedule(
  'tick-broadcasts',
  '* * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://fkbwxhjjlsjgpwttgbdw.supabase.co/functions/v1/tick-broadcasts',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := '{}'::jsonb
  )
  $$
);
