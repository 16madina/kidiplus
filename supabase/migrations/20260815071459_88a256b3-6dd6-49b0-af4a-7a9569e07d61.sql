ALTER TABLE public.vitrine_posts
  ADD COLUMN IF NOT EXISTS music_url text,
  ADD COLUMN IF NOT EXISTS music_title text,
  ADD COLUMN IF NOT EXISTS music_artist text,
  ADD COLUMN IF NOT EXISTS music_start_sec numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS music_volume numeric NOT NULL DEFAULT 0.8,
  ADD COLUMN IF NOT EXISTS original_volume numeric NOT NULL DEFAULT 1;

ALTER TABLE public.vitrine_stories
  ADD COLUMN IF NOT EXISTS music_url text,
  ADD COLUMN IF NOT EXISTS music_title text,
  ADD COLUMN IF NOT EXISTS music_artist text,
  ADD COLUMN IF NOT EXISTS music_start_sec numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS music_volume numeric NOT NULL DEFAULT 0.8,
  ADD COLUMN IF NOT EXISTS original_volume numeric NOT NULL DEFAULT 1;