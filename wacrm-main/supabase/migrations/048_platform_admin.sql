-- 048_platform_admin.sql
--
-- Introduces a "platform admin" concept — a person who administers every
-- account on this deployment (the PYVO owner), orthogonal to account_role
-- (which only ever scopes a user to *their own* account). Needed because
-- wacrm is moving from "one deployment per client" to "many clients as
-- accounts inside one shared deployment", and someone has to provision and
-- manage those accounts from outside any of them.
--
-- `platform_admins` has RLS enabled with zero client-facing policies —
-- deny-all for `anon`/`authenticated`. It's only ever read through the
-- SECURITY DEFINER function below, or directly by the service role.
--
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS platform_admins (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: RLS enabled + zero policies = deny-all for
-- anon/authenticated. Only SECURITY DEFINER functions and the service
-- role can read/write this table.

-- ============================================================
-- is_platform_admin() — mirrors is_account_member's shape (017), but
-- with no account scope: true iff auth.uid() is listed in
-- platform_admins, full stop.
-- ============================================================
CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM platform_admins WHERE user_id = auth.uid()
  );
$$;

ALTER FUNCTION is_platform_admin() OWNER TO postgres;
REVOKE ALL ON FUNCTION is_platform_admin() FROM PUBLIC;
-- Explicit anon revoke: Supabase's default privileges grant EXECUTE to
-- `anon` directly (not via PUBLIC) at function-creation time, so
-- `REVOKE ... FROM PUBLIC` alone does not actually remove anon's access —
-- confirmed the hard way auditing this deployment. Every new SECURITY
-- DEFINER function in this migration set revokes anon explicitly.
REVOKE EXECUTE ON FUNCTION is_platform_admin() FROM anon;
GRANT EXECUTE ON FUNCTION is_platform_admin() TO authenticated, service_role;

-- ============================================================
-- Bootstrap — NOT run by this migration on purpose.
--
-- Hardcoding the PYVO owner's user_id here would couple production data
-- to a versioned file that other environments (forks, test databases)
-- also run — it would create a "phantom" platform_admin row pointing at
-- a user_id that doesn't exist there.
--
-- Run this once, by hand, against the deployment that owns this table,
-- after signing up normally and finding your own auth.users.id:
--
--   INSERT INTO platform_admins (user_id) VALUES ('<your-auth-users-id>');
-- ============================================================
