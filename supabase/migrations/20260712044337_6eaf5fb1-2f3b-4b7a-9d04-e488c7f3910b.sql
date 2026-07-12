
-- ============================================================================
-- Promo codes: unassigned generation + self-claim by influencer
-- ============================================================================

-- 1) Schema changes ----------------------------------------------------------
ALTER TABLE public.promo_codes ALTER COLUMN owner_id DROP NOT NULL;
ALTER TABLE public.promo_codes ADD COLUMN IF NOT EXISTS claim_token text UNIQUE;
ALTER TABLE public.promo_codes ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

ALTER TABLE public.referrals ALTER COLUMN owner_id DROP NOT NULL;

ALTER TABLE public.referral_earnings ALTER COLUMN owner_id DROP NOT NULL;
ALTER TABLE public.referral_earnings DROP CONSTRAINT IF EXISTS referral_earnings_status_check;
ALTER TABLE public.referral_earnings ADD CONSTRAINT referral_earnings_status_check
  CHECK (status IN ('credited','reversed','held'));

-- Update the owner-select policy on promo_codes so admins can still view all
-- (unchanged predicate — kept explicit for clarity)
DROP POLICY IF EXISTS "promo_codes owner select" ON public.promo_codes;
CREATE POLICY "promo_codes owner select"
  ON public.promo_codes FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid() OR public.is_admin(auth.uid()));

-- 2) Token generator ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public._gen_claim_token()
RETURNS text
LANGUAGE plpgsql VOLATILE SET search_path = public
AS $$
DECLARE
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no O/0/I/1
  tok text;
  i int;
BEGIN
  LOOP
    tok := '';
    FOR i IN 1..8 LOOP
      tok := tok || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
      IF i = 4 THEN tok := tok || '-'; END IF;
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.promo_codes WHERE claim_token = tok);
  END LOOP;
  RETURN tok;
END;
$$;

-- Backfill tokens for existing rows
UPDATE public.promo_codes SET claim_token = public._gen_claim_token()
 WHERE claim_token IS NULL;
UPDATE public.promo_codes SET claimed_at = created_at
 WHERE owner_id IS NOT NULL AND claimed_at IS NULL;

-- 3) admin_create_promo_code — owner optional, returns claim token -----------
DROP FUNCTION IF EXISTS public.admin_create_promo_code(text, uuid, int);
CREATE OR REPLACE FUNCTION public.admin_create_promo_code(
  _code text, _owner_id uuid DEFAULT NULL, _reward_quota int DEFAULT 14
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid; v_norm text := upper(btrim(coalesce(_code,''))); v_token text;
BEGIN
  PERFORM public._assert_admin();
  IF v_norm !~ '^[A-Z0-9_-]{4,20}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code_format');
  END IF;
  IF _owner_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _owner_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'owner_not_found');
  END IF;
  IF EXISTS (SELECT 1 FROM public.promo_codes WHERE code = v_norm) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'code_exists');
  END IF;
  v_token := public._gen_claim_token();
  INSERT INTO public.promo_codes (code, owner_id, reward_quota, created_by, claim_token, claimed_at)
    VALUES (v_norm, _owner_id, GREATEST(coalesce(_reward_quota,14),1), auth.uid(), v_token,
            CASE WHEN _owner_id IS NOT NULL THEN now() ELSE NULL END)
    RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id, 'code', v_norm, 'claim_token', v_token);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_create_promo_code(text, uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_promo_code(text, uuid, int) TO authenticated;

-- 4) admin_assign_promo_code — assign / reassign owner manually --------------
CREATE OR REPLACE FUNCTION public.admin_assign_promo_code(_id uuid, _owner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_pc public.promo_codes;
BEGIN
  PERFORM public._assert_admin();
  IF _owner_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'owner_required'); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _owner_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'owner_not_found');
  END IF;
  SELECT * INTO v_pc FROM public.promo_codes WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;

  -- If unclaimed, use the same backfill path as claim (with a target user)
  IF v_pc.owner_id IS NULL THEN
    PERFORM public._claim_and_backfill(v_pc.id, _owner_id);
  ELSE
    UPDATE public.promo_codes SET owner_id = _owner_id, updated_at = now() WHERE id = _id;
    UPDATE public.referrals SET owner_id = _owner_id, updated_at = now() WHERE promo_code_id = _id;
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_assign_promo_code(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_assign_promo_code(uuid, uuid) TO authenticated;

-- 5) Shared claim + backfill --------------------------------------------------
CREATE OR REPLACE FUNCTION public._claim_and_backfill(_promo_id uuid, _owner uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_pc public.promo_codes;
  r RECORD;
  v_bal public.seller_balances;
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
     AND referred_user_id <> _owner;  -- guard against self-referral edge case

  -- Backfill and credit each held earning tied to this code's referrals
  FOR r IN
    SELECT re.id, re.amount, re.currency
      FROM public.referral_earnings re
      JOIN public.referrals rr ON rr.referred_user_id = re.referred_user_id
     WHERE rr.promo_code_id = _promo_id AND re.status = 'held' AND re.owner_id IS NULL
     FOR UPDATE OF re
  LOOP
    v_bal := public._ensure_seller_balance(_owner, r.currency);
    v_new_avail := v_bal.available + r.amount;
    UPDATE public.seller_balances
       SET available = v_new_avail, updated_at = now()
     WHERE seller_id = _owner;

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

-- 6) claim_promo_code(token) — influencer self-claim ------------------------
CREATE OR REPLACE FUNCTION public.claim_promo_code(_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_norm text := upper(btrim(coalesce(_token,'')));
  v_pc   public.promo_codes;
  v_res  jsonb;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;
  IF v_norm !~ '^[A-Z0-9]{4}-[A-Z0-9]{4}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  SELECT * INTO v_pc FROM public.promo_codes
    WHERE claim_token = v_norm FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;
  IF v_pc.owner_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_claimed');
  END IF;

  v_res := public._claim_and_backfill(v_pc.id, v_user);
  IF (v_res->>'ok')::boolean IS DISTINCT FROM true THEN
    RETURN v_res;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'code', v_pc.code,
    'promo_code_id', v_pc.id,
    'backfilled_totals', v_res->'backfilled_totals'
  );
END;
$$;
REVOKE ALL ON FUNCTION public.claim_promo_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_promo_code(text) TO authenticated;

-- 7) credit_referral_for_order — hold earnings when code is unclaimed --------
CREATE OR REPLACE FUNCTION public.credit_referral_for_order(_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_order public.orders;
  v_ref   public.referrals;
  v_pc    public.promo_codes;
  v_bal   public.seller_balances;
  v_new_avail numeric;
  v_amount numeric;
  v_currency text;
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

  SELECT * INTO v_pc FROM public.promo_codes WHERE id = v_ref.promo_code_id;
  IF NOT FOUND OR NOT v_pc.active THEN
    RETURN jsonb_build_object('ok', true, 'attributed', false, 'reason', 'code_inactive');
  END IF;

  v_currency := upper(coalesce(v_order.currency, 'EUR'));

  IF v_pc.owner_id IS NULL THEN
    -- HELD: record the earning, do not credit any balance yet
    INSERT INTO public.referral_earnings
      (owner_id, referred_user_id, order_id, amount, currency, status)
    VALUES
      (NULL, v_ref.referred_user_id, _order_id, v_amount, v_currency, 'held');

    UPDATE public.referrals
       SET credits_remaining = credits_remaining - 1, updated_at = now()
     WHERE id = v_ref.id;

    RETURN jsonb_build_object('ok', true, 'attributed', true, 'held', true,
                              'amount', v_amount, 'currency', v_currency);
  END IF;

  -- Credit influencer balance now
  v_bal := public._ensure_seller_balance(v_pc.owner_id, v_currency);
  v_new_avail := v_bal.available + v_amount;
  UPDATE public.seller_balances
     SET available = v_new_avail, updated_at = now()
   WHERE seller_id = v_pc.owner_id;

  INSERT INTO public.referral_earnings
    (owner_id, referred_user_id, order_id, amount, currency, status)
  VALUES
    (v_pc.owner_id, v_ref.referred_user_id, _order_id, v_amount, v_currency, 'credited');

  UPDATE public.referrals
     SET credits_remaining = credits_remaining - 1, updated_at = now()
   WHERE id = v_ref.id;

  RETURN jsonb_build_object('ok', true, 'attributed', true,
    'owner_id', v_pc.owner_id, 'amount', v_amount, 'currency', v_currency);
END;
$$;
REVOKE ALL ON FUNCTION public.credit_referral_for_order(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_referral_for_order(uuid) TO service_role;

-- 8) reverse_referral_for_order — handle held earnings ----------------------
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
    WHERE order_id = _order_id AND status IN ('credited','held')
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'noop', true);
  END IF;

  IF v_re.status = 'credited' AND v_re.owner_id IS NOT NULL THEN
    SELECT * INTO v_bal FROM public.seller_balances WHERE seller_id = v_re.owner_id FOR UPDATE;
    IF FOUND THEN
      v_new_avail := GREATEST(v_bal.available - v_re.amount, 0);
      UPDATE public.seller_balances
         SET available = v_new_avail, updated_at = now()
       WHERE seller_id = v_re.owner_id;
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

-- 9) apply_promo_code — allow unclaimed codes (owner may be NULL) ------------
CREATE OR REPLACE FUNCTION public.apply_promo_code(_code text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_prof public.profiles;
  v_pc   public.promo_codes;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthorized'); END IF;
  SELECT * INTO v_prof FROM public.profiles WHERE id = v_user;
  IF v_prof.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'no_profile'); END IF;
  IF v_prof.created_at < now() - interval '7 days' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'window_expired');
  END IF;
  IF EXISTS (SELECT 1 FROM public.referrals WHERE referred_user_id = v_user) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_referred');
  END IF;

  SELECT * INTO v_pc FROM public.promo_codes
    WHERE code = upper(btrim(coalesce(_code,''))) AND active;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'invalid_code'); END IF;

  IF v_pc.owner_id IS NOT NULL AND v_pc.owner_id = v_user THEN
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

-- 10) admin_list_promo_codes — expose claim_token + held totals + claimed_at
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
           pc.claim_token, pc.claimed_at,
           p.handle AS owner_handle, p.display_name AS owner_name, p.avatar_url AS owner_avatar,
           (SELECT COUNT(*) FROM public.referrals r WHERE r.promo_code_id = pc.id) AS signups,
           (SELECT COUNT(*) FROM public.referral_earnings re
              JOIN public.referrals r ON r.referred_user_id = re.referred_user_id
             WHERE r.promo_code_id = pc.id AND re.status = 'credited') AS orders_credited,
           COALESCE((SELECT jsonb_object_agg(currency, total)
             FROM (SELECT re.currency, SUM(re.amount)::numeric AS total
                     FROM public.referral_earnings re
                     JOIN public.referrals r ON r.referred_user_id = re.referred_user_id
                    WHERE r.promo_code_id = pc.id AND re.status = 'credited'
                    GROUP BY re.currency) s), '{}'::jsonb) AS totals,
           COALESCE((SELECT jsonb_object_agg(currency, total)
             FROM (SELECT re.currency, SUM(re.amount)::numeric AS total
                     FROM public.referral_earnings re
                     JOIN public.referrals r ON r.referred_user_id = re.referred_user_id
                    WHERE r.promo_code_id = pc.id AND re.status = 'held'
                    GROUP BY re.currency) s), '{}'::jsonb) AS held_totals
      FROM public.promo_codes pc
      LEFT JOIN public.profiles p ON p.id = pc.owner_id
  ) t;
  RETURN jsonb_build_object('rows', v_rows);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_promo_codes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_promo_codes() TO authenticated;
