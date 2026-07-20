create table if not exists public.seller_youtube_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  refresh_token text not null,
  access_token text null,
  access_token_expires_at timestamptz null,
  channel_id text null,
  channel_title text null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.seller_youtube_connections is
  'YouTube OAuth tokens for sellers; tokens are service-role only (no client RLS read).';

alter table public.seller_youtube_connections enable row level security;

revoke all on public.seller_youtube_connections from anon, authenticated;
grant all on public.seller_youtube_connections to service_role;

alter table public.lives
  add column if not exists egress_id text null,
  add column if not exists youtube_broadcast_id text null,
  add column if not exists youtube_stream_id text null,
  add column if not exists youtube_watch_url text null;

comment on column public.lives.egress_id is
  'LiveKit RTMP Egress id when restreaming KiDi+ → YouTube.';
comment on column public.lives.youtube_broadcast_id is
  'YouTube liveBroadcast id for the restream.';
comment on column public.lives.youtube_stream_id is
  'YouTube liveStream id bound to the broadcast.';
comment on column public.lives.youtube_watch_url is
  'Public watch URL on YouTube while restream is active.';