-- 050_seat_limit_enforcement.sql
--
-- Enforces accounts.max_seats (049) at the one point where a new row
-- actually lands in profiles.account_id = X: redeeming an invitation.
-- Pending invitations don't occupy a seat until redeemed, so this is the
-- correct — and only — authoritative place to block over-capacity joins.
--
-- Re-creates redeem_invitation (019_invitation_rpcs.sql) with 100% of its
-- original logic intact, inserting one capacity check before the account
-- move. 23505 is already mapped to HTTP 409 by the existing
-- rpcErrorToResponse in src/app/api/invitations/[token]/redeem/route.ts —
-- no route change needed for the authoritative check.
--
-- Idempotent — safe to re-run.

CREATE OR REPLACE FUNCTION public.redeem_invitation(
  p_token_hash TEXT
) RETURNS UUID  -- the joined account_id
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_inv account_invitations%ROWTYPE;
  v_old_account_id UUID;
  v_old_account_owner UUID;
  v_has_data BOOLEAN;
  v_max_seats INTEGER;
  v_seats_used INTEGER;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_inv
  FROM account_invitations
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found' USING ERRCODE = '22023';
  END IF;
  IF v_inv.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invitation has already been redeemed'
      USING ERRCODE = '22023';
  END IF;
  IF v_inv.expires_at <= NOW() THEN
    RAISE EXCEPTION 'Invitation has expired' USING ERRCODE = '22023';
  END IF;

  -- Seat limit — NEW in this migration. NULL max_seats means unlimited.
  -- Checked against current members only (pending invitations don't
  -- occupy a seat until this very redemption).
  SELECT max_seats INTO v_max_seats FROM accounts WHERE id = v_inv.account_id;
  IF v_max_seats IS NOT NULL THEN
    SELECT COUNT(*) INTO v_seats_used FROM profiles WHERE account_id = v_inv.account_id;
    IF v_seats_used >= v_max_seats THEN
      RAISE EXCEPTION 'This account has reached its seat limit'
        USING ERRCODE = '23505';
    END IF;
  END IF;

  -- Caller's current account + its owner.
  SELECT p.account_id, a.owner_user_id
  INTO v_old_account_id, v_old_account_owner
  FROM profiles p
  JOIN accounts a ON a.id = p.account_id
  WHERE p.user_id = v_caller_id;

  IF v_old_account_id IS NULL THEN
    -- Defensive — every authenticated user has a profile post-017.
    RAISE EXCEPTION 'Caller has no profile' USING ERRCODE = '42501';
  END IF;

  -- Edge case: the inviter sent themselves a link, or the caller is
  -- somehow already in the inviter's account.
  IF v_old_account_id = v_inv.account_id THEN
    RAISE EXCEPTION 'You are already a member of this account'
      USING ERRCODE = '23505';
  END IF;

  -- Safety: the caller must be the SOLE OWNER of their current account
  -- (i.e. their fresh personal account from signup or a prior removal).
  -- Any other state means they're either:
  --   - a member of another shared account (joining a second would
  --     silently orphan their access to the first), or
  --   - the owner of an account with teammates (they'd abandon their team
  --     to join the inviter's).
  -- Either way, the safe answer is "make a different login".
  IF v_old_account_owner <> v_caller_id THEN
    RAISE EXCEPTION 'You are already in a shared account; sign up with a different email to join this one'
      USING ERRCODE = '23505';
  END IF;

  -- Belt: even if they own their account, refuse if it has any domain
  -- data — joining would orphan their contacts, deals, broadcasts,
  -- automations, flows, templates, etc.
  SELECT EXISTS (
    SELECT 1 FROM contacts WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM conversations WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM broadcasts WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM automations WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM flows WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM pipelines WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM message_templates WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM tags WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM custom_fields WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM contact_notes WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM whatsapp_config WHERE account_id = v_old_account_id
    LIMIT 1
  ) INTO v_has_data;

  IF v_has_data THEN
    RAISE EXCEPTION 'Your account already contains data; sign up with a different email to join this one'
      USING ERRCODE = '23505';
  END IF;

  -- Move the profile first so the cascade-on-delete of the old account
  -- doesn't try to nuke this user's profile too.
  UPDATE profiles
  SET account_id = v_inv.account_id,
      account_role = v_inv.role
  WHERE user_id = v_caller_id;

  UPDATE account_invitations
  SET accepted_at = NOW(),
      accepted_by_user_id = v_caller_id
  WHERE id = v_inv.id;

  -- Clean up the orphan personal account. Empty by the checks above, so
  -- this is purely housekeeping — no cascades fire because no other rows
  -- reference it.
  DELETE FROM accounts WHERE id = v_old_account_id;

  RETURN v_inv.account_id;
END;
$$;

ALTER FUNCTION public.redeem_invitation(TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.redeem_invitation(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.redeem_invitation(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.redeem_invitation(TEXT) TO authenticated;
