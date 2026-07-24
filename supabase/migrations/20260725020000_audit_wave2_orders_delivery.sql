-- Wave 2 audit fixes:
-- 1) Server-side delivery eligibility helper
-- 2) place_live_bid enforces delivery
-- 3) create_live_order — amounts/fees from product (no client-trusted prices)
-- 4) Drop client INSERT on orders
-- 5) Fix admin_refund_order wallet lookup + FX
-- 6) expire_overdue_orders also restores fixed-price stock

-- ---------------------------------------------------------------------------
-- 1) Delivery eligibility + fee snapshot (mirrors canDeliver + checkout fee)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_buyer_delivery(
  _seller_id uuid,
  _buyer_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_addr public.addresses;
  v_delivery public.seller_delivery_settings;
  v_seller_country text;
  v_buyer_country text;
  v_delivery_fee numeric := 0;
  v_delivery_mode text := NULL;
  v_delivery_zone text := NULL;
  v_matched_zone jsonb;
  v_zone_country text;
  v_snapshot jsonb := NULL;
  v_has_country_zone boolean := false;
BEGIN
  SELECT * INTO v_addr
    FROM public.addresses
   WHERE user_id = _buyer_id AND is_default = true
   ORDER BY updated_at DESC LIMIT 1;
  IF v_addr.id IS NULL THEN
    SELECT * INTO v_addr
      FROM public.addresses
     WHERE user_id = _buyer_id
     ORDER BY updated_at DESC LIMIT 1;
  END IF;
  IF v_addr.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_address');
  END IF;

  v_buyer_country := upper(trim(coalesce(v_addr.country, '')));
  IF v_buyer_country = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_address');
  END IF;

  SELECT country INTO v_seller_country FROM public.profiles WHERE id = _seller_id;
  v_seller_country := upper(trim(coalesce(v_seller_country, '')));

  SELECT * INTO v_delivery FROM public.seller_delivery_settings WHERE seller_id = _seller_id;

  IF v_delivery.seller_id IS NULL OR v_delivery.mode = 'flat' THEN
    v_delivery_mode := coalesce(v_delivery.mode, 'flat');
    v_delivery_fee := coalesce(v_delivery.flat_fee, 0);
  ELSIF v_delivery.mode = 'courier' THEN
    v_delivery_mode := 'courier';
    v_delivery_fee := 0;
    IF v_seller_country <> '' AND v_buyer_country <> v_seller_country THEN
      RETURN jsonb_build_object('ok', false, 'error', 'courier_country_mismatch');
    END IF;
  ELSIF v_delivery.mode = 'zones' THEN
    v_delivery_mode := 'zones';
    IF jsonb_array_length(coalesce(v_delivery.zones, '[]'::jsonb)) = 0 THEN
      v_delivery_fee := 0;
    ELSE
      SELECT EXISTS (
        SELECT 1
          FROM jsonb_array_elements(coalesce(v_delivery.zones, '[]'::jsonb)) z
         WHERE coalesce(upper(z->>'country'), '') = ''
            OR upper(z->>'country') = v_buyer_country
      ) INTO v_has_country_zone;
      IF NOT v_has_country_zone THEN
        RETURN jsonb_build_object('ok', false, 'error', 'no_country_coverage');
      END IF;
      -- Prefer exact commune/zone name match; else first zone for that country.
      v_zone_country := v_buyer_country;
      IF v_addr.zone_or_commune IS NOT NULL THEN
        SELECT z INTO v_matched_zone
          FROM jsonb_array_elements(coalesce(v_delivery.zones, '[]'::jsonb)) z
         WHERE lower(trim(z->>'name')) = lower(trim(v_addr.zone_or_commune))
           AND (coalesce(upper(z->>'country'), '') = '' OR upper(z->>'country') = v_zone_country)
         LIMIT 1;
      END IF;
      IF v_matched_zone IS NULL THEN
        SELECT z INTO v_matched_zone
          FROM jsonb_array_elements(coalesce(v_delivery.zones, '[]'::jsonb)) z
         WHERE coalesce(upper(z->>'country'), '') = ''
            OR upper(z->>'country') = v_zone_country
         LIMIT 1;
      END IF;
      IF v_matched_zone IS NOT NULL THEN
        v_delivery_fee := coalesce((v_matched_zone->>'fee')::numeric, 0);
        v_delivery_zone := v_matched_zone->>'name';
      END IF;
    END IF;
  END IF;

  v_snapshot := jsonb_build_object(
    'id', v_addr.id,
    'label', v_addr.label,
    'full_name', v_addr.full_name,
    'phone', v_addr.phone,
    'country', v_addr.country,
    'city', v_addr.city,
    'zone_or_commune', v_addr.zone_or_commune,
    'street_address', v_addr.street_address,
    'postal_code', v_addr.postal_code,
    'region', v_addr.region,
    'details', v_addr.details
  );

  RETURN jsonb_build_object(
    'ok', true,
    'address_id', v_addr.id,
    'address_snapshot', v_snapshot,
    'delivery_fee', v_delivery_fee,
    'delivery_mode', v_delivery_mode,
    'delivery_zone', v_delivery_zone
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_buyer_delivery(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.resolve_buyer_delivery(uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) place_live_bid — delivery gate
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.place_live_bid(
  _live_id uuid,
  _product_id uuid,
  _bidder_name text,
  _amount numeric DEFAULT NULL::numeric
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_product public.live_products;
  v_live public.lives;
  v_last_bidder uuid;
  v_highest_amount numeric;
  v_current numeric; v_step numeric; v_min_next numeric; v_next numeric;
  v_bid_id uuid; v_currency text; v_cap numeric;
  v_round int;
  v_delivery jsonb;
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
  IF v_product.auction_deadline_at IS NOT NULL AND v_product.auction_deadline_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auction_ended');
  END IF;

  v_delivery := public.resolve_buyer_delivery(v_live.seller_id, v_user);
  IF NOT coalesce((v_delivery->>'ok')::boolean, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', coalesce(v_delivery->>'error', 'delivery_blocked'));
  END IF;

  v_round := COALESCE(v_product.auction_round, 1);
  SELECT bidder_id, amount INTO v_last_bidder, v_highest_amount
    FROM public.live_bids
   WHERE product_id = _product_id AND auction_round = v_round
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
  INSERT INTO public.live_bids (live_id, product_id, bidder_id, bidder_name, amount, auction_round)
  VALUES (_live_id, _product_id, v_user, v_bidder_name, v_next, v_round) RETURNING id INTO v_bid_id;
  UPDATE public.live_products SET price = v_next WHERE id = _product_id;
  RETURN jsonb_build_object('ok', true, 'bid_id', v_bid_id, 'amount', v_next,
    'bidder_id', v_user, 'bidder_name', v_bidder_name);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3) create_live_order — server-priced checkout order
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_live_order(
  _product_id uuid,
  _kind text,
  _color text DEFAULT NULL,
  _size text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_product public.live_products;
  v_live public.lives;
  v_delivery jsonb;
  v_currency text;
  v_amount numeric;
  v_platform_fee numeric;
  v_seller_net numeric;
  v_delivery_fee numeric := 0;
  v_order public.orders;
  v_item_name text;
  v_round int;
  v_bid_winner uuid;
  v_bid_amount numeric;
  v_snapshot jsonb;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthorized'); END IF;
  PERFORM public.assert_user_active();
  IF _kind NOT IN ('fixed', 'auction') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_kind');
  END IF;

  SELECT * INTO v_product FROM public.live_products WHERE id = _product_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'product_not_found'); END IF;
  SELECT * INTO v_live FROM public.lives WHERE id = v_product.live_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'live_not_found'); END IF;

  v_delivery := public.resolve_buyer_delivery(v_live.seller_id, v_user);
  IF NOT coalesce((v_delivery->>'ok')::boolean, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', coalesce(v_delivery->>'error', 'delivery_blocked'));
  END IF;
  v_delivery_fee := coalesce((v_delivery->>'delivery_fee')::numeric, 0);
  v_snapshot := coalesce(v_delivery->'address_snapshot', '{}'::jsonb);
  v_snapshot := v_snapshot || jsonb_build_object(
    'item_base_name', v_product.name,
    'product_options', jsonb_build_object('color', _color, 'size', _size)
  );

  v_item_name := v_product.name;
  IF _color IS NOT NULL AND btrim(_color) <> '' THEN
    v_item_name := v_item_name || ' · ' || btrim(_color);
  END IF;
  IF _size IS NOT NULL AND btrim(_size) <> '' THEN
    v_item_name := v_item_name || ' · ' || btrim(_size);
  END IF;

  v_currency := upper(coalesce(v_live.currency, 'EUR'));
  v_round := coalesce(v_product.auction_round, 1);

  IF _kind = 'fixed' THEN
    IF v_product.mode <> 'fixed' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_fixed');
    END IF;
    IF v_product.status NOT IN ('active', 'upcoming') OR v_product.stock <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'out_of_stock');
    END IF;
    v_amount := coalesce(v_product.price, 0);
    IF v_amount <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_price');
    END IF;

    UPDATE public.live_products
       SET stock = v_product.stock - 1,
           status = CASE WHEN v_product.stock - 1 <= 0 THEN 'out' ELSE 'active' END,
           sold_to_identity = coalesce(sold_to_identity, v_user::text),
           final_price = coalesce(final_price, v_amount)
     WHERE id = _product_id
     RETURNING * INTO v_product;

    IF v_product.shop_product_id IS NOT NULL THEN
      UPDATE public.shop_products
         SET stock = greatest(stock - 1, 0),
             active = CASE WHEN stock - 1 <= 0 THEN false ELSE active END,
             updated_at = now()
       WHERE id = v_product.shop_product_id;
    END IF;
  ELSE
    -- Auction fallback: buyer must be the current-round winner.
    IF v_product.mode <> 'auction' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_auction');
    END IF;
    SELECT bidder_id, amount INTO v_bid_winner, v_bid_amount
      FROM public.live_bids
     WHERE product_id = _product_id AND auction_round = v_round
     ORDER BY amount DESC, created_at ASC LIMIT 1;
    IF v_bid_winner IS NULL OR v_bid_winner <> v_user THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_winner');
    END IF;
    v_amount := coalesce(v_bid_amount, v_product.price, 0);
    IF v_amount <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_price');
    END IF;

    -- Return existing order for this round if any.
    SELECT * INTO v_order
      FROM public.orders
     WHERE product_id = _product_id
       AND kind = 'auction'
       AND auction_round = v_round
       AND buyer_id = v_user
     ORDER BY created_at DESC LIMIT 1;
    IF v_order.id IS NOT NULL THEN
      RETURN jsonb_build_object('ok', true, 'order_id', v_order.id, 'order', to_jsonb(v_order));
    END IF;
  END IF;

  IF v_currency = 'XOF' THEN
    v_platform_fee := round(v_amount * 0.05);
    v_delivery_fee := round(v_delivery_fee);
    v_seller_net := round(v_amount - v_platform_fee + v_delivery_fee);
  ELSE
    v_platform_fee := round(v_amount * 0.05, 2);
    v_delivery_fee := round(v_delivery_fee, 2);
    v_seller_net := round(v_amount - v_platform_fee + v_delivery_fee, 2);
  END IF;

  INSERT INTO public.orders (
    buyer_id, seller_id, live_id, product_id, kind,
    item_name, item_image, amount, platform_fee, processing_fee,
    seller_net, total, currency, status, payment_method,
    payment_deadline, auction_round,
    delivery_fee, delivery_mode, delivery_zone, address_id, address_snapshot
  ) VALUES (
    v_user, v_live.seller_id, v_product.live_id, _product_id, _kind,
    v_item_name, v_product.image_url, v_amount, v_platform_fee, 0,
    v_seller_net, v_amount + v_delivery_fee, v_currency, 'pending', 'card',
    now() + interval '24 hours',
    CASE WHEN _kind = 'auction' THEN v_round ELSE NULL END,
    v_delivery_fee,
    v_delivery->>'delivery_mode',
    v_delivery->>'delivery_zone',
    (v_delivery->>'address_id')::uuid,
    v_snapshot
  ) RETURNING * INTO v_order;

  RETURN jsonb_build_object('ok', true, 'order_id', v_order.id, 'order', to_jsonb(v_order));
END;
$$;

REVOKE ALL ON FUNCTION public.create_live_order(uuid, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_live_order(uuid, text, text, text) TO authenticated;

-- Keep purchase_fixed_price as a thin wrapper (legacy callers) — but now
-- creates the order server-side. Return type changes to jsonb.
DROP FUNCTION IF EXISTS public.purchase_fixed_price(uuid, text);
CREATE OR REPLACE FUNCTION public.purchase_fixed_price(
  _product_id uuid,
  _buyer_identity text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- _buyer_identity ignored: auth.uid() is the source of truth.
  RETURN public.create_live_order(_product_id, 'fixed', NULL, NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_fixed_price(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.purchase_fixed_price(uuid, text) TO authenticated;

-- Clients can no longer insert arbitrary order amounts.
DROP POLICY IF EXISTS orders_insert_own_pending ON public.orders;
REVOKE INSERT ON public.orders FROM authenticated;

-- ---------------------------------------------------------------------------
-- 5) admin_refund_order — single wallet per user + FX-aware credit
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_refund_order(_order_id uuid, _note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_order public.orders; v_earning public.seller_earnings; v_bal public.seller_balances;
  v_wallet public.wallets; v_pending_new numeric; v_wallet_new numeric; v_refund_status text;
  v_credit numeric;
  v_order_currency text;
  v_wallet_currency text;
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

  PERFORM public.reverse_referral_for_order(_order_id);

  IF v_order.payment_method = 'wallet' THEN
    SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_order.buyer_id FOR UPDATE;
    IF NOT FOUND THEN
      INSERT INTO public.wallets (user_id, balance, currency)
      VALUES (v_order.buyer_id, 0, lower(coalesce(v_order.currency, 'eur')))
      RETURNING * INTO v_wallet;
    END IF;
    v_order_currency := upper(coalesce(v_order.currency, 'EUR'));
    v_wallet_currency := upper(coalesce(v_wallet.currency, v_order_currency));
    IF v_wallet_currency = v_order_currency THEN
      v_credit := v_order.total;
    ELSE
      v_credit := public.convert_money(v_order.total, v_order_currency, v_wallet_currency);
      IF v_credit IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'conversion_unavailable');
      END IF;
    END IF;
    v_wallet_new := v_wallet.balance + v_credit;
    UPDATE public.wallets SET balance = v_wallet_new, updated_at = now()
     WHERE user_id = v_order.buyer_id;
    INSERT INTO public.wallet_transactions (user_id, type, amount, balance_after, order_id, status, meta)
    VALUES (
      v_order.buyer_id, 'refund', v_credit, v_wallet_new, _order_id, 'completed',
      jsonb_build_object(
        'order_total', v_order.total,
        'order_currency', v_order_currency,
        'credit_currency', v_wallet_currency
      )
    );
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

-- ---------------------------------------------------------------------------
-- 6) expire_overdue_orders — auctions + fixed (restore stock)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_overdue_orders()
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row RECORD;
  v_count int := 0;
  v_live_status text;
  v_product public.live_products;
BEGIN
  FOR v_row IN
    SELECT id, product_id, live_id, kind FROM public.orders
     WHERE status = 'pending'
       AND payment_deadline IS NOT NULL
       AND payment_deadline < now()
     FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.orders
       SET status = 'cancelled', cancelled_reason = 'payment_timeout'
     WHERE id = v_row.id;

    IF v_row.product_id IS NOT NULL THEN
      SELECT * INTO v_product FROM public.live_products WHERE id = v_row.product_id FOR UPDATE;
      IF FOUND THEN
        IF v_row.kind = 'fixed' THEN
          UPDATE public.live_products
             SET stock = stock + 1,
                 status = CASE
                   WHEN mode = 'fixed' AND status = 'out' THEN 'active'
                   ELSE status
                 END
           WHERE id = v_row.product_id;
          IF v_product.shop_product_id IS NOT NULL THEN
            UPDATE public.shop_products
               SET stock = stock + 1,
                   active = true,
                   updated_at = now()
             WHERE id = v_product.shop_product_id;
          END IF;
        ELSIF v_row.kind = 'auction' THEN
          SELECT status INTO v_live_status FROM public.lives WHERE id = v_row.live_id;
          IF v_live_status = 'live' THEN
            UPDATE public.live_products
               SET status = 'upcoming', sold_to_identity = NULL,
                   final_price = NULL, price = start_price
             WHERE id = v_row.product_id;
          ELSE
            UPDATE public.live_products
               SET status = 'unsold', sold_to_identity = NULL
             WHERE id = v_row.product_id;
          END IF;
        END IF;
      END IF;
    END IF;

    PERFORM public._log_order_event(v_row.id, 'cancelled', NULL,
      jsonb_build_object('reason', 'payment_timeout'));
    v_count := v_count + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'expired', v_count);
END;
$$;
