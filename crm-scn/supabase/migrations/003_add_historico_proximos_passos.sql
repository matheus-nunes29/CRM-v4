ALTER TABLE leads ADD COLUMN IF NOT EXISTS historico_proximos_passos JSONB DEFAULT '[]'::jsonb;
