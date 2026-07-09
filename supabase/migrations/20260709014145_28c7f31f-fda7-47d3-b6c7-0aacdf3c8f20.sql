-- Empêche physiquement plus d'une notification 'welcome' par utilisateur
CREATE UNIQUE INDEX IF NOT EXISTS notifications_one_welcome_per_user
  ON public.notifications (user_id)
  WHERE kind = 'welcome';

-- Le trigger vérifie d'abord et n'insère que si absente
CREATE OR REPLACE FUNCTION public._welcome_notification_on_profile_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.notifications
    WHERE user_id = NEW.id AND kind = 'welcome'
  ) THEN
    RETURN NEW;
  END IF;

  v_name := COALESCE(NULLIF(trim(NEW.display_name), ''), 'toi');
  INSERT INTO public.notifications (user_id, kind, title, body, data)
  VALUES (
    NEW.id,
    'welcome',
    'Bienvenue sur KIDI+' || v_name || ' !',
    'Le live shopping où chaque offre peut tout changer. Découvre les lives et fais tes premières enchères.',
    jsonb_build_object('kind', 'home')
  )
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;