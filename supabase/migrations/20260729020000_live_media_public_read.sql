-- Live / shop product images must be readable by guests and by LiveKit Web Egress
-- (unauthenticated Chromium). Previously only authenticated users could SELECT,
-- so createSignedUrl failed in broadcast composition → wrong Unsplash shoe fallback.

DROP POLICY IF EXISTS "live_media_read_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "live_media_read_public" ON storage.objects;

CREATE POLICY "live_media_read_public"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id IN ('live-covers', 'live-products'));

DROP POLICY IF EXISTS "shop-products read auth" ON storage.objects;
DROP POLICY IF EXISTS "shop_products_read_public" ON storage.objects;

CREATE POLICY "shop_products_read_public"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'shop-products');
