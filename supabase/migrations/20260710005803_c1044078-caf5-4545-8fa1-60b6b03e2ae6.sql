
-- 1. Rate table (single source of truth mirroring src/lib/money.ts).
CREATE OR REPLACE FUNCTION public.fx_rate(_from text, _to text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  f text := upper(coalesce(_from, ''));
  t text := upper(coalesce(_to, ''));
  eur_to_xof numeric := 655.957;    -- BCEAO peg
  eur_to_cad numeric := 1.47;
  margin numeric := 0.015;          -- 1.5% safety margin on non-peg pairs
  from_eur numeric;
  to_eur numeric;
  rate numeric;
  is_peg boolean;
BEGIN
  IF f = t THEN RETURN 1; END IF;

  -- Amount of `from` in 1 EUR.
  IF f = 'EUR' THEN from_eur := 1;
  ELSIF f = 'XOF' THEN from_eur := eur_to_xof;
  ELSIF f = 'CAD' THEN from_eur := eur_to_cad;
  ELSE RETURN NULL; END IF;

  IF t = 'EUR' THEN to_eur := 1;
  ELSIF t = 'XOF' THEN to_eur := eur_to_xof;
  ELSIF t = 'CAD' THEN to_eur := eur_to_cad;
  ELSE RETURN NULL; END IF;

  rate := to_eur / from_eur;

  -- Peg pairs (XOF <-> EUR) skip the margin; every other pair gets it.
  is_peg := (f = 'EUR' AND t = 'XOF') OR (f = 'XOF' AND t = 'EUR');
  IF NOT is_peg THEN
    -- Apply margin against the buyer (they pay slightly more of the source cur).
    rate := rate * (1 - margin);
  END IF;

  RETURN rate;
END;
$$;

CREATE OR REPLACE FUNCTION public.convert_money(_amount numeric, _from text, _to text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  r numeric;
  raw numeric;
  target text := upper(coalesce(_to, ''));
BEGIN
  IF _amount IS NULL THEN RETURN NULL; END IF;
  IF upper(coalesce(_from,'')) = target THEN
    IF target = 'XOF' THEN RETURN round(_amount);
    ELSE RETURN round(_amount * 100) / 100;
    END IF;
  END IF;
  r := public.fx_rate(_from, _to);
  IF r IS NULL THEN RETURN NULL; END IF;
  raw := _amount * r;
  IF target = 'XOF' THEN
    RETURN round(raw);
  ELSE
    -- Round up on non-XOF to avoid off-by-cent underpay against the seller.
    RETURN ceil(raw * 100) / 100;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fx_rate(text, text) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.convert_money(numeric, text, text) TO authenticated, service_role, anon;

-- 2. Audit columns.
ALTER TABLE public.wallet_transactions
  ADD COLUMN IF NOT EXISTS meta jsonb;

ALTER TABLE public.live_gifts
  ADD COLUMN IF NOT EXISTS debit_amount numeric,
  ADD COLUMN IF NOT EXISTS debit_currency text;

-- 3. Revised send_gift with cross-currency debit.
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
  v_live_currency text;
  v_wallet_currency text;
  v_price_live numeric;
  v_price_debit numeric;
  v_rate numeric;
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

  v_live_currency := upper(coalesce(v_live.currency, 'EUR'));
  v_price_live := public._gift_price(_gift_key, v_live_currency);
  IF v_price_live IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unknown_gift');
  END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_user FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.wallets (user_id, currency) VALUES (v_user, v_live_currency)
      RETURNING * INTO v_wallet;
  END IF;
  v_wallet_currency := upper(coalesce(v_wallet.currency, v_live_currency));

  IF v_wallet_currency = v_live_currency THEN
    v_price_debit := v_price_live;
    v_rate := 1;
  ELSE
    v_price_debit := public.convert_money(v_price_live, v_live_currency, v_wallet_currency);
    v_rate := public.fx_rate(v_live_currency, v_wallet_currency);
    IF v_price_debit IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'conversion_unavailable');
    END IF;
  END IF;

  IF v_wallet.balance < v_price_debit THEN
    RETURN jsonb_build_object(
      'ok', false, 'error', 'insufficient_funds',
      'balance', v_wallet.balance,
      'price', v_price_debit,
      'wallet_currency', v_wallet_currency,
      'live_currency', v_live_currency,
      'live_amount', v_price_live,
      'rate', v_rate
    );
  END IF;

  -- Seller-side amounts stay in the LIVE currency.
  IF v_live_currency = 'XOF' THEN
    v_platform_fee := round(v_price_live * v_fee_pct / 100);
  ELSE
    v_platform_fee := round(v_price_live * v_fee_pct / 100 * 100) / 100;
  END IF;
  v_seller_net := v_price_live - v_platform_fee;

  -- Debit wallet (in wallet currency).
  v_new_wallet := v_wallet.balance - v_price_debit;
  UPDATE public.wallets SET balance = v_new_wallet, updated_at = now()
    WHERE user_id = v_user;
  INSERT INTO public.wallet_transactions
    (user_id, type, amount, balance_after, status, meta)
    VALUES (v_user, 'gift', -v_price_debit, v_new_wallet, 'completed',
      jsonb_build_object(
        'live_id', _live_id,
        'gift_key', _gift_key,
        'live_currency', v_live_currency,
        'live_amount', v_price_live,
        'wallet_currency', v_wallet_currency,
        'wallet_amount', v_price_debit,
        'rate', v_rate
      ));

  -- Credit seller in LIVE currency.
  SELECT * INTO v_bal FROM public.seller_balances
    WHERE seller_id = v_live.seller_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.seller_balances (seller_id, available, pending, currency)
      VALUES (v_live.seller_id, 0, 0, v_live_currency)
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

  INSERT INTO public.live_gifts
    (live_id, sender_id, seller_id, gift_key, amount, currency,
     platform_fee, seller_net, debit_amount, debit_currency)
    VALUES (_live_id, v_user, v_live.seller_id, _gift_key,
            v_price_live, v_live_currency, v_platform_fee, v_seller_net,
            v_price_debit, v_wallet_currency)
    RETURNING id INTO v_gift_id;

  SELECT COALESCE(display_name, handle, 'invité') INTO v_sender_name
    FROM public.profiles WHERE id = v_user;

  RETURN jsonb_build_object(
    'ok', true,
    'gift_id', v_gift_id,
    'amount', v_price_live,
    'currency', v_live_currency,
    'debit_amount', v_price_debit,
    'debit_currency', v_wallet_currency,
    'rate', v_rate,
    'balance', v_new_wallet,
    'sender_name', v_sender_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_gift(uuid, text) TO authenticated;

-- 4. Revised pay_order_with_wallet with cross-currency debit.
CREATE OR REPLACE FUNCTION public.pay_order_with_wallet(_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_order public.orders;
  v_wallet public.wallets;
  v_order_currency text;
  v_wallet_currency text;
  v_debit numeric;
  v_rate numeric;
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

  v_order_currency := upper(coalesce(v_order.currency, 'EUR'));
  v_wallet_currency := upper(coalesce(v_wallet.currency, v_order_currency));

  IF v_wallet_currency = v_order_currency THEN
    v_debit := v_order.total;
    v_rate := 1;
  ELSE
    v_debit := public.convert_money(v_order.total, v_order_currency, v_wallet_currency);
    v_rate := public.fx_rate(v_order_currency, v_wallet_currency);
    IF v_debit IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'conversion_unavailable');
    END IF;
  END IF;

  IF v_wallet.balance < v_debit THEN
    RETURN jsonb_build_object(
      'ok', false, 'error', 'insufficient_funds',
      'balance', v_wallet.balance,
      'total', v_debit,
      'order_amount', v_order.total,
      'order_currency', v_order_currency,
      'wallet_currency', v_wallet_currency,
      'rate', v_rate
    );
  END IF;

  v_new_balance := v_wallet.balance - v_debit;
  UPDATE public.wallets SET balance = v_new_balance, updated_at = now() WHERE user_id = v_user;
  UPDATE public.orders SET status = 'paid', payment_method = 'wallet', paid_at = now()
    WHERE id = _order_id;

  INSERT INTO public.wallet_transactions
    (user_id, type, amount, balance_after, order_id, status, meta)
    VALUES (v_user, 'purchase', -v_debit, v_new_balance, _order_id, 'completed',
      jsonb_build_object(
        'order_currency', v_order_currency,
        'order_amount', v_order.total,
        'wallet_currency', v_wallet_currency,
        'wallet_amount', v_debit,
        'rate', v_rate
      ));

  PERFORM public.credit_seller_earning(_order_id);

  RETURN jsonb_build_object(
    'ok', true,
    'balance', v_new_balance,
    'debit_amount', v_debit,
    'debit_currency', v_wallet_currency,
    'order_amount', v_order.total,
    'order_currency', v_order_currency,
    'rate', v_rate
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pay_order_with_wallet(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_order_with_wallet(uuid) TO authenticated;
