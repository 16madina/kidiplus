
-- ============================================================================
-- Referral wallet separation + referred-user badge
-- ============================================================================

-- 1) profiles.is_referred flag ----------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_referred boolean NOT NULL DEFAULT false;

-- Backfill: mark anyone with a referrals row
UPDATE public.profiles p
   SET is_referred = true
  FROM public.referrals r
 WHERE r.referred_user_id = p.id
   AND p.is_referred = false;

-- 2) referral_balances table ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.referral_balances (
  owner_id   uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  available  numeric NOT NULL DEFAULT 0 CHECK (available >= 0),
  currency   text NOT NULL DEFAULT 'EUR',
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.referral_balances TO authenticated;
GRANT ALL ON public.referral_balances TO service_role;

ALTER TABLE public.referral_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "referral_balances owner select"
  ON public.referral_balances FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.is_admin(auth.uid()));

-- 3) payouts.source ---------------------------------------------------------
ALTER TABLE public.payouts
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'seller'
    CHECK (source IN ('seller','referral'));

-- 4) Helper: ensure referral_balances row -----------------------------------
CREATE OR REPLACE FUNCTION public._ensure_referral_balance(_user uuid, _currency text)
RETURNS public.referral_balances
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_bal public.referral_balances;
BEGIN
  SELECT * INTO v_bal FROM public.referral_balances WHERE owner_id = _user FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.referral_balances (owner_id, available, currency)
    VALUES (_user, 0, upper(coalesce(_currency, 'EUR')))
    RETURNING * INTO v_bal;
  END IF;
  RETURN v_bal;
END;
$$;
REVOKE ALL ON FUNCTION public._ensure_referral_balance(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._ensure_referral_balance(uuid, text) TO service_role;

-- 5) credit_referral_for_order — credit REFERRAL wallet ---------------------
CREATE OR REPLACE FUNCTION public.credit_referral_for_order(_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_order public.orders;
  v_ref   public.referrals;
  v_owner uuid;
  v_bal   public.referral_balances;
  v_new_avail numeric;
  v_amount numeric;
  v_currency text;
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

  -- Seller-first attribution, then buyer
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
    v_new_avail := v_bal.available + v_amount;
    UPDATE public.referral_balances
       SET available = v_new_avail, currency = v_currency, updated_at = now()
     WHERE owner_id = v_owner;

    INSERT INTO public.referral_earnings
      (owner_id, referred_user_id, order_id, amount, currency, status)
    VALUES
      (v_owner, v_ref.referred_user_id, _order_id, v_amount, v_currency, 'credited');
  ELSE
    -- Unclaimed code — record as held (no owner_id, no balance credit yet)
    INSERT INTO public.referral_earnings
      (owner_id, referred_user_id, order_id, amount, currency, status)
    VALUES
      (NULL, v_ref.referred_user_id, _order_id, v_amount, v_currency, 'held');
  END IF;

  UPDATE public.referrals
     SET credits_remaining = credits_remaining - 1, updated_at = now()
   WHERE id = v_ref.id;

  RETURN jsonb_build_object('ok', true, 'attributed', true,
    'amount', v_amount, 'currency', v_currency);
END;
$$;
REVOKE ALL ON FUNCTION public.credit_referral_for_order(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_referral_for_order(uuid) TO service_role;

-- 6) reverse_referral_for_order — reverse from REFERRAL wallet --------------
CREATE OR REPLACE FUNCTION public.reverse_referral_for_order(_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_re  public.referral_earnings;
  v_bal public.referral_balances;
  v_new_avail numeric;
BEGIN
  SELECT * INTO v_re FROM public.referral_earnings
    WHERE order_id = _order_id AND status IN ('credited','held')
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'noop', true);
  END IF;

  IF v_re.status = 'credited' AND v_re.owner_id IS NOT NULL THEN
    SELECT * INTO v_bal FROM public.referral_balances WHERE owner_id = v_re.owner_id FOR UPDATE;
    IF FOUND THEN
      v_new_avail := GREATEST(v_bal.available - v_re.amount, 0);
      UPDATE public.referral_balances
         SET available = v_new_avail, updated_at = now()
       WHERE owner_id = v_re.owner_id;
    END IF;
  END IF;

  UPDATE public.referral_earnings SET status = 'reversed' WHERE id = v_re.id;

  UPDATE public.referrals
     SET credits_remaining = credits_remaining + 1, updated_at = now()
   WHERE referred_user_id = v_re.referred_user_id;

  RETURN jsonb_build_object('ok', true, 'reversed', true);
END;
$$;
REVOKE ALL ON FUNCTION public.reverse_referral_for_order(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_referral_for_order(uuid) TO service_role;

-- 7) _claim_and_backfill — credit REFERRAL wallet ---------------------------
CREATE OR REPLACE FUNCTION public._claim_and_backfill(_promo_id uuid, _owner uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_pc public.promo_codes;
  r RECORD;
  v_bal public.referral_balances;
  v_new_avail numeric;
  v_totals jsonb := '{}'::jsonb;
BEGIN
  SELECT * INTO v_pc FROM public.promo_codes WHERE id = _promo_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF v_pc.owner_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_claimed');
  END IF;

  UPDATE public.promo_codes
     SET owner_id = _owner, claimed_at = now(), updated_at = now()
   WHERE id = _promo_id;

  UPDATE public.referrals
     SET owner_id = _owner, updated_at = now()
   WHERE promo_code_id = _promo_id AND owner_id IS NULL
     AND referred_user_id <> _owner;

  FOR r IN
    SELECT re.id, re.amount, re.currency
      FROM public.referral_earnings re
      JOIN public.referrals rr ON rr.referred_user_id = re.referred_user_id
     WHERE rr.promo_code_id = _promo_id AND re.status = 'held' AND re.owner_id IS NULL
     FOR UPDATE OF re
  LOOP
    v_bal := public._ensure_referral_balance(_owner, r.currency);
    v_new_avail := v_bal.available + r.amount;
    UPDATE public.referral_balances
       SET available = v_new_avail, currency = upper(r.currency), updated_at = now()
     WHERE owner_id = _owner;

    UPDATE public.referral_earnings
       SET owner_id = _owner, status = 'credited'
     WHERE id = r.id;

    v_totals := jsonb_set(
      v_totals, ARRAY[upper(r.currency)],
      to_jsonb(COALESCE((v_totals->>upper(r.currency))::numeric, 0) + r.amount)
    );
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'backfilled_totals', v_totals);
END;
$$;
REVOKE ALL ON FUNCTION public._claim_and_backfill(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._claim_and_backfill(uuid, uuid) TO service_role;

-- 8) apply_promo_code — set profiles.is_referred=true -----------------------
CREATE OR REPLACE FUNCTION public.apply_promo_code(_code text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_prof public.profiles;
  v_pc   public.promo_codes;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  SELECT * INTO v_prof FROM public.profiles WHERE id = v_user;
  IF v_prof.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_profile');
  END IF;

  IF v_prof.created_at < now() - interval '7 days' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'window_expired');
  END IF;

  IF EXISTS (SELECT 1 FROM public.referrals WHERE referred_user_id = v_user) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_referred');
  END IF;

  SELECT * INTO v_pc FROM public.promo_codes
    WHERE code = upper(btrim(coalesce(_code,''))) AND active;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;

  IF v_pc.owner_id = v_user THEN
    RETURN jsonb_build_object('ok', false, 'error', 'self_referral');
  END IF;

  INSERT INTO public.referrals
    (referred_user_id, promo_code_id, owner_id, credits_remaining)
  VALUES
    (v_user, v_pc.id, v_pc.owner_id, v_pc.reward_quota);

  UPDATE public.profiles SET is_referred = true WHERE id = v_user;

  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.apply_promo_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_promo_code(text) TO authenticated;

-- 9) request_payout — accepts source (seller | referral) --------------------
DROP FUNCTION IF EXISTS public.request_payout(numeric, text, jsonb);
DROP FUNCTION IF EXISTS public.request_payout(numeric, text, jsonb, text);

CREATE OR REPLACE FUNCTION public.request_payout(
  _amount numeric, _method text, _destination jsonb, _source text DEFAULT 'seller'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_min numeric;
  v_payout_id uuid;
  v_available numeric;
  v_currency text;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthorized'); END IF;
  PERFORM public.assert_user_active();
  IF _method NOT IN ('wave','orange_money','bank_transfer','paypal') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_method');
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;
  IF _source NOT IN ('seller','referral') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_source');
  END IF;

  IF _source = 'referral' THEN
    SELECT available, currency INTO v_available, v_currency
      FROM public.referral_balances WHERE owner_id = v_user FOR UPDATE;
    IF v_available IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'no_balance');
    END IF;
  ELSE
    SELECT available, currency INTO v_available, v_currency
      FROM public.seller_balances WHERE seller_id = v_user FOR UPDATE;
    IF v_available IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'no_balance');
    END IF;
  END IF;

  v_min := CASE v_currency WHEN 'XOF' THEN 100 WHEN 'CAD' THEN 15 ELSE 10 END;
  IF _amount < v_min THEN
    RETURN jsonb_build_object('ok', false, 'error', 'below_minimum', 'min', v_min);
  END IF;
  IF v_available < _amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_funds', 'available', v_available);
  END IF;

  IF _source = 'referral' THEN
    UPDATE public.referral_balances SET available = available - _amount, updated_at = now()
     WHERE owner_id = v_user;
  ELSE
    UPDATE public.seller_balances SET available = available - _amount, updated_at = now()
     WHERE seller_id = v_user;
  END IF;

  INSERT INTO public.payouts (seller_id, amount, currency, method, destination, source)
    VALUES (v_user, _amount, v_currency, _method, _destination, _source)
    RETURNING id INTO v_payout_id;
  RETURN jsonb_build_object('ok', true, 'payout_id', v_payout_id);
END;
$$;
REVOKE ALL ON FUNCTION public.request_payout(numeric, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_payout(numeric, text, jsonb, text) TO authenticated;

-- 10) admin_process_payout — refund back to the right wallet ----------------
DROP FUNCTION IF EXISTS public.admin_process_payout(uuid, text, text, text, text);
CREATE OR REPLACE FUNCTION public.admin_process_payout(
  _payout_id uuid,
  _action    text,
  _note      text DEFAULT NULL,
  _proof_url text DEFAULT NULL,
  _admin_note text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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
$$;
REVOKE ALL ON FUNCTION public.admin_process_payout(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_process_payout(uuid, text, text, text, text) TO authenticated;

-- 11) admin_list_payouts — include source ----------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_payouts(_status text DEFAULT NULL::text, _limit integer DEFAULT 200)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_rows jsonb;
BEGIN
  PERFORM public._assert_admin();
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT po.id, po.seller_id, po.amount, po.currency, po.method, po.destination,
           po.status, po.note, po.admin_note, po.proof_url, po.processed_by,
           po.requested_at, po.processed_at, COALESCE(po.source,'seller') AS source,
           p.handle AS seller_handle, p.display_name AS seller_name, p.avatar_url AS seller_avatar
    FROM public.payouts po
    LEFT JOIN public.profiles p ON p.id = po.seller_id
    WHERE _status IS NULL OR po.status = _status
    ORDER BY
      CASE WHEN po.status IN ('requested','processing') THEN 0 ELSE 1 END,
      CASE WHEN po.status IN ('requested','processing') THEN po.requested_at END ASC,
      po.processed_at DESC NULLS LAST,
      po.requested_at DESC
    LIMIT GREATEST(_limit,1)
  ) t;
  RETURN jsonb_build_object('rows', v_rows);
END;
$$;

-- 12) One-time backfill: move existing credited referral amounts from
--     seller_balances into referral_balances, per (owner, currency).
--     Also creates referral_balances rows for existing owners.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT owner_id, upper(currency) AS currency, SUM(amount)::numeric AS total
      FROM public.referral_earnings
     WHERE status = 'credited' AND owner_id IS NOT NULL
     GROUP BY owner_id, upper(currency)
  LOOP
    -- Ensure referral_balances row and add the moved amount.
    INSERT INTO public.referral_balances (owner_id, available, currency)
      VALUES (r.owner_id, r.total, r.currency)
    ON CONFLICT (owner_id) DO UPDATE
      SET available = public.referral_balances.available + EXCLUDED.available,
          currency  = EXCLUDED.currency,
          updated_at = now();

    -- Deduct from seller_balances if a row exists (never below 0).
    UPDATE public.seller_balances
       SET available = GREATEST(available - r.total, 0),
           updated_at = now()
     WHERE seller_id = r.owner_id;
  END LOOP;
END $$;
