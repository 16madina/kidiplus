CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  status text NOT NULL DEFAULT 'processing',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_status
  ON public.stripe_webhook_events(status, claimed_at);

GRANT ALL ON public.stripe_webhook_events TO service_role;

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role manages stripe webhook events" ON public.stripe_webhook_events;
CREATE POLICY "service_role manages stripe webhook events"
  ON public.stripe_webhook_events FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Returns: 'claimed' (process it), 'duplicate' (already done -> ack 200),
-- 'in_flight' (another delivery is mid-processing -> ack 200, Stripe may retry),
-- 'retry' (previous attempt failed or went stale -> process it again).
CREATE OR REPLACE FUNCTION public.claim_stripe_webhook_event(
  _event_id text,
  _event_type text,
  _stale_after interval DEFAULT interval '5 minutes'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_claimed timestamptz;
BEGIN
  INSERT INTO public.stripe_webhook_events (event_id, event_type, status, attempts, claimed_at)
  VALUES (_event_id, _event_type, 'processing', 1, now())
  ON CONFLICT (event_id) DO NOTHING;

  IF FOUND THEN
    RETURN 'claimed';
  END IF;

  SELECT status, claimed_at INTO v_status, v_claimed
  FROM public.stripe_webhook_events
  WHERE event_id = _event_id
  FOR UPDATE;

  IF v_status = 'done' THEN
    RETURN 'duplicate';
  END IF;

  IF v_status = 'processing' AND v_claimed > now() - _stale_after THEN
    RETURN 'in_flight';
  END IF;

  UPDATE public.stripe_webhook_events
  SET status = 'processing',
      attempts = attempts + 1,
      claimed_at = now(),
      event_type = _event_type
  WHERE event_id = _event_id;

  RETURN 'retry';
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_stripe_webhook_event(
  _event_id text,
  _ok boolean,
  _error text DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.stripe_webhook_events
  SET status = CASE WHEN _ok THEN 'done' ELSE 'failed' END,
      processed_at = CASE WHEN _ok THEN now() ELSE processed_at END,
      last_error = _error
  WHERE event_id = _event_id;
$$;

REVOKE ALL ON FUNCTION public.claim_stripe_webhook_event(text, text, interval) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_stripe_webhook_event(text, boolean, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stripe_webhook_event(text, text, interval) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_stripe_webhook_event(text, boolean, text) TO service_role;