-- Orders sync + wallet re-pay:
-- 1) pay_order_with_wallet: allow pending|failed|cancelledled(non-timeout), keep risk checks,
--    set payment_method=wallet, credit seller best-effort.
-- 2) Notify seller on paid (real sale), not on pending INSERT.

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
  v_risk jsonb;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;
  PERFORM public.assert_user_active();

  SELECT * INTO v_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'order_not_found'); END IF;
  IF v_order.buyer_id <> v_user THEN RETURN jsonb_build_object('ok', false, 'error', 'forbidden'); END IF;

  IF v_order.status = 'paid' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_pending');
  END IF;

  -- Timeout cancellations stay closed; other cancelled/failed stay repayable
  -- (e.g. abandoned Stripe PI used to flip status incorrectly).
  IF v_order.status = 'cancelled'
     AND coalesce(v_order.cancelled_reason, '') = 'payment_timeout' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_expired');
  END IF;

  IF v_order.status NOT IN ('pending', 'failed', 'cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_pending');
  END IF;

  IF v_order.payment_deadline IS NOT NULL AND v_order.payment_deadline < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_expired');
  END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_user FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.wallets (user_id, currency)
    VALUES (v_user, upper(coalesce(v_order.currency, 'EUR')))
    RETURNING * INTO v_wallet;
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

  v_risk := public.risk_check_and_consume(v_user, 'spend', v_debit, v_wallet_currency, true);
  IF coalesce((v_risk->>'ok')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', coalesce(v_risk->>'error', 'daily_limit'),
      'cap', v_risk->'cap',
      'used', v_risk->'used',
      'currency', v_wallet_currency
    );
  END IF;

  v_new_balance := v_wallet.balance - v_debit;
  UPDATE public.wallets SET balance = v_new_balance, updated_at = now() WHERE user_id = v_user;

  UPDATE public.orders
     SET status = 'paid',
         payment_method = 'wallet',
         paid_at = now(),
         cancelled_reason = NULL,
         stripe_payment_intent_id = NULL
   WHERE id = _order_id;

  INSERT INTO public.wallet_transactions
    (user_id, type, amount, balance_after, order_id, status, meta)
  VALUES (
    v_user, 'purchase', -v_debit, v_new_balance, _order_id, 'completed',
    jsonb_build_object(
      'order_currency', v_order_currency,
      'order_amount', v_order.total,
      'wallet_currency', v_wallet_currency,
      'wallet_amount', v_debit,
      'rate', v_rate
    )
  );

  BEGIN
    PERFORM public.credit_seller_earning(_order_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'credit_seller_earning failed for wallet pay %: %', _order_id, SQLERRM;
  END;

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

-- Notify seller when the order is actually paid (not on pending INSERT).
DROP TRIGGER IF EXISTS trg_notify_seller_new_sale ON public.orders;

CREATE OR REPLACE FUNCTION public.notify_seller_new_sale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.seller_id IS NULL OR NEW.seller_id = NEW.buyer_id THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM 'paid' THEN
    RETURN NEW;
  END IF;
  -- INSERT already paid (wallet auto-pay) OR UPDATE pending→paid
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM 'paid' THEN
    RETURN NEW;
  END IF;

  PERFORM public._push_notification(
    NEW.seller_id,
    'sale_new',
    'Nouvelle vente 🎉',
    coalesce(NULLIF(trim(NEW.item_name), ''), 'Un article')
      || ' — ' || trim(to_char(NEW.amount, 'FM999999990.##'))
      || ' ' || upper(coalesce(NEW.currency, '')),
    NEW.id,
    jsonb_build_object(
      'kind', 'order',
      'order_id', NEW.id,
      'live_id', NEW.live_id,
      'sale_kind', NEW.kind
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_seller_new_sale
  AFTER INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_seller_new_sale();
