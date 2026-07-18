-- Create public bucket for WhatsApp incoming media (decrypted and stored server-side)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'whatsapp-media',
  'whatsapp-media',
  true,
  52428800,
  ARRAY[
    'image/jpeg','image/jpg','image/png','image/webp','image/gif',
    'video/mp4','video/3gpp',
    'audio/ogg','audio/mp4','audio/mpeg',
    'application/pdf','application/octet-stream'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Service role can upload/manage
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'whatsapp_media_service_all'
  ) THEN
    CREATE POLICY "whatsapp_media_service_all" ON storage.objects
      FOR ALL TO service_role
      USING (bucket_id = 'whatsapp-media')
      WITH CHECK (bucket_id = 'whatsapp-media');
  END IF;
END $$;

-- Authenticated users can view
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'whatsapp_media_auth_read'
  ) THEN
    CREATE POLICY "whatsapp_media_auth_read" ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'whatsapp-media');
  END IF;
END $$;
