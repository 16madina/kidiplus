-- Facebook OAuth restream (KiDi+ camera → Facebook Page via LiveKit Egress)

create table if not exists public.seller_facebook_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  user_access_token text not null,
  user_token_expires_at timestamptz null,
  page_id text null,
  page_name text null,
  page_access_token text null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.seller_facebook_connections is
  'Facebook OAuth + selected Page tokens; service-role only (no client RLS read).';

alter table public.seller_facebook_connections enable row level security;

revoke all on public.seller_facebook_connections from anon, authenticated;
grant all on public.seller_facebook_connections to service_role;

alter table public.lives
  add column if not exists facebook_egress_id text null,
  add column if not exists facebook_live_video_id text null,
  add column if not exists facebook_watch_url text null;

comment on column public.lives.facebook_egress_id is
  'LiveKit RTMP Egress id when restreaming KiDi+ → Facebook.';
comment on column public.lives.facebook_live_video_id is
  'Facebook Live Video id for the restream.';
comment on column public.lives.facebook_watch_url is
  'Public watch URL on Facebook while restream is active.';
