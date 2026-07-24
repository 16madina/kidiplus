-- Audit critical fixes (2026-07-25):
-- 1) Drop leftover live_bids INSERT policy (forged bids)
-- 2) Enforce auction_deadline_at in place_live_bid
-- 3) Block concurrent auctions on the same live in start_auction
-- 4) finalize_auction_winner: 5% fee, delivery in seller_net, round-scoped
--    order lookup, already-paid guard (no double wallet debit)
-- 5) settle_expired_auctions sweeper when the host device is offline

-- ---------------------------------------------------------------------------
-- 1) Bids may only be inserted via place_live_bid (SECURITY DEFINER)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "live_bids_insert_own" ON public.live_bids;
REVOKE INSERT ON public.live_bids FROM authenticated;
REVOKE UPDATE, DELETE ON public.live_bids FROM authenticated;

-- ---------------------------------------------------------------------------
-- 2 + 3) start_auction: one active auction per live; place_live_bid: deadline
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_auction(_product_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_row public.live_products;
  v_live public.lives;
  v_deadline timestamptz;
  v_new_round int;
  v_other uuid;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;
  SELECT * INTO v_row FROM public.live_products WHERE id = _product_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'product_not_found');
  END IF;
  SELECT * INTO v_live FROM public.lives WHERE id = v_row.live_id;
  IF NOT FOUND
     OR (
       v_live.seller_id <> v_caller
       AND NOT public.is_admin(v_caller)
       AND NOT public.is_live_moderator(v_live.id, v_caller)
     ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF v_live.status <> 'live' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'live_not_active');
  END IF;
  IF v_row.mode <> 'auction' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_auction');
  END IF;

  -- Refuse a second concurrent auction on the same live.
  SELECT id INTO v_other
    FROM public.live_products
   WHERE live_id = v_row.live_id
     AND mode = 'auction'
     AND status = 'active'
     AND id <> _product_id
     AND auction_deadline_at IS NOT NULL
     AND auction_deadline_at > (now() - interval '30 seconds')
   LIMIT 1;
  IF v_other IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auction_already_running');
  END IF;

  v_deadline := now() + make_interval(secs => GREATEST(COALESCE(v_row.timer_seconds, 30), 5));
  v_new_round := COALESCE(v_row.auction_round, 1) + 1;
  UPDATE public.live_products
     SET status = 'active',
         price = v_row.start_price,
         final_price = NULL,
         sold_to_identity = NULL,
         auction_deadline_at = v_deadline,
         auction_round = v_new_round
   WHERE id = _product_id;
  RETURN jsonb_build_object(
    'ok', true,
    'deadline_ms', (EXTRACT(EPOCH FROM v_deadline) * 1000)::bigint,
    'timer_sec', GREATEST(COALESCE(v_row.timer_seconds, 30), 5),
    'auction_round', v_new_round
  );
END;
$function$;

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
  -- Server-side deadline: client UI alone is not enough.
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
-- 4) finalize_auction_winner — fee alignment + idempotent wallet debit
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

  -- Idempotent: already settled for this round → return existing order.
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
      'deadline', NULL, 'auction_round', v_round,
      'winner_id', NULL, 'winner_name', NULL, 'final_price', NULL);
  END IF;

  v_currency := upper(COALESCE(v_live.currency, 'EUR'));

  -- Delivery snapshot before fee math (delivery passes through to seller).
  SELECT * INTO v_addr
    FROM public.addresses
   WHERE user_id = v_resolved_winner_id AND is_default = true
   ORDER BY updated_at DESC
   LIMIT 1;
  -- Fallback: any address if none marked default (first-address bug).
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

  -- 5% platform fee (matches fees.ts); XOF is zero-decimal.
  IF v_currency = 'XOF' THEN
    v_platform_fee := round(v_resolved_price * 0.05);
    v_delivery_fee := round(v_delivery_fee);
    v_seller_net := round(v_resolved_price - v_platform_fee + v_delivery_fee);
  ELSE
    v_platform_fee := round(v_resolved_price * 0.05, 2);
    v_delivery_fee := round(v_delivery_fee, 2);
    v_seller_net := round(v_resolved_price - v_platform_fee + v_delivery_fee, 2);
  END IF;

  UPDATE public.live_products
     SET status = 'sold',
         sold_to_identity = v_resolved_winner_name,
         sold_at = now(),
         current_bidder_id = v_resolved_winner_id,
         current_bidder_name = v_resolved_winner_name,
         price = v_resolved_price,
         auction_deadline_at = NULL
   WHERE id = _product_id;

  -- Round-scoped order lookup (never rewrite a previous round's buyer).
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

  -- Wallet auto-pay only when still pending (retry-safe).
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
        PERFORM public.credit_seller_earning(v_order.id);
        v_auto_paid := true;
      END IF;
    END IF;
  ELSIF v_order.status = 'paid' THEN
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
$function$;

-- Moderators may also settle (host offline rescue from moderator dock / sweeper caller as mod).
REVOKE ALL ON FUNCTION public.finalize_auction_winner(uuid, uuid, uuid, text, numeric) FROM public;
GRANT EXECUTE ON FUNCTION public.finalize_auction_winner(uuid, uuid, uuid, text, numeric) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5) Server sweeper: settle auctions whose deadline passed (host offline)
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
  -- Grace of 20s after deadline so last-second bids / anti-snipe can land.
  -- Privileged path: any authenticated client (or cron) can trigger settlement
  -- when the host device is offline — the row work runs as SECURITY DEFINER.
  FOR r IN
    SELECT lp.id AS product_id, lp.live_id
      FROM public.live_products lp
      JOIN public.lives l ON l.id = lp.live_id
     WHERE lp.mode = 'auction'
       AND lp.status = 'active'
       AND lp.auction_deadline_at IS NOT NULL
       AND lp.auction_deadline_at < (now() - interval '20 seconds')
       AND l.status = 'live'
       AND (_live_id IS NULL OR lp.live_id = _live_id)
     ORDER BY lp.auction_deadline_at ASC
     LIMIT 20
  LOOP
    PERFORM public._settle_expired_auction_row(r.live_id, r.product_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'settled', v_count);
END;
$function$;

-- Privileged single-row settle used when the caller is not the host.
CREATE OR REPLACE FUNCTION public._settle_expired_auction_row(
  _live_id uuid,
  _product_id uuid
) RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_live public.lives;
  v_product public.live_products;
  v_currency text;
  v_order public.orders;
  v_platform_fee numeric;
  v_seller_net numeric;
  v_wallet public.wallets;
  v_new_balance numeric;
  v_round int;
  v_bid_winner_id uuid;
  v_bid_winner_name text;
  v_bid_amount numeric;
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
  SELECT * INTO v_live FROM public.lives WHERE id = _live_id;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO v_product
    FROM public.live_products
   WHERE id = _product_id AND live_id = _live_id
   FOR UPDATE;
  IF NOT FOUND OR v_product.status <> 'active' OR v_product.mode <> 'auction' THEN
    RETURN;
  END IF;

  v_round := COALESCE(v_product.auction_round, 1);

  SELECT bidder_id, bidder_name, amount
    INTO v_bid_winner_id, v_bid_winner_name, v_bid_amount
    FROM public.live_bids
   WHERE product_id = _product_id AND auction_round = v_round
   ORDER BY amount DESC, created_at ASC
   LIMIT 1;

  IF v_bid_winner_id IS NULL OR v_bid_amount IS NULL OR v_bid_amount <= 0 THEN
    UPDATE public.live_products
       SET status = 'unsold', sold_to_identity = NULL, sold_at = NULL,
           auction_deadline_at = NULL
     WHERE id = _product_id;
    RETURN;
  END IF;

  v_currency := upper(COALESCE(v_live.currency, 'EUR'));

  SELECT * INTO v_addr
    FROM public.addresses
   WHERE user_id = v_bid_winner_id AND is_default = true
   ORDER BY updated_at DESC LIMIT 1;
  IF v_addr.id IS NULL THEN
    SELECT * INTO v_addr FROM public.addresses
     WHERE user_id = v_bid_winner_id ORDER BY updated_at DESC LIMIT 1;
  END IF;
  SELECT * INTO v_delivery FROM public.seller_delivery_settings WHERE seller_id = v_live.seller_id;

  IF v_addr.id IS NOT NULL THEN
    v_address_id := v_addr.id;
    v_address_snapshot := jsonb_build_object(
      'id', v_addr.id, 'label', v_addr.label, 'full_name', v_addr.full_name,
      'phone', v_addr.phone, 'country', v_addr.country, 'city', v_addr.city,
      'zone_or_commune', v_addr.zone_or_commune, 'street_address', v_addr.street_address,
      'postal_code', v_addr.postal_code, 'region', v_addr.region, 'details', v_addr.details
    );
  END IF;

  IF v_delivery.seller_id IS NOT NULL THEN
    v_delivery_mode := v_delivery.mode;
    IF v_delivery.mode = 'flat' THEN
      v_delivery_fee := COALESCE(v_delivery.flat_fee, 0);
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
    v_platform_fee := round(v_bid_amount * 0.05);
    v_delivery_fee := round(v_delivery_fee);
    v_seller_net := round(v_bid_amount - v_platform_fee + v_delivery_fee);
  ELSE
    v_platform_fee := round(v_bid_amount * 0.05, 2);
    v_delivery_fee := round(v_delivery_fee, 2);
    v_seller_net := round(v_bid_amount - v_platform_fee + v_delivery_fee, 2);
  END IF;

  UPDATE public.live_products
     SET status = 'sold',
         sold_to_identity = v_bid_winner_name,
         sold_at = now(),
         current_bidder_id = v_bid_winner_id,
         current_bidder_name = v_bid_winner_name,
         price = v_bid_amount,
         auction_deadline_at = NULL
   WHERE id = _product_id;

  SELECT * INTO v_order
    FROM public.orders
   WHERE product_id = _product_id AND kind = 'auction' AND auction_round = v_round
   ORDER BY created_at DESC LIMIT 1;

  IF v_order.id IS NOT NULL AND v_order.status = 'paid' THEN
    RETURN;
  END IF;

  IF v_order.id IS NULL OR v_order.status NOT IN ('pending', 'paid') THEN
    INSERT INTO public.orders (
      buyer_id, seller_id, live_id, product_id, kind,
      item_name, item_image, amount, platform_fee, processing_fee,
      seller_net, total, currency, status, payment_method,
      payment_deadline, auction_round,
      delivery_fee, delivery_mode, delivery_zone, address_id, address_snapshot
    ) VALUES (
      v_bid_winner_id, v_live.seller_id, _live_id, _product_id, 'auction',
      v_product.name, v_product.image_url, v_bid_amount, v_platform_fee, 0,
      v_seller_net, v_bid_amount + v_delivery_fee, v_currency, 'pending', 'card',
      now() + interval '24 hours', v_round,
      v_delivery_fee, v_delivery_mode, v_delivery_zone, v_address_id, v_address_snapshot
    ) RETURNING * INTO v_order;
  END IF;

  IF v_order.status = 'pending' THEN
    SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_bid_winner_id FOR UPDATE;
    IF v_wallet.user_id IS NOT NULL
       AND upper(v_wallet.currency) = v_currency
       AND v_wallet.balance >= v_order.total THEN
      v_new_balance := v_wallet.balance - v_order.total;
      UPDATE public.wallets SET balance = v_new_balance, updated_at = now()
       WHERE user_id = v_bid_winner_id;
      UPDATE public.orders
         SET status = 'paid', payment_method = 'wallet', paid_at = now()
       WHERE id = v_order.id AND status = 'pending';
      IF FOUND THEN
        INSERT INTO public.wallet_transactions
          (user_id, type, amount, balance_after, order_id, status)
        VALUES
          (v_bid_winner_id, 'purchase', -v_order.total, v_new_balance, v_order.id, 'completed');
        PERFORM public.credit_seller_earning(v_order.id);
      END IF;
    END IF;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public._settle_expired_auction_row(uuid, uuid) FROM public;
-- Keep internal: only callable from settle_expired_auctions (same owner).

REVOKE ALL ON FUNCTION public.settle_expired_auctions(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.settle_expired_auctions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.settle_expired_auctions(uuid) TO service_role;
