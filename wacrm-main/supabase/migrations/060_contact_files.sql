-- ============================================================
-- 060_contact_files.sql
--
-- General-purpose file attachments per contact (photos, PDFs, docs) —
-- backs a new "Arquivos" tab in the contact detail view. Deliberately
-- separate from patient_records.photos (clinical before/after,
-- append-only, feature-gated behind 'prontuario'): this is a plain
-- attachment list available to every account, with normal delete
-- since nothing stored here is a legal/clinical record.
--
-- Idempotent — safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS contact_files (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id  UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  path        TEXT NOT NULL,
  file_name   TEXT NOT NULL,
  mime_type   TEXT,
  size_bytes  BIGINT,
  uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE contact_files IS
  'Free-form file attachments per contact (photos, PDFs, docs) — objects live in the private contact-files bucket, resolved to signed URLs at read time.';

CREATE INDEX IF NOT EXISTS idx_contact_files_account ON contact_files(account_id);
CREATE INDEX IF NOT EXISTS idx_contact_files_contact ON contact_files(contact_id, created_at DESC);

ALTER TABLE contact_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contact_files_select ON contact_files;
CREATE POLICY contact_files_select ON contact_files
  FOR SELECT USING (is_account_member(account_id));

DROP POLICY IF EXISTS contact_files_insert ON contact_files;
CREATE POLICY contact_files_insert ON contact_files
  FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS contact_files_delete ON contact_files;
CREATE POLICY contact_files_delete ON contact_files
  FOR DELETE USING (is_account_member(account_id, 'agent'));

-- No UPDATE policy — an attachment is replaced by deleting and
-- re-uploading, never edited in place.

-- ── Storage: private bucket ──────────────────────────────────────────
-- Public=FALSE — attachments can include ID documents, contracts, etc.
-- Reads go through a signed URL, same convention as patient-records-media
-- (migration 048).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'contact-files',
  'contact-files',
  FALSE,
  16777216,
  ARRAY[
    'image/png', 'image/jpeg', 'image/webp', 'image/heic',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS contact_files_media_select ON storage.objects;
CREATE POLICY contact_files_media_select ON storage.objects
  FOR SELECT USING (
    bucket_id = 'contact-files'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS contact_files_media_insert ON storage.objects;
CREATE POLICY contact_files_media_insert ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'contact-files'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS contact_files_media_delete ON storage.objects;
CREATE POLICY contact_files_media_delete ON storage.objects
  FOR DELETE USING (
    bucket_id = 'contact-files'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
    )
  );
