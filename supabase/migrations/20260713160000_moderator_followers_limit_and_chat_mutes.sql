-- Enforce: only followers of the live seller can be moderators, max 3 per live.
CREATE OR REPLACE FUNCTION public._live_moderators_enforce()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seller uuid;
  v_count int;
BEGIN
  SELECT seller_id INTO v_seller FROM public.lives WHERE id = NEW.live_id;
  IF v_seller IS NULL THEN
    RAISE EXCEPTION 'live_not_found';
  END IF;

  -- Candidate must follow the host (follower_id = candidate, followed_id = seller).
  IF NOT EXISTS (
    SELECT 1 FROM public.follows
    WHERE follower_id = NEW.user_id AND followed_id = v_seller
  ) THEN
    RAISE EXCEPTION 'moderator_not_follower'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.live_moderators
  WHERE live_id = NEW.live_id;

  IF v_count >= 3 THEN
    RAISE EXCEPTION 'moderator_limit_reached'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_live_moderators_enforce ON public.live_moderators;
CREATE TRIGGER trg_live_moderators_enforce
BEFORE INSERT ON public.live_moderators
FOR EACH ROW
EXECUTE FUNCTION public._live_moderators_enforce();

-- Live chat mutes (TikTok-style: mute a viewer for this live only).
CREATE TABLE IF NOT EXISTS public.live_chat_mutes (
  live_id uuid NOT NULL REFERENCES public.lives(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  muted_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (live_id, user_id)
);

CREATE INDEX IF NOT EXISTS live_chat_mutes_live_idx ON public.live_chat_mutes (live_id);

ALTER TABLE public.live_chat_mutes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "live_chat_mutes_select" ON public.live_chat_mutes;
CREATE POLICY "live_chat_mutes_select" ON public.live_chat_mutes
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "live_chat_mutes_insert_host_or_mod" ON public.live_chat_mutes;
CREATE POLICY "live_chat_mutes_insert_host_or_mod" ON public.live_chat_mutes
  FOR INSERT TO authenticated
  WITH CHECK (
    muted_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.lives l
      WHERE l.id = live_id
        AND (
          l.seller_id = auth.uid()
          OR public.is_live_moderator(l.id, auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS "live_chat_mutes_delete_host_or_mod" ON public.live_chat_mutes;
CREATE POLICY "live_chat_mutes_delete_host_or_mod" ON public.live_chat_mutes
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.lives l
      WHERE l.id = live_id
        AND (
          l.seller_id = auth.uid()
          OR public.is_live_moderator(l.id, auth.uid())
        )
    )
  );

GRANT SELECT, INSERT, DELETE ON public.live_chat_mutes TO authenticated;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.live_chat_mutes;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;
