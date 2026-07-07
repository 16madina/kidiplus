
CREATE OR REPLACE FUNCTION public.request_payout(_amount numeric, _method text, _destination jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Payout minimums by currency.
  -- TEST VALUE — restore XOF to 5000 before public launch.
  -- Keep in sync with PAYOUT_MINIMUMS in src/lib/fees.ts.
  v_min := CASE v_bal.currency
    WHEN 'XOF' THEN 100
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
$function$;
