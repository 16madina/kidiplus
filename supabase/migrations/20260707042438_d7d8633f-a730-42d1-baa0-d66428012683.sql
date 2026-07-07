CREATE TABLE public.orders (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  live_id                   uuid REFERENCES public.lives(id) ON DELETE SET NULL,
  product_id                uuid REFERENCES public.live_products(id) ON DELETE SET NULL,
  buyer_id                  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  seller_id                 uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind                      text NOT NULL CHECK (kind IN ('auction','fixed')),
  item_name                 text NOT NULL,
  item_image                text,
  amount                    numeric NOT NULL CHECK (amount >= 0),
  platform_fee              numeric NOT NULL DEFAULT 0 CHECK (platform_fee >= 0),
  processing_fee            numeric NOT NULL DEFAULT 0 CHECK (processing_fee >= 0),
  total                     numeric NOT NULL CHECK (total >= 0),
  currency                  text NOT NULL DEFAULT 'eur',
  status                    text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','cancelled')),
  payment_method            text NOT NULL DEFAULT 'card' CHECK (payment_method IN ('card','wave','orange_money')),
  stripe_payment_intent_id  text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  paid_at                   timestamptz
);

GRANT SELECT, INSERT ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Buyer sees own orders; seller sees orders where seller_id = auth.uid().
CREATE POLICY orders_select_buyer_or_seller ON public.orders
  FOR SELECT TO authenticated
  USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

-- Buyer creates own pending orders only.
CREATE POLICY orders_insert_own_pending ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = buyer_id
    AND status = 'pending'
    AND stripe_payment_intent_id IS NULL
    AND paid_at IS NULL
  );

-- No client UPDATE / DELETE policies: status transitions happen server-side
-- via the Stripe webhook (service_role bypasses RLS).

CREATE INDEX orders_buyer_idx  ON public.orders (buyer_id,  created_at DESC);
CREATE INDEX orders_seller_idx ON public.orders (seller_id, created_at DESC);
CREATE INDEX orders_live_idx   ON public.orders (live_id,   created_at DESC);
CREATE INDEX orders_intent_idx ON public.orders (stripe_payment_intent_id);

-- Realtime so the Commandes tab reflects webhook updates instantly.
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
