-- Config table for internal server-side settings (fanout url + secret, etc.)
CREATE TABLE IF NOT EXISTS public.app_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.app_config TO service_role;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
-- No policies for authenticated/anon: only service_role reads via SECURITY DEFINER funcs.

-- Seed the fanout URL (secret will be set later via service_role).
INSERT INTO public.app_config(key, value)
VALUES ('fanout_url', 'https://project--20d4a302-d0ef-4d57-bc8e-6948b6635878.lovable.app/api/public/notifications-fanout')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- Add a jsonb data column to notifications for deep-link metadata
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS data jsonb;

-- Extend _push_notification to accept optional data
CREATE OR REPLACE FUNCTION public._push_notification(
  _user_id uuid, _kind text, _title text, _body text,
  _order_id uuid DEFAULT NULL, _data jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, kind, title, body, order_id, data)
  VALUES (_user_id, _kind, _title, _body, _order_id, _data);
END;
$$;

-- Include data in list_my_notifications output
CREATE OR REPLACE FUNCTION public.list_my_notifications(_limit int DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_rows jsonb; v_unread int;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT id, kind, title, body, order_id, data, read_at, created_at
    FROM public.notifications
    WHERE user_id = auth.uid()
    ORDER BY created_at DESC
    LIMIT GREATEST(_limit,1)
  ) t;
  SELECT COUNT(*) INTO v_unread FROM public.notifications
   WHERE user_id = auth.uid() AND read_at IS NULL;
  RETURN jsonb_build_object('rows', v_rows, 'unread', v_unread);
END;
$$;

-- Fanout trigger: reads url + secret from app_config and calls pg_net.
CREATE OR REPLACE FUNCTION public._notifications_fanout()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_url text;
  v_secret text;
BEGIN
  SELECT value INTO v_url FROM public.app_config WHERE key = 'fanout_url';
  SELECT value INTO v_secret FROM public.app_config WHERE key = 'fanout_secret';
  IF v_url IS NULL OR v_url = '' OR v_secret IS NULL OR v_secret = '' THEN
    RETURN NEW;
  END IF;
  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Fanout-Secret', v_secret
    ),
    body := jsonb_build_object(
      'id', NEW.id,
      'user_id', NEW.user_id,
      'kind', NEW.kind,
      'title', NEW.title,
      'body', NEW.body,
      'order_id', NEW.order_id,
      'data', NEW.data
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notifications_fanout ON public.notifications;
CREATE TRIGGER trg_notifications_fanout
AFTER INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public._notifications_fanout();
