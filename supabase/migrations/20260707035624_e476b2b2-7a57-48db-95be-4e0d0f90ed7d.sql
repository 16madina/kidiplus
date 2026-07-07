-- Read: any authenticated user can read live-covers and live-products
CREATE POLICY "live_media_read_authenticated"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id IN ('live-covers','live-products'));

-- Write: authenticated user can only touch files inside a folder named by their auth.uid()
CREATE POLICY "live_media_insert_own_folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('live-covers','live-products')
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "live_media_update_own_folder"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id IN ('live-covers','live-products')
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id IN ('live-covers','live-products')
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "live_media_delete_own_folder"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id IN ('live-covers','live-products')
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
