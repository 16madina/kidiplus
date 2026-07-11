
CREATE POLICY "app_config demo_ public read anon" ON public.app_config
FOR SELECT TO anon
USING (key LIKE 'demo\_%' ESCAPE '\');

CREATE POLICY "app_config demo_ public read authed" ON public.app_config
FOR SELECT TO authenticated
USING (key LIKE 'demo\_%' ESCAPE '\');

GRANT SELECT ON public.app_config TO anon;

CREATE POLICY "demo-covers admin write"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'demo-covers' AND public.is_admin(auth.uid()));

CREATE POLICY "demo-covers admin update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'demo-covers' AND public.is_admin(auth.uid()));

CREATE POLICY "demo-covers admin delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'demo-covers' AND public.is_admin(auth.uid()));

INSERT INTO public.app_config (key, value)
VALUES ('demo_version', (extract(epoch from now())::bigint)::text)
ON CONFLICT (key) DO NOTHING;
