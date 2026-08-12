
DO $$
DECLARE
  v_seller uuid := '46529427-345b-4abc-9fb0-caa2d5392879';
  v_orders uuid[];
BEGIN
  SELECT coalesce(array_agg(id), '{}') INTO v_orders
    FROM public.orders WHERE seller_id = v_seller;

  -- Rows referencing those orders
  DELETE FROM public.order_events      WHERE order_id = ANY(v_orders);
  DELETE FROM public.seller_reviews    WHERE order_id = ANY(v_orders);
  DELETE FROM public.referral_earnings WHERE order_id = ANY(v_orders);
  DELETE FROM public.notifications     WHERE order_id = ANY(v_orders);
  UPDATE public.wallet_transactions SET order_id = NULL WHERE order_id = ANY(v_orders);

  -- Seller money rows
  DELETE FROM public.seller_earnings WHERE seller_id = v_seller;
  DELETE FROM public.payouts         WHERE seller_id = v_seller;

  -- The seller's test orders
  DELETE FROM public.orders WHERE seller_id = v_seller;

  -- Reset balance (CAD)
  UPDATE public.seller_balances
     SET available = 0, pending = 0, currency = 'CAD', updated_at = now()
   WHERE seller_id = v_seller;

  IF NOT FOUND THEN
    INSERT INTO public.seller_balances (seller_id, available, pending, currency, updated_at)
    VALUES (v_seller, 0, 0, 'CAD', now());
  END IF;
END $$;
