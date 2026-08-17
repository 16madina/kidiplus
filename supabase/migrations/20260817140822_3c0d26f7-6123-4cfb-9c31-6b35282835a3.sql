CREATE OR REPLACE FUNCTION public.admin_replace_vitrine_video(_post_id uuid, _new_url text, _new_poster text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _p public.vitrine_posts;
BEGIN
  PERFORM public._assert_admin();
  IF _new_url IS NULL OR length(trim(_new_url)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_url');
  END IF;

  SELECT * INTO _p FROM public.vitrine_posts WHERE id = _post_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  UPDATE public.vitrine_posts
     SET media_urls = jsonb_build_array(_new_url),
         poster_url = COALESCE(NULLIF(trim(COALESCE(_new_poster, '')), ''), poster_url),
         updated_at = now()
   WHERE id = _post_id;

  RETURN jsonb_build_object('ok', true, 'id', _post_id, 'url', _new_url);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_replace_vitrine_video(uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_replace_vitrine_video(uuid, text, text) TO authenticated;