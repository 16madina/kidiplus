
ALTER TABLE public.live_products
  ADD COLUMN IF NOT EXISTS auction_deadline_at timestamptz;

-- Rewrite startAuctionInDb's server counterpart so it stores the deadline
-- atomically and returns the absolute epoch milliseconds. We keep the old
-- name so the client can call rpc('start_auction', { ... }) — the previous
-- client updates were plain UPDATEs, but going through an RPC lets us
-- return the deadline in a single round-trip.
CREATE OR REPLACE FUNCTION public.start_auction(_product_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_row public.live_products;
  v_live public.lives;
  v_deadline timestamptz;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;
  SELECT * INTO v_row FROM public.live_products WHERE id = _product_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'product_not_found');
  END IF;
  SELECT * INTO v_live FROM public.lives WHERE id = v_row.live_id;
  IF NOT FOUND OR (v_live.seller_id <> v_caller AND NOT public.is_admin(v_caller)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  v_deadline := now() + make_interval(secs => v_row.timer_seconds);
  UPDATE public.live_products
     SET status = 'active',
         price = v_row.start_price,
         final_price = NULL,
         sold_to_identity = NULL,
         auction_deadline_at = v_deadline
   WHERE id = _product_id;
  RETURN jsonb_build_object(
    'ok', true,
    'deadline_ms', (EXTRACT(EPOCH FROM v_deadline) * 1000)::bigint,
    'timer_sec', v_row.timer_seconds
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_auction(uuid) TO authenticated;
