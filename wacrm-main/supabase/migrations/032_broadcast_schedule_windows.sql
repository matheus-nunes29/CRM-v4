ALTER TABLE broadcasts
  ADD COLUMN IF NOT EXISTS schedule_windows JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS schedule_timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo';
