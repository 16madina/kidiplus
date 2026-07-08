
-- ============================================================================
-- Delivery + Escrow — Migration 2/2: RPCs
-- ============================================================================

-- REWRITE: earnings now credit PENDING, not available.
CREATE OR REPLACE FUNCTION public.credit_seller_earning(_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order   public.orders;
  v_bal     public.seller_balances;
  v_seller_currency text;
  v_pending_new numeric;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'order_not_found'); END IF;
  IF v_order.status <> 'paid' THEN RETURN jsonb_build_object('ok', false, 'error', 'order_not_paid'); END IF;
  IF COALESCE(v_order.seller_net, 0) <= 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'no_net'); END IF;

  -- Idempotency
  IF EXISTS (SELECT 1 FROM public.seller_earnings WHERE order_id = _order_id) THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true);
  END IF;

  SELECT currency INTO v_seller_currency FROM public.profiles WHERE id = v_order.seller_id;

  SELECT * INTO v_bal FROM public.seller_balances WHERE seller_id = v_order.seller_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.seller_balances (seller_id, available, pending, currency)
    VALUES (v_order.seller_id, 0, 0, COALESCE(v_seller_currency, v_order.currency, 'EUR'))
    RETURNING * INTO v_bal;
  END IF;

  v_pending_new := v_bal.pending + v_order.seller_net;
  UPDATE public.seller_balances
     SET pending = v_pending_new,
         updated_at = now()
   WHERE seller_id = v_order.seller_id;

  INSERT INTO public.seller_earnings (seller_id, order_id, amount, balance_after, status)
  VALUES (v_order.seller_id, _order_id, v_order.seller_net, v_bal.available, 'pending');

  RETURN jsonb_build_object('ok', true, 'pending', v_pending_new, 'available', v_bal.available);
END;
$$;

-- Seller: marks an order shipped ---------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_order_shipped(_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_order public.orders;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'order_not_found'); END IF;
  IF v_order.seller_id <> auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_seller');
  END IF;
  IF v_order.status <> 'paid' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_paid');
  END IF;
  IF v_order.fulfillment_status NOT IN ('awaiting','shipped') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_state');
  END IF;

  UPDATE public.orders
     SET fulfillment_status = 'shipped',
         shipped_at = COALESCE(shipped_at, now())
   WHERE id = _order_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Internal helper: releases an order's pending → available (used by
-- confirm_order_delivered, admin_release_escrow, release_overdue_escrow).
CREATE OR REPLACE FUNCTION public._release_order_escrow(_order_id uuid, _confirm boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders;
  v_earning public.seller_earnings;
  v_bal public.seller_balances;
  v_pending_new numeric;
  v_available_new numeric;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'order_not_found'); END IF;
  IF v_order.status <> 'paid' THEN RETURN jsonb_build_object('ok', false, 'error', 'order_not_paid'); END IF;

  SELECT * INTO v_earning FROM public.seller_earnings WHERE order_id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'no_earning'); END IF;
  IF v_earning.status <> 'pending' THEN
    -- Already released or reversed — treat as no-op success (idempotent).
    IF _confirm THEN
      UPDATE public.orders
         SET fulfillment_status = 'delivered',
             delivered_confirmed_at = COALESCE(delivered_confirmed_at, now())
       WHERE id = _order_id;
    END IF;
    RETURN jsonb_build_object('ok', true, 'noop', true);
  END IF;

  SELECT * INTO v_bal FROM public.seller_balances WHERE seller_id = v_order.seller_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'no_balance'); END IF;

  v_pending_new   := GREATEST(v_bal.pending - v_earning.amount, 0);
  v_available_new := v_bal.available + v_earning.amount;

  UPDATE public.seller_balances
     SET pending    = v_pending_new,
         available  = v_available_new,
         updated_at = now()
   WHERE seller_id = v_order.seller_id;

  UPDATE public.seller_earnings
     SET status = 'released',
         balance_after = v_available_new
   WHERE id = v_earning.id;

  IF _confirm THEN
    UPDATE public.orders
       SET fulfillment_status = 'delivered',
           delivered_confirmed_at = COALESCE(delivered_confirmed_at, now())
     WHERE id = _order_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'pending', v_pending_new, 'available', v_available_new);
END;
$$;

REVOKE ALL ON FUNCTION public._release_order_escrow(uuid, boolean) FROM PUBLIC, anon, authenticated;

-- Buyer: confirms delivery ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_order_delivered(_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_order public.orders;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = _order_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'order_not_found'); END IF;
  IF v_order.buyer_id <> auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_buyer');
  END IF;
  IF v_order.fulfillment_status NOT IN ('awaiting','shipped') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_state');
  END IF;
  RETURN public._release_order_escrow(_order_id, true);
END;
$$;

-- Buyer: raises a dispute ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.dispute_order(_order_id uuid, _reason text DEFAULT 'other', _note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders;
  v_report_id uuid;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'order_not_found'); END IF;
  IF v_order.buyer_id <> auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_buyer');
  END IF;
  IF v_order.status <> 'paid' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_paid');
  END IF;
  IF v_order.fulfillment_status = 'delivered' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_delivered');
  END IF;

  UPDATE public.orders SET fulfillment_status = 'disputed' WHERE id = _order_id;

  -- Only one open report per order.
  SELECT id INTO v_report_id
    FROM public.reports
   WHERE target_type = 'order' AND target_id = _order_id::text AND status = 'open'
   LIMIT 1;

  IF v_report_id IS NULL THEN
    INSERT INTO public.reports (reporter_id, target_type, target_id, reason, note, status)
    VALUES (auth.uid(), 'order', _order_id::text,
            CASE WHEN _reason IN ('inappropriate','fraud','counterfeit','harassment','other')
                 THEN _reason ELSE 'other' END,
            _note, 'open')
    RETURNING id INTO v_report_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'report_id', v_report_id);
END;
$$;

-- Admin: release escrow to seller (dispute resolution) ----------------------
CREATE OR REPLACE FUNCTION public.admin_release_escrow(_order_id uuid, _note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_res jsonb;
BEGIN
  PERFORM public._assert_admin();
  v_res := public._release_order_escrow(_order_id, true);

  -- Close any open dispute report.
  UPDATE public.reports
     SET status = 'actioned',
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         resolution_note = COALESCE(_note, 'Escrow released to seller'),
         updated_at = now()
   WHERE target_type = 'order' AND target_id = _order_id::text AND status = 'open';

  RETURN v_res;
END;
$$;

-- Admin: refund the buyer (wallet: real credit; card: manual flag) ---------
CREATE OR REPLACE FUNCTION public.admin_refund_order(_order_id uuid, _note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders;
  v_earning public.seller_earnings;
  v_bal public.seller_balances;
  v_wallet public.wallets;
  v_pending_new numeric;
  v_wallet_new numeric;
  v_refund_status text;
BEGIN
  PERFORM public._assert_admin();

  SELECT * INTO v_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'order_not_found'); END IF;
  IF v_order.status <> 'paid' THEN RETURN jsonb_build_object('ok', false, 'error', 'order_not_paid'); END IF;

  -- Reverse seller pending (if earning still pending).
  SELECT * INTO v_earning FROM public.seller_earnings WHERE order_id = _order_id FOR UPDATE;
  IF FOUND AND v_earning.status = 'pending' THEN
    SELECT * INTO v_bal FROM public.seller_balances WHERE seller_id = v_order.seller_id FOR UPDATE;
    IF FOUND THEN
      v_pending_new := GREATEST(v_bal.pending - v_earning.amount, 0);
      UPDATE public.seller_balances
         SET pending = v_pending_new, updated_at = now()
       WHERE seller_id = v_order.seller_id;
    END IF;
    UPDATE public.seller_earnings SET status = 'reversed' WHERE id = v_earning.id;
  END IF;

  -- Refund buyer.
  IF v_order.payment_method = 'wallet' THEN
    SELECT * INTO v_wallet FROM public.wallets
     WHERE user_id = v_order.buyer_id AND currency = v_order.currency FOR UPDATE;
    IF NOT FOUND THEN
      -- Create a wallet in the order currency to receive the refund.
      INSERT INTO public.wallets (user_id, balance, currency)
      VALUES (v_order.buyer_id, 0, v_order.currency)
      RETURNING * INTO v_wallet;
    END IF;
    v_wallet_new := v_wallet.balance + v_order.total;
    UPDATE public.wallets SET balance = v_wallet_new, updated_at = now()
     WHERE user_id = v_order.buyer_id AND currency = v_order.currency;
    INSERT INTO public.wallet_transactions
      (user_id, type, amount, balance_after, order_id, status)
    VALUES
      (v_order.buyer_id, 'refund', v_order.total, v_wallet_new, _order_id, 'completed');
    v_refund_status := 'refunded_wallet';
  ELSE
    v_refund_status := 'pending_manual';
  END IF;

  UPDATE public.orders
     SET fulfillment_status = 'disputed',
         refund_status = v_refund_status,
         cancelled_reason = COALESCE(cancelled_reason, 'refunded_by_admin')
   WHERE id = _order_id;

  UPDATE public.reports
     SET status = 'actioned',
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         resolution_note = COALESCE(_note, 'Buyer refunded'),
         updated_at = now()
   WHERE target_type = 'order' AND target_id = _order_id::text AND status = 'open';

  RETURN jsonb_build_object('ok', true, 'refund_status', v_refund_status);
END;
$$;

-- Auto-release: shipped > 7 days, not delivered, not disputed --------------
CREATE OR REPLACE FUNCTION public.release_overdue_escrow()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ord record;
  v_count integer := 0;
BEGIN
  FOR v_ord IN
    SELECT o.id
      FROM public.orders o
      JOIN public.seller_earnings e ON e.order_id = o.id
     WHERE o.status = 'paid'
       AND o.fulfillment_status = 'shipped'
       AND o.shipped_at IS NOT NULL
       AND o.shipped_at < now() - interval '7 days'
       AND e.status = 'pending'
  LOOP
    PERFORM public._release_order_escrow(v_ord.id, true);
    v_count := v_count + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'released', v_count);
END;
$$;

-- Explicit grants: keep the internal helper private, expose the rest.
REVOKE ALL ON FUNCTION public._release_order_escrow(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_order_shipped(uuid)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_order_delivered(uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.dispute_order(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_release_escrow(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_refund_order(uuid, text)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_overdue_escrow()         TO authenticated;
