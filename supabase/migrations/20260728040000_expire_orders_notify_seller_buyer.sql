-- When a pending order passes its payment_deadline:
-- 1) cancel as payment_timeout + restore stock (existing behaviour)
-- 2) notify the seller that the buyer never paid
-- 3) notify the buyer that they can no longer pay

CREATE OR REPLACE FUNCTION public.expire_overdue_orders()
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row RECORD;
  v_count int := 0;
  v_live_status text;
  v_product public.live_products;
  v_item text;
BEGIN
  FOR v_row IN
    SELECT id, product_id, live_id, kind, seller_id, buyer_id, item_name
      FROM public.orders
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

    v_item := coalesce(NULLIF(trim(v_row.item_name), ''), 'Un article');

    -- Seller: buyer did not pay within 24h
    IF v_row.seller_id IS NOT NULL AND v_row.seller_id IS DISTINCT FROM v_row.buyer_id THEN
      BEGIN
        PERFORM public._push_notification(
          v_row.seller_id,
          'payment_timeout',
          'Acheteur non payé',
          v_item || ' — l''acheteur n''a pas payé dans les 24 h. La commande est annulée.',
          v_row.id,
          jsonb_build_object(
            'kind', 'order',
            'order_id', v_row.id,
            'reason', 'payment_timeout',
            'role', 'seller'
          )
        );
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;

    -- Buyer: can no longer pay
    IF v_row.buyer_id IS NOT NULL THEN
      BEGIN
        PERFORM public._push_notification(
          v_row.buyer_id,
          'payment_timeout',
          'Délai de paiement dépassé',
          CASE
            WHEN v_row.kind = 'auction' THEN
              v_item || ' — plus de 24 h se sont écoulées. Tu ne peux plus payer cette enchère.'
            ELSE
              v_item || ' — plus de 24 h se sont écoulées. Tu ne peux plus payer cette commande.'
          END,
          v_row.id,
          jsonb_build_object(
            'kind', 'order',
            'order_id', v_row.id,
            'reason', 'payment_timeout',
            'role', 'buyer'
          )
        );
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;

    v_count := v_count + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'expired', v_count);
END;
$$;
