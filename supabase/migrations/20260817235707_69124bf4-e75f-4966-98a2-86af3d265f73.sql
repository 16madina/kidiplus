CREATE OR REPLACE FUNCTION public.start_auction(_product_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_row public.live_products;
  v_live public.lives;
  v_deadline timestamptz;
  v_new_round int;
  v_other uuid;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  SELECT * INTO v_row FROM public.live_products WHERE id = _product_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'product_not_found');
  END IF;

  SELECT * INTO v_live FROM public.lives WHERE id = v_row.live_id;
  IF NOT FOUND
     OR (
       v_live.seller_id <> v_caller
       AND NOT public.is_admin(v_caller)
       AND NOT public.is_live_moderator(v_live.id, v_caller)
     )
     OR public.is_battle_opponent_of_live(v_live.id, v_caller) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF v_live.status <> 'live' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'live_not_active');
  END IF;

  IF v_row.mode <> 'auction' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_auction');
  END IF;

  SELECT id INTO v_other
    FROM public.live_products
   WHERE live_id = v_row.live_id
     AND mode = 'auction'
     AND status = 'active'
     AND id <> _product_id
     AND auction_deadline_at IS NOT NULL
     AND auction_deadline_at > now()
   LIMIT 1;

  IF v_other IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auction_already_running');
  END IF;

  v_deadline := now() + make_interval(secs => GREATEST(COALESCE(v_row.timer_seconds, 30), 5));
  v_new_round := COALESCE(v_row.auction_round, 1) + 1;

  UPDATE public.live_products
     SET status = 'active',
         price = v_row.start_price,
         final_price = NULL,
         sold_to_identity = NULL,
         auction_deadline_at = v_deadline,
         auction_round = v_new_round
   WHERE id = _product_id;

  RETURN jsonb_build_object(
    'ok', true,
    'deadline_ms', (EXTRACT(EPOCH FROM v_deadline) * 1000)::bigint,
    'timer_sec', GREATEST(COALESCE(v_row.timer_seconds, 30), 5),
    'auction_round', v_new_round
  );
END;
$function$;