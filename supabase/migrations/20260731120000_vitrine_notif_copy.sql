-- Clearer like/comment Activity copy + ensure notify triggers are present.
-- Titles already include the actor name; like body was generic ("Quelqu'un...").

CREATE OR REPLACE FUNCTION public.vitrine_notify_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_actor_name text;
BEGIN
  SELECT user_id INTO v_owner FROM public.vitrine_posts WHERE id = NEW.post_id;
  IF v_owner IS NULL OR v_owner = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(trim(display_name), ''), NULLIF(trim(handle), ''), 'Quelqu''un')
    INTO v_actor_name
  FROM public.profiles WHERE id = NEW.user_id;

  INSERT INTO public.notifications (user_id, kind, title, body, data)
  VALUES (
    v_owner,
    'vitrine_like',
    v_actor_name || ' a aimé ta publication',
    v_actor_name || ' a aimé ton post sur la Vitrine.',
    jsonb_build_object(
      'kind', 'vitrine',
      'post_id', NEW.post_id,
      'actor_id', NEW.user_id
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vitrine_notify_like ON public.vitrine_likes;
CREATE TRIGGER trg_vitrine_notify_like
  AFTER INSERT ON public.vitrine_likes
  FOR EACH ROW EXECUTE FUNCTION public.vitrine_notify_like();

CREATE OR REPLACE FUNCTION public.vitrine_notify_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_actor_name text;
  v_preview text;
BEGIN
  SELECT user_id INTO v_owner FROM public.vitrine_posts WHERE id = NEW.post_id;
  IF v_owner IS NULL OR v_owner = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(trim(display_name), ''), NULLIF(trim(handle), ''), 'Quelqu''un')
    INTO v_actor_name
  FROM public.profiles WHERE id = NEW.user_id;

  v_preview := left(trim(NEW.body), 120);

  INSERT INTO public.notifications (user_id, kind, title, body, data)
  VALUES (
    v_owner,
    'vitrine_comment',
    v_actor_name || ' a commenté ta publication',
    CASE
      WHEN v_preview IS NULL OR length(v_preview) = 0 THEN v_actor_name || ' a laissé un commentaire.'
      ELSE v_preview
    END,
    jsonb_build_object(
      'kind', 'vitrine',
      'post_id', NEW.post_id,
      'comment_id', NEW.id,
      'actor_id', NEW.user_id
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vitrine_notify_comment ON public.vitrine_comments;
CREATE TRIGGER trg_vitrine_notify_comment
  AFTER INSERT ON public.vitrine_comments
  FOR EACH ROW EXECUTE FUNCTION public.vitrine_notify_comment();
