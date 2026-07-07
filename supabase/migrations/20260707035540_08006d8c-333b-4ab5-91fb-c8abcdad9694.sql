-- =========================================================================
-- 1. lives
-- =========================================================================
CREATE TABLE public.lives (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title         text NOT NULL,
  category      text,
  cover_url     text,
  room_name     text NOT NULL UNIQUE,
  status        text NOT NULL DEFAULT 'live' CHECK (status IN ('live','ended')),
  viewer_count  int  NOT NULL DEFAULT 0,
  started_at    timestamptz NOT NULL DEFAULT now(),
  ended_at      timestamptz
);

CREATE INDEX lives_status_started_idx ON public.lives (status, started_at DESC);
CREATE INDEX lives_seller_idx         ON public.lives (seller_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lives TO authenticated;
GRANT ALL ON public.lives TO service_role;

ALTER TABLE public.lives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lives_select_authenticated"
  ON public.lives FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "lives_insert_own_seller"
  ON public.lives FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = seller_id
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_seller = true
    )
  );

CREATE POLICY "lives_update_own"
  ON public.lives FOR UPDATE TO authenticated
  USING (auth.uid() = seller_id)
  WITH CHECK (auth.uid() = seller_id);

-- =========================================================================
-- 2. live_products
-- =========================================================================
CREATE TABLE public.live_products (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  live_id            uuid NOT NULL REFERENCES public.lives(id) ON DELETE CASCADE,
  name               text NOT NULL,
  image_url          text,
  mode               text NOT NULL CHECK (mode IN ('auction','fixed')),
  start_price        numeric NOT NULL DEFAULT 0,
  price              numeric NOT NULL DEFAULT 0,
  stock              int     NOT NULL DEFAULT 1,
  timer_seconds      int     NOT NULL DEFAULT 30,
  status             text    NOT NULL DEFAULT 'upcoming'
                             CHECK (status IN ('upcoming','active','sold','out')),
  sold_to_identity   text,
  final_price        numeric,
  position           int     NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX live_products_live_idx ON public.live_products (live_id, position);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.live_products TO authenticated;
GRANT ALL ON public.live_products TO service_role;

ALTER TABLE public.live_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "live_products_select_authenticated"
  ON public.live_products FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "live_products_insert_seller"
  ON public.live_products FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.lives
      WHERE lives.id = live_products.live_id
        AND lives.seller_id = auth.uid()
    )
  );

CREATE POLICY "live_products_update_seller"
  ON public.live_products FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.lives
      WHERE lives.id = live_products.live_id
        AND lives.seller_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.lives
      WHERE lives.id = live_products.live_id
        AND lives.seller_id = auth.uid()
    )
  );

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER live_products_touch_updated_at
BEFORE UPDATE ON public.live_products
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================================
-- 3. live_bids
-- =========================================================================
CREATE TABLE public.live_bids (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  live_id      uuid NOT NULL REFERENCES public.lives(id) ON DELETE CASCADE,
  product_id   uuid NOT NULL REFERENCES public.live_products(id) ON DELETE CASCADE,
  bidder_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  bidder_name  text NOT NULL,
  amount       numeric NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX live_bids_product_idx ON public.live_bids (product_id, created_at DESC);
CREATE INDEX live_bids_live_idx    ON public.live_bids (live_id,    created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.live_bids TO authenticated;
GRANT ALL ON public.live_bids TO service_role;

ALTER TABLE public.live_bids ENABLE ROW LEVEL SECURITY;

CREATE POLICY "live_bids_select_authenticated"
  ON public.live_bids FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "live_bids_insert_own"
  ON public.live_bids FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = bidder_id);

-- =========================================================================
-- 4. Atomic fixed-price purchase RPC
-- =========================================================================
CREATE OR REPLACE FUNCTION public.purchase_fixed_price(
  _product_id uuid,
  _buyer_identity text
)
RETURNS public.live_products
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.live_products;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_row FROM public.live_products
  WHERE id = _product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  IF v_row.mode <> 'fixed' THEN
    RAISE EXCEPTION 'Not a fixed-price product';
  END IF;

  IF v_row.status NOT IN ('active','upcoming') OR v_row.stock <= 0 THEN
    RAISE EXCEPTION 'Out of stock';
  END IF;

  UPDATE public.live_products
     SET stock            = v_row.stock - 1,
         status           = CASE WHEN v_row.stock - 1 <= 0 THEN 'out' ELSE 'active' END,
         sold_to_identity = COALESCE(sold_to_identity, _buyer_identity),
         final_price      = COALESCE(final_price, price)
   WHERE id = _product_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.purchase_fixed_price(uuid, text) TO authenticated;

-- =========================================================================
-- 5. Realtime — full row payloads + publication membership
-- =========================================================================
ALTER TABLE public.lives          REPLICA IDENTITY FULL;
ALTER TABLE public.live_products  REPLICA IDENTITY FULL;
ALTER TABLE public.live_bids      REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.lives;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_products;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_bids;
