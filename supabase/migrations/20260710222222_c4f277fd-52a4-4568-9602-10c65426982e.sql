GRANT SELECT ON public.lives TO anon, authenticated;

DROP POLICY IF EXISTS "lives_select_authenticated" ON public.lives;

CREATE POLICY "lives_select_public_live_or_scheduled"
ON public.lives
FOR SELECT
TO anon, authenticated
USING (status IN ('live', 'scheduled', 'ended'));

-- Ensure the joined profile lookup (seller info on live cards) works for guests
GRANT SELECT ON public.profiles TO anon;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.profiles'::regclass
      AND polname = 'profiles_select_public_basic'
  ) THEN
    CREATE POLICY "profiles_select_public_basic"
    ON public.profiles
    FOR SELECT
    TO anon
    USING (true);
  END IF;
END $$;
