-- Restrict SELECT on profiles.email column so authenticated users can't read other users' emails.
-- Own email is accessible via the existing get_my_email() SECURITY DEFINER helper.
REVOKE SELECT (email) ON public.profiles FROM anon, authenticated;