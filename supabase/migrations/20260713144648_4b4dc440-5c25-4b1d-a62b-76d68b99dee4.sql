CREATE OR REPLACE FUNCTION public._notify_moderator_promoted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_host_name text;
  v_live_title text;
  v_seller_id uuid;
BEGIN
  SELECT COALESCE(NULLIF(trim(p.display_name), ''), NULLIF(trim(p.handle), ''), 'Un hôte')
  INTO v_host_name
  FROM public.profiles p
  WHERE p.id = NEW.added_by;

  SELECT l.title, l.seller_id
  INTO v_live_title, v_seller_id
  FROM public.lives l
  WHERE l.id = NEW.live_id;

  PERFORM public._push_notification(
    NEW.user_id,
    'moderator_promoted',
    v_host_name || ' t''a ajouté comme modérateur 🛡️',
    'Tu peux aider à gérer les produits sur « '
      || COALESCE(NULLIF(trim(v_live_title), ''), 'son live')
      || ' ». Ouvre le live pour commencer.',
    NULL,
    jsonb_build_object(
      'kind', 'live',
      'live_id', NEW.live_id,
      'seller_id', COALESCE(v_seller_id, NEW.added_by)
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_live_moderators_notify ON public.live_moderators;
CREATE TRIGGER trg_live_moderators_notify
AFTER INSERT ON public.live_moderators
FOR EACH ROW
EXECUTE FUNCTION public._notify_moderator_promoted();