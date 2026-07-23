// ============================================================
// /api/admin/accounts/[id]
//
//   GET   — single account detail (with members list).
//   PATCH — edit business_type / max_seats / status / enabled_features.
//
// Platform-admin only. Service-role for the same reason as the list
// route: the admin's own session is never `is_account_member` of the
// account being edited, so there is no RLS policy that authorizes this —
// intentionally not adding one just for this rare admin path.
// ============================================================

import { NextResponse } from "next/server";

import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/flows/admin-client";
import {
  isBusinessType,
  sanitizeFeatureKeys,
} from "@/lib/auth/platform-accounts";

const VALID_STATUSES = ["active", "suspended", "trial"] as const;
type AccountStatus = (typeof VALID_STATUSES)[number];

function isAccountStatus(value: unknown): value is AccountStatus {
  return (
    typeof value === "string" &&
    (VALID_STATUSES as readonly string[]).includes(value)
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePlatformAdmin();
    const { id } = await params;

    const admin = supabaseAdmin();

    const { data: account, error } = await admin
      .from("accounts")
      .select(
        "id, name, business_type, max_seats, status, enabled_features, owner_user_id, created_at",
      )
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("[GET /api/admin/accounts/[id]] fetch error:", error);
      return NextResponse.json(
        { error: "Failed to load account" },
        { status: 500 },
      );
    }
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const { data: members, error: membersError } = await admin
      .from("profiles")
      .select("user_id, full_name, email, account_role")
      .eq("account_id", id);

    if (membersError) {
      console.error(
        "[GET /api/admin/accounts/[id]] members error:",
        membersError,
      );
      return NextResponse.json(
        { error: "Failed to load account members" },
        { status: 500 },
      );
    }

    return NextResponse.json({ account, members: members ?? [] });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePlatformAdmin();
    const { id } = await params;

    const body = (await request.json().catch(() => null)) as
      | {
          businessType?: unknown;
          maxSeats?: unknown;
          status?: unknown;
          enabledFeatures?: unknown;
        }
      | null;

    if (!body) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const update: Record<string, unknown> = {};

    if (body.businessType !== undefined) {
      if (!isBusinessType(body.businessType)) {
        return NextResponse.json(
          { error: "'businessType' must be one of the known business types" },
          { status: 400 },
        );
      }
      update.business_type = body.businessType;
    }

    if (body.maxSeats !== undefined) {
      if (body.maxSeats === null) {
        update.max_seats = null; // unlimited
      } else {
        const n = Number(body.maxSeats);
        if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
          return NextResponse.json(
            { error: "'maxSeats' must be a positive integer, or null for unlimited" },
            { status: 400 },
          );
        }
        update.max_seats = n;
      }
    }

    if (body.status !== undefined) {
      if (!isAccountStatus(body.status)) {
        return NextResponse.json(
          { error: "'status' must be one of active, suspended, trial" },
          { status: 400 },
        );
      }
      update.status = body.status;
    }

    if (body.enabledFeatures !== undefined) {
      update.enabled_features = sanitizeFeatureKeys(body.enabledFeatures);
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { error: "No recognized fields to update" },
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from("accounts")
      .update(update)
      .eq("id", id)
      .select(
        "id, name, business_type, max_seats, status, enabled_features, owner_user_id, created_at",
      )
      .maybeSingle();

    if (error) {
      console.error("[PATCH /api/admin/accounts/[id]] update error:", error);
      return NextResponse.json(
        { error: "Failed to update account" },
        { status: 500 },
      );
    }
    if (!data) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    return NextResponse.json({ account: data });
  } catch (err) {
    return toErrorResponse(err);
  }
}
