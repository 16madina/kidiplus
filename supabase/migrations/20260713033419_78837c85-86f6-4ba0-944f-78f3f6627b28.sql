
CREATE OR REPLACE FUNCTION public.admin_referral_code_details(_promo_code_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows jsonb;
BEGIN
  PERFORM public._assert_admin();

  WITH ref AS (
    SELECT r.referred_user_id, r.owner_id, r.created_at AS referred_at
      FROM public.referrals r
     WHERE r.promo_code_id = _promo_code_id
  ),
  ord AS (
    SELECT o.id            AS order_id,
           o.buyer_id,
           o.seller_id,
           o.item_name,
           o.item_image,
           o.amount,
           o.platform_fee,
           o.total,
           o.currency,
           o.status,
           o.paid_at,
           o.created_at,
           CASE WHEN rb.referred_user_id IS NOT NULL THEN 'buyer'
                WHEN rs.referred_user_id IS NOT NULL THEN 'seller'
                ELSE NULL END AS referred_role,
           COALESCE(rb.referred_user_id, rs.referred_user_id) AS referred_user_id,
           pb.handle       AS buyer_handle,
           pb.display_name AS buyer_name,
           ps.handle       AS seller_handle,
           ps.display_name AS seller_name
      FROM public.orders o
      LEFT JOIN ref rb ON rb.referred_user_id = o.buyer_id
      LEFT JOIN ref rs ON rs.referred_user_id = o.seller_id
      LEFT JOIN public.profiles pb ON pb.id = o.buyer_id
      LEFT JOIN public.profiles ps ON ps.id = o.seller_id
     WHERE o.status = 'paid'
       AND (rb.referred_user_id IS NOT NULL OR rs.referred_user_id IS NOT NULL)
  ),
  earn AS (
    SELECT re.order_id,
           jsonb_agg(jsonb_build_object(
             'id', re.id,
             'amount', re.amount,
             'currency', upper(re.currency),
             'status', re.status,
             'referred_user_id', re.referred_user_id,
             'owner_id', re.owner_id,
             'created_at', re.created_at
           ) ORDER BY re.created_at) AS earnings
      FROM public.referral_earnings re
      JOIN ref rr ON rr.referred_user_id = re.referred_user_id
     GROUP BY re.order_id
  )
  SELECT COALESCE(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.paid_at DESC NULLS LAST, x.created_at DESC), '[]'::jsonb)
    INTO v_rows
    FROM (
      SELECT o.*, COALESCE(e.earnings, '[]'::jsonb) AS earnings
        FROM ord o
        LEFT JOIN earn e ON e.order_id = o.order_id
    ) x;

  RETURN jsonb_build_object('rows', v_rows);
END
$$;

REVOKE ALL ON FUNCTION public.admin_referral_code_details(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_referral_code_details(uuid) TO authenticated;
