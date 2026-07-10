
-- Grants + RLS policies on app_config
GRANT SELECT ON public.app_config TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.app_config TO authenticated;
GRANT ALL ON public.app_config TO service_role;

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_config public read" ON public.app_config;
CREATE POLICY "app_config public read" ON public.app_config
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "app_config admin write" ON public.app_config;
CREATE POLICY "app_config admin write" ON public.app_config
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Storage policies for demo-videos bucket (admins only)
DROP POLICY IF EXISTS "demo-videos admin insert" ON storage.objects;
CREATE POLICY "demo-videos admin insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'demo-videos' AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "demo-videos admin update" ON storage.objects;
CREATE POLICY "demo-videos admin update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'demo-videos' AND public.is_admin(auth.uid()))
  WITH CHECK (bucket_id = 'demo-videos' AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "demo-videos admin delete" ON storage.objects;
CREATE POLICY "demo-videos admin delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'demo-videos' AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "demo-videos admin read" ON storage.objects;
CREATE POLICY "demo-videos admin read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'demo-videos' AND public.is_admin(auth.uid()));
