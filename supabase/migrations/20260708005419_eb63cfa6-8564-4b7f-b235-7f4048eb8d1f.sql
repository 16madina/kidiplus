
CREATE OR REPLACE FUNCTION public.admin_list_orders(_status text DEFAULT NULL::text, _limit integer DEFAULT 50, _offset integer DEFAULT 0)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_rows jsonb; v_total bigint;
BEGIN
  PERFORM public._assert_admin();
  SELECT COUNT(*) INTO v_total FROM public.orders WHERE _status IS NULL OR status = _status;
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT o.id, o.item_name, o.item_image, o.amount, o.total, o.platform_fee, o.seller_net,
           o.currency, o.status, o.kind, o.payment_method, o.created_at, o.paid_at,
           o.payment_deadline, o.cancelled_reason,
           o.buyer_id, o.seller_id, o.live_id,
           b.handle AS buyer_handle, s.handle AS seller_handle
    FROM public.orders o
    LEFT JOIN public.profiles b ON b.id = o.buyer_id
    LEFT JOIN public.profiles s ON s.id = o.seller_id
    WHERE _status IS NULL OR o.status = _status
    ORDER BY o.created_at DESC
    LIMIT GREATEST(_limit,1) OFFSET GREATEST(_offset,0)
  ) t;
  RETURN jsonb_build_object('rows', v_rows, 'total', v_total);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_user_detail(_user_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_profile jsonb; v_wallet jsonb; v_seller jsonb;
  v_orders jsonb; v_lives jsonb; v_wallet_tx jsonb; v_earnings jsonb;
  v_unpaid_timeouts int;
BEGIN
  PERFORM public._assert_admin();
  SELECT to_jsonb(p) INTO v_profile FROM public.profiles p WHERE p.id = _user_id;
  IF v_profile IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'user_not_found'); END IF;

  SELECT to_jsonb(w) INTO v_wallet FROM public.wallets w WHERE w.user_id = _user_id;
  SELECT to_jsonb(sb) INTO v_seller FROM public.seller_balances sb WHERE sb.seller_id = _user_id;

  SELECT COUNT(*) INTO v_unpaid_timeouts
    FROM public.orders
   WHERE buyer_id = _user_id AND status = 'cancelled' AND cancelled_reason = 'payment_timeout';

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::jsonb) INTO v_orders
  FROM (
    SELECT id, item_name, amount, total, currency, status, kind, payment_method,
           created_at, paid_at, payment_deadline, cancelled_reason, buyer_id, seller_id
    FROM public.orders WHERE buyer_id = _user_id OR seller_id = _user_id
    ORDER BY created_at DESC LIMIT 30
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.started_at DESC), '[]'::jsonb) INTO v_lives
  FROM (SELECT id, title, status, viewer_count, started_at, ended_at, currency
        FROM public.lives WHERE seller_id = _user_id ORDER BY started_at DESC LIMIT 20) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::jsonb) INTO v_wallet_tx
  FROM (SELECT id, type, amount, balance_after, status, created_at, order_id
        FROM public.wallet_transactions WHERE user_id = _user_id ORDER BY created_at DESC LIMIT 30) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::jsonb) INTO v_earnings
  FROM (SELECT id, order_id, amount, balance_after, created_at
        FROM public.seller_earnings WHERE seller_id = _user_id ORDER BY created_at DESC LIMIT 30) t;

  RETURN jsonb_build_object(
    'ok', true, 'profile', v_profile, 'wallet', v_wallet, 'seller_balance', v_seller,
    'orders', v_orders, 'lives', v_lives, 'wallet_transactions', v_wallet_tx,
    'earnings', v_earnings, 'unpaid_timeouts', v_unpaid_timeouts
  );
END;
$function$;
