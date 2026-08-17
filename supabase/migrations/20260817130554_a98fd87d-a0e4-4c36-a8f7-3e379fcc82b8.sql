ALTER TABLE public.vitrine_comments
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.vitrine_comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS vitrine_comments_parent_id_idx ON public.vitrine_comments(parent_id);

CREATE OR REPLACE FUNCTION public.vitrine_notify_comment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
  v_owner_language text;
  v_parent_author uuid;
  v_parent_language text;
  v_actor_name text;
  v_preview text;
BEGIN
  SELECT p.user_id, COALESCE(pr.language, 'fr')
    INTO v_owner, v_owner_language
  FROM public.vitrine_posts p
  LEFT JOIN public.profiles pr ON pr.id = p.user_id
  WHERE p.id = NEW.post_id;

  SELECT COALESCE(NULLIF(trim(display_name), ''), NULLIF(trim(handle), ''), 'Quelqu''un')
    INTO v_actor_name
  FROM public.profiles
  WHERE id = NEW.user_id;

  v_preview := left(trim(NEW.body), 120);

  IF NEW.parent_id IS NOT NULL THEN
    SELECT c.user_id, COALESCE(pr.language, 'fr')
      INTO v_parent_author, v_parent_language
    FROM public.vitrine_comments c
    LEFT JOIN public.profiles pr ON pr.id = c.user_id
    WHERE c.id = NEW.parent_id;

    IF v_parent_author IS NOT NULL AND v_parent_author <> NEW.user_id THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = v_parent_author
          AND n.kind = 'vitrine_comment_reply'
          AND n.data ->> 'comment_id' = NEW.id::text
      ) THEN
        PERFORM public._push_notification(
          v_parent_author,
          'vitrine_comment_reply',
          CASE WHEN v_parent_language = 'en' THEN 'New reply' ELSE 'Nouvelle réponse' END,
          CASE
            WHEN v_preview IS NULL OR length(v_preview) = 0 THEN
              CASE WHEN v_parent_language = 'en'
                THEN COALESCE(v_actor_name, 'Someone') || ' replied to your comment.'
                ELSE COALESCE(v_actor_name, 'Quelqu''un') || ' a répondu à votre commentaire.' END
            ELSE COALESCE(v_actor_name, 'Quelqu''un') || ': ' || v_preview
          END,
          NULL,
          jsonb_build_object(
            'kind', 'vitrine',
            'post_id', NEW.post_id,
            'comment_id', NEW.id,
            'parent_comment_id', NEW.parent_id,
            'actor_id', NEW.user_id,
            'open_comments', '1'
          )
        );
      END IF;
    END IF;
  END IF;

  IF v_owner IS NULL OR v_owner = NEW.user_id OR (NEW.parent_id IS NOT NULL AND v_owner = v_parent_author) THEN
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

  v_actor_name := COALESCE(
    v_actor_name,
    CASE WHEN v_owner_language = 'en' THEN 'Someone' ELSE 'Quelqu''un' END
  );

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
$function$;