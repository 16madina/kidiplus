-- live_products: allow anyone to see products of a live/ended stream
GRANT SELECT ON public.live_products TO anon;

DROP POLICY IF EXISTS "live_products_select_public" ON public.live_products;
CREATE POLICY "live_products_select_public"
ON public.live_products
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.lives l
    WHERE l.id = live_products.live_id
      AND l.status IN ('live', 'ended', 'scheduled')
  )
);

-- live_bids: allow anyone to see bids on live/ended streams (for the ticker + current price)
GRANT SELECT ON public.live_bids TO anon;

DROP POLICY IF EXISTS "live_bids_select_public" ON public.live_bids;
CREATE POLICY "live_bids_select_public"
ON public.live_bids
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.lives l
    WHERE l.id = live_bids.live_id
      AND l.status IN ('live', 'ended')
  )
);

-- live_gifts: allow anyone to see gifts sent during a live/ended stream
GRANT SELECT ON public.live_gifts TO anon;

DROP POLICY IF EXISTS "live_gifts_select_public" ON public.live_gifts;
CREATE POLICY "live_gifts_select_public"
ON public.live_gifts
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.lives l
    WHERE l.id = live_gifts.live_id
      AND l.status IN ('live', 'ended')
  )
);
