
CREATE OR REPLACE FUNCTION public.notify_live_reminders(_live_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seller uuid;
  v_title text;
  v_seller_name text;
  v_count integer := 0;
BEGIN
  SELECT l.seller_id, l.title INTO v_seller, v_title
  FROM public.lives l WHERE l.id = _live_id;
  IF v_seller IS NULL THEN
    RETURN 0;
  END IF;
  -- Only the seller of that live may fanout its reminders.
  IF v_seller <> auth.uid() THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(p.display_name, p.handle, 'Vendeur') INTO v_seller_name
  FROM public.profiles p WHERE p.id = v_seller;

  INSERT INTO public.notifications (user_id, kind, title, body, data)
  SELECT
    r.user_id,
    'live_started',
    COALESCE(v_seller_name, 'Vendeur') || ' est en direct !',
    v_title,
    jsonb_build_object('live_id', _live_id, 'seller_id', v_seller)
  FROM public.live_reminders r
  WHERE r.live_id = _live_id
    AND r.user_id <> v_seller;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  DELETE FROM public.live_reminders WHERE live_id = _live_id;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_live_reminders(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_live_reminders(uuid) TO authenticated;
