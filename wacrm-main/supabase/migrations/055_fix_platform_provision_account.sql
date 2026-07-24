-- 055_fix_platform_provision_account.sql
--
-- Fixes a real bug in platform_provision_account (050): it INSERTed the
-- new account (owner_user_id = p_user_id) BEFORE deleting the target's
-- old personal account (same owner_user_id) — violating
-- idx_accounts_one_per_owner, since a user can never own two accounts at
-- once, not even transiently within the same transaction (it's a plain
-- unique index, not deferrable). Surfaced in production as "duplicate key
-- value violates unique constraint idx_accounts_one_per_owner" on every
-- account creation from the admin panel.
--
-- Worse, the failure wasn't clean: accounts.owner_user_id is ON DELETE
-- RESTRICT, so the API route's rollback (deleting the newly-created auth
-- user) silently failed too — Postgres won't delete a user who still owns
-- an account. Every failed attempt left behind a real auth user + an
-- orphan personal account under the signup's default name, not the name
-- the admin typed.
--
-- Fix: don't move the profile to a new account at all. The target's
-- existing personal account (created by handle_new_user, verified empty
-- and solely owned by them) is UPDATEd in place with the admin's chosen
-- name/business_type/max_seats/enabled_features — no INSERT, no DELETE,
-- no unique-index conflict, profiles.account_id never has to change.
--
-- Idempotent — safe to re-run.

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
  v_account_id UUID;
  v_owner UUID;
  v_has_data BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Platform admin access required' USING ERRCODE = '42501';
  END IF;

  SELECT p.account_id, a.owner_user_id
  INTO v_account_id, v_owner
  FROM profiles p
  JOIN accounts a ON a.id = p.account_id
  WHERE p.user_id = p_user_id;

  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'Target user has no profile yet' USING ERRCODE = '22023';
  END IF;

  -- Defensive, mirrors redeem_invitation: only proceed if the target is
  -- the sole owner of an empty personal account.
  IF v_owner <> p_user_id THEN
    RAISE EXCEPTION 'Target user does not solely own their current account'
      USING ERRCODE = '23505';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM contacts WHERE account_id = v_account_id
    UNION ALL SELECT 1 FROM deals WHERE account_id = v_account_id
    UNION ALL SELECT 1 FROM conversations WHERE account_id = v_account_id
    UNION ALL SELECT 1 FROM whatsapp_config WHERE account_id = v_account_id
  ) INTO v_has_data;

  IF v_has_data THEN
    RAISE EXCEPTION 'Target user''s personal account already has data'
      USING ERRCODE = '23505';
  END IF;

  UPDATE accounts
  SET name             = p_account_name,
      business_type    = p_business_type,
      max_seats        = p_max_seats,
      enabled_features = p_enabled_features,
      status           = 'active'
  WHERE id = v_account_id;

  RETURN v_account_id;
END;
$$;

ALTER FUNCTION platform_provision_account(UUID, TEXT, TEXT, INTEGER, TEXT[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION platform_provision_account(UUID, TEXT, TEXT, INTEGER, TEXT[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION platform_provision_account(UUID, TEXT, TEXT, INTEGER, TEXT[]) FROM anon;
GRANT EXECUTE ON FUNCTION platform_provision_account(UUID, TEXT, TEXT, INTEGER, TEXT[]) TO authenticated;
