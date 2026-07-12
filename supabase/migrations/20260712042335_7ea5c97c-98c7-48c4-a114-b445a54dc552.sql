
-- ============================================================================
-- Influencer Referral / Promo Code System
-- ============================================================================

-- 1) promo_codes -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.promo_codes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL UNIQUE,
  owner_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reward_quota  int  NOT NULL DEFAULT 14 CHECK (reward_quota > 0),
  active        boolean NOT NULL DEFAULT true,
  created_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promo_code_format CHECK (code = upper(code) AND char_length(code) BETWEEN 4 AND 20)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.promo_codes TO authenticated;
GRANT ALL ON public.promo_codes TO service_role;

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "promo_codes owner select"
  ON public.promo_codes FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS promo_codes_owner_idx ON public.promo_codes(owner_id);
CREATE INDEX IF NOT EXISTS promo_codes_code_idx  ON public.promo_codes(code);

CREATE TRIGGER promo_codes_touch_updated_at
  BEFORE UPDATE ON public.promo_codes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2) referrals ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.referrals (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referred_user_id  uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  promo_code_id     uuid NOT NULL REFERENCES public.promo_codes(id) ON DELETE RESTRICT,
  owner_id          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  credits_remaining int  NOT NULL DEFAULT 14 CHECK (credits_remaining >= 0),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "referrals owner or self select"
  ON public.referrals FOR SELECT
  TO authenticated
  USING (
    owner_id = auth.uid()
    OR referred_user_id = auth.uid()
    OR public.is_admin(auth.uid())
  );

CREATE INDEX IF NOT EXISTS referrals_owner_idx ON public.referrals(owner_id);
CREATE INDEX IF NOT EXISTS referrals_code_idx  ON public.referrals(promo_code_id);

CREATE TRIGGER referrals_touch_updated_at
  BEFORE UPDATE ON public.referrals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3) referral_earnings -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.referral_earnings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referred_user_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  order_id          uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  amount            numeric NOT NULL CHECK (amount >= 0),
  currency          text NOT NULL,
  status            text NOT NULL DEFAULT 'credited' CHECK (status IN ('credited','reversed')),
  created_at        timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.referral_earnings TO authenticated;
GRANT ALL ON public.referral_earnings TO service_role;

ALTER TABLE public.referral_earnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "referral_earnings owner select"
  ON public.referral_earnings FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS referral_earnings_owner_idx ON public.referral_earnings(owner_id);
CREATE INDEX IF NOT EXISTS referral_earnings_referred_idx ON public.referral_earnings(referred_user_id);

-- ============================================================================
-- Helper: ensure seller_balances row exists (works for non-sellers too)
-- ============================================================================
CREATE OR REPLACE FUNCTION public._ensure_seller_balance(_user_id uuid, _currency text)
RETURNS public.seller_balances
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_bal public.seller_balances;
BEGIN
  SELECT * INTO v_bal FROM public.seller_balances WHERE seller_id = _user_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.seller_balances (seller_id, available, pending, currency)
    VALUES (_user_id, 0, 0, upper(coalesce(_currency, 'EUR')))
    RETURNING * INTO v_bal;
  END IF;
  RETURN v_bal;
END;
$$;

-- ============================================================================
-- credit_referral_for_order — called from credit_seller_earning
-- ============================================================================
CREATE OR REPLACE FUNCTION public.credit_referral_for_order(_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_order public.orders;
  v_ref   public.referrals;
  v_owner uuid;
  v_bal   public.seller_balances;
  v_new_avail numeric;
  v_amount numeric;
  v_currency text;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = _order_id;
  IF NOT FOUND OR v_order.status <> 'paid' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_order');
  END IF;

  -- Idempotency
  IF EXISTS (SELECT 1 FROM public.referral_earnings WHERE order_id = _order_id) THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true);
  END IF;

  v_amount := COALESCE(v_order.platform_fee, 0);
  IF v_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_fee');
  END IF;

  -- Seller-first attribution
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

  -- Verify code still active
  IF NOT EXISTS (SELECT 1 FROM public.promo_codes WHERE id = v_ref.promo_code_id AND active) THEN
    RETURN jsonb_build_object('ok', true, 'attributed', false, 'reason', 'code_inactive');
  END IF;

  v_owner := v_ref.owner_id;
  v_currency := upper(coalesce(v_order.currency, 'EUR'));

  -- Credit influencer balance (create lazily)
  v_bal := public._ensure_seller_balance(v_owner, v_currency);
  v_new_avail := v_bal.available + v_amount;
  UPDATE public.seller_balances
     SET available = v_new_avail, updated_at = now()
   WHERE seller_id = v_owner;

  -- Ledger
  INSERT INTO public.referral_earnings
    (owner_id, referred_user_id, order_id, amount, currency, status)
  VALUES
    (v_owner, v_ref.referred_user_id, _order_id, v_amount, v_currency, 'credited');

  -- Decrement quota
  UPDATE public.referrals
     SET credits_remaining = credits_remaining - 1, updated_at = now()
   WHERE id = v_ref.id;

  RETURN jsonb_build_object(
    'ok', true, 'attributed', true,
    'owner_id', v_owner, 'amount', v_amount, 'currency', v_currency
  );
END;
$$;

REVOKE ALL ON FUNCTION public.credit_referral_for_order(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_referral_for_order(uuid) TO service_role;

-- ============================================================================
-- reverse_referral_for_order — called from admin_refund_order
-- ============================================================================
CREATE OR REPLACE FUNCTION public.reverse_referral_for_order(_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_re  public.referral_earnings;
  v_bal public.seller_balances;
  v_new_avail numeric;
BEGIN
  SELECT * INTO v_re FROM public.referral_earnings
    WHERE order_id = _order_id AND status = 'credited'
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'noop', true);
  END IF;

  SELECT * INTO v_bal FROM public.seller_balances WHERE seller_id = v_re.owner_id FOR UPDATE;
  IF FOUND THEN
    v_new_avail := GREATEST(v_bal.available - v_re.amount, 0);
    UPDATE public.seller_balances
       SET available = v_new_avail, updated_at = now()
     WHERE seller_id = v_re.owner_id;
  END IF;

  UPDATE public.referral_earnings SET status = 'reversed' WHERE id = v_re.id;

  -- Give the quota back to the referral
  UPDATE public.referrals
     SET credits_remaining = credits_remaining + 1, updated_at = now()
   WHERE referred_user_id = v_re.referred_user_id;

  RETURN jsonb_build_object('ok', true, 'reversed', true);
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_referral_for_order(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_referral_for_order(uuid) TO service_role;

-- ============================================================================
-- Patch credit_seller_earning to call referral crediting after seller credit
-- ============================================================================
CREATE OR REPLACE FUNCTION public.credit_seller_earning(_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_order  public.orders;
  v_bal    public.seller_balances;
  v_new_pending numeric;
  v_new_available numeric := NULL;
  v_earning_id uuid;
  v_currency text;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'order_not_found'); END IF;
  IF v_order.status <> 'paid' THEN RETURN jsonb_build_object('ok', false, 'error', 'order_not_paid'); END IF;

  -- Idempotency
  IF EXISTS (SELECT 1 FROM public.seller_earnings WHERE order_id = _order_id) THEN
    -- Still attempt referral crediting (idempotent) in case it was missed
    PERFORM public.credit_referral_for_order(_order_id);
    RETURN jsonb_build_object('ok', true, 'duplicate', true);
  END IF;

  v_currency := upper(coalesce(v_order.currency, 'EUR'));
  v_bal := public._ensure_seller_balance(v_order.seller_id, v_currency);

  v_new_pending := v_bal.pending + v_order.seller_net;
  UPDATE public.seller_balances
     SET pending = v_new_pending, updated_at = now()
   WHERE seller_id = v_order.seller_id;

  INSERT INTO public.seller_earnings
    (seller_id, order_id, amount, balance_after, status)
  VALUES
    (v_order.seller_id, _order_id, v_order.seller_net, v_new_pending, 'pending')
  RETURNING id INTO v_earning_id;

  BEGIN
    PERFORM public._log_order_event(_order_id, 'paid', NULL, NULL);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- Referral crediting (best-effort — errors here must not roll back the sale)
  BEGIN
    PERFORM public.credit_referral_for_order(_order_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'credit_referral_for_order failed for %: %', _order_id, SQLERRM;
  END;

  RETURN jsonb_build_object('ok', true, 'earning_id', v_earning_id);
END;
$$;

REVOKE ALL ON FUNCTION public.credit_seller_earning(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_seller_earning(uuid) TO service_role;

-- ============================================================================
-- Patch admin_refund_order to also reverse referral earnings
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_refund_order(_order_id uuid, _note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_order public.orders; v_earning public.seller_earnings; v_bal public.seller_balances;
  v_wallet public.wallets; v_pending_new numeric; v_wallet_new numeric; v_refund_status text;
BEGIN
  PERFORM public._assert_admin();
  SELECT * INTO v_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'order_not_found'); END IF;
  IF v_order.status <> 'paid' THEN RETURN jsonb_build_object('ok', false, 'error', 'order_not_paid'); END IF;

  SELECT * INTO v_earning FROM public.seller_earnings WHERE order_id = _order_id FOR UPDATE;
  IF FOUND AND v_earning.status = 'pending' THEN
    SELECT * INTO v_bal FROM public.seller_balances WHERE seller_id = v_order.seller_id FOR UPDATE;
    IF FOUND THEN
      v_pending_new := GREATEST(v_bal.pending - v_earning.amount, 0);
      UPDATE public.seller_balances SET pending = v_pending_new, updated_at = now()
       WHERE seller_id = v_order.seller_id;
    END IF;
    UPDATE public.seller_earnings SET status = 'reversed' WHERE id = v_earning.id;
  END IF;

  -- Reverse referral earnings too
  PERFORM public.reverse_referral_for_order(_order_id);

  IF v_order.payment_method = 'wallet' THEN
    SELECT * INTO v_wallet FROM public.wallets
     WHERE user_id = v_order.buyer_id AND currency = v_order.currency FOR UPDATE;
    IF NOT FOUND THEN
      INSERT INTO public.wallets (user_id, balance, currency)
      VALUES (v_order.buyer_id, 0, v_order.currency) RETURNING * INTO v_wallet;
    END IF;
    v_wallet_new := v_wallet.balance + v_order.total;
    UPDATE public.wallets SET balance = v_wallet_new, updated_at = now()
     WHERE user_id = v_order.buyer_id AND currency = v_order.currency;
    INSERT INTO public.wallet_transactions (user_id, type, amount, balance_after, order_id, status)
    VALUES (v_order.buyer_id, 'refund', v_order.total, v_wallet_new, _order_id, 'completed');
    v_refund_status := 'refunded_wallet';
  ELSE
    v_refund_status := 'pending_manual';
  END IF;

  UPDATE public.orders
     SET fulfillment_status='disputed', refund_status=v_refund_status,
         cancelled_reason=COALESCE(cancelled_reason,'refunded_by_admin')
   WHERE id = _order_id;

  UPDATE public.reports
     SET status='actioned', reviewed_by=auth.uid(), reviewed_at=now(),
         resolution_note=COALESCE(_note,'Buyer refunded'), updated_at=now()
   WHERE target_type='order' AND target_id=_order_id::text AND status='open';

  PERFORM public._log_order_event(_order_id, 'dispute_refunded', auth.uid(),
    jsonb_build_object('refund_status', v_refund_status, 'note', _note));
  PERFORM public._push_notification(v_order.buyer_id, 'dispute_refunded',
    'Remboursement effectué',
    CASE WHEN v_refund_status='refunded_wallet'
      THEN 'Ton remboursement pour ' || COALESCE(v_order.item_name,'ta commande') || ' a été crédité sur ton portefeuille.'
      ELSE 'Ton remboursement pour ' || COALESCE(v_order.item_name,'ta commande') || ' est en cours de traitement.' END,
    _order_id);
  PERFORM public._push_notification(v_order.seller_id, 'dispute_refunded',
    'Litige résolu', 'La commande ' || COALESCE(v_order.item_name,'') || ' a été remboursée à l''acheteur.', _order_id);

  RETURN jsonb_build_object('ok', true, 'refund_status', v_refund_status);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_refund_order(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_refund_order(uuid, text) TO authenticated;

-- ============================================================================
-- Signup RPCs: validate_promo_code, apply_promo_code
-- ============================================================================
CREATE OR REPLACE FUNCTION public.validate_promo_code(_code text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_ok boolean;
BEGIN
  IF _code IS NULL OR btrim(_code) = '' THEN
    RETURN jsonb_build_object('valid', false, 'error', 'empty');
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.promo_codes
    WHERE code = upper(btrim(_code)) AND active
  ) INTO v_ok;
  RETURN jsonb_build_object('valid', v_ok);
END;
$$;

REVOKE ALL ON FUNCTION public.validate_promo_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_promo_code(text) TO authenticated;

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

  -- Only allow within 7 days of profile creation
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

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_promo_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_promo_code(text) TO authenticated;

-- ============================================================================
-- Influencer read RPCs
-- ============================================================================
CREATE OR REPLACE FUNCTION public.my_promo_codes()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user uuid := auth.uid(); v_rows jsonb;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('rows', '[]'::jsonb); END IF;
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT pc.id, pc.code, pc.reward_quota, pc.active, pc.created_at,
      (SELECT COUNT(*) FROM public.referrals r WHERE r.promo_code_id = pc.id) AS signups,
      (SELECT COUNT(*) FROM public.referral_earnings re WHERE re.owner_id = pc.owner_id
        AND EXISTS (SELECT 1 FROM public.referrals r WHERE r.referred_user_id = re.referred_user_id AND r.promo_code_id = pc.id)
      ) AS orders_credited,
      COALESCE((SELECT jsonb_object_agg(currency, total)
        FROM (SELECT currency, SUM(amount)::numeric AS total FROM public.referral_earnings
              WHERE owner_id = pc.owner_id AND status = 'credited'
                AND EXISTS (SELECT 1 FROM public.referrals r WHERE r.referred_user_id = referral_earnings.referred_user_id AND r.promo_code_id = pc.id)
              GROUP BY currency) s), '{}'::jsonb) AS totals
    FROM public.promo_codes pc
    WHERE pc.owner_id = v_user
  ) t;
  RETURN jsonb_build_object('rows', v_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.my_promo_codes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_promo_codes() TO authenticated;

CREATE OR REPLACE FUNCTION public.my_referral_earnings(_limit int DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user uuid := auth.uid(); v_rows jsonb;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('rows','[]'::jsonb); END IF;
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT re.id, re.amount, re.currency, re.status, re.created_at, re.order_id,
           re.referred_user_id, p.handle AS referred_handle, p.display_name AS referred_name,
           o.item_name
      FROM public.referral_earnings re
      LEFT JOIN public.profiles p ON p.id = re.referred_user_id
      LEFT JOIN public.orders o ON o.id = re.order_id
     WHERE re.owner_id = v_user
     ORDER BY re.created_at DESC
     LIMIT GREATEST(_limit, 1)
  ) t;
  RETURN jsonb_build_object('rows', v_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.my_referral_earnings(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_referral_earnings(int) TO authenticated;

-- ============================================================================
-- Admin RPCs: create, list, deactivate, renew
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_create_promo_code(
  _code text, _owner_id uuid, _reward_quota int DEFAULT 14
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid; v_norm text := upper(btrim(coalesce(_code,'')));
BEGIN
  PERFORM public._assert_admin();
  IF v_norm !~ '^[A-Z0-9_-]{4,20}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code_format');
  END IF;
  IF _owner_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'owner_required');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _owner_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'owner_not_found');
  END IF;
  IF EXISTS (SELECT 1 FROM public.promo_codes WHERE code = v_norm) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'code_exists');
  END IF;
  INSERT INTO public.promo_codes (code, owner_id, reward_quota, created_by)
    VALUES (v_norm, _owner_id, GREATEST(coalesce(_reward_quota,14),1), auth.uid())
    RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id, 'code', v_norm);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_promo_code(text, uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_promo_code(text, uuid, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_promo_codes()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_rows jsonb;
BEGIN
  PERFORM public._assert_admin();
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT pc.id, pc.code, pc.owner_id, pc.reward_quota, pc.active, pc.created_at,
           p.handle AS owner_handle, p.display_name AS owner_name, p.avatar_url AS owner_avatar,
           (SELECT COUNT(*) FROM public.referrals r WHERE r.promo_code_id = pc.id) AS signups,
           (SELECT COUNT(*) FROM public.referral_earnings re
              JOIN public.referrals r ON r.referred_user_id = re.referred_user_id
             WHERE r.promo_code_id = pc.id) AS orders_credited,
           COALESCE((SELECT jsonb_object_agg(currency, total)
             FROM (SELECT re.currency, SUM(re.amount)::numeric AS total
                     FROM public.referral_earnings re
                     JOIN public.referrals r ON r.referred_user_id = re.referred_user_id
                    WHERE r.promo_code_id = pc.id AND re.status = 'credited'
                    GROUP BY re.currency) s), '{}'::jsonb) AS totals
      FROM public.promo_codes pc
      LEFT JOIN public.profiles p ON p.id = pc.owner_id
  ) t;
  RETURN jsonb_build_object('rows', v_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_promo_codes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_promo_codes() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_promo_code_active(_id uuid, _active boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public._assert_admin();
  UPDATE public.promo_codes SET active = _active, updated_at = now() WHERE id = _id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_promo_code_active(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_promo_code_active(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_renew_promo_credits(_promo_code_id uuid, _amount int DEFAULT 14)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  PERFORM public._assert_admin();
  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;
  WITH upd AS (
    UPDATE public.referrals
       SET credits_remaining = credits_remaining + _amount, updated_at = now()
     WHERE promo_code_id = _promo_code_id
     RETURNING 1
  )
  SELECT COUNT(*)::int INTO v_count FROM upd;
  RETURN jsonb_build_object('ok', true, 'updated', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_renew_promo_credits(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_renew_promo_credits(uuid, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_search_users_by_handle(_q text, _limit int DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_rows jsonb;
BEGIN
  PERFORM public._assert_admin();
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT id, handle, display_name, avatar_url
      FROM public.profiles
     WHERE handle ILIKE '%' || coalesce(_q,'') || '%'
        OR display_name ILIKE '%' || coalesce(_q,'') || '%'
     ORDER BY handle NULLS LAST
     LIMIT GREATEST(coalesce(_limit,10), 1)
  ) t;
  RETURN jsonb_build_object('rows', v_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_search_users_by_handle(text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_search_users_by_handle(text, int) TO authenticated;
