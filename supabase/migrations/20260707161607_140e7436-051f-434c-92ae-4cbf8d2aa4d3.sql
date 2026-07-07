
-- =========================================================================
-- Admin dashboard read RPCs. All SECURITY DEFINER, gated on is_admin().
-- Return JSONB so the client gets aggregate shapes without pulling raw rows.
-- =========================================================================

-- Helper: assert caller is admin, else raise.
CREATE OR REPLACE FUNCTION public._assert_admin()
RETURNS void
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public._assert_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._assert_admin() TO authenticated;

-- =========================================================================
-- admin_overview_stats() — top-level KPIs.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.admin_overview_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month_start timestamptz := date_trunc('month', now());
  v_week_start  timestamptz := date_trunc('week',  now());
  v_gmv jsonb;
  v_gmv_month jsonb;
  v_revenue jsonb;
  v_revenue_month jsonb;
  v_wallet_float jsonb;
  v_seller_liability jsonb;
  v_orders_daily jsonb;
  v_counts jsonb;
  v_pending_payouts jsonb;
BEGIN
  PERFORM public._assert_admin();

  SELECT jsonb_object_agg(currency, total) INTO v_gmv
  FROM (SELECT currency, COALESCE(SUM(total),0) AS total FROM public.orders WHERE status='paid' GROUP BY currency) s;

  SELECT jsonb_object_agg(currency, total) INTO v_gmv_month
  FROM (SELECT currency, COALESCE(SUM(total),0) AS total FROM public.orders WHERE status='paid' AND paid_at >= v_month_start GROUP BY currency) s;

  SELECT jsonb_object_agg(currency, total) INTO v_revenue
  FROM (SELECT currency, COALESCE(SUM(platform_fee),0) AS total FROM public.orders WHERE status='paid' GROUP BY currency) s;

  SELECT jsonb_object_agg(currency, total) INTO v_revenue_month
  FROM (SELECT currency, COALESCE(SUM(platform_fee),0) AS total FROM public.orders WHERE status='paid' AND paid_at >= v_month_start GROUP BY currency) s;

  SELECT jsonb_object_agg(currency, total) INTO v_wallet_float
  FROM (SELECT currency, COALESCE(SUM(balance),0) AS total FROM public.wallets GROUP BY currency) s;

  SELECT jsonb_object_agg(currency, total) INTO v_seller_liability
  FROM (SELECT currency, COALESCE(SUM(available),0) AS total FROM public.seller_balances GROUP BY currency) s;

  SELECT jsonb_agg(row_to_json(t) ORDER BY t.day) INTO v_orders_daily
  FROM (
    SELECT
      to_char(d.day, 'YYYY-MM-DD') AS day,
      COALESCE(o.orders_count, 0)  AS orders,
      COALESCE(o.gmv_eur_ish, 0)   AS gmv
    FROM generate_series((now()::date - INTERVAL '13 days')::date, now()::date, INTERVAL '1 day') d(day)
    LEFT JOIN (
      SELECT date_trunc('day', paid_at)::date AS day,
             COUNT(*) AS orders_count,
             SUM(total) AS gmv_eur_ish
      FROM public.orders
      WHERE status='paid' AND paid_at >= (now() - INTERVAL '14 days')
      GROUP BY 1
    ) o ON o.day = d.day
  ) t;

  SELECT jsonb_build_object(
    'users_total',  (SELECT COUNT(*) FROM public.profiles),
    'sellers',      (SELECT COUNT(*) FROM public.profiles WHERE is_seller = true),
    'admins',       (SELECT COUNT(*) FROM public.profiles WHERE is_admin  = true),
    'new_this_week',(SELECT COUNT(*) FROM public.profiles WHERE created_at >= v_week_start),
    'lives_total',  (SELECT COUNT(*) FROM public.lives),
    'lives_live',   (SELECT COUNT(*) FROM public.lives WHERE status = 'live'),
    'orders_paid',  (SELECT COUNT(*) FROM public.orders WHERE status = 'paid')
  ) INTO v_counts;

  SELECT jsonb_build_object(
    'count',    COUNT(*),
    'by_currency', COALESCE(jsonb_object_agg(currency, total) FILTER (WHERE currency IS NOT NULL), '{}'::jsonb)
  ) INTO v_pending_payouts
  FROM (
    SELECT currency, SUM(amount) AS total
    FROM public.payouts
    WHERE status IN ('requested','processing')
    GROUP BY currency
  ) s;

  RETURN jsonb_build_object(
    'gmv',              COALESCE(v_gmv, '{}'::jsonb),
    'gmv_month',        COALESCE(v_gmv_month, '{}'::jsonb),
    'revenue',          COALESCE(v_revenue, '{}'::jsonb),
    'revenue_month',    COALESCE(v_revenue_month, '{}'::jsonb),
    'wallet_float',     COALESCE(v_wallet_float, '{}'::jsonb),
    'seller_liability', COALESCE(v_seller_liability, '{}'::jsonb),
    'pending_payouts',  COALESCE(v_pending_payouts, jsonb_build_object('count',0,'by_currency','{}'::jsonb)),
    'orders_daily',     COALESCE(v_orders_daily, '[]'::jsonb),
    'counts',           v_counts,
    'generated_at',     now()
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_overview_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_overview_stats() TO authenticated;

-- =========================================================================
-- admin_list_users(_search, _limit, _offset)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.admin_list_users(
  _search text DEFAULT NULL,
  _limit  int  DEFAULT 30,
  _offset int  DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows jsonb;
  v_total bigint;
  v_q text := NULLIF(trim(coalesce(_search,'')), '');
BEGIN
  PERFORM public._assert_admin();

  SELECT COUNT(*) INTO v_total
  FROM public.profiles p
  WHERE v_q IS NULL
     OR p.handle       ILIKE '%'||v_q||'%'
     OR p.display_name ILIKE '%'||v_q||'%'
     OR p.email        ILIKE '%'||v_q||'%';

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT
      p.id, p.email, p.display_name, p.handle, p.avatar_url, p.country,
      p.currency, p.is_seller, p.is_admin, p.created_at,
      COALESCE(w.balance, 0)                                      AS wallet_balance,
      COALESCE(w.currency, p.currency)                            AS wallet_currency,
      COALESCE(sb.available, 0)                                   AS seller_balance,
      COALESCE(sb.currency, p.currency)                           AS seller_currency,
      (SELECT COUNT(*) FROM public.orders o WHERE o.buyer_id  = p.id AND o.status='paid') AS orders_count,
      (SELECT COUNT(*) FROM public.orders o WHERE o.seller_id = p.id AND o.status='paid') AS sales_count
    FROM public.profiles p
    LEFT JOIN public.wallets         w  ON w.user_id   = p.id
    LEFT JOIN public.seller_balances sb ON sb.seller_id = p.id
    WHERE v_q IS NULL
       OR p.handle       ILIKE '%'||v_q||'%'
       OR p.display_name ILIKE '%'||v_q||'%'
       OR p.email        ILIKE '%'||v_q||'%'
    ORDER BY p.created_at DESC
    LIMIT GREATEST(_limit, 1) OFFSET GREATEST(_offset, 0)
  ) t;

  RETURN jsonb_build_object('rows', v_rows, 'total', v_total);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_users(text,int,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users(text,int,int) TO authenticated;

-- =========================================================================
-- admin_user_detail(_user_id)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.admin_user_detail(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile jsonb;
  v_wallet jsonb;
  v_seller jsonb;
  v_orders jsonb;
  v_lives jsonb;
  v_wallet_tx jsonb;
  v_earnings jsonb;
BEGIN
  PERFORM public._assert_admin();

  SELECT to_jsonb(p) INTO v_profile FROM public.profiles p WHERE p.id = _user_id;
  IF v_profile IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  SELECT to_jsonb(w) INTO v_wallet         FROM public.wallets         w  WHERE w.user_id   = _user_id;
  SELECT to_jsonb(sb) INTO v_seller        FROM public.seller_balances sb WHERE sb.seller_id = _user_id;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::jsonb) INTO v_orders
  FROM (
    SELECT id, item_name, amount, total, currency, status, kind, payment_method, created_at, paid_at,
           buyer_id, seller_id
    FROM public.orders
    WHERE buyer_id = _user_id OR seller_id = _user_id
    ORDER BY created_at DESC
    LIMIT 30
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.started_at DESC), '[]'::jsonb) INTO v_lives
  FROM (
    SELECT id, title, status, viewer_count, started_at, ended_at, currency
    FROM public.lives WHERE seller_id = _user_id
    ORDER BY started_at DESC LIMIT 20
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::jsonb) INTO v_wallet_tx
  FROM (
    SELECT id, type, amount, balance_after, status, created_at, order_id
    FROM public.wallet_transactions WHERE user_id = _user_id
    ORDER BY created_at DESC LIMIT 30
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::jsonb) INTO v_earnings
  FROM (
    SELECT id, order_id, amount, balance_after, created_at
    FROM public.seller_earnings WHERE seller_id = _user_id
    ORDER BY created_at DESC LIMIT 30
  ) t;

  RETURN jsonb_build_object(
    'ok', true,
    'profile', v_profile,
    'wallet', v_wallet,
    'seller_balance', v_seller,
    'orders', v_orders,
    'lives', v_lives,
    'wallet_transactions', v_wallet_tx,
    'earnings', v_earnings
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_user_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_user_detail(uuid) TO authenticated;

-- =========================================================================
-- admin_list_payouts(_status)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.admin_list_payouts(
  _status text DEFAULT NULL,
  _limit  int  DEFAULT 200
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_rows jsonb;
BEGIN
  PERFORM public._assert_admin();
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT po.id, po.seller_id, po.amount, po.currency, po.method, po.destination,
           po.status, po.note, po.requested_at, po.processed_at,
           p.handle AS seller_handle, p.display_name AS seller_name, p.avatar_url AS seller_avatar
    FROM public.payouts po
    LEFT JOIN public.profiles p ON p.id = po.seller_id
    WHERE _status IS NULL OR po.status = _status
    ORDER BY
      CASE WHEN po.status IN ('requested','processing') THEN 0 ELSE 1 END,
      po.requested_at ASC
    LIMIT GREATEST(_limit,1)
  ) t;
  RETURN jsonb_build_object('rows', v_rows);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_payouts(text,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_payouts(text,int) TO authenticated;

-- =========================================================================
-- admin_list_orders(_status, _limit, _offset)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.admin_list_orders(
  _status text DEFAULT NULL,
  _limit  int  DEFAULT 50,
  _offset int  DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_rows jsonb; v_total bigint;
BEGIN
  PERFORM public._assert_admin();
  SELECT COUNT(*) INTO v_total FROM public.orders WHERE _status IS NULL OR status = _status;
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT o.id, o.item_name, o.item_image, o.amount, o.total, o.platform_fee, o.seller_net,
           o.currency, o.status, o.kind, o.payment_method, o.created_at, o.paid_at,
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
$$;
REVOKE ALL ON FUNCTION public.admin_list_orders(text,int,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_orders(text,int,int) TO authenticated;

-- =========================================================================
-- admin_list_lives(_status, _limit)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.admin_list_lives(
  _status text DEFAULT NULL,
  _limit  int  DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_rows jsonb;
BEGIN
  PERFORM public._assert_admin();
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT l.id, l.title, l.category, l.cover_url, l.status, l.viewer_count,
           l.started_at, l.ended_at, l.currency, l.seller_id,
           p.handle AS seller_handle, p.display_name AS seller_name, p.avatar_url AS seller_avatar,
           (SELECT COUNT(*)             FROM public.orders o WHERE o.live_id = l.id AND o.status='paid') AS orders_count,
           (SELECT COALESCE(SUM(total),0) FROM public.orders o WHERE o.live_id = l.id AND o.status='paid') AS gmv
    FROM public.lives l
    LEFT JOIN public.profiles p ON p.id = l.seller_id
    WHERE _status IS NULL OR l.status = _status
    ORDER BY
      CASE WHEN l.status='live' THEN 0 ELSE 1 END,
      l.started_at DESC
    LIMIT GREATEST(_limit,1)
  ) t;
  RETURN jsonb_build_object('rows', v_rows);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_lives(text,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_lives(text,int) TO authenticated;
