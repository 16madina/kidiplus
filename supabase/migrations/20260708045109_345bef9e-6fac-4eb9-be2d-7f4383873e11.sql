
-- ============================================================================
-- Delivery + Escrow — Migration 1/2: Schema
-- ============================================================================

-- 1) Seller delivery settings ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.seller_delivery_settings (
  seller_id  uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  mode       text NOT NULL DEFAULT 'flat' CHECK (mode IN ('zones','flat','courier')),
  flat_fee   numeric NOT NULL DEFAULT 0 CHECK (flat_fee >= 0),
  zones      jsonb   NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.seller_delivery_settings TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.seller_delivery_settings TO authenticated;
GRANT ALL ON public.seller_delivery_settings TO service_role;
ALTER TABLE public.seller_delivery_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "delivery_read_all_authenticated"
  ON public.seller_delivery_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "delivery_owner_insert"
  ON public.seller_delivery_settings
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = seller_id);
CREATE POLICY "delivery_owner_update"
  ON public.seller_delivery_settings
  FOR UPDATE TO authenticated USING (auth.uid() = seller_id) WITH CHECK (auth.uid() = seller_id);
CREATE POLICY "delivery_owner_delete"
  ON public.seller_delivery_settings
  FOR DELETE TO authenticated USING (auth.uid() = seller_id);

-- 2) Addresses ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.addresses (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  label            text NOT NULL DEFAULT '',
  full_name        text NOT NULL DEFAULT '',
  phone            text NOT NULL,
  country          text NOT NULL DEFAULT '',
  city             text NOT NULL DEFAULT '',
  zone_or_commune  text,
  street_address   text,
  details          text,
  is_default       boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.addresses TO authenticated;
GRANT ALL ON public.addresses TO service_role;
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "addresses_owner_all"
  ON public.addresses
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_addresses_user_default
  ON public.addresses(user_id, is_default DESC);

-- Single-default enforcement: when a row is set is_default=true,
-- unset all other defaults for the same user in the same statement.
CREATE OR REPLACE FUNCTION public.enforce_single_default_address()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_default THEN
    UPDATE public.addresses
       SET is_default = false, updated_at = now()
     WHERE user_id = NEW.user_id
       AND id <> NEW.id
       AND is_default = true;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_addresses_single_default ON public.addresses;
CREATE TRIGGER trg_addresses_single_default
BEFORE INSERT OR UPDATE ON public.addresses
FOR EACH ROW EXECUTE FUNCTION public.enforce_single_default_address();

-- 3) Orders — delivery + fulfillment ----------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_fee   numeric NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  ADD COLUMN IF NOT EXISTS delivery_mode  text CHECK (delivery_mode IN ('zones','flat','courier')),
  ADD COLUMN IF NOT EXISTS delivery_zone  text,
  ADD COLUMN IF NOT EXISTS address_id     uuid REFERENCES public.addresses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS address_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS fulfillment_status text NOT NULL DEFAULT 'awaiting'
    CHECK (fulfillment_status IN ('awaiting','shipped','delivered','disputed')),
  ADD COLUMN IF NOT EXISTS shipped_at              timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_confirmed_at  timestamptz,
  ADD COLUMN IF NOT EXISTS refund_status           text CHECK (refund_status IN ('pending_manual','refunded_wallet','refunded_card','none'));

CREATE INDEX IF NOT EXISTS idx_orders_fulfillment_shipped
  ON public.orders(fulfillment_status, shipped_at);

-- 4) Seller balances / earnings — pending column + earnings status ----------
ALTER TABLE public.seller_balances
  ADD COLUMN IF NOT EXISTS pending numeric NOT NULL DEFAULT 0 CHECK (pending >= 0);

ALTER TABLE public.seller_earnings
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','released','reversed'));

-- Backfill: any existing paid orders are considered delivered + released
-- so pre-launch sellers aren't retroactively frozen.
UPDATE public.orders
   SET fulfillment_status = 'delivered',
       delivered_confirmed_at = COALESCE(delivered_confirmed_at, paid_at, now())
 WHERE status = 'paid'
   AND fulfillment_status = 'awaiting';

UPDATE public.seller_earnings SET status = 'released' WHERE status = 'pending';

-- 5) Reports — allow 'order' as a target ------------------------------------
ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_target_type_check;
ALTER TABLE public.reports
  ADD CONSTRAINT reports_target_type_check
  CHECK (target_type IN ('live','message','user','order'));
