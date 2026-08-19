-- Remote config for pre-launch live crowd simulation.
-- JSON value readable by everyone (hosts); writable by admins only.

INSERT INTO public.app_config (key, value, updated_at)
VALUES (
  'prelaunch_live_sim',
  '{"enabled":false,"viewersMin":50,"viewersMax":160,"commentEverySecMin":1,"commentEverySecMax":3,"fakeBids":true,"bidEverySecMin":1,"bidEverySecMax":3,"heartChancePct":18}',
  now()
)
ON CONFLICT (key) DO UPDATE
  SET value = CASE
    WHEN public.app_config.value IN ('0', '1', 'true', 'false', 'on', 'off')
      THEN EXCLUDED.value
    ELSE public.app_config.value
  END,
  updated_at = now();

DROP POLICY IF EXISTS "app_config prelaunch_live_sim public read anon" ON public.app_config;
CREATE POLICY "app_config prelaunch_live_sim public read anon" ON public.app_config
  FOR SELECT TO anon
  USING (key = 'prelaunch_live_sim');

DROP POLICY IF EXISTS "app_config prelaunch_live_sim public read authed" ON public.app_config;
CREATE POLICY "app_config prelaunch_live_sim public read authed" ON public.app_config
  FOR SELECT TO authenticated
  USING (key = 'prelaunch_live_sim');
