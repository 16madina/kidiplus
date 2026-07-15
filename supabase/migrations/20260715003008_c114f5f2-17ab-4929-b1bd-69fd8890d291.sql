CREATE TABLE IF NOT EXISTS public.dm_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_b uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  last_message_preview text,
  last_sender_id uuid,
  CONSTRAINT dm_threads_pair_order CHECK (user_a < user_b),
  CONSTRAINT dm_threads_pair_unique UNIQUE (user_a, user_b)
);

GRANT SELECT ON public.dm_threads TO authenticated;
GRANT ALL ON public.dm_threads TO service_role;

CREATE TABLE IF NOT EXISTS public.dm_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.dm_threads(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

GRANT SELECT ON public.dm_messages TO authenticated;
GRANT ALL ON public.dm_messages TO service_role;

CREATE INDEX IF NOT EXISTS dm_messages_thread_created_idx
  ON public.dm_messages (thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS dm_threads_user_a_idx ON public.dm_threads (user_a, last_message_at DESC);
CREATE INDEX IF NOT EXISTS dm_threads_user_b_idx ON public.dm_threads (user_b, last_message_at DESC);

ALTER TABLE public.dm_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dm_threads_select_participants ON public.dm_threads;
CREATE POLICY dm_threads_select_participants ON public.dm_threads
  FOR SELECT TO authenticated
  USING (auth.uid() = user_a OR auth.uid() = user_b);

DROP POLICY IF EXISTS dm_messages_select_participants ON public.dm_messages;
CREATE POLICY dm_messages_select_participants ON public.dm_messages
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.dm_threads t
    WHERE t.id = dm_messages.thread_id
      AND (auth.uid() = t.user_a OR auth.uid() = t.user_b)
  ));

CREATE OR REPLACE FUNCTION public._assert_not_blocked(_me uuid, _other uuid)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.blocks
    WHERE (blocker_id = _me AND blocked_id = _other)
       OR (blocker_id = _other AND blocked_id = _me)
  ) THEN
    RAISE EXCEPTION 'blocked';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.find_dm_thread(_other uuid)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_me uuid := auth.uid(); v_id uuid;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT id INTO v_id FROM public.dm_threads
  WHERE user_a = LEAST(v_me, _other) AND user_b = GREATEST(v_me, _other);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_dm(_to uuid, _body text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_body text := trim(coalesce(_body, ''));
  v_thread uuid;
  v_msg public.dm_messages;
  v_sender_name text;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _to IS NULL OR _to = v_me THEN RAISE EXCEPTION 'invalid_recipient'; END IF;
  IF char_length(v_body) < 1 OR char_length(v_body) > 2000 THEN
    RAISE EXCEPTION 'invalid_body';
  END IF;
  PERFORM public.assert_user_active();
  PERFORM public._assert_not_blocked(v_me, _to);
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _to) THEN
    RAISE EXCEPTION 'recipient_not_found';
  END IF;

  INSERT INTO public.dm_threads (user_a, user_b)
  VALUES (LEAST(v_me, _to), GREATEST(v_me, _to))
  ON CONFLICT (user_a, user_b) DO UPDATE SET user_a = EXCLUDED.user_a
  RETURNING id INTO v_thread;

  INSERT INTO public.dm_messages (thread_id, sender_id, body)
  VALUES (v_thread, v_me, v_body)
  RETURNING * INTO v_msg;

  UPDATE public.dm_threads
  SET last_message_at = v_msg.created_at,
      last_message_preview = left(v_body, 140),
      last_sender_id = v_me
  WHERE id = v_thread;

  SELECT display_name INTO v_sender_name FROM public.profiles WHERE id = v_me;
  PERFORM public._push_notification(
    _to,
    'chat_message',
    coalesce(v_sender_name, 'Nouveau message'),
    left(v_body, 120),
    NULL,
    jsonb_build_object('kind', 'chat', 'thread_id', v_thread, 'sender_id', v_me)
  );

  RETURN jsonb_build_object(
    'thread_id', v_thread,
    'message', jsonb_build_object(
      'id', v_msg.id,
      'thread_id', v_msg.thread_id,
      'sender_id', v_msg.sender_id,
      'body', v_msg.body,
      'created_at', v_msg.created_at,
      'read_at', v_msg.read_at
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_my_dm_threads(_limit int DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_me uuid := auth.uid(); v_rows jsonb; v_unread int;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.last_message_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      th.id,
      th.last_message_at,
      th.last_message_preview,
      th.last_sender_id,
      p.id            AS other_id,
      p.display_name  AS other_name,
      p.handle        AS other_handle,
      p.avatar_url    AS other_avatar_url,
      p.is_seller     AS other_is_seller,
      p.is_verified   AS other_is_verified,
      (
        SELECT COUNT(*) FROM public.dm_messages m
        WHERE m.thread_id = th.id AND m.sender_id <> v_me AND m.read_at IS NULL
      ) AS unread
    FROM public.dm_threads th
    JOIN public.profiles p
      ON p.id = CASE WHEN th.user_a = v_me THEN th.user_b ELSE th.user_a END
    WHERE v_me IN (th.user_a, th.user_b)
    ORDER BY th.last_message_at DESC
    LIMIT GREATEST(_limit, 1)
  ) t;

  SELECT COUNT(*) INTO v_unread
  FROM public.dm_messages m
  JOIN public.dm_threads th ON th.id = m.thread_id
  WHERE v_me IN (th.user_a, th.user_b)
    AND m.sender_id <> v_me AND m.read_at IS NULL;

  RETURN jsonb_build_object('rows', v_rows, 'unread', v_unread);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_dm_messages(
  _thread uuid, _limit int DEFAULT 60, _before timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_me uuid := auth.uid(); v_rows jsonb;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.dm_threads t
    WHERE t.id = _thread AND v_me IN (t.user_a, t.user_b)
  ) THEN
    RAISE EXCEPTION 'not_participant';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT id, thread_id, sender_id, body, created_at, read_at
    FROM public.dm_messages
    WHERE thread_id = _thread
      AND (_before IS NULL OR created_at < _before)
    ORDER BY created_at DESC
    LIMIT GREATEST(_limit, 1)
  ) t;
  RETURN jsonb_build_object('rows', v_rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_dm_thread_read(_thread uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  UPDATE public.dm_messages m
  SET read_at = now()
  FROM public.dm_threads t
  WHERE m.thread_id = _thread
    AND t.id = m.thread_id
    AND v_me IN (t.user_a, t.user_b)
    AND m.sender_id <> v_me
    AND m.read_at IS NULL;
END;
$$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_threads;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;