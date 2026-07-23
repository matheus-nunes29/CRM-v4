// ============================================================
// Server-side platform-admin context — mirrors requireRole() in
// ./account.ts, but for the PYVO owner managing every account on this
// deployment rather than a member managing their own account.
//
// Deliberately does NOT call getCurrentAccount(): a platform admin has no
// required relationship to any client account, so requiring one here
// would force the PYVO owner to also be a member of some account just to
// use /admin.
//
// Calling convention — identical to requireRole:
//
//   try {
//     const ctx = await requirePlatformAdmin();
//     // ctx.supabase — SSR client, this admin's own session
//     // ctx.userId
//   } catch (err) {
//     return toErrorResponse(err);
//   }
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { UnauthorizedError, ForbiddenError } from "./account";

export interface PlatformAdminContext {
  /** Supabase SSR client, RLS scoped to the calling platform admin. */
  supabase: SupabaseClient;
  /** `auth.uid()` for the caller. */
  userId: string;
}

/**
 * Resolve the caller's session and verify they're a platform admin.
 *
 * Throws `UnauthorizedError` if there's no Supabase session.
 * Throws `ForbiddenError` if the caller is authenticated but not listed
 * in `platform_admins`.
 */
export async function requirePlatformAdmin(): Promise<PlatformAdminContext> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    throw new UnauthorizedError();
  }

  const { data: isAdmin, error: rpcErr } = await supabase.rpc("is_platform_admin");
  if (rpcErr) {
    console.error("[requirePlatformAdmin] is_platform_admin RPC error:", rpcErr);
    throw new ForbiddenError("Could not verify platform admin status");
  }
  if (!isAdmin) {
    throw new ForbiddenError("Platform admin access required");
  }

  return { supabase, userId: user.id };
}
