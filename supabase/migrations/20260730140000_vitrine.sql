-- Vitrine feed (additive only): posts, likes, comments, stories.
-- Does not alter wallet, orders, auctions, lives core, or auth tables.
-- live_reminders already exists — reuse it; do not recreate.

-- ========== vitrine_posts ==========
CREATE TABLE IF NOT EXISTS public.vitrine_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  media_type text NOT NULL DEFAULT 'image'
    CHECK (media_type IN ('image', 'video', 'carousel')),
  media_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  caption text NULL,
  product_id uuid NULL,
  live_id uuid NULL REFERENCES public.lives(id) ON DELETE SET NULL,
  like_count integer NOT NULL DEFAULT 0,
  comment_count integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vitrine_posts_active_created_idx
  ON public.vitrine_posts (active, created_at DESC)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS vitrine_posts_user_idx
  ON public.vitrine_posts (user_id, created_at DESC);

ALTER TABLE public.vitrine_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vitrine_posts public read active" ON public.vitrine_posts;
CREATE POLICY "vitrine_posts public read active"
  ON public.vitrine_posts FOR SELECT
  TO public
  USING (active = true);

DROP POLICY IF EXISTS "vitrine_posts insert own" ON public.vitrine_posts;
CREATE POLICY "vitrine_posts insert own"
  ON public.vitrine_posts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "vitrine_posts update own" ON public.vitrine_posts;
CREATE POLICY "vitrine_posts update own"
  ON public.vitrine_posts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "vitrine_posts delete own" ON public.vitrine_posts;
CREATE POLICY "vitrine_posts delete own"
  ON public.vitrine_posts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ========== vitrine_likes ==========
CREATE TABLE IF NOT EXISTS public.vitrine_likes (
  post_id uuid NOT NULL REFERENCES public.vitrine_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS vitrine_likes_user_idx
  ON public.vitrine_likes (user_id);

ALTER TABLE public.vitrine_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vitrine_likes public read" ON public.vitrine_likes;
CREATE POLICY "vitrine_likes public read"
  ON public.vitrine_likes FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "vitrine_likes insert own" ON public.vitrine_likes;
CREATE POLICY "vitrine_likes insert own"
  ON public.vitrine_likes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "vitrine_likes delete own" ON public.vitrine_likes;
CREATE POLICY "vitrine_likes delete own"
  ON public.vitrine_likes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Keep like_count in sync
CREATE OR REPLACE FUNCTION public.vitrine_likes_count_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.vitrine_posts
      SET like_count = like_count + 1, updated_at = now()
      WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.vitrine_posts
      SET like_count = GREATEST(0, like_count - 1), updated_at = now()
      WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_vitrine_likes_count ON public.vitrine_likes;
CREATE TRIGGER trg_vitrine_likes_count
  AFTER INSERT OR DELETE ON public.vitrine_likes
  FOR EACH ROW EXECUTE FUNCTION public.vitrine_likes_count_trg();

-- ========== vitrine_comments ==========
CREATE TABLE IF NOT EXISTS public.vitrine_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.vitrine_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(trim(body)) > 0 AND char_length(body) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vitrine_comments_post_idx
  ON public.vitrine_comments (post_id, created_at DESC);

ALTER TABLE public.vitrine_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vitrine_comments public read" ON public.vitrine_comments;
CREATE POLICY "vitrine_comments public read"
  ON public.vitrine_comments FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "vitrine_comments insert own" ON public.vitrine_comments;
CREATE POLICY "vitrine_comments insert own"
  ON public.vitrine_comments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "vitrine_comments delete own" ON public.vitrine_comments;
CREATE POLICY "vitrine_comments delete own"
  ON public.vitrine_comments FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.vitrine_comments_count_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.vitrine_posts
      SET comment_count = comment_count + 1, updated_at = now()
      WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.vitrine_posts
      SET comment_count = GREATEST(0, comment_count - 1), updated_at = now()
      WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_vitrine_comments_count ON public.vitrine_comments;
CREATE TRIGGER trg_vitrine_comments_count
  AFTER INSERT OR DELETE ON public.vitrine_comments
  FOR EACH ROW EXECUTE FUNCTION public.vitrine_comments_count_trg();

-- ========== vitrine_stories (24h) ==========
CREATE TABLE IF NOT EXISTS public.vitrine_stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  media_url text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vitrine_stories_expires_idx
  ON public.vitrine_stories (expires_at DESC);

ALTER TABLE public.vitrine_stories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vitrine_stories public read active" ON public.vitrine_stories;
CREATE POLICY "vitrine_stories public read active"
  ON public.vitrine_stories FOR SELECT
  TO public
  USING (expires_at > now());

DROP POLICY IF EXISTS "vitrine_stories insert own" ON public.vitrine_stories;
CREATE POLICY "vitrine_stories insert own"
  ON public.vitrine_stories FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "vitrine_stories delete own" ON public.vitrine_stories;
CREATE POLICY "vitrine_stories delete own"
  ON public.vitrine_stories FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.vitrine_posts IS 'Commercial showcase feed posts (Vitrine tab)';
COMMENT ON TABLE public.vitrine_stories IS '24h stories for Vitrine; filter expires_at > now()';
