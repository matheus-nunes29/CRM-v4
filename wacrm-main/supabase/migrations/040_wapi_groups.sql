-- 040_wapi_groups.sql
-- Support WhatsApp groups in the inbox via W-API webhooks.
-- Groups are stored as contacts with is_group=true and phone=groupJid (@g.us).
-- Messages from groups include who sent each message inside the group.

-- Mark a contact as a WhatsApp group
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_group BOOLEAN NOT NULL DEFAULT false;

-- Who sent a specific message inside a group (null for 1-on-1 conversations)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS group_sender_name TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS group_sender_phone TEXT;

-- Index to quickly list group contacts
CREATE INDEX IF NOT EXISTS idx_contacts_is_group ON contacts(account_id, is_group) WHERE is_group = true;

-- Allow group JIDs (e.g. 120363XXXX@g.us) as the "phone" for group contacts.
-- The existing phone NOT NULL is fine — group JID serves as the identifier.
-- No schema change needed: phone column already accepts any text.

-- RPC used by the W-API webhook to safely increment unread_count
CREATE OR REPLACE FUNCTION increment_unread_count(conv_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE conversations
  SET unread_count = COALESCE(unread_count, 0) + 1
  WHERE id = conv_id;
$$;
