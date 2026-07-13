CREATE OR REPLACE FUNCTION public.admin_referral_reconciliation()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_rows jsonb;
BEGIN
  PERFORM public._assert_admin();

  WITH ref AS (
    SELECT r.promo_code_id, r.referred_user_id
      FROM public.referrals r
  ),
  orders_agg AS (
    SELECT ref.promo_code_id,
           COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'paid')                AS paid_orders,
           COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'paid'
                                          AND (o.buyer_id  = ref.referred_user_id
                                            OR o.seller_id = ref.referred_user_id)) AS paid_orders_referred
      FROM ref
      LEFT JOIN public.orders o
        ON (o.buyer_id = ref.referred_user_id OR o.seller_id = ref.referred_user_id)
     GROUP BY ref.promo_code_id
  ),
  earn_agg AS (
    SELECT rr.promo_code_id,
           re.status,
           upper(re.currency) AS currency,
           SUM(re.amount)::numeric AS total,
           COUNT(*)::int AS n
      FROM public.referral_earnings re
      JOIN public.referrals rr ON rr.referred_user_id = re.referred_user_id
     GROUP BY rr.promo_code_id, re.status, upper(re.currency)
  ),
  earn_by_code AS (
    SELECT promo_code_id,
           jsonb_object_agg(
             status,
             totals
           ) AS by_status
      FROM (
        SELECT promo_code_id, status,
               jsonb_object_agg(currency, total) AS totals
          FROM earn_agg
         GROUP BY promo_code_id, status
      ) s
     GROUP BY promo_code_id
  ),
  earn_counts AS (
    SELECT promo_code_id, SUM(n)::int AS earning_rows
      FROM earn_agg GROUP BY promo_code_id
  ),
  ref_count AS (
    SELECT promo_code_id, COUNT(*)::int AS referred_count
      FROM public.referrals GROUP BY promo_code_id
  ),
  bal AS (
    SELECT owner_id, available, currency FROM public.referral_balances
  )
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_rows FROM (
    SELECT pc.id                              AS promo_code_id,
           pc.code                            AS code,
           pc.active                          AS active,
           pc.owner_id                        AS owner_id,
           p.handle                           AS owner_handle,
           p.display_name                     AS owner_name,
           p.avatar_url                       AS owner_avatar,
           pc.claimed_at                      AS claimed_at,
           COALESCE(rc.referred_count, 0)     AS referred_count,
           COALESCE(oa.paid_orders_referred,
                    oa.paid_orders, 0)        AS paid_orders,
           COALESCE(ec.by_status, '{}'::jsonb) AS credits_by_status,
           COALESCE(econ.earning_rows, 0)     AS earning_rows,
           b.available                        AS wallet_available,
           b.currency                         AS wallet_currency
      FROM public.promo_codes pc
      LEFT JOIN public.profiles   p    ON p.id = pc.owner_id
      LEFT JOIN ref_count         rc   ON rc.promo_code_id = pc.id
      LEFT JOIN orders_agg        oa   ON oa.promo_code_id = pc.id
      LEFT JOIN earn_by_code      ec   ON ec.promo_code_id = pc.id
      LEFT JOIN earn_counts       econ ON econ.promo_code_id = pc.id
      LEFT JOIN bal               b    ON b.owner_id = pc.owner_id
     ORDER BY pc.created_at DESC
  ) t;

  RETURN jsonb_build_object('rows', v_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_referral_reconciliation() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_referral_reconciliation() TO authenticated;