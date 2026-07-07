
CREATE OR REPLACE FUNCTION public.place_live_bid(
  _live_id uuid,
  _product_id uuid,
  _bidder_name text,
  _amount numeric DEFAULT NULL
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
  v_current numeric;
  v_step numeric;
  v_min_next numeric;
  v_next numeric;
  v_bid_id uuid;
  v_currency text;
  v_cap numeric;
  v_bidder_name text := coalesce(nullif(trim(coalesce(_bidder_name, '')), ''), 'invité');
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  SELECT * INTO v_product
    FROM public.live_products
   WHERE id = _product_id AND live_id = _live_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'product_not_found');
  END IF;

  SELECT * INTO v_live FROM public.lives WHERE id = _live_id;
  IF NOT FOUND OR v_live.status <> 'live' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'live_not_active');
  END IF;

  IF v_product.mode <> 'auction' OR v_product.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auction_not_active');
  END IF;

  SELECT bidder_id, amount INTO v_last_bidder, v_highest_amount
    FROM public.live_bids
   WHERE product_id = _product_id
   ORDER BY amount DESC, created_at DESC
   LIMIT 1;

  IF v_last_bidder = v_user THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'already_highest',
      'current_price', greatest(v_product.price, coalesce(v_highest_amount, v_product.price))
    );
  END IF;

  v_current := greatest(v_product.price, coalesce(v_highest_amount, v_product.price));
  v_currency := upper(coalesce(v_live.currency, 'EUR'));
  v_step := CASE v_currency
    WHEN 'XOF' THEN CASE WHEN v_current < 5000 THEN 250 ELSE 500 END
    WHEN 'CAD' THEN 1
    ELSE CASE WHEN v_current < 10 THEN 0.5 ELSE 1 END
  END;
  v_min_next := v_current + v_step;

  -- Cap: max(100 × start_price, currency floor) to allow tiny-start auctions to grow.
  v_cap := greatest(
    coalesce(v_product.start_price, 0) * 100,
    CASE v_currency WHEN 'XOF' THEN 1000000 WHEN 'CAD' THEN 3000 ELSE 2000 END
  );

  IF _amount IS NULL THEN
    v_next := v_min_next;
  ELSE
    v_next := _amount;
    IF v_currency = 'XOF' THEN
      v_next := round(v_next);
    ELSE
      v_next := round(v_next * 100) / 100;
    END IF;

    IF v_next < v_min_next THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'price_changed',
        'current_price', v_current,
        'min_next', v_min_next
      );
    END IF;

    IF v_next > v_cap THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'above_cap',
        'max_amount', v_cap
      );
    END IF;
  END IF;

  IF v_currency = 'XOF' THEN
    v_next := round(v_next);
  ELSE
    v_next := round(v_next * 100) / 100;
  END IF;

  INSERT INTO public.live_bids (live_id, product_id, bidder_id, bidder_name, amount)
  VALUES (_live_id, _product_id, v_user, v_bidder_name, v_next)
  RETURNING id INTO v_bid_id;

  UPDATE public.live_products SET price = v_next WHERE id = _product_id;

  RETURN jsonb_build_object(
    'ok', true,
    'bid_id', v_bid_id,
    'amount', v_next,
    'bidder_id', v_user,
    'bidder_name', v_bidder_name
  );
END;
$function$;
