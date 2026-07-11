-- Fix round mismatch: relaunch should NOT bump the round.
-- Only start_auction advances the round exactly once per auction start.
-- Prior code double-bumped (relaunch +1, then start +1), and any bid that
-- landed between those two calls would carry a mid-round number that never
-- matched the round the winner was finalized under.

CREATE OR REPLACE FUNCTION public.relaunch_unsold_product(_product_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_product public.live_products;
  v_live public.lives;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;
  SELECT * INTO v_product FROM public.live_products WHERE id = _product_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  SELECT * INTO v_live FROM public.lives WHERE id = v_product.live_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'live_not_found'); END IF;
  IF v_live.seller_id <> v_caller
     AND NOT public.is_admin(v_caller)
     AND NOT EXISTS (
       SELECT 1 FROM public.live_moderators
        WHERE live_id = v_product.live_id AND user_id = v_caller
     ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF v_product.status <> 'unsold' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_unsold');
  END IF;
  -- Reset to 'upcoming'. Do NOT bump auction_round here — start_auction
  -- owns the single round increment when the auction actually starts.
  UPDATE public.live_products
     SET status = 'upcoming',
         sold_to_identity = NULL,
         final_price = NULL,
         price = start_price,
         auction_deadline_at = NULL,
         position = (SELECT COALESCE(MAX(position), -1) + 1 FROM public.live_products WHERE live_id = v_product.live_id)
   WHERE id = _product_id;
  RETURN jsonb_build_object('ok', true);
END;
$function$;