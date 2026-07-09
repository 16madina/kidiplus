-- 1) live_moderators table
CREATE TABLE public.live_moderators (
  live_id    uuid NOT NULL REFERENCES public.lives(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  added_by   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (live_id, user_id)
);

CREATE INDEX live_moderators_user_idx ON public.live_moderators (user_id);

GRANT SELECT, INSERT, DELETE ON public.live_moderators TO authenticated;
GRANT ALL ON public.live_moderators TO service_role;

ALTER TABLE public.live_moderators ENABLE ROW LEVEL SECURITY;

-- Anyone signed in can read the moderator list for a live
CREATE POLICY "live_moderators_select_authenticated"
  ON public.live_moderators FOR SELECT TO authenticated
  USING (true);

-- Only the live's seller (host) can add moderators
CREATE POLICY "live_moderators_insert_host"
  ON public.live_moderators FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.lives l
      WHERE l.id = live_id AND l.seller_id = auth.uid()
    )
  );

-- The host can remove any moderator; a moderator can remove themselves.
CREATE POLICY "live_moderators_delete_host_or_self"
  ON public.live_moderators FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.lives l
      WHERE l.id = live_id AND l.seller_id = auth.uid()
    )
  );

-- 2) Security-definer helper: is user a moderator of this live?
CREATE OR REPLACE FUNCTION public.is_live_moderator(_live_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.live_moderators
    WHERE live_id = _live_id AND user_id = _user_id
  );
$$;

-- 3) Extend live_products policies: seller OR moderator can manage products
DROP POLICY IF EXISTS "live_products_insert_seller" ON public.live_products;
DROP POLICY IF EXISTS "live_products_update_seller" ON public.live_products;

CREATE POLICY "live_products_insert_seller_or_moderator"
  ON public.live_products FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.lives
      WHERE lives.id = live_products.live_id
        AND (
          lives.seller_id = auth.uid()
          OR public.is_live_moderator(lives.id, auth.uid())
        )
    )
  );

CREATE POLICY "live_products_update_seller_or_moderator"
  ON public.live_products FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.lives
      WHERE lives.id = live_products.live_id
        AND (
          lives.seller_id = auth.uid()
          OR public.is_live_moderator(lives.id, auth.uid())
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.lives
      WHERE lives.id = live_products.live_id
        AND (
          lives.seller_id = auth.uid()
          OR public.is_live_moderator(lives.id, auth.uid())
        )
    )
  );

-- 4) Realtime
ALTER TABLE public.live_moderators REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_moderators;