-- 051_patient_records.sql
--
-- Regularizes `patient_records` — this table was found running in
-- production on at least one self-hosted deployment (clinic vertical)
-- without ever having a matching migration in this repo (undocumented
-- schema drift, discovered while auditing that deployment). This migration
-- brings it under version control and, for the first time, gates it behind
-- `enabled_features` so only clinic-type accounts see it.
--
-- ATTENTION before applying to a deployment where this table already
-- exists in production: run `\d patient_records` against that database
-- first and reconcile the columns below with what's actually there — add
-- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` lines for anything real that's
-- missing from this list, following 047_cloud_schema_drift_sync.sql's
-- convergence style. As written, this assumes no prior columns beyond what
-- follows; it has not been diffed against the live drifted table.
--
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS patient_records (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id           UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id           UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  created_by_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  record_date          DATE NOT NULL DEFAULT CURRENT_DATE,
  anamnesis            TEXT,
  evolution_notes      TEXT,
  procedures_performed TEXT,
  attachments          JSONB NOT NULL DEFAULT '[]',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Column-by-column convergence, mirroring 047's style — a no-op on a fresh
-- table, but converges an already-drifted one onto this shape.
ALTER TABLE patient_records ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE patient_records ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE;
ALTER TABLE patient_records ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE patient_records ADD COLUMN IF NOT EXISTS record_date DATE NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE patient_records ADD COLUMN IF NOT EXISTS anamnesis TEXT;
ALTER TABLE patient_records ADD COLUMN IF NOT EXISTS evolution_notes TEXT;
ALTER TABLE patient_records ADD COLUMN IF NOT EXISTS procedures_performed TEXT;
ALTER TABLE patient_records ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]';
ALTER TABLE patient_records ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE patient_records ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_patient_records_account ON patient_records(account_id);
CREATE INDEX IF NOT EXISTS idx_patient_records_contact ON patient_records(contact_id);

ALTER TABLE patient_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patient_records_select ON patient_records;
DROP POLICY IF EXISTS patient_records_insert ON patient_records;
DROP POLICY IF EXISTS patient_records_update ON patient_records;
DROP POLICY IF EXISTS patient_records_delete ON patient_records;
-- Drop any pre-drift ad-hoc policy names too, in case the table was set up
-- by hand with an "allow all" style policy before this migration existed.
DROP POLICY IF EXISTS "allow all" ON patient_records;
DROP POLICY IF EXISTS "Allow all" ON patient_records;

CREATE POLICY patient_records_select ON patient_records FOR SELECT USING (
  is_account_member(account_id) AND account_has_feature(account_id, 'prontuario')
);
CREATE POLICY patient_records_insert ON patient_records FOR INSERT WITH CHECK (
  is_account_member(account_id, 'agent') AND account_has_feature(account_id, 'prontuario')
);
CREATE POLICY patient_records_update ON patient_records FOR UPDATE USING (
  is_account_member(account_id, 'agent') AND account_has_feature(account_id, 'prontuario')
) WITH CHECK (
  is_account_member(account_id, 'agent') AND account_has_feature(account_id, 'prontuario')
);
CREATE POLICY patient_records_delete ON patient_records FOR DELETE USING (
  is_account_member(account_id, 'agent') AND account_has_feature(account_id, 'prontuario')
);
