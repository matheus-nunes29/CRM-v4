-- 054_feature_gate_broadcasts.sql
--
-- Adds 'broadcasts' ("Disparos") to the set of platform-admin-gated
-- modules, same mechanism as 052 (patient_records) and 053
-- (automations/flows). Backfills every account that exists right now
-- with 'broadcasts' in enabled_features BEFORE gating the policies —
-- the Mayara account already sends broadcasts in production, so skipping
-- this backfill would lock her out the moment this migration lands.
-- Accounts created after this migration via the admin panel start
-- without 'broadcasts' unless the platform admin explicitly checks it.
--
-- Re-applies the existing broadcasts/broadcast_recipients policies from
-- 017_account_sharing.sql with one `AND account_has_feature(...)` added —
-- the `is_account_member(...)` condition on each is otherwise
-- byte-for-byte identical to what's already live.
--
-- Idempotent — safe to re-run.

UPDATE accounts
SET enabled_features = enabled_features || ARRAY['broadcasts']
WHERE NOT ('broadcasts' = ANY(enabled_features));

-- ---- broadcasts -------------------------------------------------
DROP POLICY IF EXISTS broadcasts_select ON broadcasts;
DROP POLICY IF EXISTS broadcasts_insert ON broadcasts;
DROP POLICY IF EXISTS broadcasts_update ON broadcasts;
DROP POLICY IF EXISTS broadcasts_delete ON broadcasts;
CREATE POLICY broadcasts_select ON broadcasts FOR SELECT USING (
  is_account_member(account_id) AND account_has_feature(account_id, 'broadcasts')
);
CREATE POLICY broadcasts_insert ON broadcasts FOR INSERT WITH CHECK (
  is_account_member(account_id, 'agent') AND account_has_feature(account_id, 'broadcasts')
);
CREATE POLICY broadcasts_update ON broadcasts FOR UPDATE USING (
  is_account_member(account_id, 'agent') AND account_has_feature(account_id, 'broadcasts')
) WITH CHECK (
  is_account_member(account_id, 'agent') AND account_has_feature(account_id, 'broadcasts')
);
CREATE POLICY broadcasts_delete ON broadcasts FOR DELETE USING (
  is_account_member(account_id, 'agent') AND account_has_feature(account_id, 'broadcasts')
);

-- ---- broadcast_recipients (parent-join on broadcasts) -------------------
DROP POLICY IF EXISTS broadcast_recipients_select ON broadcast_recipients;
DROP POLICY IF EXISTS broadcast_recipients_modify ON broadcast_recipients;
CREATE POLICY broadcast_recipients_select ON broadcast_recipients FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM broadcasts b
    WHERE b.id = broadcast_recipients.broadcast_id
      AND is_account_member(b.account_id)
      AND account_has_feature(b.account_id, 'broadcasts')
  )
);
CREATE POLICY broadcast_recipients_modify ON broadcast_recipients FOR ALL USING (
  EXISTS (
    SELECT 1 FROM broadcasts b
    WHERE b.id = broadcast_recipients.broadcast_id
      AND is_account_member(b.account_id, 'agent')
      AND account_has_feature(b.account_id, 'broadcasts')
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM broadcasts b
    WHERE b.id = broadcast_recipients.broadcast_id
      AND is_account_member(b.account_id, 'agent')
      AND account_has_feature(b.account_id, 'broadcasts')
  )
);
