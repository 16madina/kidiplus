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

  IF _winner_id IS NULL OR _final_price IS NULL OR _final_price <= 0 THEN
    UPDATE public.live_products
       SET status = 'unsold',
           sold_to_identity = NULL,
           final_price = NULL,
           price = start_price
     WHERE id = _product_id;
    RETURN jsonb_build_object('ok', true, 'order_id', null, 'auto_paid', false, 'unsold', true);
  END IF;

  UPDATE public.live_products
     SET status = 'sold',
         sold_to_identity = _winner_name,
         final_price = _final_price
   WHERE id = _product_id;

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

CREATE OR REPLACE FUNCTION public.relaunch_unsold_product(_product_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_product public.live_products;
  v_live public.lives;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;
  SELECT * INTO v_product FROM public.live_products WHERE id = _product_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  SELECT * INTO v_live FROM public.lives WHERE id = v_product.live_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'live_not_found'); END IF;
  IF v_live.seller_id <> v_caller
     AND NOT public.is_admin(v_caller)
     AND NOT EXISTS (
       SELECT 1 FROM public.live_moderators
        WHERE live_id = v_product.live_id AND user_id = v_caller
     ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF v_product.status <> 'unsold' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_unsold');
  END IF;
  UPDATE public.live_products
     SET status = 'upcoming',
         sold_to_identity = NULL,
         final_price = NULL,
         price = start_price,
         auction_deadline_at = NULL,
         position = (SELECT COALESCE(MAX(position), -1) + 1 FROM public.live_products WHERE live_id = v_product.live_id)
   WHERE id = _product_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.relaunch_unsold_product(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.relaunch_unsold_product(uuid) TO authenticated;