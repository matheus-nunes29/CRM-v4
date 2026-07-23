-- 052_feature_gate_patient_records.sql
--
-- Gates the real `patient_records` table (048_patient_records.sql) behind
-- `account_has_feature(account_id, 'prontuario')` (050). Re-applies the two
-- existing client policies with the same `is_account_member(...)` condition
-- already in production, adding one `AND account_has_feature(...)` — same
-- mechanism as 053_feature_gate_automations_flows.sql for automations/flows.
--
-- No UPDATE/DELETE policy exists on this table by design (048's header:
-- append-only, immutability enforced by RLS default-deny) — nothing to gate
-- there.
--
-- Safe against the existing Mayara deployment specifically because
-- 050_account_plan_fields.sql already backfilled 'prontuario' into every
-- pre-existing account's enabled_features before this migration runs.
--
-- Storage policies on the `patient-records-media` bucket (048) are left
-- untouched — deliberately out of scope here. An account without the
-- 'prontuario' feature has no UI path to ever learn the object paths
-- (`account-<id>/...`) needed to read/write them, and the sensitive
-- structured clinical data (procedure notes, observations) is what this
-- migration actually locks down.
--
-- Idempotent — safe to re-run.

DROP POLICY IF EXISTS patient_records_select ON patient_records;
CREATE POLICY patient_records_select ON patient_records
  FOR SELECT USING (
    is_account_member(account_id) AND account_has_feature(account_id, 'prontuario')
  );

DROP POLICY IF EXISTS patient_records_insert ON patient_records;
CREATE POLICY patient_records_insert ON patient_records
  FOR INSERT WITH CHECK (
    is_account_member(account_id, 'agent') AND account_has_feature(account_id, 'prontuario')
  );
