-- 045_messages_content_type_sticker.sql
--
-- Widen messages.content_type to allow 'sticker' as its own value,
-- distinct from 'image'. Stickers were previously stored as 'image'
-- (mirroring wapi's original behavior), which meant the inbox
-- rendered them identically to photos — full bubble background,
-- full-size <img>. WhatsApp itself (and now this app) shows stickers
-- borderless and smaller.

ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_content_type_check;

ALTER TABLE messages
  ADD CONSTRAINT messages_content_type_check
  CHECK (content_type IN (
    'text', 'image', 'sticker', 'document', 'audio', 'video',
    'location', 'template', 'interactive'
  ));
