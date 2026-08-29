CREATE OR REPLACE FUNCTION public._report_content_ref(_target_type text, _target_id text, _note text)
RETURNS TABLE(kind text, content_id uuid)
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE
  v_note text := coalesce(_note, '');
  v_m text[];
BEGIN
  v_m := regexp_match(v_note, '\[kidiContent:(vitrine_post|vitrine_story|live):([0-9a-fA-F-]{36})\]', 'i');
  IF v_m IS NOT NULL THEN
    kind := lower(v_m[1]);
    content_id := v_m[2]::uuid;
    RETURN NEXT;
    RETURN;
  END IF;
  v_m := regexp_match(v_note, 'Vitrine post:\s*([0-9a-fA-F-]{36})', 'i');
  IF v_m IS NOT NULL THEN
    kind := 'vitrine_post';
    content_id := v_m[1]::uuid;
    RETURN NEXT;
    RETURN;
  END IF;
  v_m := regexp_match(v_note, 'Vitrine story:\s*([0-9a-fA-F-]{36})', 'i');
  IF v_m IS NOT NULL THEN
    kind := 'vitrine_story';
    content_id := v_m[1]::uuid;
    RETURN NEXT;
    RETURN;
  END IF;
  IF lower(coalesce(_target_type, '')) = 'live' AND _target_id ~* '^[0-9a-fA-F-]{36}$' THEN
    kind := 'live';
    content_id := _target_id::uuid;
    RETURN NEXT;
    RETURN;
  END IF;
  IF lower(coalesce(_target_type, '')) IN ('vitrine_post', 'vitrine_story')
     AND _target_id ~* '^[0-9a-fA-F-]{36}$' THEN
    kind := lower(_target_type);
    content_id := _target_id::uuid;
    RETURN NEXT;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_action_report(_report_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  r public.reports;
  v_kind text;
  v_content uuid;
  v_owner uuid;
  v_media text := 'photo';
  v_title text;
  v_body text;
  v_removed boolean := false;
BEGIN
  PERFORM public._assert_admin();
  SELECT * INTO r FROM public.reports WHERE id = _report_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  SELECT ref.kind, ref.content_id
    INTO v_kind, v_content
  FROM public._report_content_ref(r.target_type, r.target_id, r.note) AS ref
  LIMIT 1;

  IF v_kind = 'vitrine_post' AND v_content IS NOT NULL THEN
    SELECT user_id,
           CASE WHEN media_type = 'video' THEN 'video' ELSE 'photo' END
      INTO v_owner, v_media
    FROM public.vitrine_posts
    WHERE id = v_content;
    UPDATE public.vitrine_posts SET active = false WHERE id = v_content;
    DELETE FROM public.vitrine_posts WHERE id = v_content;
    v_removed := FOUND OR v_owner IS NOT NULL;
  ELSIF v_kind = 'vitrine_story' AND v_content IS NOT NULL THEN
    SELECT user_id INTO v_owner FROM public.vitrine_stories WHERE id = v_content;
    DELETE FROM public.vitrine_stories WHERE id = v_content;
    v_media := 'story';
    v_removed := FOUND OR v_owner IS NOT NULL;
  ELSIF v_kind = 'live' AND v_content IS NOT NULL THEN
    SELECT seller_id INTO v_owner FROM public.lives WHERE id = v_content;
    UPDATE public.lives
       SET status = 'ended', ended_at = coalesce(ended_at, now())
     WHERE id = v_content AND status IS DISTINCT FROM 'ended';
    v_media := 'live';
    v_removed := v_owner IS NOT NULL;
  END IF;

  IF v_owner IS NULL AND r.target_type = 'user' AND r.target_id ~* '^[0-9a-fA-F-]{36}$' THEN
    v_owner := r.target_id::uuid;
  END IF;

  IF v_media = 'live' THEN
    v_title := 'Live retiré';
    v_body := 'Ton live a été interrompu car il ne respecte pas les normes de KiDi+.';
  ELSIF v_media = 'story' THEN
    v_title := 'Story retirée';
    v_body := 'Ta story a été supprimée car elle ne respecte pas les normes de KiDi+.';
  ELSIF v_media = 'video' THEN
    v_title := 'Contenu retiré';
    v_body := 'Ta vidéo a été supprimée car elle ne respecte pas les normes de KiDi+.';
  ELSE
    v_title := 'Contenu retiré';
    v_body := 'Ta photo a été supprimée car elle ne respecte pas les normes de KiDi+.';
  END IF;

  IF v_owner IS NOT NULL AND (v_removed OR v_kind IS NOT NULL) THEN
    BEGIN
      PERFORM public._push_notification(
        v_owner,
        'moderation_takedown',
        v_title,
        v_body,
        NULL,
        jsonb_build_object(
          'kind', 'notif',
          'content_kind', coalesce(v_kind, r.target_type),
          'report_id', r.id
        )
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    BEGIN
      INSERT INTO public.admin_messages (user_id, title, body, sent_by)
      VALUES (v_owner, v_title, v_body, v_admin);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  UPDATE public.reports
     SET status = 'actioned',
         reviewed_by = v_admin,
         reviewed_at = now(),
         resolution_note = coalesce(r.resolution_note, 'takedown'),
         updated_at = now()
   WHERE id = _report_id;

  RETURN jsonb_build_object(
    'ok', true,
    'removed', v_removed,
    'kind', v_kind,
    'owner_id', v_owner
  );
END;
$$;

REVOKE ALL ON FUNCTION public._report_content_ref(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._report_content_ref(text, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_action_report(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_action_report(uuid) TO authenticated;