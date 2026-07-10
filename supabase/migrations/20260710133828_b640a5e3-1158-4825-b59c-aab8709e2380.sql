
CREATE TABLE public.live_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  live_id uuid REFERENCES public.lives(id) ON DELETE CASCADE,
  seller_id uuid,
  category text,
  kind text NOT NULL CHECK (kind IN ('view','click','like')),
  weight integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX live_interactions_user_created_idx ON public.live_interactions (user_id, created_at DESC);
CREATE INDEX live_interactions_user_kind_idx ON public.live_interactions (user_id, kind);

GRANT SELECT, INSERT ON public.live_interactions TO authenticated;
GRANT ALL ON public.live_interactions TO service_role;

ALTER TABLE public.live_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_read" ON public.live_interactions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "own_insert" ON public.live_interactions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
