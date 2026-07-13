
-- Validation trigger: candidate must follow seller, max 3 moderators per live
CREATE OR REPLACE FUNCTION public._validate_live_moderator_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seller uuid;
  v_count int;
  v_follows boolean;
BEGIN
  SELECT seller_id INTO v_seller FROM public.lives WHERE id = NEW.live_id;
  IF v_seller IS NULL THEN
    RAISE EXCEPTION 'live_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.user_id = v_seller THEN
    RAISE EXCEPTION 'seller_cannot_be_moderator' USING ERRCODE = 'P0001';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.follows
    WHERE follower_id = NEW.user_id AND followed_id = v_seller
  ) INTO v_follows;
  IF NOT v_follows THEN
    RAISE EXCEPTION 'moderator_must_follow_seller' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO v_count FROM public.live_moderators WHERE live_id = NEW.live_id;
  IF v_count >= 3 THEN
    RAISE EXCEPTION 'moderator_limit_reached' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_live_moderators_validate ON public.live_moderators;
CREATE TRIGGER trg_live_moderators_validate
BEFORE INSERT ON public.live_moderators
FOR EACH ROW EXECUTE FUNCTION public._validate_live_moderator_insert();

-- live_chat_mutes table
CREATE TABLE IF NOT EXISTS public.live_chat_mutes (
  live_id uuid NOT NULL REFERENCES public.lives(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  muted_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (live_id, user_id)
);

GRANT SELECT, INSERT, DELETE ON public.live_chat_mutes TO authenticated;
GRANT ALL ON public.live_chat_mutes TO service_role;

ALTER TABLE public.live_chat_mutes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_mutes_select_all_auth"
ON public.live_chat_mutes FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "chat_mutes_insert_host_or_mod"
ON public.live_chat_mutes FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = muted_by
  AND (
    EXISTS (SELECT 1 FROM public.lives l WHERE l.id = live_id AND l.seller_id = auth.uid())
    OR public.is_live_moderator(live_id, auth.uid())
  )
);

CREATE POLICY "chat_mutes_delete_host_or_mod"
ON public.live_chat_mutes FOR DELETE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.lives l WHERE l.id = live_id AND l.seller_id = auth.uid())
  OR public.is_live_moderator(live_id, auth.uid())
);

ALTER PUBLICATION supabase_realtime ADD TABLE public.live_chat_mutes;
