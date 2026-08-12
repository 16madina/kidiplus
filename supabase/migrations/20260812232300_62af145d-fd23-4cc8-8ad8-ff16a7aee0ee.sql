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

CREATE OR REPLACE FUNCTION public.send_gift(_live_id uuid, _gift_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid := auth.uid();
  v_live public.lives;
  v_wallet public.wallets;
  v_bal public.seller_balances;
  v_live_currency text;
  v_wallet_currency text;
  v_seller_bal_currency text;
  v_price_live numeric;
  v_price_debit numeric;
  v_rate numeric;
  v_fee_pct numeric := 30;
  v_platform_fee numeric;
  v_seller_net numeric;
  v_seller_net_credited numeric;
  v_new_wallet numeric;
  v_new_available numeric;
  v_gift_id uuid;
  v_sender_name text;
  v_risk jsonb;
begin
  if v_user is null then return jsonb_build_object('ok', false, 'error', 'unauthorized'); end if;
  perform public.assert_user_active();

  select * into v_live from public.lives where id = _live_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'live_not_found'); end if;
  if v_live.status <> 'live' then return jsonb_build_object('ok', false, 'error', 'live_not_active'); end if;
  if v_live.seller_id = v_user then return jsonb_build_object('ok', false, 'error', 'cannot_gift_self'); end if;

  v_live_currency := upper(coalesce(v_live.currency, 'EUR'));
  v_price_live := public._gift_price(_gift_key, v_live_currency);
  if v_price_live is null then return jsonb_build_object('ok', false, 'error', 'unknown_gift'); end if;

  select * into v_wallet from public.wallets where user_id = v_user for update;
  if not found then
    insert into public.wallets (user_id, currency) values (v_user, v_live_currency) returning * into v_wallet;
  end if;
  v_wallet_currency := upper(coalesce(v_wallet.currency, v_live_currency));

  if v_wallet_currency = v_live_currency then
    v_price_debit := v_price_live;
    v_rate := 1;
  else
    v_price_debit := public.convert_money(v_price_live, v_live_currency, v_wallet_currency);
    v_rate := public.fx_rate(v_live_currency, v_wallet_currency);
    if v_price_debit is null then return jsonb_build_object('ok', false, 'error', 'conversion_unavailable'); end if;
  end if;

  if v_wallet.balance < v_price_debit then
    return jsonb_build_object('ok', false, 'error', 'insufficient_funds',
      'balance', v_wallet.balance, 'price', v_price_debit,
      'wallet_currency', v_wallet_currency, 'live_currency', v_live_currency,
      'live_amount', v_price_live, 'rate', v_rate);
  end if;

  if v_live_currency = 'XOF' then
    v_platform_fee := round(v_price_live * v_fee_pct / 100);
  else
    v_platform_fee := round(v_price_live * v_fee_pct / 100 * 100) / 100;
  end if;
  v_seller_net := v_price_live - v_platform_fee;

  v_risk := public.risk_check_and_consume(v_user, 'spend', v_price_debit, v_wallet_currency, false);
  if coalesce((v_risk->>'ok')::boolean, false) is not true then
    return jsonb_build_object('ok', false, 'error', coalesce(v_risk->>'error', 'daily_limit'),
      'cap', v_risk->'cap', 'used', v_risk->'used', 'currency', v_wallet_currency);
  end if;
  v_risk := public.risk_check_and_consume(v_live.seller_id, 'gift_received', v_seller_net, v_live_currency, false);
  if coalesce((v_risk->>'ok')::boolean, false) is not true then
    return jsonb_build_object('ok', false, 'error', 'seller_gift_limit',
      'cap', v_risk->'cap', 'used', v_risk->'used', 'currency', v_live_currency);
  end if;
  perform public.risk_check_and_consume(v_user, 'spend', v_price_debit, v_wallet_currency, true);
  perform public.risk_check_and_consume(v_live.seller_id, 'gift_received', v_seller_net, v_live_currency, true);

  v_new_wallet := v_wallet.balance - v_price_debit;
  update public.wallets set balance = v_new_wallet, updated_at = now() where user_id = v_user;
  insert into public.wallet_transactions (user_id, type, amount, balance_after, status, meta)
    values (v_user, 'gift', -v_price_debit, v_new_wallet, 'completed',
      jsonb_build_object('live_id', _live_id, 'gift_key', _gift_key,
        'live_currency', v_live_currency, 'live_amount', v_price_live,
        'wallet_currency', v_wallet_currency, 'wallet_amount', v_price_debit, 'rate', v_rate));

  select * into v_bal from public.seller_balances where seller_id = v_live.seller_id for update;
  if not found then
    insert into public.seller_balances (seller_id, available, pending, currency)
      values (v_live.seller_id, 0, 0, v_live_currency) returning * into v_bal;
  end if;
  v_seller_bal_currency := upper(coalesce(v_bal.currency, v_live_currency));

  if v_seller_bal_currency = v_live_currency then
    v_seller_net_credited := v_seller_net;
  else
    v_seller_net_credited := public.convert_money(v_seller_net, v_live_currency, v_seller_bal_currency);
    if v_seller_net_credited is null then
      return jsonb_build_object('ok', false, 'error', 'conversion_unavailable');
    end if;
  end if;

  v_new_available := v_bal.available + v_seller_net_credited;
  update public.seller_balances set available = v_new_available, updated_at = now()
    where seller_id = v_live.seller_id;

  insert into public.seller_earnings
    (seller_id, order_id, amount, balance_after, status, source, live_id, gift_key)
    values (v_live.seller_id, null, v_seller_net_credited, v_new_available, 'released', 'gift', _live_id, _gift_key);

  insert into public.live_gifts
    (live_id, sender_id, seller_id, gift_key, amount, currency,
     platform_fee, seller_net, debit_amount, debit_currency)
    values (_live_id, v_user, v_live.seller_id, _gift_key,
            v_price_live, v_live_currency, v_platform_fee, v_seller_net,
            v_price_debit, v_wallet_currency)
    returning id into v_gift_id;

  select coalesce(display_name, handle, 'invité') into v_sender_name
    from public.profiles where id = v_user;

  return jsonb_build_object('ok', true, 'gift_id', v_gift_id,
    'amount', v_price_live, 'currency', v_live_currency,
    'debit_amount', v_price_debit, 'debit_currency', v_wallet_currency,
    'rate', v_rate, 'balance', v_new_wallet, 'sender_name', v_sender_name,
    'seller_credited_amount', v_seller_net_credited, 'seller_credited_currency', v_seller_bal_currency);
end;
$function$;

CREATE OR REPLACE FUNCTION public.credit_referral_for_order(_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.orders;
  v_ref   public.referrals;
  v_owner uuid;
  v_bal   public.referral_balances;
  v_new_avail numeric;
  v_amount numeric;
  v_amount_credited numeric;
  v_currency text;
  v_bal_currency text;
  v_code_active boolean;
  v_claimed boolean;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = _order_id;
  IF NOT FOUND OR v_order.status <> 'paid' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_order');
  END IF;

  IF EXISTS (SELECT 1 FROM public.referral_earnings WHERE order_id = _order_id) THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true);
  END IF;

  v_amount := COALESCE(v_order.platform_fee, 0);
  IF v_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_fee');
  END IF;

  SELECT * INTO v_ref FROM public.referrals
    WHERE referred_user_id = v_order.seller_id AND credits_remaining > 0
    FOR UPDATE;
  IF NOT FOUND THEN
    SELECT * INTO v_ref FROM public.referrals
      WHERE referred_user_id = v_order.buyer_id AND credits_remaining > 0
      FOR UPDATE;
  END IF;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'attributed', false);
  END IF;

  SELECT active, (owner_id IS NOT NULL) INTO v_code_active, v_claimed
    FROM public.promo_codes WHERE id = v_ref.promo_code_id;
  IF NOT COALESCE(v_code_active, false) THEN
    RETURN jsonb_build_object('ok', true, 'attributed', false, 'reason', 'code_inactive');
  END IF;

  v_currency := upper(coalesce(v_order.currency, 'EUR'));

  IF v_claimed AND v_ref.owner_id IS NOT NULL THEN
    v_owner := v_ref.owner_id;
    v_bal := public._ensure_referral_balance(v_owner, v_currency);
    v_bal_currency := upper(coalesce(v_bal.currency, v_currency));

    IF v_bal_currency = v_currency THEN
      v_amount_credited := v_amount;
    ELSE
      v_amount_credited := public.convert_money(v_amount, v_currency, v_bal_currency);
      IF v_amount_credited IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'conversion_unavailable');
      END IF;
    END IF;

    v_new_avail := v_bal.available + v_amount_credited;
    UPDATE public.referral_balances
       SET available = v_new_avail, updated_at = now()
     WHERE owner_id = v_owner;

    INSERT INTO public.referral_earnings
      (owner_id, referred_user_id, order_id, amount, currency, status)
    VALUES
      (v_owner, v_ref.referred_user_id, _order_id, v_amount_credited, v_bal_currency, 'credited');
  ELSE
    INSERT INTO public.referral_earnings
      (owner_id, referred_user_id, order_id, amount, currency, status)
    VALUES
      (NULL, v_ref.referred_user_id, _order_id, v_amount, v_currency, 'held');
  END IF;

  UPDATE public.referrals
     SET credits_remaining = credits_remaining - 1, updated_at = now()
   WHERE id = v_ref.id;

  RETURN jsonb_build_object('ok', true, 'attributed', true,
    'amount', v_amount, 'currency', v_currency,
    'credited_amount', v_amount_credited, 'credited_currency', v_bal_currency);
END;
$function$;
