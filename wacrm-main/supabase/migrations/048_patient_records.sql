-- ============================================================
-- 048_patient_records.sql
--
-- Clinical evolution records ("prontuário") for the aesthetics-clinic
-- vertical. This is intentionally NOT a field on `deals` or a row in
-- `contact_notes`: a prontuário entry belongs to the patient
-- (contact_id), not to a commercial deal, and it is append-only —
-- once saved, a record is never updated or deleted through the app.
-- Corrections are made by inserting a new row that references the one
-- being corrected via `corrects_record_id`, preserving full history.
--
-- Deliberately no UPDATE / DELETE RLS policy is created below — RLS
-- defaults to deny, so this alone enforces immutability at the DB
-- level (only the service-role key, which no app code uses against
-- this table, can bypass it).
--
-- Idempotent — safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS patient_records (
  id                          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id                  UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id                  UUID        NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  deal_id                     UUID        REFERENCES deals(id) ON DELETE SET NULL,
  professional_id             UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  occurred_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  procedure_description       TEXT        NOT NULL,
  treated_area                TEXT,
  products_used                JSONB       NOT NULL DEFAULT '[]'::jsonb,
  observations                 TEXT,
  next_session_recommended_at DATE,
  photos                      JSONB       NOT NULL DEFAULT '[]'::jsonb,
  corrects_record_id          UUID        REFERENCES patient_records(id) ON DELETE SET NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE patient_records IS
  'Append-only clinical evolution log ("prontuário") per patient. No UPDATE/DELETE policy exists on purpose — see file header.';
COMMENT ON COLUMN patient_records.products_used IS
  'Array of {name, lot, expiration, quantity} — traceability for injectables (toxina botulínica, preenchedores etc).';
COMMENT ON COLUMN patient_records.photos IS
  'Array of {path, type: "before"|"after", marketing_consent: boolean} — objects live in the private patient-records-media bucket, resolved to signed URLs at read time.';
COMMENT ON COLUMN patient_records.corrects_record_id IS
  'Self-reference used to append a correction to an earlier entry instead of editing it.';

CREATE INDEX IF NOT EXISTS idx_patient_records_account ON patient_records(account_id);
CREATE INDEX IF NOT EXISTS idx_patient_records_contact ON patient_records(contact_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_patient_records_deal    ON patient_records(deal_id) WHERE deal_id IS NOT NULL;

ALTER TABLE patient_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patient_records_select ON patient_records;
CREATE POLICY patient_records_select ON patient_records
  FOR SELECT USING (is_account_member(account_id));

DROP POLICY IF EXISTS patient_records_insert ON patient_records;
CREATE POLICY patient_records_insert ON patient_records
  FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));

-- No UPDATE / DELETE policy — append-only by design (see header).

-- ── Storage: private bucket for before/after photos ──────────────────
-- Public=FALSE deliberately deviates from the flow-media/chat-media
-- convention: these are clinical photos of a patient's body, dado
-- sensível de saúde under LGPD, and must not be reachable via a bare
-- public URL. Display goes through a signed URL generated at read
-- time (short-lived, scoped to one object).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'patient-records-media',
  'patient-records-media',
  FALSE,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS patient_records_media_select ON storage.objects;
CREATE POLICY patient_records_media_select ON storage.objects
  FOR SELECT USING (
    bucket_id = 'patient-records-media'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS patient_records_media_insert ON storage.objects;
CREATE POLICY patient_records_media_insert ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'patient-records-media'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
    )
  );

-- DELETE is allowed (unlike the patient_records table rows) so a photo
-- staged during a form that's abandoned before submit doesn't linger
-- as an orphan. Once a patient_records row is actually saved, the app
-- never calls delete on the objects referenced by its `photos` column.
DROP POLICY IF EXISTS patient_records_media_delete ON storage.objects;
CREATE POLICY patient_records_media_delete ON storage.objects
  FOR DELETE USING (
    bucket_id = 'patient-records-media'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
    )
  );
