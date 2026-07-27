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

alter table public.seller_facebook_connections enable row level security;

revoke all on public.seller_facebook_connections from anon, authenticated;

grant all on public.seller_facebook_connections to service_role;

alter table public.lives
  add column if not exists facebook_egress_id text null,
  add column if not exists facebook_live_video_id text null,
  add column if not exists facebook_watch_url text null;

comment on table public.seller_facebook_connections is 'Facebook OAuth connection for a seller (tokens are server-only via service_role).';
comment on column public.seller_facebook_connections.user_access_token is 'Short-lived user access token from Facebook OAuth.';
comment on column public.seller_facebook_connections.page_access_token is 'Page access token used to create live videos on the selected Facebook Page.';
comment on column public.lives.facebook_egress_id is 'LiveKit Egress id for the Facebook restream.';
comment on column public.lives.facebook_live_video_id is 'Facebook Live Video id created for the restream.';
comment on column public.lives.facebook_watch_url is 'Public watch URL on Facebook while restream is active.';