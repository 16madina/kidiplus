-- RTMP multi-stream (Restream / OBS → LiveKit Ingress → KiDi+ room)
alter table public.lives
  add column if not exists ingress_id text null,
  add column if not exists broadcast_mode text not null default 'camera';

comment on column public.lives.ingress_id is
  'LiveKit Ingress id when broadcast_mode = rtmp; cleared when live ends.';
comment on column public.lives.broadcast_mode is
  'camera = in-app WebRTC host; rtmp = Restream/OBS via LiveKit Ingress.';

alter table public.lives
  drop constraint if exists lives_broadcast_mode_check;

alter table public.lives
  add constraint lives_broadcast_mode_check
  check (broadcast_mode in ('camera', 'rtmp'));
