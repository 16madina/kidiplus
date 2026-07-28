-- Harden auction close once and for all:
-- 1) Ensure columns referenced by finalize_auction_winner exist
-- 2) Never let order-insert / wallet autopay errors roll back the sale

ALTER TABLE public.live_products
  ADD COLUMN IF NOT EXISTS sold_at timestamptz,
  ADD COLUMN IF NOT EXISTS current_bidder_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS current_bidder_name text;

CREATE INDEX IF NOT EXISTS live_products_current_bidder_idx
  ON public.live_products (current_bidder_id)
  WHERE current_bidder_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.finalize_auction_winner(
  _live_id uuid,
  _product_id uuid,
  _winner_id uuid,
  _winner_name text,
  _final_price numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
  v_wallet_currency text;
  v_debit numeric;
  v_rate numeric;
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
    RETURN jsonb_build_object(
      'ok', true, 'order_id', NULL, 'auto_paid', false,
      'deadline', NULL, 'auction_round', v_round,
      'winner_id', NULL, 'winner_name', NULL, 'final_price', NULL
    );
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
    ELSIF v_delivery.mode = 'zones'
          AND v_addr.id IS NOT NULL
          AND v_addr.zone_or_commune IS NOT NULL
          AND jsonb_typeof(COALESCE(v_delivery.zones, '[]'::jsonb)) = 'array' THEN
      v_zone_country := upper(coalesce(v_addr.country, ''));
      SELECT z INTO v_matched_zone
        FROM jsonb_array_elements(COALESCE(v_delivery.zones, '[]'::jsonb)) z
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

  -- Mark sold FIRST so the auction always closes even if order/wallet fails.
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
      IF v_wallet.user_id IS NOT NULL THEN
        v_wallet_currency := upper(COALESCE(v_wallet.currency, v_currency));
        IF v_wallet_currency = v_currency THEN
          v_debit := v_order.total;
          v_rate := 1;
        ELSE
          v_debit := public.convert_money(v_order.total, v_currency, v_wallet_currency);
          v_rate := public.fx_rate(v_currency, v_wallet_currency);
        END IF;

        IF v_debit IS NOT NULL AND v_wallet.balance >= v_debit THEN
          v_new_balance := v_wallet.balance - v_debit;
          UPDATE public.wallets
             SET balance = v_new_balance, updated_at = now()
           WHERE user_id = v_resolved_winner_id;
          UPDATE public.orders
             SET status = 'paid', payment_method = 'wallet', paid_at = now()
           WHERE id = v_order.id AND status = 'pending';
          IF FOUND THEN
            INSERT INTO public.wallet_transactions
              (user_id, type, amount, balance_after, order_id, status, meta)
            VALUES
              (v_resolved_winner_id, 'purchase', -v_debit, v_new_balance, v_order.id, 'completed',
               jsonb_build_object(
                 'order_currency', v_currency,
                 'order_amount', v_order.total,
                 'wallet_currency', v_wallet_currency,
                 'wallet_amount', v_debit,
                 'rate', v_rate
               ));
            BEGIN
              PERFORM public.credit_seller_earning(v_order.id);
            EXCEPTION WHEN OTHERS THEN
              NULL;
            END;
            v_auto_paid := true;
          END IF;
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