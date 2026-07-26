import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolves the conversation to open for a contact from anywhere that
 * offers a "go talk to this contact" shortcut (contact popup, deal
 * popup). Previously these buttons only looked up an existing
 * conversation and showed an error if the contact had never messaged
 * in — this creates one on the spot so the shortcut always works, even
 * for a brand-new contact with zero history.
 */
export async function findOrCreateConversationForContact(
  supabase: SupabaseClient,
  contactId: string,
  accountId: string,
  userId: string,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("contact_id", contactId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) return existing.id as string;

  const { data: created, error } = await supabase
    .from("conversations")
    .insert({ account_id: accountId, user_id: userId, contact_id: contactId })
    .select("id")
    .single();

  if (error || !created) {
    console.error("[findOrCreateConversationForContact] insert failed:", error);
    return null;
  }
  return created.id as string;
}
