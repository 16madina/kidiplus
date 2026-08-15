DROP POLICY IF EXISTS live_products_select_authenticated ON public.live_products;

CREATE POLICY live_products_select_owner_or_moderator
ON public.live_products
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.lives l
    WHERE l.id = live_products.live_id
      AND (l.seller_id = auth.uid() OR public.is_live_moderator(l.id, auth.uid()))
  )
);