-- 1. Allow 'gift' as a wallet transaction type.
ALTER TABLE public.wallet_transactions
  DROP CONSTRAINT wallet_transactions_type_check;
ALTER TABLE public.wallet_transactions
  ADD CONSTRAINT wallet_transactions_type_check
  CHECK (type IN ('topup','purchase','refund','adjustment','gift'));

-- 2. seller_earnings: allow rows not tied to an order (gifts), and track source.
ALTER TABLE public.seller_earnings
  DROP CONSTRAINT seller_earnings_order_id_key;
ALTER TABLE public.seller_earnings
  ALTER COLUMN order_id DROP NOT NULL;
ALTER TABLE public.seller_earnings
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'sale'
    CHECK (source IN ('sale','gift'));
ALTER TABLE public.seller_earnings
  ADD COLUMN IF NOT EXISTS live_id uuid REFERENCES public.lives(id) ON DELETE SET NULL;
ALTER TABLE public.seller_earnings
  ADD COLUMN IF NOT EXISTS gift_key text;
-- Preserve idempotency on order-based earnings, drop uniqueness for gifts.
CREATE UNIQUE INDEX IF NOT EXISTS seller_earnings_order_id_uidx
  ON public.seller_earnings(order_id) WHERE order_id IS NOT NULL;

-- 3. live_gifts table (audit log of every gift sent).
CREATE TABLE public.live_gifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  live_id uuid NOT NULL REFERENCES public.lives(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  gift_key text NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL,
  platform_fee numeric NOT NULL DEFAULT 0,
  seller_net numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX live_gifts_live_id_idx ON public.live_gifts(live_id, created_at DESC);
CREATE INDEX live_gifts_seller_id_idx ON public.live_gifts(seller_id, created_at DESC);

GRANT SELECT ON public.live_gifts TO authenticated;
GRANT ALL ON public.live_gifts TO service_role;

ALTER TABLE public.live_gifts ENABLE ROW LEVEL SECURITY;

-- Anyone signed-in can read gifts for a live (audit / realtime feed).
CREATE POLICY "auth can read live gifts"
  ON public.live_gifts FOR SELECT
  TO authenticated
  USING (true);

-- Inserts happen only via SECURITY DEFINER RPC — no direct client insert.
-- (No INSERT policy = no client inserts.)

ALTER PUBLICATION supabase_realtime ADD TABLE public.live_gifts;

-- 4. Gift catalog price resolver — server-authoritative, per currency.
-- Prices: XOF / EUR / CAD. Keep in sync with src/lib/gifts.ts.
CREATE OR REPLACE FUNCTION public._gift_price(_key text, _currency text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE upper(_currency)
    WHEN 'XOF' THEN
      CASE _key
        WHEN 'rose'    THEN 100
        WHEN 'heart'   THEN 250
        WHEN 'diamond' THEN 500
        WHEN 'crown'   THEN 1000
        WHEN 'rocket'  THEN 2500
        WHEN 'lion'    THEN 5000
        ELSE NULL END
    WHEN 'CAD' THEN
      CASE _key
        WHEN 'rose'    THEN 1
        WHEN 'heart'   THEN 1.5
        WHEN 'diamond' THEN 3
        WHEN 'crown'   THEN 6
        WHEN 'rocket'  THEN 12
        WHEN 'lion'    THEN 22
        ELSE NULL END
    ELSE -- EUR default
      CASE _key
        WHEN 'rose'    THEN 0.5
        WHEN 'heart'   THEN 1
        WHEN 'diamond' THEN 2
        WHEN 'crown'   THEN 4
        WHEN 'rocket'  THEN 8
        WHEN 'lion'    THEN 15
        ELSE NULL END
  END;
$$;

-- 5. RPC: send_gift — atomic wallet debit → seller credit → gift log.
CREATE OR REPLACE FUNCTION public.send_gift(_live_id uuid, _gift_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_live public.lives;
  v_wallet public.wallets;
  v_bal public.seller_balances;
  v_currency text;
  v_price numeric;
  v_fee_pct numeric := 30;
  v_platform_fee numeric;
  v_seller_net numeric;
  v_new_wallet numeric;
  v_new_available numeric;
  v_gift_id uuid;
  v_sender_name text;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;
  PERFORM public.assert_user_active();

  SELECT * INTO v_live FROM public.lives WHERE id = _live_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'live_not_found');
  END IF;
  IF v_live.status <> 'live' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'live_not_active');
  END IF;
  IF v_live.seller_id = v_user THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_gift_self');
  END IF;

  v_currency := upper(coalesce(v_live.currency, 'EUR'));
  v_price := public._gift_price(_gift_key, v_currency);
  IF v_price IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unknown_gift');
  END IF;

  -- Wallet must exist and be in the live's currency (same rule as purchases).
  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_user FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.wallets (user_id, currency) VALUES (v_user, v_currency)
      RETURNING * INTO v_wallet;
  END IF;
  IF upper(v_wallet.currency) <> v_currency THEN
    RETURN jsonb_build_object(
      'ok', false, 'error', 'currency_mismatch',
      'wallet_currency', v_wallet.currency, 'live_currency', v_currency
    );
  END IF;
  IF v_wallet.balance < v_price THEN
    RETURN jsonb_build_object(
      'ok', false, 'error', 'insufficient_funds',
      'balance', v_wallet.balance, 'price', v_price
    );
  END IF;

  -- Rounding: XOF is whole, others 2-decimal.
  IF v_currency = 'XOF' THEN
    v_platform_fee := round(v_price * v_fee_pct / 100);
  ELSE
    v_platform_fee := round(v_price * v_fee_pct / 100 * 100) / 100;
  END IF;
  v_seller_net := v_price - v_platform_fee;

  -- Debit wallet.
  v_new_wallet := v_wallet.balance - v_price;
  UPDATE public.wallets SET balance = v_new_wallet, updated_at = now()
    WHERE user_id = v_user;
  INSERT INTO public.wallet_transactions
    (user_id, type, amount, balance_after, status)
    VALUES (v_user, 'gift', -v_price, v_new_wallet, 'completed');

  -- Credit seller (available immediately — nothing to deliver).
  SELECT * INTO v_bal FROM public.seller_balances
    WHERE seller_id = v_live.seller_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.seller_balances (seller_id, available, pending, currency)
      VALUES (v_live.seller_id, 0, 0, v_currency)
      RETURNING * INTO v_bal;
  END IF;
  v_new_available := v_bal.available + v_seller_net;
  UPDATE public.seller_balances
     SET available = v_new_available, updated_at = now()
   WHERE seller_id = v_live.seller_id;

  INSERT INTO public.seller_earnings
    (seller_id, order_id, amount, balance_after, status, source, live_id, gift_key)
    VALUES (v_live.seller_id, NULL, v_seller_net, v_new_available,
            'released', 'gift', _live_id, _gift_key);

  -- Log the gift for realtime + audit.
  INSERT INTO public.live_gifts
    (live_id, sender_id, seller_id, gift_key, amount, currency, platform_fee, seller_net)
    VALUES (_live_id, v_user, v_live.seller_id, _gift_key,
            v_price, v_currency, v_platform_fee, v_seller_net)
    RETURNING id INTO v_gift_id;

  SELECT COALESCE(display_name, handle, 'invité') INTO v_sender_name
    FROM public.profiles WHERE id = v_user;

  RETURN jsonb_build_object(
    'ok', true,
    'gift_id', v_gift_id,
    'amount', v_price,
    'currency', v_currency,
    'balance', v_new_wallet,
    'sender_name', v_sender_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_gift(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public._gift_price(text, text) TO authenticated, service_role;