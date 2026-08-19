-- Reliable admin get/set for pre-launch sim config (bypasses upsert RLS quirks).
-- Also ensures the row exists and public/host can read the flag via RPC.

INSERT INTO public.app_config (key, value, updated_at)
VALUES (
  'prelaunch_live_sim',
  '{"enabled":false,"viewersMin":50,"viewersMax":160,"commentEverySecMin":1,"commentEverySecMax":3,"fakeBids":true,"bidEverySecMin":1,"bidEverySecMax":3,"heartChancePct":18}',
  now()
)
ON CONFLICT (key) DO NOTHING;

-- Hosts / clients: read without needing admin.
CREATE OR REPLACE FUNCTION public.get_prelaunch_live_sim()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT value FROM public.app_config WHERE key = 'prelaunch_live_sim';
$$;

-- Admin: read stored JSON.
CREATE OR REPLACE FUNCTION public.admin_get_prelaunch_live_sim()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._assert_admin();
  RETURN (SELECT value FROM public.app_config WHERE key = 'prelaunch_live_sim');
END;
$$;

-- Admin: write stored JSON and return what was saved.
CREATE OR REPLACE FUNCTION public.admin_set_prelaunch_live_sim(_value text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v text := btrim(coalesce(_value, ''));
BEGIN
  PERFORM public._assert_admin();
  IF v = '' OR length(v) > 8000 THEN
    RAISE EXCEPTION 'invalid prelaunch_live_sim value';
  END IF;
  -- Must look like JSON or legacy 0/1
  IF v NOT IN ('0', '1', 'true', 'false', 'on', 'off')
     AND left(v, 1) NOT IN ('{', '[') THEN
    RAISE EXCEPTION 'invalid prelaunch_live_sim format';
  END IF;

  INSERT INTO public.app_config (key, value, updated_at)
  VALUES ('prelaunch_live_sim', v, now())
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_at = now();

  RETURN (SELECT value FROM public.app_config WHERE key = 'prelaunch_live_sim');
END;
$$;

REVOKE ALL ON FUNCTION public.get_prelaunch_live_sim() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_prelaunch_live_sim() TO anon, authenticated;

REVOKE ALL ON FUNCTION public.admin_get_prelaunch_live_sim() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_prelaunch_live_sim() TO authenticated;

REVOKE ALL ON FUNCTION public.admin_set_prelaunch_live_sim(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_prelaunch_live_sim(text) TO authenticated;

-- Keep direct table read for hosts if policies already exist; recreate for safety.
DROP POLICY IF EXISTS "app_config prelaunch_live_sim public read anon" ON public.app_config;
CREATE POLICY "app_config prelaunch_live_sim public read anon" ON public.app_config
  FOR SELECT TO anon
  USING (key = 'prelaunch_live_sim');

DROP POLICY IF EXISTS "app_config prelaunch_live_sim public read authed" ON public.app_config;
CREATE POLICY "app_config prelaunch_live_sim public read authed" ON public.app_config
  FOR SELECT TO authenticated
  USING (key = 'prelaunch_live_sim');
