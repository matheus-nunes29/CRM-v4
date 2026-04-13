-- Add link_transcricao column to leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS link_transcricao TEXT;
