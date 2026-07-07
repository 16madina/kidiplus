
-- Part 1: Seller earnings, payouts, admin flag

-- 0. Admin flag on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- 0b. seller_net column on orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS seller_net numeric NOT NULL DEFAULT 0;

-- 1. seller_balances
CREATE TABLE IF NOT EXISTS public.seller_balances (
  seller_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  available numeric NOT NULL DEFAULT 0 CHECK (available >= 0),
  currency text NOT NULL DEFAULT 'EUR',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.seller_balances TO authenticated;
GRANT ALL ON public.seller_balances TO service_role;
ALTER TABLE public.seller_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "seller reads own balance" ON public.seller_balances
  FOR SELECT TO authenticated USING (auth.uid() = seller_id);

-- 2. seller_earnings ledger
CREATE TABLE IF NOT EXISTS public.seller_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  balance_after numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.seller_earnings TO authenticated;
GRANT ALL ON public.seller_earnings TO service_role;
ALTER TABLE public.seller_earnings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "seller reads own earnings" ON public.seller_earnings
  FOR SELECT TO authenticated USING (auth.uid() = seller_id);

-- 3. payouts
CREATE TABLE IF NOT EXISTS public.payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL,
  method text NOT NULL CHECK (method IN ('wave','orange_money','bank_transfer')),
  destination jsonb NOT NULL,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','processing','paid','rejected')),
  note text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_payouts_seller ON public.payouts(seller_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_payouts_status ON public.payouts(status, requested_at);
GRANT SELECT ON public.payouts TO authenticated;
GRANT ALL ON public.payouts TO service_role;
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

-- has_admin helper (avoid recursive RLS)
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT is_admin FROM public.profiles WHERE id = _user_id), false);
$$;

CREATE POLICY "seller reads own payouts" ON public.payouts
  FOR SELECT TO authenticated USING (auth.uid() = seller_id);
CREATE POLICY "admins read all payouts" ON public.payouts
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- RPC: credit_seller_earning
CREATE OR REPLACE FUNCTION public.credit_seller_earning(_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order public.orders;
  v_bal public.seller_balances;
  v_seller_currency text;
  v_new numeric;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'order_not_found'); END IF;
  IF v_order.status <> 'paid' THEN RETURN jsonb_build_object('ok', false, 'error', 'order_not_paid'); END IF;
  IF COALESCE(v_order.seller_net, 0) <= 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'no_net'); END IF;

  -- Idempotency
  IF EXISTS (SELECT 1 FROM public.seller_earnings WHERE order_id = _order_id) THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true);
  END IF;

  SELECT currency INTO v_seller_currency FROM public.profiles WHERE id = v_order.seller_id;

  SELECT * INTO v_bal FROM public.seller_balances WHERE seller_id = v_order.seller_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.seller_balances (seller_id, available, currency)
    VALUES (v_order.seller_id, 0, COALESCE(v_seller_currency, v_order.currency, 'EUR'))
    RETURNING * INTO v_bal;
  END IF;

  v_new := v_bal.available + v_order.seller_net;
  UPDATE public.seller_balances SET available = v_new, updated_at = now() WHERE seller_id = v_order.seller_id;
  INSERT INTO public.seller_earnings (seller_id, order_id, amount, balance_after)
  VALUES (v_order.seller_id, _order_id, v_order.seller_net, v_new);

  RETURN jsonb_build_object('ok', true, 'balance', v_new);
END;
$$;

-- RPC: request_payout
CREATE OR REPLACE FUNCTION public.request_payout(_amount numeric, _method text, _destination jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_bal public.seller_balances;
  v_min numeric;
  v_payout_id uuid;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthorized'); END IF;
  IF _method NOT IN ('wave','orange_money','bank_transfer') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_method');
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  SELECT * INTO v_bal FROM public.seller_balances WHERE seller_id = v_user FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'no_balance'); END IF;

  v_min := CASE v_bal.currency
    WHEN 'XOF' THEN 5000
    WHEN 'CAD' THEN 15
    ELSE 10
  END;

  IF _amount < v_min THEN
    RETURN jsonb_build_object('ok', false, 'error', 'below_minimum', 'min', v_min);
  END IF;
  IF v_bal.available < _amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_funds', 'available', v_bal.available);
  END IF;

  UPDATE public.seller_balances SET available = available - _amount, updated_at = now()
    WHERE seller_id = v_user;

  INSERT INTO public.payouts (seller_id, amount, currency, method, destination)
    VALUES (v_user, _amount, v_bal.currency, _method, _destination)
    RETURNING id INTO v_payout_id;

  RETURN jsonb_build_object('ok', true, 'payout_id', v_payout_id);
END;
$$;

-- RPC: admin_process_payout
CREATE OR REPLACE FUNCTION public.admin_process_payout(_payout_id uuid, _action text, _note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_payout public.payouts;
BEGIN
  IF v_user IS NULL OR NOT public.is_admin(v_user) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF _action NOT IN ('paid','rejected') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_action');
  END IF;

  SELECT * INTO v_payout FROM public.payouts WHERE id = _payout_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'payout_not_found'); END IF;
  IF v_payout.status NOT IN ('requested','processing') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_processed');
  END IF;

  IF _action = 'paid' THEN
    UPDATE public.payouts SET status = 'paid', processed_at = now(), note = COALESCE(_note, note)
      WHERE id = _payout_id;
  ELSE
    -- Credit back to seller balance
    UPDATE public.seller_balances SET available = available + v_payout.amount, updated_at = now()
      WHERE seller_id = v_payout.seller_id;
    UPDATE public.payouts SET status = 'rejected', processed_at = now(), note = COALESCE(_note, note)
      WHERE id = _payout_id;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Update pay_order_with_wallet to also credit the seller
CREATE OR REPLACE FUNCTION public.pay_order_with_wallet(_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'order_not_found'); END IF;
  IF v_order.buyer_id <> v_user THEN RETURN jsonb_build_object('ok', false, 'error', 'forbidden'); END IF;
  IF v_order.status <> 'pending' THEN RETURN jsonb_build_object('ok', false, 'error', 'order_not_pending'); END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_user FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.wallets (user_id) VALUES (v_user) RETURNING * INTO v_wallet;
  END IF;

  IF v_wallet.balance < v_order.total THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_funds',
                              'balance', v_wallet.balance, 'total', v_order.total);
  END IF;

  v_new_balance := v_wallet.balance - v_order.total;
  UPDATE public.wallets SET balance = v_new_balance, updated_at = now() WHERE user_id = v_user;
  UPDATE public.orders SET status = 'paid', payment_method = 'wallet', paid_at = now()
    WHERE id = _order_id;

  INSERT INTO public.wallet_transactions (user_id, type, amount, balance_after, order_id, status)
    VALUES (v_user, 'purchase', -v_order.total, v_new_balance, _order_id, 'completed');

  -- Credit the seller
  PERFORM public.credit_seller_earning(_order_id);

  RETURN jsonb_build_object('ok', true, 'balance', v_new_balance);
END;
$$;
