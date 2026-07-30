-- Vitrine engagement: notify owners on like/comment + public media bucket.
-- Additive only — does not touch wallet/orders/auctions/auth.

-- ========== Storage: vitrine-media ==========
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'vitrine-media',
  'vitrine-media',
  true,
  104857600, -- 100 MiB
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/quicktime', 'video/webm'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "vitrine-media public read" ON storage.objects;
CREATE POLICY "vitrine-media public read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'vitrine-media');

DROP POLICY IF EXISTS "vitrine-media insert own" ON storage.objects;
CREATE POLICY "vitrine-media insert own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'vitrine-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "vitrine-media update own" ON storage.objects;
CREATE POLICY "vitrine-media update own"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'vitrine-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'vitrine-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "vitrine-media delete own" ON storage.objects;
CREATE POLICY "vitrine-media delete own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'vitrine-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ========== Notify post owner on like ==========
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
    'Quelqu''un a aimé ton post sur la Vitrine.',
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

-- ========== Notify post owner on comment ==========
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
    v_preview,
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
