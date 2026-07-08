
-- 1) Columns
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_reason text;

CREATE INDEX IF NOT EXISTS orders_pending_deadline_idx
  ON public.orders (payment_deadline)
  WHERE status = 'pending' AND kind = 'auction';

-- 2) Allow live_products.status = 'unsold'
ALTER TABLE public.live_products DROP CONSTRAINT IF EXISTS live_products_status_check;
ALTER TABLE public.live_products
  ADD CONSTRAINT live_products_status_check
  CHECK (status = ANY (ARRAY['upcoming','active','sold','out','unsold']));

-- 3) finalize_auction_winner: host-triggered, atomic finalize + optional wallet auto-pay.
CREATE OR REPLACE FUNCTION public.finalize_auction_winner(
  _live_id uuid,
  _product_id uuid,
  _winner_id uuid,
  _winner_name text,
  _final_price numeric
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_live public.lives;
  v_product public.live_products;
  v_currency text;
  v_order public.orders;
  v_platform_fee numeric;
  v_seller_net numeric;
  v_wallet public.wallets;
  v_new_balance numeric;
  v_auto_paid boolean := false;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  SELECT * INTO v_live FROM public.lives WHERE id = _live_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'live_not_found'); END IF;
  IF v_live.seller_id <> v_caller AND NOT public.is_admin(v_caller) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_product FROM public.live_products
    WHERE id = _product_id AND live_id = _live_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'product_not_found'); END IF;

  -- Mark product sold (idempotent-ish; overwrites final_price)
  UPDATE public.live_products
     SET status = 'sold',
         sold_to_identity = _winner_name,
         final_price = _final_price
   WHERE id = _product_id;

  IF _winner_id IS NULL OR _final_price IS NULL OR _final_price <= 0 THEN
    RETURN jsonb_build_object('ok', true, 'order_id', null, 'auto_paid', false);
  END IF;

  -- Reuse existing order if this product already has one (idempotency).
  SELECT * INTO v_order FROM public.orders
    WHERE product_id = _product_id AND kind = 'auction' AND buyer_id = _winner_id
    ORDER BY created_at DESC LIMIT 1;

  v_currency := upper(coalesce(v_live.currency, 'EUR'));
  v_platform_fee := round(_final_price * 5 / 100 *
    CASE WHEN v_currency = 'XOF' THEN 1 ELSE 100 END) /
    CASE WHEN v_currency = 'XOF' THEN 1 ELSE 100 END;
  v_seller_net := _final_price - v_platform_fee;

  IF v_order.id IS NULL THEN
    INSERT INTO public.orders (
      buyer_id, seller_id, live_id, product_id, kind,
      item_name, item_image, amount, platform_fee, processing_fee,
      seller_net, total, currency, status, payment_method, payment_deadline
    ) VALUES (
      _winner_id, v_live.seller_id, _live_id, _product_id, 'auction',
      v_product.name, v_product.image_url, _final_price, v_platform_fee, 0,
      v_seller_net, _final_price, v_currency, 'pending', 'card',
      now() + interval '24 hours'
    ) RETURNING * INTO v_order;
  END IF;

  IF v_order.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', true, 'order_id', v_order.id,
      'auto_paid', v_order.status = 'paid');
  END IF;

  -- Try wallet auto-pay
  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = _winner_id FOR UPDATE;
  IF v_wallet.user_id IS NOT NULL
     AND upper(v_wallet.currency) = v_currency
     AND v_wallet.balance >= v_order.total THEN
    v_new_balance := v_wallet.balance - v_order.total;
    UPDATE public.wallets SET balance = v_new_balance, updated_at = now()
      WHERE user_id = _winner_id;
    UPDATE public.orders SET status = 'paid', payment_method = 'wallet', paid_at = now()
      WHERE id = v_order.id;
    INSERT INTO public.wallet_transactions
      (user_id, type, amount, balance_after, order_id, status)
    VALUES
      (_winner_id, 'purchase', -v_order.total, v_new_balance, v_order.id, 'completed');
    PERFORM public.credit_seller_earning(v_order.id);
    v_auto_paid := true;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', v_order.id,
    'auto_paid', v_auto_paid,
    'deadline', v_order.payment_deadline
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_auction_winner(uuid, uuid, uuid, text, numeric) FROM public;
GRANT EXECUTE ON FUNCTION public.finalize_auction_winner(uuid, uuid, uuid, text, numeric) TO authenticated;

-- 4) expire_overdue_orders: cancels overdue pending auction orders and releases products.
CREATE OR REPLACE FUNCTION public.expire_overdue_orders()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row RECORD;
  v_count int := 0;
  v_live_status text;
BEGIN
  FOR v_row IN
    SELECT id, product_id, live_id
      FROM public.orders
     WHERE status = 'pending'
       AND kind = 'auction'
       AND payment_deadline IS NOT NULL
       AND payment_deadline < now()
     FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.orders
       SET status = 'cancelled',
           cancelled_reason = 'payment_timeout'
     WHERE id = v_row.id;

    IF v_row.product_id IS NOT NULL THEN
      SELECT status INTO v_live_status FROM public.lives WHERE id = v_row.live_id;
      IF v_live_status = 'live' THEN
        UPDATE public.live_products
           SET status = 'upcoming',
               sold_to_identity = NULL,
               final_price = NULL,
               price = start_price
         WHERE id = v_row.product_id;
      ELSE
        UPDATE public.live_products
           SET status = 'unsold',
               sold_to_identity = NULL
         WHERE id = v_row.product_id;
      END IF;
    END IF;
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'expired', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.expire_overdue_orders() FROM public;
GRANT EXECUTE ON FUNCTION public.expire_overdue_orders() TO authenticated;
