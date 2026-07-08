
-- =========================================================
-- 1) order_events
-- =========================================================
CREATE TABLE IF NOT EXISTS public.order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  event text NOT NULL CHECK (event IN (
    'created','paid','shipped','delivery_confirmed','auto_released',
    'disputed','dispute_released','dispute_refunded','cancelled'
  )),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_events_order_idx ON public.order_events(order_id, created_at);

GRANT SELECT ON public.order_events TO authenticated;
GRANT ALL ON public.order_events TO service_role;

ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "buyer_seller_can_read_events"
  ON public.order_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_events.order_id
        AND (o.buyer_id = auth.uid() OR o.seller_id = auth.uid())
    )
    OR public.is_admin(auth.uid())
  );

-- No INSERT/UPDATE/DELETE policies: writes go through SECURITY DEFINER helpers only.

CREATE OR REPLACE FUNCTION public._log_order_event(
  _order_id uuid, _event text, _actor uuid, _meta jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.order_events (order_id, event, actor_id, meta)
  VALUES (_order_id, _event, _actor, _meta);
END;
$$;

-- =========================================================
-- 2) notifications
-- =========================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_order_kind_idx ON public.notifications(order_id, kind);

GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_owner_read"
  ON public.notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "notifications_owner_update_read"
  ON public.notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public._push_notification(
  _user_id uuid, _kind text, _title text, _body text, _order_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, kind, title, body, order_id)
  VALUES (_user_id, _kind, _title, _body, _order_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_notification_read(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.notifications SET read_at = COALESCE(read_at, now())
   WHERE id = _id AND user_id = auth.uid();
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.notifications SET read_at = now()
   WHERE user_id = auth.uid() AND read_at IS NULL;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_my_notifications(_limit int DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_rows jsonb; v_unread int;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT id, kind, title, body, order_id, read_at, created_at
    FROM public.notifications
    WHERE user_id = auth.uid()
    ORDER BY created_at DESC
    LIMIT GREATEST(_limit,1)
  ) t;
  SELECT COUNT(*) INTO v_unread FROM public.notifications
   WHERE user_id = auth.uid() AND read_at IS NULL;
  RETURN jsonb_build_object('rows', v_rows, 'unread', v_unread);
END;
$$;

-- =========================================================
-- 3) Extend escrow / order RPCs to log events + push notifications
-- =========================================================

-- mark_order_shipped: add event + buyer notif
CREATE OR REPLACE FUNCTION public.mark_order_shipped(_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_order public.orders; v_title text;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'order_not_found'); END IF;
  IF v_order.seller_id <> auth.uid() THEN RETURN jsonb_build_object('ok', false, 'error', 'not_seller'); END IF;
  IF v_order.status <> 'paid' THEN RETURN jsonb_build_object('ok', false, 'error', 'order_not_paid'); END IF;
  IF v_order.fulfillment_status NOT IN ('awaiting','shipped') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_state');
  END IF;

  UPDATE public.orders
     SET fulfillment_status = 'shipped', shipped_at = COALESCE(shipped_at, now())
   WHERE id = _order_id;

  PERFORM public._log_order_event(_order_id, 'shipped', auth.uid(), NULL);
  v_title := '📦 ' || COALESCE(v_order.item_name, 'Ta commande') || ' est en route !';
  PERFORM public._push_notification(v_order.buyer_id, 'order_shipped',
    v_title, 'Confirme la réception quand tu la reçois.', _order_id);

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- confirm_order_delivered: add event + seller notif via wrapper of _release
CREATE OR REPLACE FUNCTION public.confirm_order_delivered(_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_order public.orders; v_res jsonb; v_buyer_handle text;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = _order_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'order_not_found'); END IF;
  IF v_order.buyer_id <> auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_buyer');
  END IF;
  IF v_order.fulfillment_status NOT IN ('awaiting','shipped') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_state');
  END IF;
  v_res := public._release_order_escrow(_order_id, true);
  IF (v_res->>'ok')::boolean THEN
    PERFORM public._log_order_event(_order_id, 'delivery_confirmed', auth.uid(), NULL);
    SELECT handle INTO v_buyer_handle FROM public.profiles WHERE id = v_order.buyer_id;
    PERFORM public._push_notification(v_order.seller_id, 'order_delivered',
      '✅ Réception confirmée',
      '@' || COALESCE(v_buyer_handle, 'acheteur') || ' a confirmé la réception — tes fonds sont disponibles.',
      _order_id);
  END IF;
  RETURN v_res;
END;
$$;

-- dispute_order: log event
CREATE OR REPLACE FUNCTION public.dispute_order(_order_id uuid, _reason text DEFAULT 'other', _note text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_order public.orders; v_report_id uuid;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'order_not_found'); END IF;
  IF v_order.buyer_id <> auth.uid() THEN RETURN jsonb_build_object('ok', false, 'error', 'not_buyer'); END IF;
  IF v_order.status <> 'paid' THEN RETURN jsonb_build_object('ok', false, 'error', 'order_not_paid'); END IF;
  IF v_order.fulfillment_status = 'delivered' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_delivered');
  END IF;

  UPDATE public.orders SET fulfillment_status = 'disputed' WHERE id = _order_id;

  SELECT id INTO v_report_id FROM public.reports
   WHERE target_type = 'order' AND target_id = _order_id::text AND status = 'open' LIMIT 1;
  IF v_report_id IS NULL THEN
    INSERT INTO public.reports (reporter_id, target_type, target_id, reason, note, status)
    VALUES (auth.uid(), 'order', _order_id::text,
            CASE WHEN _reason IN ('inappropriate','fraud','counterfeit','harassment','other')
                 THEN _reason ELSE 'other' END,
            _note, 'open')
    RETURNING id INTO v_report_id;
  END IF;

  PERFORM public._log_order_event(_order_id, 'disputed', auth.uid(),
    jsonb_build_object('reason', _reason, 'report_id', v_report_id));

  RETURN jsonb_build_object('ok', true, 'report_id', v_report_id);
END;
$$;

-- admin_release_escrow: log + notify both
CREATE OR REPLACE FUNCTION public.admin_release_escrow(_order_id uuid, _note text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_res jsonb; v_order public.orders;
BEGIN
  PERFORM public._assert_admin();
  SELECT * INTO v_order FROM public.orders WHERE id = _order_id;
  v_res := public._release_order_escrow(_order_id, true);

  UPDATE public.reports
     SET status='actioned', reviewed_by=auth.uid(), reviewed_at=now(),
         resolution_note=COALESCE(_note, 'Escrow released to seller'), updated_at=now()
   WHERE target_type='order' AND target_id=_order_id::text AND status='open';

  IF v_order.id IS NOT NULL AND (v_res->>'ok')::boolean THEN
    PERFORM public._log_order_event(_order_id, 'dispute_released', auth.uid(),
      jsonb_build_object('note', _note));
    PERFORM public._push_notification(v_order.seller_id, 'dispute_released',
      '💰 Litige résolu', 'Les fonds ont été libérés pour ' || COALESCE(v_order.item_name,'ta vente') || '.',
      _order_id);
    PERFORM public._push_notification(v_order.buyer_id, 'dispute_released',
      'Litige clos', 'Ton litige sur ' || COALESCE(v_order.item_name,'la commande') || ' a été résolu en faveur du vendeur.',
      _order_id);
  END IF;
  RETURN v_res;
END;
$$;

-- admin_refund_order: log + notify
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

-- credit_seller_earning: log 'paid' event on first credit
CREATE OR REPLACE FUNCTION public.credit_seller_earning(_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_order public.orders; v_bal public.seller_balances;
  v_seller_currency text; v_pending_new numeric;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'order_not_found'); END IF;
  IF v_order.status <> 'paid' THEN RETURN jsonb_build_object('ok', false, 'error', 'order_not_paid'); END IF;
  IF COALESCE(v_order.seller_net, 0) <= 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'no_net'); END IF;

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
  UPDATE public.seller_balances SET pending = v_pending_new, updated_at = now()
   WHERE seller_id = v_order.seller_id;

  INSERT INTO public.seller_earnings (seller_id, order_id, amount, balance_after, status)
  VALUES (v_order.seller_id, _order_id, v_order.seller_net, v_bal.available, 'pending');

  -- Log paid event once (idempotent via earnings uniqueness above)
  PERFORM public._log_order_event(_order_id, 'paid', v_order.buyer_id,
    jsonb_build_object('total', v_order.total, 'method', v_order.payment_method));

  RETURN jsonb_build_object('ok', true, 'pending', v_pending_new, 'available', v_bal.available);
END;
$$;

-- expire_overdue_orders: log cancelled events
CREATE OR REPLACE FUNCTION public.expire_overdue_orders()
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row RECORD; v_count int := 0; v_live_status text;
BEGIN
  FOR v_row IN
    SELECT id, product_id, live_id FROM public.orders
     WHERE status='pending' AND kind='auction'
       AND payment_deadline IS NOT NULL AND payment_deadline < now()
     FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.orders SET status='cancelled', cancelled_reason='payment_timeout'
     WHERE id = v_row.id;

    IF v_row.product_id IS NOT NULL THEN
      SELECT status INTO v_live_status FROM public.lives WHERE id = v_row.live_id;
      IF v_live_status = 'live' THEN
        UPDATE public.live_products SET status='upcoming', sold_to_identity=NULL,
               final_price=NULL, price=start_price WHERE id = v_row.product_id;
      ELSE
        UPDATE public.live_products SET status='unsold', sold_to_identity=NULL
         WHERE id = v_row.product_id;
      END IF;
    END IF;
    PERFORM public._log_order_event(v_row.id, 'cancelled', NULL,
      jsonb_build_object('reason','payment_timeout'));
    v_count := v_count + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'expired', v_count);
END;
$$;

-- release_overdue_escrow: log + notify + generate reminders
CREATE OR REPLACE FUNCTION public.release_overdue_escrow()
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_ord record; v_count integer := 0; v_reminders integer := 0; v_order public.orders;
BEGIN
  -- Auto-release
  FOR v_ord IN
    SELECT o.id FROM public.orders o
      JOIN public.seller_earnings e ON e.order_id = o.id
     WHERE o.status='paid' AND o.fulfillment_status='shipped'
       AND o.shipped_at IS NOT NULL AND o.shipped_at < now() - interval '7 days'
       AND e.status='pending'
  LOOP
    PERFORM public._release_order_escrow(v_ord.id, true);
    SELECT * INTO v_order FROM public.orders WHERE id = v_ord.id;
    PERFORM public._log_order_event(v_ord.id, 'auto_released', NULL, NULL);
    PERFORM public._push_notification(v_order.buyer_id, 'order_auto_released',
      'Fonds remis au vendeur',
      'Le délai de confirmation est dépassé — les fonds de ' || COALESCE(v_order.item_name,'ta commande') || ' ont été remis au vendeur.',
      v_ord.id);
    PERFORM public._push_notification(v_order.seller_id, 'order_auto_released',
      '💰 Fonds libérés automatiquement',
      'Les fonds pour ' || COALESCE(v_order.item_name,'ta vente') || ' sont désormais disponibles.',
      v_ord.id);
    v_count := v_count + 1;
  END LOOP;

  -- J+5 reminders (2 days before auto-release)
  FOR v_ord IN
    SELECT o.id FROM public.orders o
     WHERE o.status='paid' AND o.fulfillment_status='shipped'
       AND o.shipped_at IS NOT NULL AND o.shipped_at < now() - interval '5 days'
       AND o.shipped_at >= now() - interval '7 days'
       AND NOT EXISTS (
         SELECT 1 FROM public.notifications n
         WHERE n.order_id = o.id AND n.kind = 'order_reminder'
       )
  LOOP
    SELECT * INTO v_order FROM public.orders WHERE id = v_ord.id;
    PERFORM public._push_notification(v_order.buyer_id, 'order_reminder',
      'As-tu bien reçu ' || COALESCE(v_order.item_name,'ta commande') || ' ?',
      'Confirme la réception — sans réponse, les fonds seront remis au vendeur dans 2 jours. Un problème ? Signale-le.',
      v_ord.id);
    v_reminders := v_reminders + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'released', v_count, 'reminders', v_reminders);
END;
$$;

-- pay_order_with_wallet: no direct event add here (credit_seller_earning logs 'paid')
-- but log initial 'created' when the earning path runs? The order 'created' event
-- is best logged at insert-time via a trigger for coverage of all creation paths.

CREATE OR REPLACE FUNCTION public._on_order_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.order_events (order_id, event, actor_id, meta)
  VALUES (NEW.id, 'created', NEW.buyer_id,
    jsonb_build_object('kind', NEW.kind, 'total', NEW.total, 'currency', NEW.currency));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_log_created ON public.orders;
CREATE TRIGGER orders_log_created
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public._on_order_created();
