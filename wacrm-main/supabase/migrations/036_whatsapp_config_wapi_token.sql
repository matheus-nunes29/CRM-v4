-- Cache WAPI token in whatsapp_config so edge functions can read credentials
-- without depending on Vercel env vars or per-broadcast storage
ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS wapi_token text;

-- Fix broadcasts stuck from code transition: set scheduled_at = now()
-- so tick-broadcasts picks them up as soon as credentials are available
UPDATE broadcast_recipients
SET scheduled_at = now()
WHERE status = 'pending'
  AND scheduled_at IS NULL
  AND broadcast_id IN (
    SELECT id FROM broadcasts WHERE status = 'sending'
  );
