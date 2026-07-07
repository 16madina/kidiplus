
-- 1. Allow 'wallet' as a payment method on orders
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IN ('card','wave','orange_money','wallet'));

-- 2. wallets table
CREATE TABLE public.wallets (
  user_id    uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  balance    numeric NOT NULL DEFAULT 0 CHECK (balance >= 0),
  currency   text NOT NULL DEFAULT 'eur',
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.wallets TO authenticated;
GRANT ALL ON public.wallets TO service_role;

ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY wallets_select_own ON public.wallets
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
-- No client INSERT/UPDATE/DELETE policies — only SECURITY DEFINER RPCs
-- and the service_role webhook mutate balances.

-- 3. wallet_transactions
CREATE TABLE public.wallet_transactions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type                     text NOT NULL CHECK (type IN ('topup','purchase','refund','adjustment')),
  amount                   numeric NOT NULL,
  balance_after            numeric NOT NULL CHECK (balance_after >= 0),
  order_id                 uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  stripe_payment_intent_id text,
  status                   text NOT NULL DEFAULT 'completed' CHECK (status IN ('pending','completed','failed')),
  created_at               timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.wallet_transactions TO authenticated;
GRANT ALL ON public.wallet_transactions TO service_role;

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY wallet_tx_select_own ON public.wallet_transactions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX wallet_tx_user_idx ON public.wallet_transactions (user_id, created_at DESC);
CREATE UNIQUE INDEX wallet_tx_topup_intent_unique
  ON public.wallet_transactions (stripe_payment_intent_id)
  WHERE type = 'topup' AND status = 'completed';

-- 4. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.wallets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.wallet_transactions;

-- 5. Extend handle_new_user to also create a wallet row
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  base_handle TEXT;
  candidate_handle TEXT;
  counter INT := 0;
  display TEXT;
BEGIN
  base_handle := lower(regexp_replace(split_part(NEW.email, '@', 1), '[^a-z0-9_]', '', 'g'));
  IF base_handle IS NULL OR length(base_handle) < 2 THEN
    base_handle := 'user' || substr(NEW.id::text, 1, 6);
  END IF;
  base_handle := substr(base_handle, 1, 24);

  candidate_handle := base_handle;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE handle = candidate_handle) LOOP
    counter := counter + 1;
    candidate_handle := base_handle || counter::text;
  END LOOP;

  display := COALESCE(
    NULLIF(NEW.raw_user_meta_data ->> 'display_name', ''),
    split_part(NEW.email, '@', 1)
  );

  INSERT INTO public.profiles (id, email, display_name, handle)
  VALUES (NEW.id, NEW.email, display, candidate_handle);

  INSERT INTO public.wallets (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- 6. Backfill wallets for existing profiles
INSERT INTO public.wallets (user_id)
SELECT id FROM public.profiles
ON CONFLICT (user_id) DO NOTHING;

-- 7. Atomic pay-with-wallet RPC
CREATE OR REPLACE FUNCTION public.pay_order_with_wallet(_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_order public.orders;
  v_wallet public.wallets;
  v_new_balance numeric;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;
  IF v_order.buyer_id <> v_user THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF v_order.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_pending');
  END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_user FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.wallets (user_id) VALUES (v_user)
    RETURNING * INTO v_wallet;
  END IF;

  IF v_wallet.balance < v_order.total THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_funds',
                              'balance', v_wallet.balance, 'total', v_order.total);
  END IF;

  v_new_balance := v_wallet.balance - v_order.total;

  UPDATE public.wallets
     SET balance = v_new_balance, updated_at = now()
   WHERE user_id = v_user;

  UPDATE public.orders
     SET status = 'paid',
         payment_method = 'wallet',
         paid_at = now()
   WHERE id = _order_id;

  INSERT INTO public.wallet_transactions
    (user_id, type, amount, balance_after, order_id, status)
  VALUES
    (v_user, 'purchase', -v_order.total, v_new_balance, _order_id, 'completed');

  RETURN jsonb_build_object('ok', true, 'balance', v_new_balance);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pay_order_with_wallet(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_order_with_wallet(uuid) TO authenticated;

-- 8. Service-role idempotent top-up credit (used by Stripe webhook)
CREATE OR REPLACE FUNCTION public.credit_wallet_topup(
  _user_id uuid,
  _amount numeric,
  _payment_intent_id text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_wallet public.wallets;
  v_new_balance numeric;
BEGIN
  IF _amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  -- Idempotency guard
  IF EXISTS (
    SELECT 1 FROM public.wallet_transactions
     WHERE stripe_payment_intent_id = _payment_intent_id
       AND type = 'topup' AND status = 'completed'
  ) THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true);
  END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = _user_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.wallets (user_id) VALUES (_user_id)
    RETURNING * INTO v_wallet;
  END IF;

  v_new_balance := v_wallet.balance + _amount;

  UPDATE public.wallets
     SET balance = v_new_balance, updated_at = now()
   WHERE user_id = _user_id;

  INSERT INTO public.wallet_transactions
    (user_id, type, amount, balance_after, stripe_payment_intent_id, status)
  VALUES
    (_user_id, 'topup', _amount, v_new_balance, _payment_intent_id, 'completed');

  RETURN jsonb_build_object('ok', true, 'balance', v_new_balance);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.credit_wallet_topup(uuid, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_wallet_topup(uuid, numeric, text) TO service_role;
