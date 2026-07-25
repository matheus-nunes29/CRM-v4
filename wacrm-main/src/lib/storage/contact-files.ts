import { createClient } from "@/lib/supabase/client";
import { buildMediaPath } from "@/lib/storage/upload-media";

/**
 * Upload/read/delete helpers for the `contact-files` bucket (migration
 * 060) — general attachments (photos, PDFs, docs) on a contact's
 * "Arquivos" tab. Private bucket, same signed-URL convention as
 * patient-record-media.ts.
 */

export const CONTACT_FILES_BUCKET = "contact-files";

/** Records are viewed in one sitting (the contact detail panel), so this
 *  never needs to outlive a page load. */
const SIGNED_URL_TTL_SECONDS = 3600;

export interface ContactFile {
  id: string;
  contact_id: string;
  path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

export async function uploadContactFile(
  contactId: string,
  file: File,
): Promise<ContactFile> {
  const supabase = createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) throw new Error("Not signed in.");

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("account_id, id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileErr || !profile?.account_id) {
    throw new Error("Could not resolve your account.");
  }

  const path = buildMediaPath(profile.account_id as string, file.name);
  const { error: upErr } = await supabase.storage
    .from(CONTACT_FILES_BUCKET)
    .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
  if (upErr) throw new Error(upErr.message);

  const { data: row, error: insertErr } = await supabase
    .from("contact_files")
    .insert({
      account_id: profile.account_id,
      contact_id: contactId,
      path,
      file_name: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
      uploaded_by: profile.id,
    })
    .select()
    .single();

  if (insertErr || !row) {
    // Storage object was written but the row failed — remove it so it
    // doesn't linger as an orphan with nothing pointing to it.
    await supabase.storage.from(CONTACT_FILES_BUCKET).remove([path]);
    throw new Error(insertErr?.message ?? "Falha ao salvar o arquivo.");
  }

  return row as ContactFile;
}

export async function getContactFileSignedUrl(path: string): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from(CONTACT_FILES_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return null;
  return data.signedUrl;
}

export async function deleteContactFile(id: string, path: string): Promise<void> {
  const supabase = createClient();
  const { error: dbErr } = await supabase.from("contact_files").delete().eq("id", id);
  if (dbErr) throw new Error(dbErr.message);
  // Best-effort — the DB row is the source of truth for what's "attached";
  // a leftover storage object with no row pointing to it is a harmless nit.
  await supabase.storage.from(CONTACT_FILES_BUCKET).remove([path]).catch(() => {});
}
