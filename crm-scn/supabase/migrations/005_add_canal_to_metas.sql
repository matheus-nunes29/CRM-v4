ALTER TABLE metas_mensais ADD COLUMN IF NOT EXISTS canal VARCHAR DEFAULT 'geral';
UPDATE metas_mensais SET canal = 'geral' WHERE canal IS NULL;
ALTER TABLE metas_mensais DROP CONSTRAINT IF EXISTS metas_mensais_periodo_key;
ALTER TABLE metas_mensais ADD CONSTRAINT IF NOT EXISTS metas_mensais_periodo_canal_key UNIQUE (periodo, canal);
