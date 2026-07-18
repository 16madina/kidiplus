ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_frozen boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS frozen_reason text,
  ADD COLUMN IF NOT EXISTS frozen_at timestamptz,
  ADD COLUMN IF NOT EXISTS frozen_by uuid;

CREATE OR REPLACE FUNCTION public.is_user_frozen(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn_isf$
  SELECT COALESCE((SELECT is_frozen FROM public.profiles WHERE id = _user_id), false);
$fn_isf$;

CREATE OR REPLACE FUNCTION public.my_moderation_state()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn_mms$
DECLARE
  v_user uuid := auth.uid();
  v_status text;
  v_active jsonb;
  v_frozen boolean;
  v_reason text;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('status','active','is_frozen',false); END IF;
  v_status := public.current_moderation_status(v_user);
  SELECT to_jsonb(t) INTO v_active FROM (
    SELECT id, type, reason, expires_at, created_at
    FROM public.user_sanctions
    WHERE user_id = v_user AND revoked_at IS NULL
      AND (type = 'ban' OR (type = 'suspension' AND (expires_at IS NULL OR expires_at > now())))
    ORDER BY created_at DESC LIMIT 1
  ) t;
  SELECT is_frozen, frozen_reason INTO v_frozen, v_reason FROM public.profiles WHERE id = v_user;
  RETURN jsonb_build_object(
    'status', v_status,
    'active_sanction', v_active,
    'is_frozen', COALESCE(v_frozen, false),
    'frozen_reason', v_reason
  );
END;
$fn_mms$;

CREATE OR REPLACE FUNCTION public.admin_freeze_user(_user_id uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn_fr$
DECLARE
  v_admin uuid := auth.uid();
  v_reason text := COALESCE(NULLIF(trim(_reason),''), 'Verification anti-fraude en cours');
BEGIN
  IF NOT public.has_role(v_admin, 'admin') THEN RETURN jsonb_build_object('ok',false,'error','forbidden'); END IF;
  UPDATE public.profiles
     SET is_frozen = true, frozen_reason = v_reason, frozen_at = now(), frozen_by = v_admin
   WHERE id = _user_id;
  INSERT INTO public.admin_messages (user_id, title, body, sent_by)
    VALUES (_user_id, 'Compte en verification',
            'Ton compte fait l objet d une verification anti-fraude. Les retraits, achats via portefeuille et cadeaux sont temporairement bloques. Motif: ' || v_reason || '. Contacte le support si tu as des questions.',
            v_admin);
  RETURN jsonb_build_object('ok', true);
END;
$fn_fr$;

CREATE OR REPLACE FUNCTION public.admin_unfreeze_user(_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn_uf$
DECLARE v_admin uuid := auth.uid();
BEGIN
  IF NOT public.has_role(v_admin, 'admin') THEN RETURN jsonb_build_object('ok',false,'error','forbidden'); END IF;
  UPDATE public.profiles
     SET is_frozen = false, frozen_reason = NULL, frozen_at = NULL, frozen_by = NULL
   WHERE id = _user_id;
  INSERT INTO public.admin_messages (user_id, title, body, sent_by)
    VALUES (_user_id, 'Compte reactive',
            'La verification est terminee. Tu peux a nouveau utiliser ton portefeuille et demander des retraits.',
            v_admin);
  RETURN jsonb_build_object('ok', true);
END;
$fn_uf$;

CREATE OR REPLACE FUNCTION public.request_payout(_amount numeric, _method text, _destination jsonb, _source text DEFAULT 'seller')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn_rp$
DECLARE
  v_user uuid := auth.uid();
  v_min numeric;
  v_payout_id uuid;
  v_available numeric;
  v_currency text;
  v_max_day numeric;
  v_day_total numeric;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthorized'); END IF;
  PERFORM public.assert_user_active();
  IF public.is_user_frozen(v_user) THEN RETURN jsonb_build_object('ok', false, 'error', 'account_frozen'); END IF;
  IF _method NOT IN ('wave','orange_money','bank_transfer','paypal') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_method'); END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount'); END IF;
  IF _source NOT IN ('seller','referral') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_source'); END IF;

  IF _source = 'referral' THEN
    SELECT available, currency INTO v_available, v_currency
      FROM public.referral_balances WHERE owner_id = v_user FOR UPDATE;
  ELSE
    SELECT available, currency INTO v_available, v_currency
      FROM public.seller_balances WHERE seller_id = v_user FOR UPDATE;
  END IF;
  IF v_available IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'no_balance'); END IF;

  v_min := (CASE v_currency WHEN 'XOF' THEN 100 WHEN 'CAD' THEN 15 ELSE 10 END);
  IF _amount < v_min THEN RETURN jsonb_build_object('ok', false, 'error', 'below_minimum', 'min', v_min); END IF;
  IF v_available < _amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_funds', 'available', v_available); END IF;

  v_max_day := (CASE v_currency WHEN 'XOF' THEN 1000000 WHEN 'CAD' THEN 3000 ELSE 2000 END);
  SELECT COALESCE(SUM(amount),0) INTO v_day_total
    FROM public.payouts
   WHERE seller_id = v_user AND currency = v_currency
     AND status IN ('requested','processing','paid')
     AND requested_at > now() - interval '24 hours';
  IF v_day_total + _amount > v_max_day THEN
    RETURN jsonb_build_object('ok', false, 'error', 'daily_payout_cap',
      'max', v_max_day, 'used', v_day_total, 'currency', v_currency);
  END IF;

  IF _source = 'referral' THEN
    UPDATE public.referral_balances SET available = available - _amount, updated_at = now() WHERE owner_id = v_user;
  ELSE
    UPDATE public.seller_balances SET available = available - _amount, updated_at = now() WHERE seller_id = v_user;
  END IF;

  INSERT INTO public.payouts (seller_id, amount, currency, method, destination, source)
    VALUES (v_user, _amount, v_currency, _method, _destination, _source)
    RETURNING id INTO v_payout_id;
  RETURN jsonb_build_object('ok', true, 'payout_id', v_payout_id);
END;
$fn_rp$;

CREATE OR REPLACE FUNCTION public.pay_order_with_wallet(_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn_pow$
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
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthorized'); END IF;
  IF public.is_user_frozen(v_user) THEN RETURN jsonb_build_object('ok', false, 'error', 'account_frozen'); END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'order_not_found'); END IF;
  IF v_order.buyer_id <> v_user THEN RETURN jsonb_build_object('ok', false, 'error', 'forbidden'); END IF;
  IF v_order.status <> 'pending' THEN RETURN jsonb_build_object('ok', false, 'error', 'order_not_pending'); END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_user FOR UPDATE;
  IF NOT FOUND THEN INSERT INTO public.wallets (user_id) VALUES (v_user) RETURNING * INTO v_wallet; END IF;

  v_order_currency := upper(coalesce(v_order.currency, 'EUR'));
  v_wallet_currency := upper(coalesce(v_wallet.currency, v_order_currency));

  IF v_wallet_currency = v_order_currency THEN
    v_debit := v_order.total; v_rate := 1;
  ELSE
    v_debit := public.convert_money(v_order.total, v_order_currency, v_wallet_currency);
    v_rate := public.fx_rate(v_order_currency, v_wallet_currency);
    IF v_debit IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'conversion_unavailable'); END IF;
  END IF;

  IF v_wallet.balance < v_debit THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_funds',
      'balance', v_wallet.balance, 'total', v_debit,
      'order_amount', v_order.total, 'order_currency', v_order_currency,
      'wallet_currency', v_wallet_currency, 'rate', v_rate);
  END IF;

  v_new_balance := v_wallet.balance - v_debit;
  UPDATE public.wallets SET balance = v_new_balance, updated_at = now() WHERE user_id = v_user;
  UPDATE public.orders SET status = 'paid', payment_method = 'wallet', paid_at = now() WHERE id = _order_id;

  INSERT INTO public.wallet_transactions
    (user_id, type, amount, balance_after, order_id, status, meta)
  VALUES
    (v_user, 'purchase', -v_debit, v_new_balance, _order_id, 'completed',
      jsonb_build_object('order_currency', v_order_currency, 'order_amount', v_order.total,
        'wallet_currency', v_wallet_currency, 'wallet_amount', v_debit, 'rate', v_rate));

  RETURN jsonb_build_object('ok', true, 'balance', v_new_balance);
END;
$fn_pow$;

CREATE OR REPLACE FUNCTION public.credit_wallet_topup(_user_id uuid, _amount numeric, _payment_intent_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn_cwt$
DECLARE
  v_wallet public.wallets;
  v_new_balance numeric;
  v_currency text;
  v_max_balance numeric;
  v_day_total numeric;
BEGIN
  IF _amount <= 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount'); END IF;

  IF EXISTS (
    SELECT 1 FROM public.wallet_transactions
     WHERE stripe_payment_intent_id = _payment_intent_id
       AND type = 'topup' AND status = 'completed'
  ) THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true);
  END IF;

  IF public.is_user_frozen(_user_id) THEN RETURN jsonb_build_object('ok', false, 'error', 'account_frozen'); END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = _user_id FOR UPDATE;
  IF NOT FOUND THEN INSERT INTO public.wallets (user_id) VALUES (_user_id) RETURNING * INTO v_wallet; END IF;

  v_currency := upper(coalesce(v_wallet.currency, 'EUR'));
  v_max_balance := (CASE v_currency WHEN 'XOF' THEN 1000000 WHEN 'CAD' THEN 3000 ELSE 2000 END);

  IF v_wallet.balance + _amount > v_max_balance THEN
    RETURN jsonb_build_object('ok', false, 'error', 'wallet_cap_exceeded',
      'max', v_max_balance, 'currency', v_currency);
  END IF;

  SELECT COALESCE(SUM(amount),0) INTO v_day_total
    FROM public.wallet_transactions
   WHERE user_id = _user_id AND type = 'topup' AND status = 'completed'
     AND created_at > now() - interval '24 hours';
  IF v_day_total + _amount > v_max_balance THEN
    RETURN jsonb_build_object('ok', false, 'error', 'daily_topup_cap',
      'max', v_max_balance, 'used', v_day_total, 'currency', v_currency);
  END IF;

  v_new_balance := v_wallet.balance + _amount;
  UPDATE public.wallets SET balance = v_new_balance, updated_at = now() WHERE user_id = _user_id;
  INSERT INTO public.wallet_transactions
    (user_id, type, amount, balance_after, stripe_payment_intent_id, status)
  VALUES (_user_id, 'topup', _amount, v_new_balance, _payment_intent_id, 'completed');

  RETURN jsonb_build_object('ok', true, 'balance', v_new_balance);
END;
$fn_cwt$;

CREATE OR REPLACE FUNCTION public.tg_block_gift_if_frozen()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn_tgg$
BEGIN
  IF public.is_user_frozen(NEW.sender_id) THEN
    RAISE EXCEPTION 'account_frozen' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$fn_tgg$;
DROP TRIGGER IF EXISTS trg_block_gift_if_frozen ON public.live_gifts;
CREATE TRIGGER trg_block_gift_if_frozen
  BEFORE INSERT ON public.live_gifts
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_gift_if_frozen();

CREATE OR REPLACE FUNCTION public.admin_compute_payout_risk(_payout_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn_risk$
DECLARE
  v_admin uuid := auth.uid();
  v_seller uuid;
  v_amount numeric;
  v_currency text;
  v_requested_at timestamptz;
  v_seller_age_days numeric;
  v_total_sales integer := 0;
  v_top_buyer_pct numeric := 0;
  v_top_buyer_id uuid;
  v_top_buyer_handle text;
  v_min_topup_ts timestamptz;
  v_cycle_hours numeric;
  v_prev_payouts integer;
  v_prev_avg numeric;
  v_chargebacks integer := 0;
  v_disputes integer := 0;
  v_threshold numeric;
  v_signals jsonb := '[]'::jsonb;
  v_level text := 'green';
BEGIN
  IF NOT public.has_role(v_admin, 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  SELECT seller_id, amount, currency, requested_at
    INTO v_seller, v_amount, v_currency, v_requested_at
    FROM public.payouts WHERE id = _payout_id;
  IF v_seller IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;

  SELECT EXTRACT(EPOCH FROM (now() - created_at))/86400 INTO v_seller_age_days
    FROM public.profiles WHERE id = v_seller;
  IF v_seller_age_days IS NOT NULL AND v_seller_age_days < 14 THEN
    v_signals := v_signals || jsonb_build_array(
      jsonb_build_object('code','young_account','label',
        'Compte recent (' || round(v_seller_age_days,0) || ' j)'));
  END IF;

  WITH pool AS (
    SELECT buyer_id, count(*)::numeric AS n
      FROM public.orders
     WHERE seller_id = v_seller AND status IN ('paid','shipped','delivered')
     GROUP BY buyer_id
  ), tot AS (SELECT COALESCE(sum(n),0) AS s FROM pool)
  SELECT p.buyer_id, ROUND(p.n * 100 / NULLIF(t.s,0), 1), (SELECT s::int FROM tot)
    INTO v_top_buyer_id, v_top_buyer_pct, v_total_sales
    FROM pool p, tot t
    ORDER BY p.n DESC LIMIT 1;
  IF v_top_buyer_id IS NOT NULL AND v_total_sales >= 2 AND COALESCE(v_top_buyer_pct,0) > 50 THEN
    SELECT handle INTO v_top_buyer_handle FROM public.profiles WHERE id = v_top_buyer_id;
    v_signals := v_signals || jsonb_build_array(
      jsonb_build_object('code','single_buyer_concentration','label',
        'Un seul acheteur = ' || v_top_buyer_pct || ' pct des ventes'));
  END IF;

  SELECT MIN(wt.created_at) INTO v_min_topup_ts
    FROM public.wallet_transactions wt
    JOIN public.orders o ON o.buyer_id = wt.user_id
   WHERE o.seller_id = v_seller
     AND o.status IN ('paid','shipped','delivered')
     AND wt.type = 'topup' AND wt.status = 'completed'
     AND wt.created_at > v_requested_at - interval '14 days';
  IF v_min_topup_ts IS NOT NULL THEN
    v_cycle_hours := EXTRACT(EPOCH FROM (v_requested_at - v_min_topup_ts))/3600;
    IF v_cycle_hours < 48 THEN
      v_signals := v_signals || jsonb_build_array(
        jsonb_build_object('code','fast_cycle','label',
          'Cycle recharge->achat->retrait < 48h (' || round(v_cycle_hours,1) || ' h)'));
    END IF;
  END IF;

  SELECT count(*), COALESCE(AVG(amount),0) INTO v_prev_payouts, v_prev_avg
    FROM public.payouts
    WHERE seller_id = v_seller AND id <> _payout_id AND status IN ('paid','processing');
  v_threshold := (CASE v_currency WHEN 'XOF' THEN 250000 WHEN 'CAD' THEN 750 ELSE 500 END);
  IF v_prev_payouts = 0 THEN
    v_signals := v_signals || jsonb_build_array(
      jsonb_build_object('code','first_payout','label','Premier retrait de ce compte'));
    IF v_amount > v_threshold THEN
      v_signals := v_signals || jsonb_build_array(
        jsonb_build_object('code','large_first_payout','label','Montant eleve pour un premier retrait'));
    END IF;
  ELSIF v_prev_avg > 0 AND v_amount > v_prev_avg * 3 THEN
    v_signals := v_signals || jsonb_build_array(
      jsonb_build_object('code','unusual_amount','label','Montant inhabituel (>3x la moyenne)'));
  END IF;

  SELECT count(*) INTO v_disputes
    FROM public.reports
   WHERE target_type = 'order' AND target_user_id = v_seller;

  IF v_disputes > 0 THEN
    v_signals := v_signals || jsonb_build_array(
      jsonb_build_object('code','disputes','label',
        'Signalements ouverts (' || v_disputes || ')'));
  END IF;

  IF jsonb_array_length(v_signals) = 0 THEN v_level := 'green';
  ELSIF jsonb_array_length(v_signals) >= 3 THEN v_level := 'red';
  ELSE v_level := 'yellow';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'level', v_level,
    'signals', v_signals,
    'seller_age_days', v_seller_age_days,
    'total_sales', COALESCE(v_total_sales, 0),
    'top_buyer_pct', v_top_buyer_pct,
    'top_buyer_handle', v_top_buyer_handle,
    'cycle_hours', v_cycle_hours,
    'prev_payouts', v_prev_payouts,
    'chargebacks', v_chargebacks,
    'disputes', v_disputes,
    'is_frozen', public.is_user_frozen(v_seller)
  );
END;
$fn_risk$;

CREATE OR REPLACE FUNCTION public.admin_seller_recent_orders(_user_id uuid, _limit int DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn_hist$
DECLARE v_admin uuid := auth.uid(); v_rows jsonb;
BEGIN
  IF NOT public.has_role(v_admin, 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  SELECT COALESCE(jsonb_agg(row_to_jsonb(r) ORDER BY (r->>'created_at') DESC), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT o.id, o.status, o.total, o.currency, o.created_at, o.paid_at, o.shipped_at, o.delivered_at,
           o.item_name, o.buyer_id, p.handle AS buyer_handle, p.display_name AS buyer_name
      FROM public.orders o
      LEFT JOIN public.profiles p ON p.id = o.buyer_id
     WHERE o.seller_id = _user_id
     ORDER BY o.created_at DESC
     LIMIT GREATEST(1, LEAST(_limit, 100))
  ) r;
  RETURN jsonb_build_object('ok', true, 'rows', v_rows);
END;
$fn_hist$;

GRANT EXECUTE ON FUNCTION public.admin_freeze_user(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unfreeze_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_compute_payout_risk(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_seller_recent_orders(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_user_frozen(uuid) TO authenticated;
