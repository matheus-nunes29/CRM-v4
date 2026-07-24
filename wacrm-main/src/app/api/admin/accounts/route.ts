// ============================================================
// /api/admin/accounts
//
//   GET  — list every account on this deployment, with seats used.
//   POST — provision a brand-new client: creates the auth user (Auth
//          Admin API), then moves them into a freshly-created account
//          via the `platform_provision_account` RPC (050).
//
// Platform-admin only. Unlike /api/account/*, every read/write here goes
// through supabaseAdmin() (service role) rather than ctx.supabase — a
// platform admin is never `is_account_member` of a client's account, so
// there's no RLS policy that would let their own session see it. The one
// exception is the RPC call itself, which runs under the admin's own
// session because it self-checks `is_platform_admin()` internally.
//
// The new owner starts on DEFAULT_ACCOUNT_PASSWORD (same fixed password
// for every client, per PYVO's own process) — not a per-account secret.
// We don't rely on Supabase's own invite e-mail because SMTP isn't
// confirmed configured on every self-hosted deployment; the admin
// relays the password to the client themselves.
// ============================================================

import { NextResponse } from "next/server";
import type { PostgrestError } from "@supabase/supabase-js";

import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/flows/admin-client";
import {
  isBusinessType,
  sanitizeFeatureKeys,
  DEFAULT_ACCOUNT_PASSWORD,
} from "@/lib/auth/platform-accounts";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rate-limit";

function rpcErrorToResponse(err: PostgrestError): NextResponse {
  if (err.code === "42501") {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  if (err.code === "22023") {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  if (err.code === "23505") {
    return NextResponse.json({ error: err.message }, { status: 409 });
  }
  console.error("[POST /api/admin/accounts] unexpected RPC error:", err);
  return NextResponse.json(
    { error: "Failed to provision account" },
    { status: 500 },
  );
}

export async function GET() {
  try {
    await requirePlatformAdmin();

    const admin = supabaseAdmin();

    const { data: accounts, error } = await admin
      .from("accounts")
      .select(
        "id, name, business_type, max_seats, status, enabled_features, owner_user_id, created_at",
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[GET /api/admin/accounts] fetch error:", error);
      return NextResponse.json(
        { error: "Failed to load accounts" },
        { status: 500 },
      );
    }

    // Seats used per account — one extra query rather than an embedded
    // count, since we want an exact match to what redeem_invitation
    // counts (COUNT(*) FROM profiles WHERE account_id = X) without
    // depending on PostgREST's embedded-resource count syntax.
    const { data: profiles, error: profilesError } = await admin
      .from("profiles")
      .select("account_id");

    if (profilesError) {
      console.error(
        "[GET /api/admin/accounts] profiles count error:",
        profilesError,
      );
      return NextResponse.json(
        { error: "Failed to load account members" },
        { status: 500 },
      );
    }

    const seatsUsed = new Map<string, number>();
    for (const p of profiles ?? []) {
      seatsUsed.set(p.account_id, (seatsUsed.get(p.account_id) ?? 0) + 1);
    }

    const result = (accounts ?? []).map((a) => ({
      ...a,
      seatsUsed: seatsUsed.get(a.id) ?? 0,
    }));

    return NextResponse.json({ accounts: result });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requirePlatformAdmin();

    const limit = checkRateLimit(
      `admin:platformProvision:${ctx.userId}`,
      RATE_LIMITS.platformProvision,
    );
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as
      | {
          email?: unknown;
          fullName?: unknown;
          accountName?: unknown;
          businessType?: unknown;
          maxSeats?: unknown;
          enabledFeatures?: unknown;
        }
      | null;

    const email = typeof body?.email === "string" ? body.email.trim() : "";
    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "A valid 'email' is required" },
        { status: 400 },
      );
    }

    const accountName =
      typeof body?.accountName === "string" ? body.accountName.trim() : "";
    if (!accountName) {
      return NextResponse.json(
        { error: "'accountName' is required" },
        { status: 400 },
      );
    }

    const fullName =
      typeof body?.fullName === "string" ? body.fullName.trim() : "";

    const businessType = body?.businessType;
    if (!isBusinessType(businessType)) {
      return NextResponse.json(
        { error: "'businessType' must be one of the known business types" },
        { status: 400 },
      );
    }

    let maxSeats: number | null = null;
    if (body?.maxSeats !== undefined && body?.maxSeats !== null) {
      const n = Number(body.maxSeats);
      if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
        return NextResponse.json(
          { error: "'maxSeats' must be a positive integer, or omitted for unlimited" },
          { status: 400 },
        );
      }
      maxSeats = n;
    }

    const enabledFeatures = sanitizeFeatureKeys(body?.enabledFeatures);

    const admin = supabaseAdmin();

    const { data: created, error: createUserError } =
      await admin.auth.admin.createUser({
        email,
        password: DEFAULT_ACCOUNT_PASSWORD,
        email_confirm: true,
        user_metadata: fullName ? { full_name: fullName } : undefined,
      });

    if (createUserError || !created?.user) {
      console.error(
        "[POST /api/admin/accounts] createUser error:",
        createUserError,
      );
      // Supabase Auth returns a 422-ish "already registered" error for a
      // duplicate e-mail — surface it as 409 rather than a generic 500.
      const status =
        createUserError?.message?.toLowerCase().includes("already")
          ? 409
          : 500;
      return NextResponse.json(
        { error: createUserError?.message ?? "Failed to create user" },
        { status },
      );
    }

    const { data: accountId, error: rpcError } = await ctx.supabase.rpc(
      "platform_provision_account",
      {
        p_user_id: created.user.id,
        p_account_name: accountName,
        p_business_type: businessType,
        p_max_seats: maxSeats,
        p_enabled_features: enabledFeatures,
      },
    );

    if (rpcError) {
      // The auth user was created but never provisioned into a real
      // account — clean it up rather than leaving a dangling login that
      // isn't tied to anything usable.
      await admin.auth.admin.deleteUser(created.user.id).catch((cleanupErr) => {
        console.error(
          "[POST /api/admin/accounts] failed to roll back orphaned user:",
          cleanupErr,
        );
      });
      return rpcErrorToResponse(rpcError);
    }

    return NextResponse.json(
      {
        account: {
          id: accountId,
          name: accountName,
          businessType,
          maxSeats,
          enabledFeatures,
        },
        email,
        password: DEFAULT_ACCOUNT_PASSWORD,
      },
      { status: 201 },
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
