-- 1) profiles.is_verified flag
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false;

-- 2) verification_requests table
CREATE TABLE IF NOT EXISTS public.verification_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.verification_requests TO authenticated;
GRANT ALL ON public.verification_requests TO service_role;

ALTER TABLE public.verification_requests ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS verification_requests_one_pending
  ON public.verification_requests(user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS verification_requests_status_idx
  ON public.verification_requests(status, created_at DESC);

-- RLS (admin check inlined via profiles.is_admin to avoid conflict with existing is_admin() signature)
DROP POLICY IF EXISTS "verif_select_own_or_admin" ON public.verification_requests;
CREATE POLICY "verif_select_own_or_admin" ON public.verification_requests
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR COALESCE((SELECT is_admin FROM public.profiles WHERE id = auth.uid()), false)
  );

DROP POLICY IF EXISTS "verif_insert_own" ON public.verification_requests;
CREATE POLICY "verif_insert_own" ON public.verification_requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 3) eligibility function
CREATE OR REPLACE FUNCTION public.verification_eligibility(_user uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p RECORD;
  v_sales int := 0;
  v_rating_avg numeric := 0;
  v_review_count int := 0;
  v_age_days int := 0;
  v_sanctioned boolean := false;
BEGIN
  SELECT id, is_seller, created_at, rating_avg, rating_count
    INTO p FROM public.profiles WHERE id = _user;
  IF p.id IS NULL THEN
    RETURN jsonb_build_object('exists', false);
  END IF;

  SELECT COUNT(*)::int INTO v_sales
    FROM public.orders
    WHERE seller_id = _user AND fulfillment_status = 'delivered';

  SELECT COALESCE(AVG(rating), 0)::numeric, COUNT(*)::int
    INTO v_rating_avg, v_review_count
    FROM public.seller_reviews WHERE seller_id = _user;

  v_age_days := GREATEST(0, EXTRACT(DAY FROM (now() - p.created_at))::int);

  SELECT EXISTS (
    SELECT 1 FROM public.user_sanctions
    WHERE user_id = _user
      AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > now())
  ) INTO v_sanctioned;

  RETURN jsonb_build_object(
    'exists', true,
    'is_seller', p.is_seller,
    'sales_count', v_sales,
    'sales_ok', v_sales >= 10,
    'rating_avg', ROUND(v_rating_avg, 2),
    'review_count', v_review_count,
    'rating_ok', (v_review_count >= 5 AND v_rating_avg >= 4.0),
    'age_days', v_age_days,
    'age_ok', v_age_days >= 30,
    'no_sanction', NOT v_sanctioned,
    'all_ok', (p.is_seller AND v_sales >= 10 AND v_review_count >= 5 AND v_rating_avg >= 4.0 AND v_age_days >= 30 AND NOT v_sanctioned)
  );
END;
$$;

-- 4) request submission
CREATE OR REPLACE FUNCTION public.request_verification(_message text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  elig jsonb;
  already_verified boolean;
  new_id uuid;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth_required');
  END IF;
  SELECT is_verified INTO already_verified FROM public.profiles WHERE id = uid;
  IF already_verified THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_verified');
  END IF;
  IF EXISTS (SELECT 1 FROM public.verification_requests WHERE user_id = uid AND status = 'pending') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_pending');
  END IF;
  elig := public.verification_eligibility(uid);
  IF NOT COALESCE((elig->>'all_ok')::boolean, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_eligible', 'eligibility', elig);
  END IF;
  INSERT INTO public.verification_requests (user_id, message)
    VALUES (uid, NULLIF(TRIM(_message), ''))
    RETURNING id INTO new_id;
  RETURN jsonb_build_object('ok', true, 'id', new_id);
END;
$$;

-- 5) admin review
CREATE OR REPLACE FUNCTION public.admin_review_verification(_id uuid, _approve boolean, _note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  is_ad boolean;
  req RECORD;
BEGIN
  SELECT is_admin INTO is_ad FROM public.profiles WHERE id = uid;
  IF NOT COALESCE(is_ad, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  SELECT * INTO req FROM public.verification_requests WHERE id = _id FOR UPDATE;
  IF req.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF req.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_pending');
  END IF;
  UPDATE public.verification_requests
    SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
        reviewed_by = uid,
        reviewed_at = now(),
        note = NULLIF(TRIM(_note), '')
    WHERE id = _id;
  IF _approve THEN
    UPDATE public.profiles SET is_verified = true WHERE id = req.user_id;
    INSERT INTO public.admin_messages (user_id, title, body, sent_by)
      VALUES (req.user_id, 'Compte certifié ✓', 'Félicitations, ton compte est certifié ✓', uid);
  ELSE
    INSERT INTO public.admin_messages (user_id, title, body, sent_by)
      VALUES (req.user_id, 'Demande de certification refusée',
              COALESCE(NULLIF(TRIM(_note), ''), 'Ta demande de certification a été refusée.'), uid);
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 6) admin manual toggle
CREATE OR REPLACE FUNCTION public.admin_set_verified(_user uuid, _verified boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  is_ad boolean;
BEGIN
  SELECT is_admin INTO is_ad FROM public.profiles WHERE id = uid;
  IF NOT COALESCE(is_ad, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  UPDATE public.profiles SET is_verified = _verified WHERE id = _user;
  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.verification_eligibility(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_verification(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_verification(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_verified(uuid, boolean) TO authenticated;