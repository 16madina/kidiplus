
-- ============ profiles table ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  handle TEXT NOT NULL UNIQUE,
  avatar_url TEXT,
  bio TEXT,
  is_seller BOOLEAN NOT NULL DEFAULT false,
  country TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can view any profile (needed to display sellers, etc.)
CREATE POLICY "profiles_select_authenticated"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- Users can only update their own profile
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- No INSERT/DELETE from client — the trigger handles creation.

-- ============ signup trigger ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_handle TEXT;
  candidate_handle TEXT;
  counter INT := 0;
  display TEXT;
BEGIN
  -- Derive a safe base handle from the email local-part.
  base_handle := lower(regexp_replace(split_part(NEW.email, '@', 1), '[^a-z0-9_]', '', 'g'));
  IF base_handle IS NULL OR length(base_handle) < 2 THEN
    base_handle := 'user' || substr(NEW.id::text, 1, 6);
  END IF;
  base_handle := substr(base_handle, 1, 24);

  candidate_handle := base_handle;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE handle = candidate_handle) LOOP
    counter := counter + 1;
    candidate_handle := base_handle || counter::text;
  END LOOP;

  display := COALESCE(
    NULLIF(NEW.raw_user_meta_data ->> 'display_name', ''),
    split_part(NEW.email, '@', 1)
  );

  INSERT INTO public.profiles (id, email, display_name, handle)
  VALUES (NEW.id, NEW.email, display, candidate_handle);

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
