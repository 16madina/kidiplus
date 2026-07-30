-- Expand vitrine-media MIME allow-list for iOS Camera Roll exports
-- (empty/odd content-types, HEIC stills used as covers, 3GPP, m4v).

UPDATE storage.buckets
SET
  public = true,
  file_size_limit = 104857600,
  allowed_mime_types = ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'image/heic', 'image/heif',
    'video/mp4', 'video/quicktime', 'video/webm',
    'video/x-m4v', 'video/3gpp', 'video/3gpp2'
  ]::text[]
WHERE id = 'vitrine-media';

-- Ensure bucket exists even if the previous engagement migration was skipped.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'vitrine-media',
  'vitrine-media',
  true,
  104857600,
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'image/heic', 'image/heif',
    'video/mp4', 'video/quicktime', 'video/webm',
    'video/x-m4v', 'video/3gpp', 'video/3gpp2'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "vitrine-media public read" ON storage.objects;
CREATE POLICY "vitrine-media public read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'vitrine-media');

DROP POLICY IF EXISTS "vitrine-media insert own" ON storage.objects;
CREATE POLICY "vitrine-media insert own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'vitrine-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "vitrine-media update own" ON storage.objects;
CREATE POLICY "vitrine-media update own"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'vitrine-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'vitrine-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "vitrine-media delete own" ON storage.objects;
CREATE POLICY "vitrine-media delete own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'vitrine-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
