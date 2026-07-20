import { createClient } from "@/lib/supabase/client";
import { buildMediaPath } from "@/lib/storage/upload-media";

/**
 * Upload/read helpers for the `patient-records-media` bucket (migration
 * 048). Unlike `uploadAccountMedia`, this bucket is PRIVATE — clinical
 * before/after photos are dado sensível de saúde under LGPD and must
 * never be reachable via a bare public URL. Reads go through a
 * short-lived signed URL instead of `getPublicUrl`.
 *
 * Deletion reuses the generic `deleteAccountMedia` helper — the
 * account-scoped path convention and RLS policy shape are identical,
 * only the bucket's `public` flag differs.
 */

export const PATIENT_RECORD_MEDIA_BUCKET = "patient-records-media";

/** How long a signed URL stays valid. Records are viewed in one sitting
 *  (the contact detail panel), so this never needs to outlive a page load. */
const SIGNED_URL_TTL_SECONDS = 3600;

export interface UploadPatientRecordPhotoResult {
  /** Storage object path (account-scoped) — this, not a URL, is what
   *  gets stored in `patient_records.photos`. */
  path: string;
}

export async function uploadPatientRecordPhoto(
  file: File,
): Promise<UploadPatientRecordPhotoResult> {
  const supabase = createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    throw new Error("Not signed in.");
  }

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("account_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileErr || !profile?.account_id) {
    throw new Error("Could not resolve your account.");
  }

  const path = buildMediaPath(profile.account_id as string, file.name);
  const { error: upErr } = await supabase.storage
    .from(PATIENT_RECORD_MEDIA_BUCKET)
    .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
  if (upErr) throw new Error(upErr.message);

  return { path };
}

/** Resolve one object path to a signed, time-limited URL for display. */
export async function getPatientRecordPhotoSignedUrl(path: string): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from(PATIENT_RECORD_MEDIA_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return null;
  return data.signedUrl;
}

/** Resolve several paths at once (one call per photo — the storage API
 *  has no batched createSignedUrls in the JS client version this app pins). */
export async function getPatientRecordPhotoSignedUrls(
  paths: string[],
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    paths.map(async (path) => [path, await getPatientRecordPhotoSignedUrl(path)] as const),
  );
  const map: Record<string, string> = {};
  for (const [path, url] of entries) if (url) map[path] = url;
  return map;
}
