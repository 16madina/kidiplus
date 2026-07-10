CREATE TABLE public.push_debug_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL,
  step text NOT NULL,
  ok boolean NOT NULL,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX push_debug_logs_user_created ON public.push_debug_logs (user_id, created_at DESC);

GRANT SELECT, INSERT ON public.push_debug_logs TO authenticated;
GRANT ALL ON public.push_debug_logs TO service_role;

ALTER TABLE public.push_debug_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users insert own push logs"
  ON public.push_debug_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "admins read all push logs"
  ON public.push_debug_logs FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));