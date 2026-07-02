-- Track which message in a multi-message sequence has been sent so far.
-- The worker sends 1 message per cron tick and reschedules the recipient
-- for the next message, avoiding sleep() inside serverless functions.
ALTER TABLE broadcast_recipients
  ADD COLUMN IF NOT EXISTS message_index INTEGER NOT NULL DEFAULT 0;
