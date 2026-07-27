-- TikTok manual RTMP restream (LiveKit Web Egress → host-provided stream key).
alter table public.lives
  add column if not exists tiktok_egress_id text null;

comment on column public.lives.tiktok_egress_id is
  'LiveKit Web Egress id while restreaming KiDi+ UI to TikTok via host RTMP key.';
