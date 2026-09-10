-- Repair replays finalized by the webhook but later overwritten to `processing`
-- by the stop endpoint race. A ready timestamp plus a stored public URL means
-- finalization completed successfully.

UPDATE public.lives
SET replay_status = 'ready'
WHERE replay_status = 'processing'
  AND replay_ready_at IS NOT NULL
  AND replay_url IS NOT NULL
  AND (replay_expires_at IS NULL OR replay_expires_at > now());

UPDATE public.lives
SET
  replay_status = 'expired',
  replay_url = NULL
WHERE replay_status = 'processing'
  AND replay_expires_at IS NOT NULL
  AND replay_expires_at <= now();
