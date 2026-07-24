// ============================================================
// Shared constants for platform-admin account provisioning.
//
// Single source of truth for both the `/api/admin/accounts` validation
// and the `/admin` UI's selects/checkboxes — keeps the two from drifting
// apart the way `account_invitations.role` validation currently lives
// separately in the DB CHECK and in `isAccountRole`.
// ============================================================

import { randomInt } from "node:crypto";

/** Mirrors the CHECK constraint added in 050_account_plan_fields.sql. */
export const BUSINESS_TYPES = [
  { value: "clinica_estetica", label: "Clínica de estética" },
  { value: "clinica_odontologica", label: "Clínica odontológica" },
  { value: "other", label: "Outro" },
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number]["value"];

export function isBusinessType(value: unknown): value is BusinessType {
  return (
    typeof value === "string" &&
    BUSINESS_TYPES.some((t) => t.value === value)
  );
}

/**
 * Feature keys a platform admin can toggle per account, gated via
 * `account_has_feature` (050_account_plan_fields.sql).
 *
 * `dre` is listed for forward-compatibility only — there is no DRE
 * table/route in this codebase yet, so enabling it today has no
 * observable effect. Documented here rather than hidden so nobody goes
 * looking for a gate that doesn't exist.
 */
export const AVAILABLE_FEATURES = [
  { key: "prontuario", label: "Prontuário", implemented: true },
  { key: "broadcasts", label: "Disparos", implemented: true },
  { key: "automations", label: "Automações", implemented: true },
  { key: "flows", label: "Flows", implemented: true },
  { key: "dre", label: "DRE (financeiro)", implemented: false },
] as const;

export type FeatureKey = (typeof AVAILABLE_FEATURES)[number]["key"];

export function isFeatureKey(value: unknown): value is FeatureKey {
  return (
    typeof value === "string" &&
    AVAILABLE_FEATURES.some((f) => f.key === value)
  );
}

/** Validates an arbitrary array down to known feature keys, silently
 *  dropping anything unrecognized rather than erroring — a stray typo
 *  in a client payload shouldn't 400 the whole provisioning request. */
export function sanitizeFeatureKeys(value: unknown): FeatureKey[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isFeatureKey);
}

/**
 * One-time temporary password for a newly provisioned account owner.
 * Shown once in the admin UI (same "shown once" contract as invite
 * tokens in src/lib/auth/invitations.ts) — the admin copies it and
 * relays it to the client themselves (WhatsApp/e-mail), since we can't
 * assume SMTP is configured on every self-hosted deployment.
 *
 * 16 characters from an unambiguous alphabet (no 0/O/1/l/I) so it's
 * still typeable by hand if the copy/paste step fails.
 */
const PASSWORD_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

export function generateTemporaryPassword(length = 16): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)];
  }
  return out;
}
