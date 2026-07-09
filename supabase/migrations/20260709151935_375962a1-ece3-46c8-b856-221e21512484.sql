
-- 1. FOLLOWS
create table public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followed_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  check (follower_id <> followed_id)
);
grant select, insert, delete on public.follows to authenticated;
grant all on public.follows to service_role;
alter table public.follows enable row level security;
create policy "read follows" on public.follows for select to authenticated using (true);
create policy "follow self only" on public.follows for insert to authenticated
  with check (follower_id = auth.uid());
create policy "unfollow self only" on public.follows for delete to authenticated
  using (follower_id = auth.uid());
alter publication supabase_realtime add table public.follows;

create index follows_followed_idx on public.follows(followed_id);
create index follows_follower_idx on public.follows(follower_id);

-- Profile counters
alter table public.profiles
  add column if not exists followers_count int not null default 0,
  add column if not exists following_count int not null default 0,
  add column if not exists rating_avg numeric(3,2) not null default 0,
  add column if not exists rating_count int not null default 0;

create or replace function public._follows_counts_sync()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set followers_count = followers_count + 1 where id = new.followed_id;
    update public.profiles set following_count = following_count + 1 where id = new.follower_id;
  elsif tg_op = 'DELETE' then
    update public.profiles set followers_count = greatest(followers_count - 1, 0) where id = old.followed_id;
    update public.profiles set following_count = greatest(following_count - 1, 0) where id = old.follower_id;
  end if;
  return null;
end $$;

create trigger follows_counts_ins after insert on public.follows
  for each row execute function public._follows_counts_sync();
create trigger follows_counts_del after delete on public.follows
  for each row execute function public._follows_counts_sync();

update public.profiles p set followers_count = coalesce((select count(*) from public.follows f where f.followed_id = p.id), 0);
update public.profiles p set following_count = coalesce((select count(*) from public.follows f where f.follower_id = p.id), 0);

-- 2. SHOP PRODUCTS
create table public.shop_products (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  description text,
  image_url text,
  price numeric not null check (price >= 0),
  currency text not null,
  stock int not null default 1 check (stock >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.shop_products to authenticated;
grant all on public.shop_products to service_role;
alter table public.shop_products enable row level security;
create policy "read active or own shop products" on public.shop_products
  for select to authenticated using (active or seller_id = auth.uid());
create policy "seller manages own shop products" on public.shop_products
  for all to authenticated using (seller_id = auth.uid()) with check (seller_id = auth.uid());
create trigger shop_products_touch before update on public.shop_products
  for each row execute function public.touch_updated_at();
create index shop_products_seller_idx on public.shop_products(seller_id, active);
alter publication supabase_realtime add table public.shop_products;

alter table public.live_products
  add column if not exists shop_product_id uuid references public.shop_products(id) on delete set null;

-- Storage policies for shop-products bucket (bucket created via storage tool)
create policy "shop-products read auth"
  on storage.objects for select to authenticated
  using (bucket_id = 'shop-products');
create policy "shop-products upload own"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'shop-products' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "shop-products update own"
  on storage.objects for update to authenticated
  using (bucket_id = 'shop-products' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'shop-products' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "shop-products delete own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'shop-products' and (storage.foldername(name))[1] = auth.uid()::text);

-- 3. SELLER REVIEWS
create table public.seller_reviews (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid not null unique references public.orders(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);
grant select on public.seller_reviews to authenticated;
grant all on public.seller_reviews to service_role;
alter table public.seller_reviews enable row level security;
create policy "read reviews" on public.seller_reviews for select to authenticated using (true);
create index seller_reviews_seller_idx on public.seller_reviews(seller_id, created_at desc);
alter publication supabase_realtime add table public.seller_reviews;

create or replace function public._reviews_avg_sync()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  _seller uuid := coalesce(new.seller_id, old.seller_id);
  _avg numeric; _cnt int;
begin
  select coalesce(avg(rating)::numeric(3,2), 0), count(*) into _avg, _cnt
    from public.seller_reviews where seller_id = _seller;
  update public.profiles set rating_avg = _avg, rating_count = _cnt where id = _seller;
  return null;
end $$;

create trigger reviews_avg_ins after insert on public.seller_reviews
  for each row execute function public._reviews_avg_sync();
create trigger reviews_avg_del after delete on public.seller_reviews
  for each row execute function public._reviews_avg_sync();

create or replace function public.leave_review(_order_id uuid, _rating int, _comment text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_order public.orders;
  v_id uuid;
begin
  if v_user is null then return jsonb_build_object('ok', false, 'error', 'unauthorized'); end if;
  if _rating < 1 or _rating > 5 then return jsonb_build_object('ok', false, 'error', 'invalid_rating'); end if;
  select * into v_order from public.orders where id = _order_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'order_not_found'); end if;
  if v_order.buyer_id <> v_user then return jsonb_build_object('ok', false, 'error', 'not_buyer'); end if;
  if v_order.fulfillment_status <> 'delivered' then
    return jsonb_build_object('ok', false, 'error', 'not_delivered');
  end if;
  insert into public.seller_reviews (seller_id, reviewer_id, order_id, rating, comment)
    values (v_order.seller_id, v_user, _order_id, _rating, nullif(trim(coalesce(_comment,'')), ''))
  on conflict (order_id) do update
    set rating = excluded.rating, comment = excluded.comment
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

grant execute on function public.leave_review(uuid, int, text) to authenticated;

-- 4. Stock decrement on shop-linked live purchases
create or replace function public.purchase_fixed_price(_product_id uuid, _buyer_identity text)
returns live_products
language plpgsql security definer set search_path = public as $$
declare v_row public.live_products;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  perform public.assert_user_active();
  select * into v_row from public.live_products where id = _product_id for update;
  if not found then raise exception 'Product not found'; end if;
  if v_row.mode <> 'fixed' then raise exception 'Not a fixed-price product'; end if;
  if v_row.status not in ('active','upcoming') or v_row.stock <= 0 then raise exception 'Out of stock'; end if;
  update public.live_products
     set stock = v_row.stock - 1,
         status = case when v_row.stock - 1 <= 0 then 'out' else 'active' end,
         sold_to_identity = coalesce(sold_to_identity, _buyer_identity),
         final_price = coalesce(final_price, price)
   where id = _product_id returning * into v_row;
  if v_row.shop_product_id is not null then
    update public.shop_products
       set stock = greatest(stock - 1, 0),
           active = case when stock - 1 <= 0 then false else active end,
           updated_at = now()
     where id = v_row.shop_product_id;
  end if;
  return v_row;
end $$;

create or replace function public.finalize_auction_winner(_live_id uuid, _product_id uuid, _winner_id uuid, _winner_name text, _final_price numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_caller uuid := auth.uid();
  v_live public.lives;
  v_product public.live_products;
  v_currency text;
  v_order public.orders;
  v_platform_fee numeric;
  v_seller_net numeric;
  v_wallet public.wallets;
  v_new_balance numeric;
  v_auto_paid boolean := false;
begin
  if v_caller is null then return jsonb_build_object('ok', false, 'error', 'unauthorized'); end if;
  select * into v_live from public.lives where id = _live_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'live_not_found'); end if;
  if v_live.seller_id <> v_caller and not public.is_admin(v_caller) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  select * into v_product from public.live_products where id = _product_id and live_id = _live_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'product_not_found'); end if;

  if _winner_id is null or _final_price is null or _final_price <= 0 then
    update public.live_products
       set status = 'unsold', sold_to_identity = null, final_price = null, price = start_price
     where id = _product_id;
    return jsonb_build_object('ok', true, 'order_id', null, 'auto_paid', false, 'unsold', true);
  end if;

  update public.live_products
     set status = 'sold', sold_to_identity = _winner_name, final_price = _final_price
   where id = _product_id;

  if v_product.shop_product_id is not null then
    update public.shop_products
       set stock = greatest(stock - 1, 0),
           active = case when stock - 1 <= 0 then false else active end,
           updated_at = now()
     where id = v_product.shop_product_id;
  end if;

  select * into v_order from public.orders
    where product_id = _product_id and kind = 'auction' and buyer_id = _winner_id
    order by created_at desc limit 1;

  v_currency := upper(coalesce(v_live.currency, 'EUR'));
  v_platform_fee := round(_final_price * 5 / 100 * case when v_currency = 'XOF' then 1 else 100 end) /
                    case when v_currency = 'XOF' then 1 else 100 end;
  v_seller_net := _final_price - v_platform_fee;

  if v_order.id is null then
    insert into public.orders (
      buyer_id, seller_id, live_id, product_id, kind,
      item_name, item_image, amount, platform_fee, processing_fee,
      seller_net, total, currency, status, payment_method, payment_deadline
    ) values (
      _winner_id, v_live.seller_id, _live_id, _product_id, 'auction',
      v_product.name, v_product.image_url, _final_price, v_platform_fee, 0,
      v_seller_net, _final_price, v_currency, 'pending', 'card',
      now() + interval '24 hours'
    ) returning * into v_order;
  end if;

  if v_order.status <> 'pending' then
    return jsonb_build_object('ok', true, 'order_id', v_order.id, 'auto_paid', v_order.status = 'paid');
  end if;

  select * into v_wallet from public.wallets where user_id = _winner_id for update;
  if v_wallet.user_id is not null and upper(v_wallet.currency) = v_currency and v_wallet.balance >= v_order.total then
    v_new_balance := v_wallet.balance - v_order.total;
    update public.wallets set balance = v_new_balance, updated_at = now() where user_id = _winner_id;
    update public.orders set status = 'paid', payment_method = 'wallet', paid_at = now() where id = v_order.id;
    insert into public.wallet_transactions (user_id, type, amount, balance_after, order_id, status)
      values (_winner_id, 'purchase', -v_order.total, v_new_balance, v_order.id, 'completed');
    perform public.credit_seller_earning(v_order.id);
    v_auto_paid := true;
  end if;

  return jsonb_build_object('ok', true, 'order_id', v_order.id, 'auto_paid', v_auto_paid, 'deadline', v_order.payment_deadline);
end $$;
