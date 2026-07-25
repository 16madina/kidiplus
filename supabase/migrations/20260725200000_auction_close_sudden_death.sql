-- Auction reliability (2026-07-25 evening):
-- 1) Server-side anti-snipe (sudden death) inside place_live_bid — every
--    client stays in sync even if the host missed a realtime bid frame.
-- 2) settle_expired_auctions grace 20s → 3s so zombie 00:01 auctions close.
-- 3) finalize_auction_winner: never abort the whole sale if wallet/credit
--    throws — mark sold + create order first; auto-pay is best-effort.

-- ---------------------------------------------------------------------------
-- 1) place_live_bid + sudden death
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
  v_bidder_name text := coalesce(nullif(trim(coalesce(_bidder_name, '')), ''), 'invité');
  v_new_deadline timestamptz;
  v_extended boolean := false;
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
    WHEN 'USD' THEN CASE WHEN v_current < 10 THEN 0.5 ELSE 1 END
    WHEN 'GBP' THEN CASE WHEN v_current < 10 THEN 0.5 ELSE 1 END
    ELSE CASE WHEN v_current < 10 THEN 0.5 ELSE 1 END END;
  v_min_next := v_current + v_step;
  v_cap := greatest(coalesce(v_product.start_price, 0) * 100,
    CASE v_currency
      WHEN 'XOF' THEN 1000000
      WHEN 'CAD' THEN 3000
      WHEN 'USD' THEN 2200
      WHEN 'GBP' THEN 1800
      ELSE 2000 END);
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

  -- Anti-snipe: if < 10s remain, reset deadline to now()+10s (server truth).
  IF v_product.auction_deadline_at IS NOT NULL
     AND v_product.auction_deadline_at <= (now() + interval '10 seconds') THEN
    v_new_deadline := now() + interval '10 seconds';
    UPDATE public.live_products
       SET price = v_next,
           auction_deadline_at = v_new_deadline,
           current_bidder_id = v_user,
           current_bidder_name = v_bidder_name
     WHERE id = _product_id;
    v_extended := true;
  ELSE
    UPDATE public.live_products
       SET price = v_next,
           current_bidder_id = v_user,
           current_bidder_name = v_bidder_name
     WHERE id = _product_id;
    v_new_deadline := v_product.auction_deadline_at;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'bid_id', v_bid_id,
    'amount', v_next,
    'bidder_id', v_user,
    'bidder_name', v_bidder_name,
    'extended', v_extended,
    'deadline', v_new_deadline
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2) Faster sweeper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.settle_expired_auctions(_live_id uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  r record;
  v_count int := 0;
BEGIN
  -- 3s grace (was 20s) — long enough for last bids, short enough to unstick UI.
  FOR r IN
    SELECT lp.id AS product_id, lp.live_id
      FROM public.live_products lp
      JOIN public.lives l ON l.id = lp.live_id
     WHERE lp.mode = 'auction'
       AND lp.status = 'active'
       AND lp.auction_deadline_at IS NOT NULL
       AND lp.auction_deadline_at < (now() - interval '3 seconds')
       AND l.status = 'live'
       AND (_live_id IS NULL OR lp.live_id = _live_id)
     ORDER BY lp.auction_deadline_at ASC
     LIMIT 20
  LOOP
    BEGIN
      PERFORM public._settle_expired_auction_row(r.live_id, r.product_id);
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'settle_expired row failed %: %', r.product_id, SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'settled', v_count);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3) finalize: sale must succeed even if wallet auto-pay throws
-- ---------------------------------------------------------------------------
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
AS $function$
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
  v_addr public.addresses;
  v_delivery public.seller_delivery_settings;
  v_delivery_fee numeric := 0;
  v_delivery_mode text := NULL;
  v_delivery_zone text := NULL;
  v_address_id uuid := NULL;
  v_address_snapshot jsonb := NULL;
  v_zone_country text;
  v_matched_zone jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  SELECT * INTO v_live FROM public.lives WHERE id = _live_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'live_not_found'); END IF;
  IF v_live.seller_id <> v_caller
     AND NOT public.is_admin(v_caller)
     AND NOT public.is_live_moderator(v_live.id, v_caller) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_product
    FROM public.live_products
   WHERE id = _product_id AND live_id = _live_id
   FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'product_not_found'); END IF;

  v_round := COALESCE(v_product.auction_round, 1);

  IF v_product.status IN ('sold', 'unsold') THEN
    SELECT * INTO v_order
      FROM public.orders
     WHERE product_id = _product_id
       AND kind = 'auction'
       AND auction_round = v_round
     ORDER BY created_at DESC
     LIMIT 1;
    RETURN jsonb_build_object(
      'ok', true,
      'order_id', v_order.id,
      'auto_paid', COALESCE(v_order.status = 'paid', false),
      'deadline', v_order.payment_deadline,
      'auction_round', v_round,
      'winner_id', v_product.current_bidder_id,
      'winner_name', v_product.sold_to_identity,
      'final_price', v_product.price
    );
  END IF;

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
    v_resolved_winner_id := NULL;
    v_resolved_winner_name := NULL;
    v_resolved_price := NULL;
  END IF;

  IF v_resolved_winner_id IS NULL OR v_resolved_price IS NULL OR v_resolved_price <= 0 THEN
    UPDATE public.live_products
       SET status = 'unsold',
           sold_to_identity = NULL,
           sold_at = NULL,
           auction_deadline_at = NULL
     WHERE id = _product_id;
    RETURN jsonb_build_object('ok', true, 'order_id', NULL, 'auto_paid', false,
      'deadline', NULL, 'auction_round', v_round, 'unsold', true,
      'winner_id', NULL, 'winner_name', NULL, 'final_price', NULL);
  END IF;

  v_currency := upper(COALESCE(v_live.currency, 'EUR'));

  SELECT * INTO v_addr
    FROM public.addresses
   WHERE user_id = v_resolved_winner_id AND is_default = true
   ORDER BY updated_at DESC
   LIMIT 1;
  IF v_addr.id IS NULL THEN
    SELECT * INTO v_addr
      FROM public.addresses
     WHERE user_id = v_resolved_winner_id
     ORDER BY updated_at DESC
     LIMIT 1;
  END IF;

  SELECT * INTO v_delivery
    FROM public.seller_delivery_settings
   WHERE seller_id = v_live.seller_id;

  IF v_addr.id IS NOT NULL THEN
    v_address_id := v_addr.id;
    v_address_snapshot := jsonb_build_object(
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
      'details', v_addr.details,
      'line', trim(both ', ' from
        concat_ws(', ',
          NULLIF(v_addr.street_address, ''),
          NULLIF(v_addr.zone_or_commune, ''),
          NULLIF(concat_ws(' ', NULLIF(v_addr.postal_code, ''), NULLIF(v_addr.city, '')), ''),
          NULLIF(v_addr.region, ''),
          NULLIF(v_addr.country, '')
        )
      )
    );
  END IF;

  IF v_delivery.seller_id IS NOT NULL THEN
    v_delivery_mode := v_delivery.mode;
    IF v_delivery.mode = 'flat' THEN
      v_delivery_fee := COALESCE(v_delivery.flat_fee, 0);
    ELSIF v_delivery.mode = 'courier' THEN
      v_delivery_fee := 0;
    ELSIF v_delivery.mode = 'zones' AND v_addr.id IS NOT NULL AND v_addr.zone_or_commune IS NOT NULL THEN
      v_zone_country := upper(coalesce(v_addr.country, ''));
      SELECT z INTO v_matched_zone
        FROM jsonb_array_elements(coalesce(v_delivery.zones, '[]'::jsonb)) z
       WHERE lower(trim(z->>'name')) = lower(trim(v_addr.zone_or_commune))
         AND (coalesce(upper(z->>'country'), '') = '' OR upper(z->>'country') = v_zone_country)
       LIMIT 1;
      IF v_matched_zone IS NOT NULL THEN
        v_delivery_fee := coalesce((v_matched_zone->>'fee')::numeric, 0);
        v_delivery_zone := v_matched_zone->>'name';
      END IF;
    END IF;
  END IF;

  IF v_currency = 'XOF' THEN
    v_platform_fee := round(v_resolved_price * 0.05);
    v_delivery_fee := round(v_delivery_fee);
    v_seller_net := round(v_resolved_price - v_platform_fee + v_delivery_fee);
  ELSE
    v_platform_fee := round(v_resolved_price * 0.05, 2);
    v_delivery_fee := round(v_delivery_fee, 2);
    v_seller_net := round(v_resolved_price - v_platform_fee + v_delivery_fee, 2);
  END IF;

  -- Mark sold FIRST — this is what unsticks host/viewer UI.
  UPDATE public.live_products
     SET status = 'sold',
         sold_to_identity = v_resolved_winner_name,
         sold_at = now(),
         current_bidder_id = v_resolved_winner_id,
         current_bidder_name = v_resolved_winner_name,
         price = v_resolved_price,
         auction_deadline_at = NULL
   WHERE id = _product_id;

  SELECT * INTO v_order
    FROM public.orders
   WHERE product_id = _product_id
     AND kind = 'auction'
     AND auction_round = v_round
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_order.id IS NOT NULL AND v_order.status = 'paid' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'order_id', v_order.id,
      'auto_paid', true,
      'deadline', v_order.payment_deadline,
      'auction_round', v_round,
      'winner_id', v_resolved_winner_id,
      'winner_name', v_resolved_winner_name,
      'final_price', v_resolved_price
    );
  END IF;

  BEGIN
    IF v_order.id IS NULL OR v_order.status NOT IN ('pending', 'paid') THEN
      INSERT INTO public.orders (
        buyer_id, seller_id, live_id, product_id, kind,
        item_name, item_image, amount, platform_fee, processing_fee,
        seller_net, total, currency, status, payment_method,
        payment_deadline, auction_round,
        delivery_fee, delivery_mode, delivery_zone, address_id, address_snapshot
      ) VALUES (
        v_resolved_winner_id, v_live.seller_id, _live_id, _product_id, 'auction',
        v_product.name, v_product.image_url, v_resolved_price, v_platform_fee, 0,
        v_seller_net, v_resolved_price + v_delivery_fee, v_currency, 'pending', 'card',
        now() + interval '24 hours',
        v_round,
        v_delivery_fee, v_delivery_mode, v_delivery_zone, v_address_id, v_address_snapshot
      ) RETURNING * INTO v_order;
    ELSE
      UPDATE public.orders
         SET buyer_id = v_resolved_winner_id,
             amount = v_resolved_price,
             platform_fee = v_platform_fee,
             seller_net = v_seller_net,
             total = v_resolved_price + v_delivery_fee,
             item_name = v_product.name,
             item_image = v_product.image_url,
             payment_deadline = now() + interval '24 hours',
             delivery_fee = v_delivery_fee,
             delivery_mode = v_delivery_mode,
             delivery_zone = v_delivery_zone,
             address_id = coalesce(v_address_id, address_id),
             address_snapshot = coalesce(v_address_snapshot, address_snapshot)
       WHERE id = v_order.id
       RETURNING * INTO v_order;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Product is already sold; return ok so the UI can celebrate the winner.
    RETURN jsonb_build_object(
      'ok', true,
      'order_id', NULL,
      'auto_paid', false,
      'auction_round', v_round,
      'winner_id', v_resolved_winner_id,
      'winner_name', v_resolved_winner_name,
      'final_price', v_resolved_price,
      'warning', 'order_insert_failed'
    );
  END;

  -- Best-effort wallet auto-pay — never roll back the sale.
  BEGIN
    IF v_order.status = 'pending' THEN
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
         WHERE id = v_order.id AND status = 'pending';
        IF FOUND THEN
          INSERT INTO public.wallet_transactions
            (user_id, type, amount, balance_after, order_id, status)
          VALUES
            (v_resolved_winner_id, 'purchase', -v_order.total, v_new_balance, v_order.id, 'completed');
          BEGIN
            PERFORM public.credit_seller_earning(v_order.id);
          EXCEPTION WHEN OTHERS THEN
            NULL; -- paid order stands even if earnings ledger hiccups
          END;
          v_auto_paid := true;
        END IF;
      END IF;
    ELSIF v_order.status = 'paid' THEN
      v_auto_paid := true;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_auto_paid := false;
  END;

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
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$function$;

REVOKE ALL ON FUNCTION public.finalize_auction_winner(uuid, uuid, uuid, text, numeric) FROM public;
GRANT EXECUTE ON FUNCTION public.finalize_auction_winner(uuid, uuid, uuid, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.place_live_bid(uuid, uuid, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.settle_expired_auctions(uuid) TO authenticated;
