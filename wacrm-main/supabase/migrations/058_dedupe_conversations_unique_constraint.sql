-- Race condition fix: findOrCreateConversation() (both the shared
-- src/lib/whatsapp/inbound-message.ts helper and its duplicate in
-- src/app/api/whatsapp/webhook/route.ts) selected for an existing
-- conversation then inserted if none was found, with no unique
-- constraint backing it. A burst of near-simultaneous webhook calls for
-- the same contact (e.g. many messages landing in a busy WhatsApp group
-- within the same second) could each pass the SELECT before any prior
-- INSERT committed, forking a brand-new conversation per message instead
-- of sharing one. Confirmed in production: one group contact accumulated
-- 22 duplicate conversation rows, each holding exactly one message,
-- created within a 2.5-minute window.
--
-- This migration merges any existing duplicates before adding the unique
-- constraint that makes the race impossible going forward — the
-- constraint can't be added while duplicate (account_id, contact_id)
-- pairs still exist.

DO $$
DECLARE
  dup RECORD;
  canonical_id UUID;
  merged_last_message_at TIMESTAMPTZ;
  merged_last_message_text TEXT;
  merged_unread_count INTEGER;
BEGIN
  FOR dup IN
    SELECT account_id, contact_id
    FROM conversations
    GROUP BY account_id, contact_id
    HAVING count(*) > 1
  LOOP
    -- Canonical = earliest-created conversation for this contact; every
    -- other duplicate's children get reparented onto it.
    SELECT id INTO canonical_id
    FROM conversations
    WHERE account_id = dup.account_id AND contact_id = dup.contact_id
    ORDER BY created_at ASC
    LIMIT 1;

    UPDATE messages SET conversation_id = canonical_id
    WHERE conversation_id IN (
      SELECT id FROM conversations
      WHERE account_id = dup.account_id AND contact_id = dup.contact_id AND id <> canonical_id
    );

    UPDATE deals SET conversation_id = canonical_id
    WHERE conversation_id IN (
      SELECT id FROM conversations
      WHERE account_id = dup.account_id AND contact_id = dup.contact_id AND id <> canonical_id
    );

    UPDATE flow_runs SET conversation_id = canonical_id
    WHERE conversation_id IN (
      SELECT id FROM conversations
      WHERE account_id = dup.account_id AND contact_id = dup.contact_id AND id <> canonical_id
    );

    UPDATE message_reactions SET conversation_id = canonical_id
    WHERE conversation_id IN (
      SELECT id FROM conversations
      WHERE account_id = dup.account_id AND contact_id = dup.contact_id AND id <> canonical_id
    );

    -- Recompute the canonical row's summary fields from the merged set —
    -- unread counts add up, last_message_at/text follow the actual
    -- latest message now attached to it.
    SELECT max(last_message_at), sum(coalesce(unread_count, 0))
      INTO merged_last_message_at, merged_unread_count
    FROM conversations
    WHERE account_id = dup.account_id AND contact_id = dup.contact_id;

    SELECT content_text INTO merged_last_message_text
    FROM messages
    WHERE conversation_id = canonical_id
    ORDER BY created_at DESC
    LIMIT 1;

    UPDATE conversations
    SET last_message_at = merged_last_message_at,
        last_message_text = merged_last_message_text,
        unread_count = merged_unread_count,
        updated_at = now()
    WHERE id = canonical_id;

    DELETE FROM conversations
    WHERE account_id = dup.account_id AND contact_id = dup.contact_id AND id <> canonical_id;
  END LOOP;
END $$;

ALTER TABLE conversations
  ADD CONSTRAINT conversations_account_contact_unique UNIQUE (account_id, contact_id);
