
-- =========================================================
-- MODERATION SYSTEM (Step 2)
-- =========================================================

-- 1) profiles.moderation_status
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS moderation_status text NOT NULL DEFAULT 'active';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_moderation_status_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_moderation_status_check
  CHECK (moderation_status IN ('active','suspended','banned'));

-- 2) user_sanctions
CREATE TABLE IF NOT EXISTS public.user_sanctions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('warning','suspension','ban')),
  reason text NOT NULL,
  admin_note text,
  issued_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid
);
CREATE INDEX IF NOT EXISTS user_sanctions_user_idx ON public.user_sanctions(user_id, created_at DESC);

GRANT SELECT ON public.user_sanctions TO authenticated;
GRANT ALL ON public.user_sanctions TO service_role;
ALTER TABLE public.user_sanctions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User can view own sanctions"
  ON public.user_sanctions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- 3) admin_messages
CREATE TABLE IF NOT EXISTS public.admin_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  sent_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE INDEX IF NOT EXISTS admin_messages_user_idx ON public.admin_messages(user_id, created_at DESC);

GRANT SELECT, UPDATE ON public.admin_messages TO authenticated;
GRANT ALL ON public.admin_messages TO service_role;
ALTER TABLE public.admin_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User can view own admin messages"
  ON public.admin_messages FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- Only allow updating read_at on user's own messages
CREATE POLICY "User can mark own admin messages read"
  ON public.admin_messages FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4) reports: add review fields
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolution_note text;

-- Admin can SELECT all reports
DROP POLICY IF EXISTS "Admins can view all reports" ON public.reports;
CREATE POLICY "Admins can view all reports"
  ON public.reports FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- =========================================================
-- Helper: current moderation status (auto-expire suspensions)
-- =========================================================
CREATE OR REPLACE FUNCTION public.current_moderation_status(_user_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_active_suspension boolean;
BEGIN
  SELECT moderation_status INTO v_status FROM public.profiles WHERE id = _user_id;
  IF v_status IS NULL THEN RETURN 'active'; END IF;
  IF v_status = 'suspended' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.user_sanctions
      WHERE user_id = _user_id
        AND type = 'suspension'
        AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > now())
    ) INTO v_active_suspension;
    IF NOT v_active_suspension THEN
      UPDATE public.profiles SET moderation_status = 'active' WHERE id = _user_id;
      RETURN 'active';
    END IF;
  END IF;
  RETURN v_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_user_active()
RETURNS void
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_status text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  v_status := public.current_moderation_status(auth.uid());
  IF v_status = 'banned' THEN RAISE EXCEPTION 'account_banned' USING ERRCODE = '42501'; END IF;
  IF v_status = 'suspended' THEN RAISE EXCEPTION 'account_suspended' USING ERRCODE = '42501'; END IF;
END;
$$;

-- =========================================================
-- Admin RPCs
-- =========================================================
CREATE OR REPLACE FUNCTION public.admin_issue_sanction(
  _user_id uuid, _type text, _reason text,
  _note text DEFAULT NULL, _expires_at timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_id uuid;
  v_new_status text;
  v_title text;
  v_body text;
BEGIN
  PERFORM public._assert_admin();
  IF _type NOT IN ('warning','suspension','ban') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_type');
  END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;
  IF _type = 'suspension' AND _expires_at IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expires_at_required');
  END IF;

  INSERT INTO public.user_sanctions (user_id, type, reason, admin_note, issued_by, expires_at)
  VALUES (_user_id, _type, _reason, _note, v_admin, _expires_at)
  RETURNING id INTO v_id;

  v_new_status := CASE _type
    WHEN 'ban' THEN 'banned'
    WHEN 'suspension' THEN 'suspended'
    ELSE 'active'
  END;
  UPDATE public.profiles SET moderation_status = v_new_status WHERE id = _user_id;

  -- Auto-message
  v_title := CASE _type
    WHEN 'warning' THEN 'Avertissement'
    WHEN 'suspension' THEN 'Compte suspendu'
    ELSE 'Compte banni'
  END;
  v_body := 'Raison: ' || _reason ||
    CASE WHEN _type = 'suspension' AND _expires_at IS NOT NULL
      THEN E'\nFin de la suspension : ' || to_char(_expires_at, 'YYYY-MM-DD HH24:MI')
      ELSE '' END;
  INSERT INTO public.admin_messages (user_id, title, body, sent_by)
  VALUES (_user_id, v_title, v_body, v_admin);

  RETURN jsonb_build_object('ok', true, 'sanction_id', v_id, 'status', v_new_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_revoke_sanction(_sanction_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_s public.user_sanctions;
  v_has_active boolean;
  v_new_status text := 'active';
BEGIN
  PERFORM public._assert_admin();
  SELECT * INTO v_s FROM public.user_sanctions WHERE id = _sanction_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF v_s.revoked_at IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'already_revoked'); END IF;

  UPDATE public.user_sanctions
     SET revoked_at = now(), revoked_by = v_admin
   WHERE id = _sanction_id;

  -- Recompute status: is there any other active ban? suspension?
  SELECT EXISTS (SELECT 1 FROM public.user_sanctions
    WHERE user_id = v_s.user_id AND type = 'ban' AND revoked_at IS NULL)
  INTO v_has_active;
  IF v_has_active THEN v_new_status := 'banned';
  ELSE
    SELECT EXISTS (SELECT 1 FROM public.user_sanctions
      WHERE user_id = v_s.user_id AND type = 'suspension' AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > now()))
    INTO v_has_active;
    IF v_has_active THEN v_new_status := 'suspended'; END IF;
  END IF;

  UPDATE public.profiles SET moderation_status = v_new_status WHERE id = v_s.user_id;
  RETURN jsonb_build_object('ok', true, 'status', v_new_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_send_message(_user_id uuid, _title text, _body text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_admin uuid := auth.uid(); v_id uuid;
BEGIN
  PERFORM public._assert_admin();
  IF _title IS NULL OR _body IS NULL OR length(trim(_title))=0 OR length(trim(_body))=0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'empty');
  END IF;
  INSERT INTO public.admin_messages (user_id, title, body, sent_by)
  VALUES (_user_id, _title, _body, v_admin) RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_resolve_report(_report_id uuid, _status text, _note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_admin uuid := auth.uid();
BEGIN
  PERFORM public._assert_admin();
  IF _status NOT IN ('reviewed','actioned','dismissed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status');
  END IF;
  UPDATE public.reports
     SET status = _status,
         reviewed_by = v_admin,
         reviewed_at = now(),
         resolution_note = COALESCE(_note, resolution_note),
         updated_at = now()
   WHERE id = _report_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_end_live(_live_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public._assert_admin();
  UPDATE public.lives SET status = 'ended', ended_at = now()
   WHERE id = _live_id AND status <> 'ended';
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found_or_ended'); END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_reports(_status text DEFAULT NULL, _limit int DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_rows jsonb;
BEGIN
  PERFORM public._assert_admin();
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT r.id, r.reporter_id, r.target_type, r.target_id, r.reason, r.note, r.status,
           r.created_at, r.reviewed_by, r.reviewed_at, r.resolution_note,
           rep.handle AS reporter_handle, rep.display_name AS reporter_name,
           CASE r.target_type
             WHEN 'user' THEN (SELECT p.handle FROM public.profiles p WHERE p.id::text = r.target_id)
             WHEN 'live' THEN (SELECT l.title FROM public.lives l WHERE l.id::text = r.target_id)
             ELSE NULL END AS target_label,
           CASE r.target_type
             WHEN 'live' THEN (SELECT l.seller_id::text FROM public.lives l WHERE l.id::text = r.target_id)
             WHEN 'user' THEN r.target_id
             ELSE NULL END AS target_user_id
    FROM public.reports r
    LEFT JOIN public.profiles rep ON rep.id = r.reporter_id
    WHERE _status IS NULL OR r.status = _status
    ORDER BY r.created_at DESC
    LIMIT GREATEST(_limit,1)
  ) t;
  RETURN jsonb_build_object('rows', v_rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_sanctions(_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_rows jsonb;
BEGIN
  PERFORM public._assert_admin();
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT id, type, reason, admin_note, issued_by, created_at, expires_at, revoked_at, revoked_by
    FROM public.user_sanctions WHERE user_id = _user_id ORDER BY created_at DESC
  ) t;
  RETURN jsonb_build_object('rows', v_rows);
END;
$$;

-- User-side: list my admin messages
CREATE OR REPLACE FUNCTION public.list_my_admin_messages(_limit int DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user uuid := auth.uid(); v_rows jsonb; v_unread int;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('rows','[]'::jsonb,'unread',0); END IF;
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT id, title, body, created_at, read_at FROM public.admin_messages
    WHERE user_id = v_user ORDER BY created_at DESC LIMIT GREATEST(_limit,1)
  ) t;
  SELECT COUNT(*) INTO v_unread FROM public.admin_messages
    WHERE user_id = v_user AND read_at IS NULL;
  RETURN jsonb_build_object('rows', v_rows, 'unread', v_unread);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_admin_message_read(_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthorized'); END IF;
  UPDATE public.admin_messages SET read_at = COALESCE(read_at, now())
    WHERE id = _id AND user_id = v_user;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.my_moderation_state()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_status text;
  v_active jsonb;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('status','active'); END IF;
  v_status := public.current_moderation_status(v_user);
  SELECT to_jsonb(t) INTO v_active FROM (
    SELECT id, type, reason, expires_at, created_at
    FROM public.user_sanctions
    WHERE user_id = v_user AND revoked_at IS NULL
      AND (type = 'ban' OR (type = 'suspension' AND (expires_at IS NULL OR expires_at > now())))
    ORDER BY created_at DESC LIMIT 1
  ) t;
  RETURN jsonb_build_object('status', v_status, 'active_sanction', v_active);
END;
$$;

-- =========================================================
-- ENFORCEMENT: patch existing RPCs to check moderation status
-- =========================================================

-- request_payout
CREATE OR REPLACE FUNCTION public.request_payout(_amount numeric, _method text, _destination jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_bal public.seller_balances;
  v_min numeric;
  v_payout_id uuid;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthorized'); END IF;
  PERFORM public.assert_user_active();
  IF _method NOT IN ('wave','orange_money','bank_transfer','paypal') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_method');
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  SELECT * INTO v_bal FROM public.seller_balances WHERE seller_id = v_user FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'no_balance'); END IF;

  v_min := CASE v_bal.currency
    WHEN 'XOF' THEN 100 WHEN 'CAD' THEN 15 ELSE 10 END;

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
$$;

-- pay_order_with_wallet
CREATE OR REPLACE FUNCTION public.pay_order_with_wallet(_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_order public.orders;
  v_wallet public.wallets;
  v_new_balance numeric;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthorized'); END IF;
  PERFORM public.assert_user_active();
  SELECT * INTO v_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'order_not_found'); END IF;
  IF v_order.buyer_id <> v_user THEN RETURN jsonb_build_object('ok', false, 'error', 'forbidden'); END IF;
  IF v_order.status <> 'pending' THEN RETURN jsonb_build_object('ok', false, 'error', 'order_not_pending'); END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_user FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.wallets (user_id) VALUES (v_user) RETURNING * INTO v_wallet;
  END IF;
  IF v_wallet.balance < v_order.total THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_funds',
                              'balance', v_wallet.balance, 'total', v_order.total);
  END IF;
  v_new_balance := v_wallet.balance - v_order.total;
  UPDATE public.wallets SET balance = v_new_balance, updated_at = now() WHERE user_id = v_user;
  UPDATE public.orders SET status = 'paid', payment_method = 'wallet', paid_at = now()
    WHERE id = _order_id;
  INSERT INTO public.wallet_transactions (user_id, type, amount, balance_after, order_id, status)
    VALUES (v_user, 'purchase', -v_order.total, v_new_balance, _order_id, 'completed');
  PERFORM public.credit_seller_earning(_order_id);
  RETURN jsonb_build_object('ok', true, 'balance', v_new_balance);
END;
$$;

-- purchase_fixed_price
CREATE OR REPLACE FUNCTION public.purchase_fixed_price(_product_id uuid, _buyer_identity text)
RETURNS public.live_products LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.live_products;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  PERFORM public.assert_user_active();
  SELECT * INTO v_row FROM public.live_products WHERE id = _product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
  IF v_row.mode <> 'fixed' THEN RAISE EXCEPTION 'Not a fixed-price product'; END IF;
  IF v_row.status NOT IN ('active','upcoming') OR v_row.stock <= 0 THEN RAISE EXCEPTION 'Out of stock'; END IF;
  UPDATE public.live_products
     SET stock = v_row.stock - 1,
         status = CASE WHEN v_row.stock - 1 <= 0 THEN 'out' ELSE 'active' END,
         sold_to_identity = COALESCE(sold_to_identity, _buyer_identity),
         final_price = COALESCE(final_price, price)
   WHERE id = _product_id RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- place_live_bid (with amount)
CREATE OR REPLACE FUNCTION public.place_live_bid(_live_id uuid, _product_id uuid, _bidder_name text, _amount numeric DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_product public.live_products;
  v_live public.lives;
  v_last_bidder uuid;
  v_highest_amount numeric;
  v_current numeric; v_step numeric; v_min_next numeric; v_next numeric;
  v_bid_id uuid; v_currency text; v_cap numeric;
  v_bidder_name text := coalesce(nullif(trim(coalesce(_bidder_name, '')), ''), 'invité');
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthorized'); END IF;
  PERFORM public.assert_user_active();
  SELECT * INTO v_product FROM public.live_products WHERE id = _product_id AND live_id = _live_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'product_not_found'); END IF;
  SELECT * INTO v_live FROM public.lives WHERE id = _live_id;
  IF NOT FOUND OR v_live.status <> 'live' THEN RETURN jsonb_build_object('ok', false, 'error', 'live_not_active'); END IF;
  IF v_product.mode <> 'auction' OR v_product.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auction_not_active');
  END IF;
  SELECT bidder_id, amount INTO v_last_bidder, v_highest_amount
    FROM public.live_bids WHERE product_id = _product_id
    ORDER BY amount DESC, created_at DESC LIMIT 1;
  IF v_last_bidder = v_user THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_highest',
      'current_price', greatest(v_product.price, coalesce(v_highest_amount, v_product.price)));
  END IF;
  v_current := greatest(v_product.price, coalesce(v_highest_amount, v_product.price));
  v_currency := upper(coalesce(v_live.currency, 'EUR'));
  v_step := CASE v_currency
    WHEN 'XOF' THEN CASE WHEN v_current < 5000 THEN 250 ELSE 500 END
    WHEN 'CAD' THEN 1
    ELSE CASE WHEN v_current < 10 THEN 0.5 ELSE 1 END END;
  v_min_next := v_current + v_step;
  v_cap := greatest(coalesce(v_product.start_price, 0) * 100,
    CASE v_currency WHEN 'XOF' THEN 1000000 WHEN 'CAD' THEN 3000 ELSE 2000 END);
  IF _amount IS NULL THEN v_next := v_min_next;
  ELSE
    v_next := _amount;
    IF v_currency = 'XOF' THEN v_next := round(v_next); ELSE v_next := round(v_next * 100) / 100; END IF;
    IF v_next < v_min_next THEN
      RETURN jsonb_build_object('ok', false, 'error', 'price_changed',
        'current_price', v_current, 'min_next', v_min_next);
    END IF;
    IF v_next > v_cap THEN
      RETURN jsonb_build_object('ok', false, 'error', 'above_cap', 'max_amount', v_cap);
    END IF;
  END IF;
  IF v_currency = 'XOF' THEN v_next := round(v_next); ELSE v_next := round(v_next * 100) / 100; END IF;
  INSERT INTO public.live_bids (live_id, product_id, bidder_id, bidder_name, amount)
  VALUES (_live_id, _product_id, v_user, v_bidder_name, v_next) RETURNING id INTO v_bid_id;
  UPDATE public.live_products SET price = v_next WHERE id = _product_id;
  RETURN jsonb_build_object('ok', true, 'bid_id', v_bid_id, 'amount', v_next,
    'bidder_id', v_user, 'bidder_name', v_bidder_name);
END;
$$;

-- Lives INSERT: require active status
DROP POLICY IF EXISTS "Active users can create lives" ON public.lives;
CREATE POLICY "Active users can create lives"
  ON public.lives FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = seller_id AND public.current_moderation_status(auth.uid()) = 'active');
