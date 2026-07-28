DROP POLICY IF EXISTS "avatars_read_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "avatars_read_public" ON storage.objects;
CREATE POLICY "avatars_read_public" ON storage.objects FOR SELECT TO public USING (bucket_id = 'avatars');