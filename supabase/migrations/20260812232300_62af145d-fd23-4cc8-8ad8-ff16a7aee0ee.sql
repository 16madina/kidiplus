CREATE OR REPLACE FUNCTION public.credit_seller_earning(_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order  public.orders;
  v_bal    public.seller_balances;
  v_new_pending numeric;
  v_earning_id uuid;
  v_currency text;
  v_bal_currency text;
  v_fee numeric;
  v_net numeric;
  v_net_credited numeric;
  v_zero boolean;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'order_not_found'); END IF;
  IF v_order.status <> 'paid' THEN RETURN jsonb_build_object('ok', false, 'error', 'order_not_paid'); END IF;

  IF EXISTS (SELECT 1 FROM public.seller_earnings WHERE order_id = _order_id) THEN
    PERFORM public.credit_referral_for_order(_order_id);
    RETURN jsonb_build_object('ok', true, 'duplicate', true);
  END IF;

  v_currency := upper(coalesce(v_order.currency, 'EUR'));
  v_zero := (v_currency = 'XOF');

  v_fee := CASE WHEN v_zero
    THEN round(coalesce(v_order.amount,0) * public.platform_fee_rate())
    ELSE round(coalesce(v_order.amount,0) * public.platform_fee_rate(), 2) END;
  v_net := coalesce(v_order.amount,0) - v_fee + coalesce(v_order.delivery_fee,0);
  v_net := CASE WHEN v_zero THEN round(v_net) ELSE round(v_net, 2) END;

  IF coalesce(v_order.platform_fee,0) <> v_fee OR coalesce(v_order.seller_net,0) <> v_net THEN
    UPDATE public.orders
       SET platform_fee = v_fee, seller_net = v_net
     WHERE id = _order_id;
  END IF;

  v_bal := public._ensure_seller_balance(v_order.seller_id, v_currency);
  v_bal_currency := upper(coalesce(v_bal.currency, v_currency));

  IF v_bal_currency = v_currency THEN
    v_net_credited := v_net;
  ELSE
    v_net_credited := public.convert_money(v_net, v_currency, v_bal_currency);
    IF v_net_credited IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'conversion_unavailable');
    END IF;
  END IF;

  v_new_pending := v_bal.pending + v_net_credited;
  UPDATE public.seller_balances
     SET pending = v_new_pending, updated_at = now()
   WHERE seller_id = v_order.seller_id;

  INSERT INTO public.seller_earnings
    (seller_id, order_id, amount, balance_after, status)
  VALUES
    (v_order.seller_id, _order_id, v_net_credited, v_new_pending, 'pending')
  RETURNING id INTO v_earning_id;

  BEGIN
    PERFORM public._log_order_event(_order_id, 'paid', NULL, NULL);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    PERFORM public.credit_referral_for_order(_order_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'credit_referral_for_order failed for %: %', _order_id, SQLERRM;
  END;

  RETURN jsonb_build_object('ok', true, 'earning_id', v_earning_id, 'seller_net', v_net,
    'credited_amount', v_net_credited, 'credited_currency', v_bal_currency);
END;
$function$;
