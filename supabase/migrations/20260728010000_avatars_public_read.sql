-- Profile avatars are meant to be visible to every viewer (including guests
-- watching a live). Previously only authenticated users could SELECT, so
-- createSignedUrl failed for guests and the live header fell back to initials.

DROP POLICY IF EXISTS "avatars_read_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "avatars_read_public" ON storage.objects;

CREATE POLICY "avatars_read_public"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'avatars');
