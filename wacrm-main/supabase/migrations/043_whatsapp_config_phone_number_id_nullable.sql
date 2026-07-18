-- 043_whatsapp_config_phone_number_id_nullable.sql
--
-- phone_number_id was NOT NULL since 001_initial_schema.sql, back when
-- 'meta' was the only provider. Now that 'wapi' and 'evolution' exist
-- (027, 042), it's meta-specific and must not block inserts for the
-- other providers — a fresh account activating wapi/evolution with no
-- prior meta config hits "null value in column phone_number_id
-- violates not-null constraint" on the very first insert.
--
-- Production wapi rows never hit this because they were created by
-- flipping an existing meta row's provider (UPDATE, not INSERT), so
-- phone_number_id was already populated from its meta days. A brand
-- new self-hosted account has no such row to inherit from.

ALTER TABLE whatsapp_config ALTER COLUMN phone_number_id DROP NOT NULL;
