CREATE OR REPLACE FUNCTION public.admin_list_payouts(_status text DEFAULT NULL::text, _limit integer DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_rows jsonb;
BEGIN
  PERFORM public._assert_admin();
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT po.id, po.seller_id, po.amount, po.currency, po.method, po.destination,
           po.status, po.note, po.admin_note, po.proof_url, po.processed_by,
           po.requested_at, po.processed_at, COALESCE(po.source,'seller') AS source,
           po.paypal_batch_id, po.paypal_error,
           p.handle AS seller_handle, p.display_name AS seller_name, p.avatar_url AS seller_avatar
    FROM public.payouts po
    LEFT JOIN public.profiles p ON p.id = po.seller_id
    WHERE _status IS NULL OR po.status = _status
    ORDER BY
      CASE WHEN po.status IN ('requested','processing') THEN 0 ELSE 1 END,
      CASE WHEN po.status IN ('requested','processing') THEN po.requested_at END ASC,
      po.processed_at DESC NULLS LAST,
      po.requested_at DESC
    LIMIT GREATEST(_limit,1)
  ) t;
  RETURN jsonb_build_object('rows', v_rows);
END;
$function$;