-- 047_cloud_schema_drift_sync.sql
--
-- The original Supabase Cloud project accumulated schema changes made
-- directly via the dashboard/SQL editor that were never captured as
-- migrations (pipeline_stages.fixed_role, fixed in 046, was the first
-- one found). This migration syncs every other drifted piece found by
-- diffing information_schema against the Cloud project as of
-- 2026-07-19: 7 missing tables (tracking links, calendar integrations,
-- CAPI dispatch log, deal custom values, Meta Pixel config, quick
-- replies, stage keyword triggers) and a handful of missing columns on
-- existing tables. Idempotent — safe to re-run.

-- ============================================================
-- TRACKING_LINKS (created before `contacts.tracking_link_id` below,
-- which references it)
-- ============================================================
CREATE TABLE IF NOT EXISTS tracking_links (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  code              TEXT NOT NULL,
  name              TEXT NOT NULL,
  utm_source        TEXT,
  utm_medium        TEXT,
  utm_campaign      TEXT,
  utm_content       TEXT,
  utm_term          TEXT,
  destination_phone TEXT NOT NULL,
  initial_message   TEXT NOT NULL DEFAULT 'Olá!',
  click_count       INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tracking_links_code_key ON tracking_links (code);
CREATE INDEX IF NOT EXISTS tracking_links_account_id_idx ON tracking_links (account_id);

ALTER TABLE tracking_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "account members can manage tracking links" ON tracking_links;
CREATE POLICY "account members can manage tracking links" ON tracking_links FOR ALL
  USING (account_id IN (SELECT profiles.account_id FROM profiles WHERE profiles.user_id = auth.uid()));

-- ============================================================
-- QUICK_TEMPLATES (created before `broadcasts.quick_template_id`
-- below, which references it)
-- ============================================================
CREATE TABLE IF NOT EXISTS quick_templates (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  media_type TEXT CHECK (media_type IN ('image', 'video', 'audio')),
  media_url  TEXT,
  messages   JSONB
);

CREATE INDEX IF NOT EXISTS idx_quick_templates_account ON quick_templates (account_id);

ALTER TABLE quick_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS qt_select ON quick_templates;
DROP POLICY IF EXISTS qt_insert ON quick_templates;
DROP POLICY IF EXISTS qt_update ON quick_templates;
DROP POLICY IF EXISTS qt_delete ON quick_templates;
CREATE POLICY qt_select ON quick_templates FOR SELECT USING (is_account_member(account_id, 'viewer'));
CREATE POLICY qt_insert ON quick_templates FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY qt_update ON quick_templates FOR UPDATE USING (is_account_member(account_id, 'agent'));
CREATE POLICY qt_delete ON quick_templates FOR DELETE USING (is_account_member(account_id, 'agent'));

-- ============================================================
-- CALENDAR_INTEGRATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS calendar_integrations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id         UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id            UUID NOT NULL,
  provider           TEXT NOT NULL DEFAULT 'google',
  access_token       TEXT NOT NULL,
  refresh_token      TEXT,
  token_expires_at   TIMESTAMPTZ,
  calendar_id        TEXT NOT NULL DEFAULT 'primary',
  connected_email    TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  watch_channel_id   TEXT,
  watch_resource_id  TEXT,
  watch_expires_at   TIMESTAMPTZ,
  sync_token         TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS calendar_integrations_account_id_provider_key
  ON calendar_integrations (account_id, provider);

ALTER TABLE calendar_integrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "account members" ON calendar_integrations;
-- Note: the Cloud source policy compared `profiles.id = auth.uid()`,
-- which can never match (profiles.id is that row's own PK, not the
-- auth user id) — every other policy in this codebase keys off
-- profiles.user_id, so that's used here instead rather than
-- reproducing what looks like a dead/no-op policy from Cloud.
CREATE POLICY "account members" ON calendar_integrations FOR ALL
  USING (account_id IN (SELECT profiles.account_id FROM profiles WHERE profiles.user_id = auth.uid()));

-- ============================================================
-- CAPI_DISPATCH_LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS capi_dispatch_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id    UUID REFERENCES contacts(id) ON DELETE SET NULL,
  event_name    TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  stage_id      UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  utm_source    TEXT,
  utm_campaign  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS capi_dispatch_log_account_id_idx ON capi_dispatch_log (account_id);

ALTER TABLE capi_dispatch_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "account members can view capi log" ON capi_dispatch_log;
CREATE POLICY "account members can view capi log" ON capi_dispatch_log FOR ALL
  USING (account_id IN (SELECT profiles.account_id FROM profiles WHERE profiles.user_id = auth.uid()));

-- ============================================================
-- DEAL_CUSTOM_VALUES (mirrors contact_custom_values, but for deals)
-- ============================================================
CREATE TABLE IF NOT EXISTS deal_custom_values (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deal_id         UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  custom_field_id UUID NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE,
  value           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (deal_id, custom_field_id)
);

ALTER TABLE deal_custom_values ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deal_custom_values_select ON deal_custom_values;
DROP POLICY IF EXISTS deal_custom_values_modify ON deal_custom_values;
CREATE POLICY deal_custom_values_select ON deal_custom_values FOR SELECT
  USING (EXISTS (SELECT 1 FROM deals d WHERE d.id = deal_custom_values.deal_id AND is_account_member(d.account_id)));
CREATE POLICY deal_custom_values_modify ON deal_custom_values FOR ALL
  USING (EXISTS (SELECT 1 FROM deals d WHERE d.id = deal_custom_values.deal_id AND is_account_member(d.account_id, 'agent')));

-- ============================================================
-- META_PIXEL_CONFIG
-- ============================================================
CREATE TABLE IF NOT EXISTS meta_pixel_config (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  pixel_id        TEXT NOT NULL,
  access_token    TEXT NOT NULL,
  test_event_code TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS meta_pixel_config_account_id_key ON meta_pixel_config (account_id);

ALTER TABLE meta_pixel_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "account members can manage pixel config" ON meta_pixel_config;
CREATE POLICY "account members can manage pixel config" ON meta_pixel_config FOR ALL
  USING (account_id IN (SELECT profiles.account_id FROM profiles WHERE profiles.user_id = auth.uid()));

-- ============================================================
-- STAGE_TRIGGERS
-- ============================================================
CREATE TABLE IF NOT EXISTS stage_triggers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  stage_id   UUID NOT NULL REFERENCES pipeline_stages(id) ON DELETE CASCADE,
  keyword    TEXT NOT NULL,
  match_type TEXT NOT NULL DEFAULT 'contains',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stage_triggers_account_id_idx ON stage_triggers (account_id);

ALTER TABLE stage_triggers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "account members can manage stage triggers" ON stage_triggers;
CREATE POLICY "account members can manage stage triggers" ON stage_triggers FOR ALL
  USING (account_id IN (SELECT profiles.account_id FROM profiles WHERE profiles.user_id = auth.uid()));

-- ============================================================
-- MISSING COLUMNS ON EXISTING TABLES
-- ============================================================

-- contacts: UTM attribution + WhatsApp LID (W-API)
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS utm_source        TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium        TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign      TEXT,
  ADD COLUMN IF NOT EXISTS utm_content       TEXT,
  ADD COLUMN IF NOT EXISTS utm_term          TEXT,
  ADD COLUMN IF NOT EXISTS tracking_link_id  UUID REFERENCES tracking_links(id),
  ADD COLUMN IF NOT EXISTS gclid             TEXT,
  ADD COLUMN IF NOT EXISTS wapi_lid          TEXT;

-- whatsapp_config: W-API connection state (mirrors the evolution_* columns from 042)
ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS wapi_instance_id     TEXT,
  ADD COLUMN IF NOT EXISTS wapi_connected       BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS wapi_connected_phone TEXT,
  ADD COLUMN IF NOT EXISTS wapi_connected_lid   TEXT;

-- broadcast_recipients: worker lock timestamp
ALTER TABLE broadcast_recipients
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ;

-- broadcasts: quick-reply broadcast support
ALTER TABLE broadcasts
  ADD COLUMN IF NOT EXISTS broadcast_type      TEXT NOT NULL DEFAULT 'meta',
  ADD COLUMN IF NOT EXISTS quick_template_id   UUID REFERENCES quick_templates(id),
  ADD COLUMN IF NOT EXISTS quick_template_body TEXT,
  ADD COLUMN IF NOT EXISTS delay_seconds       INTEGER NOT NULL DEFAULT 10;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'broadcasts_broadcast_type_check') THEN
    ALTER TABLE broadcasts ADD CONSTRAINT broadcasts_broadcast_type_check
      CHECK (broadcast_type IN ('meta', 'quick'));
  END IF;
END $$;

-- calendar_events: status tracking + assignment
ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS status              TEXT NOT NULL DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS provider_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assigned_to         UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- custom_fields: deal-level custom fields (vs. contact-level) + card visibility
ALTER TABLE custom_fields
  ADD COLUMN IF NOT EXISTS entity_type   TEXT NOT NULL DEFAULT 'contact',
  ADD COLUMN IF NOT EXISTS show_on_card  BOOLEAN NOT NULL DEFAULT false;

-- message_templates: WhatsApp variable → CRM field mapping
ALTER TABLE message_templates
  ADD COLUMN IF NOT EXISTS variable_mappings JSONB NOT NULL DEFAULT '[]'::jsonb;

-- pipeline_stages: CAPI event fired when a deal enters this stage
ALTER TABLE pipeline_stages
  ADD COLUMN IF NOT EXISTS capi_event TEXT;
