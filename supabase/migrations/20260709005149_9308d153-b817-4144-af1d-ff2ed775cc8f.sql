CREATE OR REPLACE FUNCTION public._welcome_notification_on_profile_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  v_name := COALESCE(NULLIF(trim(NEW.display_name), ''), 'toi');
  INSERT INTO public.notifications (user_id, kind, title, body)
  VALUES (
    NEW.id,
    'welcome',
    'Bienvenue sur KIDI+' || v_name || ' !',
    'Le live shopping où chaque offre peut tout changer. Découvre les lives et fais tes premières enchères.'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_welcome_notification_on_profile_insert ON public.profiles;
CREATE TRIGGER trg_welcome_notification_on_profile_insert
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public._welcome_notification_on_profile_insert();