-- 044_whatsapp_config_access_token_nullable.sql
--
-- Same story as 043 for phone_number_id: access_token is meta-specific
-- (the Meta Cloud API permanent token) but was NOT NULL since
-- 001_initial_schema.sql. Blocks wapi/evolution inserts on fresh
-- accounts the same way phone_number_id did.

ALTER TABLE whatsapp_config ALTER COLUMN access_token DROP NOT NULL;
