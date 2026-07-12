CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta          JSONB := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  meta_name     TEXT;
  meta_avatar   TEXT;
  base_handle   TEXT;
  candidate_handle TEXT;
  counter       INT := 0;
  display       TEXT;
  v_currency    TEXT;
BEGIN
  meta_name := COALESCE(
    NULLIF(meta ->> 'display_name', ''),
    NULLIF(meta ->> 'full_name', ''),
    NULLIF(meta ->> 'name', ''),
    NULLIF(TRIM(CONCAT_WS(' ', meta ->> 'given_name', meta ->> 'family_name')), '')
  );
  meta_avatar := COALESCE(
    NULLIF(meta ->> 'avatar_url', ''),
    NULLIF(meta ->> 'picture', '')
  );

  base_handle := lower(regexp_replace(COALESCE(split_part(NEW.email, '@', 1), ''), '[^a-z0-9_]', '', 'g'));
  IF base_handle IS NULL OR length(base_handle) < 2 THEN
    base_handle := lower(regexp_replace(COALESCE(meta_name, ''), '[^a-z0-9_]', '', 'g'));
  END IF;
  IF base_handle IS NULL OR length(base_handle) < 2 THEN
    base_handle := 'user' || substr(NEW.id::text, 1, 6);
  END IF;
  base_handle := substr(base_handle, 1, 24);

  candidate_handle := base_handle;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE handle = candidate_handle) LOOP
    counter := counter + 1;
    candidate_handle := base_handle || counter::text;
  END LOOP;

  display := COALESCE(meta_name, split_part(NEW.email, '@', 1), 'Utilisateur');

  v_currency := COALESCE(NULLIF(meta ->> 'currency', ''), 'EUR');
  IF v_currency NOT IN ('XOF','EUR','CAD') THEN v_currency := 'EUR'; END IF;

  INSERT INTO public.profiles (id, email, display_name, handle, avatar_url, currency)
  VALUES (NEW.id, NEW.email, display, candidate_handle, meta_avatar, v_currency);

  INSERT INTO public.wallets (user_id, currency) VALUES (NEW.id, v_currency)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;