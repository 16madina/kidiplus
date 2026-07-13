
-- Requests table
CREATE TABLE public.promo_code_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  admin_note text,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_promo_code_id uuid REFERENCES public.promo_codes(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX promo_code_requests_user_idx ON public.promo_code_requests(user_id, created_at DESC);
CREATE INDEX promo_code_requests_status_idx ON public.promo_code_requests(status, created_at DESC);
CREATE UNIQUE INDEX promo_code_requests_one_pending_per_user
  ON public.promo_code_requests(user_id) WHERE status = 'pending';

GRANT SELECT, INSERT ON public.promo_code_requests TO authenticated;
GRANT ALL ON public.promo_code_requests TO service_role;
ALTER TABLE public.promo_code_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own requests read"
  ON public.promo_code_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_admin(auth.uid()));

CREATE TRIGGER promo_code_requests_touch
  BEFORE UPDATE ON public.promo_code_requests
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- User: submit a request
CREATE OR REPLACE FUNCTION public.request_promo_code(_message text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _has_code boolean;
  _pending boolean;
  _new_id uuid;
BEGIN
  IF _uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthorized'); END IF;

  SELECT EXISTS(SELECT 1 FROM promo_codes WHERE owner_id = _uid) INTO _has_code;
  IF _has_code THEN RETURN jsonb_build_object('ok', false, 'error', 'already_has_code'); END IF;

  SELECT EXISTS(SELECT 1 FROM promo_code_requests WHERE user_id = _uid AND status = 'pending') INTO _pending;
  IF _pending THEN RETURN jsonb_build_object('ok', false, 'error', 'already_pending'); END IF;

  INSERT INTO promo_code_requests(user_id, message)
  VALUES (_uid, NULLIF(trim(coalesce(_message,'')), ''))
  RETURNING id INTO _new_id;

  RETURN jsonb_build_object('ok', true, 'id', _new_id);
END $$;
REVOKE ALL ON FUNCTION public.request_promo_code(text) FROM public;
GRANT EXECUTE ON FUNCTION public.request_promo_code(text) TO authenticated;

-- User: fetch my latest request (to show status)
CREATE OR REPLACE FUNCTION public.my_promo_code_request()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT to_jsonb(r) FROM (
    SELECT id, status, message, admin_note, created_at, reviewed_at
    FROM promo_code_requests
    WHERE user_id = auth.uid()
    ORDER BY created_at DESC
    LIMIT 1
  ) r;
$$;
REVOKE ALL ON FUNCTION public.my_promo_code_request() FROM public;
GRANT EXECUTE ON FUNCTION public.my_promo_code_request() TO authenticated;

-- Admin: list requests
CREATE OR REPLACE FUNCTION public.admin_list_promo_code_requests(_status text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE _rows jsonb;
BEGIN
  IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT coalesce(jsonb_agg(row_to_json(x) ORDER BY x.created_at DESC), '[]'::jsonb) INTO _rows
  FROM (
    SELECT r.id, r.status, r.message, r.admin_note, r.created_at, r.reviewed_at,
           r.user_id, p.handle AS user_handle, p.display_name AS user_name, p.avatar_url AS user_avatar,
           r.created_promo_code_id
    FROM promo_code_requests r
    LEFT JOIN profiles p ON p.id = r.user_id
    WHERE _status IS NULL OR r.status = _status
  ) x;
  RETURN jsonb_build_object('rows', _rows);
END $$;
REVOKE ALL ON FUNCTION public.admin_list_promo_code_requests(text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_list_promo_code_requests(text) TO authenticated;

-- Admin: approve or reject
CREATE OR REPLACE FUNCTION public.admin_review_promo_code_request(
  _id uuid, _action text, _code text DEFAULT NULL, _reward_quota int DEFAULT 14, _note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _req promo_code_requests%ROWTYPE;
  _new_code_id uuid;
  _token text;
  _code_norm text;
BEGIN
  IF NOT is_admin(_uid) THEN RETURN jsonb_build_object('ok', false, 'error', 'forbidden'); END IF;
  SELECT * INTO _req FROM promo_code_requests WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF _req.status <> 'pending' THEN RETURN jsonb_build_object('ok', false, 'error', 'already_reviewed'); END IF;

  IF _action = 'approve' THEN
    _code_norm := upper(trim(coalesce(_code, '')));
    IF _code_norm !~ '^[A-Z0-9_-]{4,20}$' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'bad_code_format');
    END IF;
    IF EXISTS(SELECT 1 FROM promo_codes WHERE code = _code_norm) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'code_taken');
    END IF;

    _token := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4)) || '-' ||
              upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4));

    INSERT INTO promo_codes(code, owner_id, reward_quota, created_by, claim_token)
    VALUES (_code_norm, _req.user_id, greatest(1, coalesce(_reward_quota, 14)), _uid, NULL)
    RETURNING id INTO _new_code_id;

    -- Directly assigned to the requester → mark claimed
    UPDATE promo_codes SET claimed_at = now() WHERE id = _new_code_id;

    UPDATE promo_code_requests
      SET status = 'approved', reviewed_by = _uid, reviewed_at = now(),
          admin_note = NULLIF(trim(coalesce(_note,'')), ''),
          created_promo_code_id = _new_code_id
    WHERE id = _id;

    INSERT INTO notifications(user_id, kind, title, body, data)
    VALUES (_req.user_id, 'referral_request_approved',
            'Ta demande de parrainage a été approuvée 🎉',
            'Ton code ' || _code_norm || ' est actif. Retrouve-le dans Profil → Parrainage.',
            jsonb_build_object('code', _code_norm, 'promo_code_id', _new_code_id));

    RETURN jsonb_build_object('ok', true, 'code', _code_norm, 'promo_code_id', _new_code_id);
  ELSIF _action = 'reject' THEN
    UPDATE promo_code_requests
      SET status = 'rejected', reviewed_by = _uid, reviewed_at = now(),
          admin_note = NULLIF(trim(coalesce(_note,'')), '')
    WHERE id = _id;

    INSERT INTO notifications(user_id, kind, title, body, data)
    VALUES (_req.user_id, 'referral_request_rejected',
            'Ta demande de parrainage a été refusée',
            coalesce(NULLIF(trim(coalesce(_note,'')), ''), 'Ta demande n''a pas été retenue pour le moment.'),
            jsonb_build_object('request_id', _id));

    RETURN jsonb_build_object('ok', true);
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'bad_action');
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.admin_review_promo_code_request(uuid, text, text, int, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_review_promo_code_request(uuid, text, text, int, text) TO authenticated;
