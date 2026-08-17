CREATE OR REPLACE FUNCTION public.vitrine_notify_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_owner_language text;
  v_actor_name text;
BEGIN
  SELECT p.user_id, COALESCE(pr.language, 'fr')
    INTO v_owner, v_owner_language
  FROM public.vitrine_posts p
  LEFT JOIN public.profiles pr ON pr.id = p.user_id
  WHERE p.id = NEW.post_id;

  IF v_owner IS NULL OR v_owner = NEW.user_id THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.notifications n
    WHERE n.user_id = v_owner
      AND n.kind = 'vitrine_like'
      AND n.data ->> 'post_id' = NEW.post_id::text
      AND n.data ->> 'actor_id' = NEW.user_id::text
  ) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(trim(display_name), ''), NULLIF(trim(handle), ''),
                  CASE WHEN v_owner_language = 'en' THEN 'Someone' ELSE 'Quelqu''un' END)
    INTO v_actor_name
  FROM public.profiles
  WHERE id = NEW.user_id;

  v_actor_name := COALESCE(
    v_actor_name,
    CASE WHEN v_owner_language = 'en' THEN 'Someone' ELSE 'Quelqu''un' END
  );

  PERFORM public._push_notification(
    v_owner,
    'vitrine_like',
    CASE
      WHEN v_owner_language = 'en' THEN 'New like on your video'
      ELSE 'Nouveau j''aime sur votre vidéo'
    END,
    CASE
      WHEN v_owner_language = 'en' THEN v_actor_name || ' liked your video.'
      ELSE v_actor_name || ' a aimé votre vidéo.'
    END,
    NULL,
    jsonb_build_object(
      'kind', 'vitrine',
      'post_id', NEW.post_id,
      'actor_id', NEW.user_id
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'vitrine_notify_like failed for post %: %', NEW.post_id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vitrine_notify_like ON public.vitrine_likes;
CREATE TRIGGER trg_vitrine_notify_like
  AFTER INSERT ON public.vitrine_likes
  FOR EACH ROW
  EXECUTE FUNCTION public.vitrine_notify_like();

CREATE OR REPLACE FUNCTION public.vitrine_notify_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_owner_language text;
  v_actor_name text;
  v_preview text;
BEGIN
  SELECT p.user_id, COALESCE(pr.language, 'fr')
    INTO v_owner, v_owner_language
  FROM public.vitrine_posts p
  LEFT JOIN public.profiles pr ON pr.id = p.user_id
  WHERE p.id = NEW.post_id;

  IF v_owner IS NULL OR v_owner = NEW.user_id THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.notifications n
    WHERE n.user_id = v_owner
      AND n.kind = 'vitrine_comment'
      AND n.data ->> 'comment_id' = NEW.id::text
  ) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(trim(display_name), ''), NULLIF(trim(handle), ''),
                  CASE WHEN v_owner_language = 'en' THEN 'Someone' ELSE 'Quelqu''un' END)
    INTO v_actor_name
  FROM public.profiles
  WHERE id = NEW.user_id;

  v_actor_name := COALESCE(
    v_actor_name,
    CASE WHEN v_owner_language = 'en' THEN 'Someone' ELSE 'Quelqu''un' END
  );
  v_preview := left(trim(NEW.body), 120);

  PERFORM public._push_notification(
    v_owner,
    'vitrine_comment',
    CASE
      WHEN v_owner_language = 'en' THEN 'New comment on your video'
      ELSE 'Nouveau commentaire sur votre vidéo'
    END,
    CASE
      WHEN v_preview IS NULL OR length(v_preview) = 0 THEN
        CASE
          WHEN v_owner_language = 'en' THEN v_actor_name || ' commented on your video.'
          ELSE v_actor_name || ' a commenté votre vidéo.'
        END
      ELSE v_actor_name || ': ' || v_preview
    END,
    NULL,
    jsonb_build_object(
      'kind', 'vitrine',
      'post_id', NEW.post_id,
      'comment_id', NEW.id,
      'actor_id', NEW.user_id,
      'open_comments', '1'
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'vitrine_notify_comment failed for comment %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vitrine_notify_comment ON public.vitrine_comments;
CREATE TRIGGER trg_vitrine_notify_comment
  AFTER INSERT ON public.vitrine_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.vitrine_notify_comment();