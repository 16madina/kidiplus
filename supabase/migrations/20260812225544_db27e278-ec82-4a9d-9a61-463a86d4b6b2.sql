
-- 1) Allow 'wallet' payout source + 'withdrawal' wallet transaction type
ALTER TABLE public.payouts DROP CONSTRAINT IF EXISTS payouts_source_check;
ALTER TABLE public.payouts ADD CONSTRAINT payouts_source_check
  CHECK (source = ANY (ARRAY['seller'::text, 'referral'::text, 'wallet'::text]));

ALTER TABLE public.wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_type_check;
ALTER TABLE public.wallet_transactions ADD CONSTRAINT wallet_transactions_type_check
  CHECK (type = ANY (ARRAY['topup'::text,'purchase'::text,'refund'::text,'adjustment'::text,'gift'::text,'withdrawal'::text]));

-- 2) request_payout: support source = 'wallet'
CREATE OR REPLACE FUNCTION public.request_payout(_amount numeric, _method text, _destination jsonb, _source text DEFAULT 'seller'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid := auth.uid();
  v_min numeric;
  v_payout_id uuid;
  v_available numeric;
  v_currency text;
  v_tier text;
  v_caps jsonb;
  v_daily_cap numeric;
  v_weekly_cap numeric;
  v_day_used numeric;
  v_week_used numeric;
  v_day_start timestamptz;
  v_recent_topup boolean;
  v_recent_gift boolean;
  v_connect text;
  v_new_balance numeric;
begin
  if v_user is null then return jsonb_build_object('ok', false, 'error', 'unauthorized'); end if;
  perform public.assert_user_active();

  v_tier := public.risk_user_tier(v_user);
  if v_tier = 'restricted' then
    perform public.risk_raise_alert(v_user, 'restricted_block', jsonb_build_object('kind', 'payout'));
    return jsonb_build_object('ok', false, 'error', 'risk_restricted');
  end if;

  if _method not in ('wave','orange_money','bank_transfer','paypal','stripe_connect') then
    return jsonb_build_object('ok', false, 'error', 'invalid_method');
  end if;
  if _amount is null or _amount <= 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_amount');
  end if;
  if _source not in ('seller','referral','wallet') then
    return jsonb_build_object('ok', false, 'error', 'invalid_source');
  end if;

  if _source = 'referral' then
    select available, currency into v_available, v_currency
      from public.referral_balances where owner_id = v_user for update;
  elsif _source = 'wallet' then
    select balance, currency into v_available, v_currency
      from public.wallets where user_id = v_user for update;
  else
    select available, currency into v_available, v_currency
      from public.seller_balances where seller_id = v_user for update;
  end if;
  if v_available is null then
    return jsonb_build_object('ok', false, 'error', 'no_balance');
  end if;

  v_currency := upper(coalesce(v_currency, 'EUR'));

  if _method = 'stripe_connect' then
    if v_currency = 'XOF' then
      return jsonb_build_object('ok', false, 'error', 'connect_currency_unsupported');
    end if;
    select connect_status into v_connect from public.profiles where id = v_user;
    if coalesce(v_connect, 'none') <> 'active' then
      return jsonb_build_object('ok', false, 'error', 'connect_not_ready', 'connect_status', coalesce(v_connect,'none'));
    end if;
  end if;

  v_min := case v_currency when 'XOF' then 5000 when 'CAD' then 15 when 'USD' then 12 when 'GBP' then 10 else 10 end;
  if _amount < v_min then
    return jsonb_build_object('ok', false, 'error', 'below_minimum', 'min', v_min);
  end if;
  if v_available < _amount then
    return jsonb_build_object('ok', false, 'error', 'insufficient_funds', 'available', v_available);
  end if;

  v_caps := public.risk_payout_caps(v_tier, v_currency);
  v_daily_cap := coalesce((v_caps->>'daily')::numeric, 0);
  v_weekly_cap := coalesce((v_caps->>'weekly')::numeric, 0);
  v_day_start := date_trunc('day', timezone('utc', now())) at time zone 'utc';

  v_day_used := public.risk_payout_usage(v_user, v_currency, v_day_start);
  v_week_used := public.risk_payout_usage(v_user, v_currency, now() - interval '7 days');

  if v_day_used + _amount > v_daily_cap then
    perform public.risk_raise_alert(v_user, 'payout_daily_limit', jsonb_build_object(
      'amount', _amount, 'currency', v_currency, 'tier', v_tier,
      'used', v_day_used, 'cap', v_daily_cap
    ));
    return jsonb_build_object('ok', false, 'error', 'payout_daily_limit', 'tier', v_tier,
      'used', v_day_used, 'cap', v_daily_cap, 'currency', v_currency);
  end if;

  if v_week_used + _amount > v_weekly_cap then
    perform public.risk_raise_alert(v_user, 'payout_weekly_limit', jsonb_build_object(
      'amount', _amount, 'currency', v_currency, 'tier', v_tier,
      'used', v_week_used, 'cap', v_weekly_cap
    ));
    return jsonb_build_object('ok', false, 'error', 'payout_weekly_limit', 'tier', v_tier,
      'used', v_week_used, 'cap', v_weekly_cap, 'currency', v_currency);
  end if;

  select exists (
    select 1 from public.wallet_transactions
     where user_id = v_user and type = 'topup' and status = 'completed'
       and created_at > now() - interval '2 hours'
  ) into v_recent_topup;
  select exists (
    select 1 from public.seller_earnings
     where seller_id = v_user and source = 'gift'
       and created_at > now() - interval '2 hours'
  ) into v_recent_gift;
  if v_recent_topup and v_recent_gift then
    perform public.risk_raise_alert(v_user, 'velocity_topup_gift_payout', jsonb_build_object(
      'amount', _amount, 'currency', v_currency, 'source', _source
    ));
  end if;
  if _source = 'wallet' and v_recent_topup then
    perform public.risk_raise_alert(v_user, 'velocity_topup_wallet_payout', jsonb_build_object(
      'amount', _amount, 'currency', v_currency
    ));
  end if;

  if _source = 'referral' then
    update public.referral_balances set available = available - _amount, updated_at = now()
     where owner_id = v_user;
  elsif _source = 'wallet' then
    update public.wallets set balance = balance - _amount, updated_at = now()
     where user_id = v_user
     returning balance into v_new_balance;
  else
    update public.seller_balances set available = available - _amount, updated_at = now()
     where seller_id = v_user;
  end if;

  insert into public.payouts (seller_id, amount, currency, method, destination, source)
    values (v_user, _amount, v_currency, _method, _destination, _source)
    returning id into v_payout_id;

  if _source = 'wallet' then
    insert into public.wallet_transactions
      (user_id, type, amount, balance_after, status, meta)
    values (
      v_user, 'withdrawal', -_amount, v_new_balance, 'completed',
      jsonb_build_object('payout_id', v_payout_id, 'method', _method, 'currency', v_currency)
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'payout_id', v_payout_id,
    'tier', v_tier,
    'daily_cap', v_daily_cap,
    'weekly_cap', v_weekly_cap
  );
end;
$function$;

-- 3) admin_process_payout: refund wallet-sourced payouts back to the wallet
CREATE OR REPLACE FUNCTION public.admin_process_payout(_payout_id uuid, _action text, _note text DEFAULT NULL::text, _proof_url text DEFAULT NULL::text, _admin_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_payout public.payouts;
  v_new_balance numeric;
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
    UPDATE public.payouts
       SET status='paid', processed_at=now(), processed_by=v_user,
           note=COALESCE(_note, note), admin_note=COALESCE(_admin_note, admin_note),
           proof_url=COALESCE(_proof_url, proof_url)
     WHERE id=_payout_id;
  ELSE
    IF COALESCE(v_payout.source,'seller') = 'referral' THEN
      PERFORM public._ensure_referral_balance(v_payout.seller_id, v_payout.currency);
      UPDATE public.referral_balances
         SET available = available + v_payout.amount, updated_at = now()
       WHERE owner_id = v_payout.seller_id;
    ELSIF COALESCE(v_payout.source,'seller') = 'wallet' THEN
      UPDATE public.wallets
         SET balance = balance + v_payout.amount, updated_at = now()
       WHERE user_id = v_payout.seller_id
       RETURNING balance INTO v_new_balance;
      IF v_new_balance IS NOT NULL THEN
        INSERT INTO public.wallet_transactions
          (user_id, type, amount, balance_after, status, meta)
        VALUES (
          v_payout.seller_id, 'refund', v_payout.amount, v_new_balance, 'completed',
          jsonb_build_object('reason','payout_rejected','payout_id', v_payout.id)
        );
      END IF;
    ELSE
      UPDATE public.seller_balances
         SET available = available + v_payout.amount, updated_at = now()
       WHERE seller_id = v_payout.seller_id;
    END IF;
    UPDATE public.payouts
       SET status='rejected', processed_at=now(), processed_by=v_user,
           note=COALESCE(_note, note), admin_note=COALESCE(_admin_note, admin_note)
     WHERE id=_payout_id;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- 4) Real currency conversion for wallet + seller + referral balances
CREATE OR REPLACE FUNCTION public.convert_my_wallet_currency()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  target_currency text;
  w_currency text; w_balance numeric; new_w_balance numeric;
  sb_currency text; sb_available numeric; sb_pending numeric;
  new_available numeric; new_pending numeric;
  rb_currency text; rb_available numeric; new_rb numeric;
  rate_w numeric; rate_s numeric; rate_r numeric;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT upper(currency) INTO target_currency FROM public.profiles WHERE id = uid;
  IF target_currency IS NULL THEN RAISE EXCEPTION 'Profile not found'; END IF;
  IF target_currency NOT IN ('XOF','EUR','CAD','USD','GBP') THEN
    RAISE EXCEPTION 'Unsupported target currency: %', target_currency;
  END IF;

  PERFORM set_config('app.allow_wallet_currency_change', 'on', true);

  -- Wallet
  SELECT upper(currency), balance INTO w_currency, w_balance
    FROM public.wallets WHERE user_id = uid FOR UPDATE;

  IF w_currency IS NOT NULL AND w_currency <> target_currency THEN
    rate_w := public.fx_rate(w_currency, target_currency);
    IF rate_w IS NULL THEN RAISE EXCEPTION 'No FX rate from % to %', w_currency, target_currency; END IF;
    new_w_balance := public.convert_money(w_balance, w_currency, target_currency);

    UPDATE public.wallets
       SET currency = target_currency, balance = new_w_balance, updated_at = now()
     WHERE user_id = uid;

    INSERT INTO public.wallet_transactions
      (user_id, type, amount, balance_after, status, meta)
    VALUES (
      uid, 'adjustment', new_w_balance - w_balance, new_w_balance, 'completed',
      jsonb_build_object(
        'reason', 'currency_conversion',
        'from_currency', w_currency, 'to_currency', target_currency,
        'from_balance', w_balance, 'to_balance', new_w_balance, 'rate', rate_w
      )
    );
  END IF;

  -- Seller balance
  SELECT upper(currency), available, pending INTO sb_currency, sb_available, sb_pending
    FROM public.seller_balances WHERE seller_id = uid FOR UPDATE;

  IF sb_currency IS NOT NULL AND sb_currency <> target_currency THEN
    rate_s := public.fx_rate(sb_currency, target_currency);
    IF rate_s IS NULL THEN RAISE EXCEPTION 'No FX rate from % to % (seller)', sb_currency, target_currency; END IF;
    new_available := public.convert_money(sb_available, sb_currency, target_currency);
    new_pending   := public.convert_money(sb_pending,   sb_currency, target_currency);

    UPDATE public.seller_balances
       SET currency = target_currency, available = new_available,
           pending = new_pending, updated_at = now()
     WHERE seller_id = uid;
  END IF;

  -- Referral balance
  SELECT upper(currency), available INTO rb_currency, rb_available
    FROM public.referral_balances WHERE owner_id = uid FOR UPDATE;

  IF rb_currency IS NOT NULL AND rb_currency <> target_currency THEN
    rate_r := public.fx_rate(rb_currency, target_currency);
    IF rate_r IS NULL THEN RAISE EXCEPTION 'No FX rate from % to % (referral)', rb_currency, target_currency; END IF;
    new_rb := public.convert_money(rb_available, rb_currency, target_currency);
    UPDATE public.referral_balances
       SET currency = target_currency, available = new_rb, updated_at = now()
     WHERE owner_id = uid;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'currency', target_currency,
    'wallet_balance', COALESCE(new_w_balance, w_balance),
    'wallet_rate', rate_w,
    'seller_available', COALESCE(new_available, sb_available),
    'seller_pending', COALESCE(new_pending, sb_pending),
    'seller_rate', rate_s,
    'referral_available', COALESCE(new_rb, rb_available)
  );
END;
$function$;

-- 5) seller_net consistency at crediting time (amount - 10% + delivery)
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
  v_fee numeric;
  v_net numeric;
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

  -- Recompute from the canonical formula so seller_net can never drift.
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

  v_new_pending := v_bal.pending + v_net;
  UPDATE public.seller_balances
     SET pending = v_new_pending, updated_at = now()
   WHERE seller_id = v_order.seller_id;

  INSERT INTO public.seller_earnings
    (seller_id, order_id, amount, balance_after, status)
  VALUES
    (v_order.seller_id, _order_id, v_net, v_new_pending, 'pending')
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

  RETURN jsonb_build_object('ok', true, 'earning_id', v_earning_id, 'seller_net', v_net);
END;
$function$;
