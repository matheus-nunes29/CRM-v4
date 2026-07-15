-- 042_evolution_provider.sql
--
-- Two fixes, bundled because they touch the same column:
--
-- 1. Schema/code drift: 027_whatsapp_provider.sql constrained `provider`
--    to ('meta', 'evolution'), but 'wapi' has been used in production
--    since (the TS union `WhatsAppProvider` already includes it) —
--    someone dropped/altered the constraint directly against the
--    database without a migration. Re-create it here so a fresh
--    self-hosted instance matches what the code actually does.
--
-- 2. Evolution API connection-state columns, mirroring the existing
--    wapi_connected / wapi_connected_phone pair, so the config route
--    has somewhere to persist "is this instance actually paired".

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'whatsapp_config'
      AND constraint_name = 'whatsapp_config_provider_check'
  ) THEN
    ALTER TABLE whatsapp_config DROP CONSTRAINT whatsapp_config_provider_check;
  END IF;

  ALTER TABLE whatsapp_config
    ADD CONSTRAINT whatsapp_config_provider_check
    CHECK (provider IN ('meta', 'evolution', 'wapi'));
END $$;

ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS evolution_connected BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS evolution_connected_phone TEXT;
