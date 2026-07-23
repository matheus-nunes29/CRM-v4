-- 049_account_plan_fields.sql
--
-- Adds the metadata a platform admin needs per account: what kind of
-- business it is, how many seats it's allowed, whether it's suspended, and
-- which optional modules are switched on for it.
--
-- CRITICAL — read before applying to any deployment with real accounts:
-- this migration backfills `enabled_features` on every account that exists
-- at the moment it runs with the full feature set ('prontuario',
-- 'automations', 'flows') *before* any later migration starts gating those
-- modules behind `account_has_feature`. Every account created before this
-- migration was, in practice, already using automations/flows freely (and,
-- via undocumented schema drift on at least one deployment, patient
-- records too) — skipping this backfill would silently lock existing
-- customers out the moment 051/052 ship. Accounts created *after* this
-- migration (i.e. via the new admin-provisioning flow) start with an empty
-- `enabled_features` and get whatever the platform admin explicitly picks.
--
-- Idempotent — safe to re-run (backfill is guarded by `WHERE enabled_features = '{}'`).

-- ============================================================
-- New columns on accounts
-- ============================================================
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS business_type TEXT NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS max_seats INTEGER,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS enabled_features TEXT[] NOT NULL DEFAULT '{}';

-- business_type: a TEXT + CHECK, not an ENUM. Business verticals the PYVO
-- sells to will grow over time; widening a CHECK is a plain
-- DROP/ADD CONSTRAINT, while PostgreSQL enums can't have values added
-- inside the same transaction that then uses them — a worse fit for this
-- migration style.
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_business_type_check;
ALTER TABLE accounts ADD CONSTRAINT accounts_business_type_check
  CHECK (business_type IN ('clinica_estetica', 'clinica_odontologica', 'other'));

ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_status_check;
ALTER TABLE accounts ADD CONSTRAINT accounts_status_check
  CHECK (status IN ('active', 'suspended', 'trial'));

-- max_seats is nullable = unlimited. NULL is the safe default for every
-- account that existed before a platform admin ever set a limit.
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_max_seats_check;
ALTER TABLE accounts ADD CONSTRAINT accounts_max_seats_check
  CHECK (max_seats IS NULL OR max_seats > 0);

-- ============================================================
-- Backfill — grandfather every account that exists right now. See the
-- CRITICAL note above; do not remove or narrow this without re-checking
-- every account that will be gated by 051/052 first.
-- ============================================================
UPDATE accounts
SET enabled_features = ARRAY['prontuario', 'automations', 'flows']
WHERE enabled_features = '{}';

-- ============================================================
-- is_account_member — re-created (not just extended) to also require an
-- active account for anything above viewer. A suspended account can still
-- be *read* (viewer-tier) so its own dashboard can render a "this account
-- is suspended" notice instead of an opaque wall of empty-data errors, but
-- no write of any kind (agent/admin/owner-tier) goes through.
-- ============================================================
CREATE OR REPLACE FUNCTION is_account_member(
  target_account_id UUID,
  min_role account_role_enum DEFAULT 'viewer'
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles p
    JOIN accounts a ON a.id = p.account_id
    WHERE p.user_id = auth.uid()
      AND p.account_id = target_account_id
      AND (min_role = 'viewer' OR a.status = 'active')
      AND CASE p.account_role
            WHEN 'owner'  THEN 4
            WHEN 'admin'  THEN 3
            WHEN 'agent'  THEN 2
            WHEN 'viewer' THEN 1
          END
        >=
          CASE min_role
            WHEN 'owner'  THEN 4
            WHEN 'admin'  THEN 3
            WHEN 'agent'  THEN 2
            WHEN 'viewer' THEN 1
          END
  );
$$;

ALTER FUNCTION is_account_member(UUID, account_role_enum) OWNER TO postgres;
REVOKE ALL ON FUNCTION is_account_member(UUID, account_role_enum) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION is_account_member(UUID, account_role_enum) FROM anon;
GRANT EXECUTE ON FUNCTION is_account_member(UUID, account_role_enum) TO authenticated, service_role;

-- ============================================================
-- account_has_feature(account_id, feature) — generic module gate, reused
-- by patient_records (051) and by automations/flows (052). Any future
-- gated module reuses this same helper instead of inlining
-- `= ANY(enabled_features)` everywhere.
-- ============================================================
CREATE OR REPLACE FUNCTION account_has_feature(
  target_account_id UUID,
  feature TEXT
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM accounts a
    WHERE a.id = target_account_id AND feature = ANY (a.enabled_features)
  );
$$;

ALTER FUNCTION account_has_feature(UUID, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION account_has_feature(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION account_has_feature(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION account_has_feature(UUID, TEXT) TO authenticated, service_role;

-- ============================================================
-- platform_provision_account — the platform-admin equivalent of
-- redeem_invitation (019): a brand-new auth user (created by the admin via
-- the Auth Admin API) already got a throwaway personal account from the
-- handle_new_user trigger. This RPC deletes that empty personal account
-- and creates the "real" account with the metadata the admin chose,
-- moving the profile there as owner.
--
-- Deliberately separate from account_invitations/redeem_invitation rather
-- than relaxing their `role <> 'owner'` CHECK — that constraint protects
-- the invariant that a teammate invite can never grant ownership, and this
-- is a structurally different action (provisioning a brand-new customer),
-- not a teammate invite.
-- ============================================================
CREATE OR REPLACE FUNCTION platform_provision_account(
  p_user_id UUID,
  p_account_name TEXT,
  p_business_type TEXT,
  p_max_seats INTEGER,
  p_enabled_features TEXT[]
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_account_id UUID;
  v_old_owner UUID;
  v_has_data BOOLEAN;
  v_new_account_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Platform admin access required' USING ERRCODE = '42501';
  END IF;

  SELECT p.account_id, a.owner_user_id
  INTO v_old_account_id, v_old_owner
  FROM profiles p
  JOIN accounts a ON a.id = p.account_id
  WHERE p.user_id = p_user_id;

  IF v_old_account_id IS NULL THEN
    RAISE EXCEPTION 'Target user has no profile yet' USING ERRCODE = '22023';
  END IF;

  -- Defensive, mirrors redeem_invitation: only proceed if the target is
  -- the sole owner of an empty personal account. Protects against calling
  -- this on a user who already belongs to a real account with data.
  IF v_old_owner <> p_user_id THEN
    RAISE EXCEPTION 'Target user does not solely own their current account'
      USING ERRCODE = '23505';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM contacts WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM deals WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM conversations WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM whatsapp_config WHERE account_id = v_old_account_id
  ) INTO v_has_data;

  IF v_has_data THEN
    RAISE EXCEPTION 'Target user''s personal account already has data'
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO accounts (name, owner_user_id, business_type, max_seats, enabled_features, status)
  VALUES (p_account_name, p_user_id, p_business_type, p_max_seats, p_enabled_features, 'active')
  RETURNING id INTO v_new_account_id;

  UPDATE profiles
  SET account_id = v_new_account_id, account_role = 'owner'
  WHERE user_id = p_user_id;

  -- Move the profile first so the cascade-on-delete of the old account
  -- doesn't try to nuke this user's profile too (mirrors redeem_invitation).
  DELETE FROM accounts WHERE id = v_old_account_id;

  RETURN v_new_account_id;
END;
$$;

ALTER FUNCTION platform_provision_account(UUID, TEXT, TEXT, INTEGER, TEXT[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION platform_provision_account(UUID, TEXT, TEXT, INTEGER, TEXT[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION platform_provision_account(UUID, TEXT, TEXT, INTEGER, TEXT[]) FROM anon;
GRANT EXECUTE ON FUNCTION platform_provision_account(UUID, TEXT, TEXT, INTEGER, TEXT[]) TO authenticated;
