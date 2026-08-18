CREATE OR REPLACE FUNCTION public._battle_live_has_restream(_live public.lives)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT false;
$$;