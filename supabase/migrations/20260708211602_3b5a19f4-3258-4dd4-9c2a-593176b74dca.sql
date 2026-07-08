
-- Add 'scheduled' status + scheduled_at column to lives
ALTER TABLE public.lives DROP CONSTRAINT IF EXISTS lives_status_check;
ALTER TABLE public.lives ADD CONSTRAINT lives_status_check CHECK (status = ANY (ARRAY['scheduled'::text, 'live'::text, 'ended'::text]));
ALTER TABLE public.lives ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;

-- Allow started_at to be NULL for scheduled lives (they haven't started yet)
ALTER TABLE public.lives ALTER COLUMN started_at DROP NOT NULL;

CREATE INDEX IF NOT EXISTS lives_status_scheduled_at_idx ON public.lives (status, scheduled_at);

-- live_reminders table (buyer taps "Me rappeler" on a scheduled live)
CREATE TABLE IF NOT EXISTS public.live_reminders (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  live_id uuid NOT NULL REFERENCES public.lives(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, live_id)
);

GRANT SELECT, INSERT, DELETE ON public.live_reminders TO authenticated;
GRANT ALL ON public.live_reminders TO service_role;

ALTER TABLE public.live_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own reminders"
ON public.live_reminders
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Allow the seller of the live to read reminders for that live (so start-transition
-- fanout can list users to notify). No write access for the seller.
CREATE POLICY "Seller can read reminders for their live"
ON public.live_reminders
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.lives l
    WHERE l.id = live_reminders.live_id AND l.seller_id = auth.uid()
  )
);

CREATE INDEX IF NOT EXISTS live_reminders_live_id_idx ON public.live_reminders (live_id);
