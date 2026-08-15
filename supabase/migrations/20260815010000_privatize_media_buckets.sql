-- Match Lovable Cloud: media buckets are private; reads go through
-- storage policies + signed URLs (not /object/public/).
-- payout-proofs / live-replays already private.

UPDATE storage.buckets
SET public = false
WHERE id IN (
  'avatars',
  'live-covers',
  'live-products',
  'shop-products',
  'demo-videos',
  'demo-covers'
);

-- Guests and LiveKit egress still need SELECT so createSignedUrl works.
DROP POLICY IF EXISTS "avatars_read_public" ON storage.objects;
CREATE POLICY "avatars_read_public"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "live_media_read_public" ON storage.objects;
CREATE POLICY "live_media_read_public"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id IN ('live-covers', 'live-products'));

DROP POLICY IF EXISTS "shop_products_read_public" ON storage.objects;
CREATE POLICY "shop_products_read_public"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'shop-products');
