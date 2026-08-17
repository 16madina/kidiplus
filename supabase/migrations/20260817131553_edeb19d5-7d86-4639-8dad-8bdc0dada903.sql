ALTER TABLE public.vitrine_comments ADD COLUMN IF NOT EXISTS like_count integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.vitrine_comment_likes (
  comment_id uuid NOT NULL REFERENCES public.vitrine_comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);

GRANT SELECT, INSERT, DELETE ON public.vitrine_comment_likes TO authenticated;
GRANT SELECT ON public.vitrine_comment_likes TO anon;
GRANT ALL ON public.vitrine_comment_likes TO service_role;

ALTER TABLE public.vitrine_comment_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vitrine_comment_likes_select ON public.vitrine_comment_likes;
CREATE POLICY vitrine_comment_likes_select ON public.vitrine_comment_likes FOR SELECT USING (true);

DROP POLICY IF EXISTS vitrine_comment_likes_insert_own ON public.vitrine_comment_likes;
CREATE POLICY vitrine_comment_likes_insert_own ON public.vitrine_comment_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS vitrine_comment_likes_delete_own ON public.vitrine_comment_likes;
CREATE POLICY vitrine_comment_likes_delete_own ON public.vitrine_comment_likes FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS vitrine_comment_likes_comment_idx ON public.vitrine_comment_likes(comment_id);

CREATE OR REPLACE FUNCTION public.vitrine_comment_likes_count_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.vitrine_comments SET like_count = like_count + 1 WHERE id = NEW.comment_id;
    RETURN NEW;
  ELSE
    UPDATE public.vitrine_comments SET like_count = GREATEST(0, like_count - 1) WHERE id = OLD.comment_id;
    RETURN OLD;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_vitrine_comment_likes_count ON public.vitrine_comment_likes;
CREATE TRIGGER trg_vitrine_comment_likes_count
AFTER INSERT OR DELETE ON public.vitrine_comment_likes
FOR EACH ROW EXECUTE FUNCTION public.vitrine_comment_likes_count_sync();

CREATE OR REPLACE FUNCTION public.vitrine_notify_comment_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author uuid;
  v_lang text;
  v_post uuid;
  v_actor_name text;
  v_preview text;
BEGIN
  SELECT c.user_id, c.post_id, left(trim(c.body), 80), COALESCE(pr.language, 'fr')
    INTO v_author, v_post, v_preview, v_lang
  FROM public.vitrine_comments c
  LEFT JOIN public.profiles pr ON pr.id = c.user_id
  WHERE c.id = NEW.comment_id;

  IF v_author IS NULL OR v_author = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(trim(display_name), ''), NULLIF(trim(handle), ''),
    CASE WHEN v_lang = 'en' THEN 'Someone' ELSE 'Quelqu''un' END)
    INTO v_actor_name
  FROM public.profiles WHERE id = NEW.user_id;

  IF EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.user_id = v_author
      AND n.kind = 'vitrine_comment_like'
      AND n.data ->> 'comment_id' = NEW.comment_id::text
      AND n.data ->> 'actor_id' = NEW.user_id::text
  ) THEN
    RETURN NEW;
  END IF;

  PERFORM public._push_notification(
    v_author,
    'vitrine_comment_like',
    CASE WHEN v_lang = 'en' THEN 'New like on your comment' ELSE 'J''aime sur votre commentaire' END,
    CASE
      WHEN v_preview IS NULL OR length(v_preview) = 0 THEN
        CASE WHEN v_lang = 'en'
          THEN COALESCE(v_actor_name, 'Someone') || ' liked your comment.'
          ELSE COALESCE(v_actor_name, 'Quelqu''un') || ' a aimé votre commentaire.' END
      ELSE
        CASE WHEN v_lang = 'en'
          THEN COALESCE(v_actor_name, 'Someone') || ' liked your comment: ' || v_preview
          ELSE COALESCE(v_actor_name, 'Quelqu''un') || ' a aimé votre commentaire : ' || v_preview END
    END,
    NULL,
    jsonb_build_object(
      'kind', 'vitrine',
      'post_id', v_post,
      'comment_id', NEW.comment_id,
      'actor_id', NEW.user_id,
      'open_comments', '1'
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'vitrine_notify_comment_like failed for comment %: %', NEW.comment_id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vitrine_notify_comment_like ON public.vitrine_comment_likes;
CREATE TRIGGER trg_vitrine_notify_comment_like
AFTER INSERT ON public.vitrine_comment_likes
FOR EACH ROW EXECUTE FUNCTION public.vitrine_notify_comment_like();