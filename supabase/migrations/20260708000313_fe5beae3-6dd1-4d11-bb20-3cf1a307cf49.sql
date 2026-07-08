
-- 1) Add proof/note/processed_by columns to payouts
ALTER TABLE public.payouts
  ADD COLUMN IF NOT EXISTS proof_url    text,
  ADD COLUMN IF NOT EXISTS admin_note   text,
  ADD COLUMN IF NOT EXISTS processed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2) Extend admin_process_payout to accept proof_url + admin_note and record processed_by.
--    Keep the old 3-arg signature working; we replace it with a new 5-arg definition.
DROP FUNCTION IF EXISTS public.admin_process_payout(uuid, text, text);

CREATE OR REPLACE FUNCTION public.admin_process_payout(
  _payout_id uuid,
  _action    text,
  _note      text DEFAULT NULL,
  _proof_url text DEFAULT NULL,
  _admin_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_payout public.payouts;
BEGIN
  IF v_user IS NULL OR NOT public.is_admin(v_user) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF _action NOT IN ('paid','rejected') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_action');
  END IF;

  SELECT * INTO v_payout FROM public.payouts WHERE id = _payout_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'payout_not_found'); END IF;
  IF v_payout.status NOT IN ('requested','processing') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_processed');
  END IF;

  IF _action = 'paid' THEN
    UPDATE public.payouts
       SET status       = 'paid',
           processed_at = now(),
           processed_by = v_user,
           note         = COALESCE(_note, note),
           admin_note   = COALESCE(_admin_note, admin_note),
           proof_url    = COALESCE(_proof_url, proof_url)
     WHERE id = _payout_id;
  ELSE
    UPDATE public.seller_balances
       SET available = available + v_payout.amount,
           updated_at = now()
     WHERE seller_id = v_payout.seller_id;

    UPDATE public.payouts
       SET status       = 'rejected',
           processed_at = now(),
           processed_by = v_user,
           note         = COALESCE(_note, note),
           admin_note   = COALESCE(_admin_note, admin_note)
     WHERE id = _payout_id;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- 3) Update admin_list_payouts to include new columns
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
           po.requested_at, po.processed_at,
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
