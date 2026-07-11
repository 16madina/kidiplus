-- Fix re-auction of the same live_products row:
-- 1) Resolve winner from live_bids for the CURRENT auction_round (ignore client guess).
-- 2) Tag orders with auction_round so a new win creates a new order + wallet debit.
-- 3) Only reuse a pending order for the same product+buyer+round.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS auction_round int;

CREATE INDEX IF NOT EXISTS orders_product_buyer_round_idx
  ON public.orders (product_id, buyer_id, auction_round)
  WHERE kind = 'auction';

CREATE OR REPLACE FUNCTION public.finalize_auction_winner(
  _live_id uuid,
  _product_id uuid,
  _winner_id uuid,
  _winner_name text,
  _final_price numeric
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  v_round int;
  v_bid_winner_id uuid;
  v_bid_winner_name text;
  v_bid_amount numeric;
  v_resolved_winner_id uuid;
  v_resolved_winner_name text;
  v_resolved_price numeric;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  SELECT * INTO v_live FROM public.lives WHERE id = _live_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'live_not_found'); END IF;
  IF v_live.seller_id <> v_caller AND NOT public.is_admin(v_caller) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_product
    FROM public.live_products
   WHERE id = _product_id AND live_id = _live_id
   FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'product_not_found'); END IF;

  v_round := COALESCE(v_product.auction_round, 1);

  -- Authoritative winner = highest bid for THIS round (not client-supplied ids).
  SELECT bidder_id, bidder_name, amount
    INTO v_bid_winner_id, v_bid_winner_name, v_bid_amount
    FROM public.live_bids
   WHERE product_id = _product_id
     AND auction_round = v_round
   ORDER BY amount DESC, created_at ASC
   LIMIT 1;

  IF v_bid_winner_id IS NOT NULL THEN
    v_resolved_winner_id := v_bid_winner_id;
    v_resolved_winner_name := COALESCE(v_bid_winner_name, _winner_name, 'winner');
    v_resolved_price := COALESCE(v_bid_amount, _final_price, v_product.price);
  ELSE
    -- No bids this round → unsold (ignore stale client winner from a prior round).
    v_resolved_winner_id := NULL;
    v_resolved_winner_name := NULL;
    v_resolved_price := NULL;
  END IF;

  IF v_resolved_winner_id IS NULL OR v_resolved_price IS NULL OR v_resolved_price <= 0 THEN
    UPDATE public.live_products
       SET status = 'unsold',
           sold_to_identity = NULL,
           final_price = NULL,
           price = start_price,
           auction_deadline_at = NULL
     WHERE id = _product_id;
    RETURN jsonb_build_object(
      'ok', true,
      'order_id', null,
      'auto_paid', false,
      'unsold', true,
      'auction_round', v_round,
      'winner_id', null,
      'winner_name', null,
      'final_price', null
    );
  END IF;

  UPDATE public.live_products
     SET status = 'sold',
         sold_to_identity = v_resolved_winner_name,
         final_price = v_resolved_price,
         auction_deadline_at = NULL
   WHERE id = _product_id;

  IF v_product.shop_product_id IS NOT NULL THEN
    UPDATE public.shop_products
       SET stock = greatest(stock - 1, 0),
           active = CASE WHEN stock - 1 <= 0 THEN false ELSE active END,
           updated_at = now()
     WHERE id = v_product.shop_product_id;
  END IF;

  v_currency := upper(coalesce(v_live.currency, 'EUR'));
  v_platform_fee := round(v_resolved_price * 5 / 100 *
    CASE WHEN v_currency = 'XOF' THEN 1 ELSE 100 END) /
    CASE WHEN v_currency = 'XOF' THEN 1 ELSE 100 END;
  v_seller_net := v_resolved_price - v_platform_fee;

  -- Reuse only a PENDING order for this exact round.
  SELECT * INTO v_order
    FROM public.orders
   WHERE product_id = _product_id
     AND kind = 'auction'
     AND buyer_id = v_resolved_winner_id
     AND auction_round = v_round
     AND status = 'pending'
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_order.id IS NULL THEN
    INSERT INTO public.orders (
      buyer_id, seller_id, live_id, product_id, kind,
      item_name, item_image, amount, platform_fee, processing_fee,
      seller_net, total, currency, status, payment_method, payment_deadline,
      auction_round
    ) VALUES (
      v_resolved_winner_id, v_live.seller_id, _live_id, _product_id, 'auction',
      v_product.name, v_product.image_url, v_resolved_price, v_platform_fee, 0,
      v_seller_net, v_resolved_price, v_currency, 'pending', 'card',
      now() + interval '24 hours',
      v_round
    ) RETURNING * INTO v_order;
  ELSE
    -- Keep pending order totals in sync with this round's winning bid.
    UPDATE public.orders
       SET amount = v_resolved_price,
           platform_fee = v_platform_fee,
           seller_net = v_seller_net,
           total = v_resolved_price,
           item_name = v_product.name,
           item_image = v_product.image_url,
           payment_deadline = now() + interval '24 hours'
     WHERE id = v_order.id
     RETURNING * INTO v_order;
  END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_resolved_winner_id FOR UPDATE;
  IF v_wallet.user_id IS NOT NULL
     AND upper(v_wallet.currency) = v_currency
     AND v_wallet.balance >= v_order.total THEN
    v_new_balance := v_wallet.balance - v_order.total;
    UPDATE public.wallets
       SET balance = v_new_balance, updated_at = now()
     WHERE user_id = v_resolved_winner_id;
    UPDATE public.orders
       SET status = 'paid', payment_method = 'wallet', paid_at = now()
     WHERE id = v_order.id;
    INSERT INTO public.wallet_transactions
      (user_id, type, amount, balance_after, order_id, status)
    VALUES
      (v_resolved_winner_id, 'purchase', -v_order.total, v_new_balance, v_order.id, 'completed');
    PERFORM public.credit_seller_earning(v_order.id);
    v_auto_paid := true;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', v_order.id,
    'auto_paid', v_auto_paid,
    'deadline', v_order.payment_deadline,
    'auction_round', v_round,
    'winner_id', v_resolved_winner_id,
    'winner_name', v_resolved_winner_name,
    'final_price', v_resolved_price
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_auction_winner(uuid, uuid, uuid, text, numeric) FROM public;
GRANT EXECUTE ON FUNCTION public.finalize_auction_winner(uuid, uuid, uuid, text, numeric) TO authenticated;
