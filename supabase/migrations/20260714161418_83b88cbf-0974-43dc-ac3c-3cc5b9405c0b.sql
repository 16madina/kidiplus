-- Extend allowed report reasons to include the auto-generated one created on block
ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_reason_check;
ALTER TABLE public.reports ADD CONSTRAINT reports_reason_check
  CHECK (reason IN ('inappropriate','fraud','counterfeit','harassment','other','auto_block'));

-- Update block_user so every block also surfaces to the admin Signalements tab.
-- Apple guideline 1.2 requires blocking a user to "notify the developer of the
-- inappropriate content". A lightweight admin report is created alongside the
-- block entry so the moderation team can review the reason.
CREATE OR REPLACE FUNCTION public.block_user(_blocked_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user     uuid := auth.uid();
  v_inserted boolean := false;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;
  IF v_user = _blocked_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_block_self');
  END IF;

  INSERT INTO public.blocks (blocker_id, blocked_id)
  VALUES (v_user, _blocked_id)
  ON CONFLICT DO NOTHING
  RETURNING true INTO v_inserted;

  -- Only file one admin report per new block (avoid duplicates on repeated calls).
  IF COALESCE(v_inserted, false) THEN
    INSERT INTO public.reports (reporter_id, target_type, target_id, reason, note)
    VALUES (
      v_user,
      'user',
      _blocked_id::text,
      'auto_block',
      'Signalement automatique : cet utilisateur a été bloqué depuis l''application.'
    );
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.block_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.block_user(uuid) TO authenticated;