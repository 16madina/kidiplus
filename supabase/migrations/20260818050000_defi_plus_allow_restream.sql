-- Défi Plus can run while YouTube / Facebook / TikTok restream is on:
-- the egress composition now composites both cameras + the intro overlay.

CREATE OR REPLACE FUNCTION public._battle_live_has_restream(_live public.lives)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT false;
$$;
