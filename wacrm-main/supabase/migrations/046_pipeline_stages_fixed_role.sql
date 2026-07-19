-- 046_pipeline_stages_fixed_role.sql
--
-- Adds pipeline_stages.fixed_role, used throughout the app (pipeline
-- board sorting, won/lost detection, auto_create_deal stage
-- resolution) to mark a stage as playing a special role regardless of
-- its display name/position: 'new_lead' (default landing stage for
-- new deals), 'won', 'lost'. Normal stages have fixed_role = NULL.
--
-- This column was applied directly to the original Supabase Cloud
-- project outside of any migration file (schema drift), so it never
-- existed in this migrations folder — fresh self-hosted databases
-- built from these migrations alone were missing it entirely, which
-- broke every pipeline_stages insert (e.g. new pipeline creation,
-- default pipeline seeding) with "column fixed_role does not exist".

ALTER TABLE pipeline_stages
  ADD COLUMN IF NOT EXISTS fixed_role TEXT
  CHECK (fixed_role IN ('new_lead', 'won', 'lost'));
