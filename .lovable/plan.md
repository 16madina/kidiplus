# Real seller shop + real seller profile (follows, boutique, reviews)

Big migration + broad UI rewrite. Grouping into 4 workstreams. Approving this runs one DB migration + creates a `shop-products` storage bucket, then the code changes.

## 1. DB migration (single file)

### `follows`
```sql
create table public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followed_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  check (follower_id <> followed_id)
);
grant select on public.follows to authenticated;
grant insert, delete on public.follows to authenticated;
grant all on public.follows to service_role;
alter table public.follows enable row level security;
create policy "read follows" on public.follows for select to authenticated using (true);
create policy "follow self only" on public.follows for insert to authenticated
  with check (follower_id = auth.uid());
create policy "unfollow self only" on public.follows for delete to authenticated
  using (follower_id = auth.uid());
alter publication supabase_realtime add table public.follows;
```

Add `followers_count int not null default 0`, `following_count int not null default 0`, `rating_avg numeric(3,2) not null default 0`, `rating_count int not null default 0` to `profiles`.

Trigger `_follows_counts_sync()` on insert/delete: bump/decrement `followers_count` on `followed_id` and `following_count` on `follower_id`.

### `shop_products`
```sql
create table public.shop_products (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
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
create policy "read active shop products" on public.shop_products for select to authenticated
  using (active or seller_id = auth.uid());
create policy "seller manages own products" on public.shop_products for all to authenticated
  using (seller_id = auth.uid()) with check (seller_id = auth.uid());
create trigger shop_products_touch before update on public.shop_products
  for each row execute function public.touch_updated_at();
```

Add `shop_product_id uuid references public.shop_products(id) on delete set null` to `live_products`.

Storage bucket `shop-products` (public read; auth insert/update/delete on `<uid>/*`).

### `seller_reviews`
```sql
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
```
Insert is via `leave_review(_order_id, _rating, _comment)` SECURITY DEFINER RPC that verifies `orders.buyer_id = auth.uid()` and `fulfillment_status = 'delivered'`.

Trigger `_reviews_avg_sync()` on insert: recompute `profiles.rating_avg / rating_count` for `seller_id`.

### Stock decrement for shop-linked live purchases

Patch `purchase_fixed_price` and `finalize_auction_winner`: after committing the sale, if `live_products.shop_product_id is not null`, `update shop_products set stock = greatest(stock - 1, 0), active = case when stock - 1 <= 0 then false else active end` for that shop product.

## 2. Follows (frontend)

- New `src/lib/follows-db.ts`: `followUser`, `unfollowUser`, `isFollowing(sellerId)`, `useFollow(sellerId)` (returns `{ following, toggle, count }` with optimistic UI + realtime sub on `follows` filtered by `followed_id=eq.<id>`).
- Wire `<FollowButton />` (new small component) into:
  - `real-live-viewer-screen.tsx` (host header)
  - `seller-profile-screen.tsx`
- Profile stats (`profile-screen.tsx`): read `followers_count`, `following_count` from `profiles`; Ventes = `orders count where seller_id = me and status = 'paid'`.

## 3. Shop catalog (frontend)

- New `src/lib/shop-db.ts`: `listMyShopProducts`, `listSellerShopProducts(sellerId)`, `createShopProduct`, `updateShopProduct`, `archiveShopProduct`, `uploadShopProductImage(file)`.
- New `src/screens/my-shop-screen.tsx`: 2-col grid of own products, active/archived badge, edit + activate/deactivate. `+ Ajouter` opens sheet (photo → shop-products/<uid>/<ts>.jpg, name, description, price in seller currency, stock).
- Own-profile page (`profile-screen.tsx`) gets a "Ma boutique" row (sellers only) that pushes `MyShopScreen`.

## 4. Live integration

- `AddProductSheet` (`src/components/broadcast/add-product-sheet.tsx`) and the broadcast SETUP product step: add a prominent "📦 Choisir depuis ma boutique" button opening `<ShopPickerSheet />` (new).
- `ShopPickerSheet`: multi-select grid of active `shop_products`. Confirm → for each selected item, insert into `live_products` with `shop_product_id`, `name`, `image_url`, `price` (fixed) or `start_price` + `timer_seconds` (auction). Quick config step lets user set mode/start/duration per selected item (default: fixed at current price).
- `live_products` insert already goes through existing seller policy — augment with `shop_product_id`.

## 5. Seller profile screen (real data)

Rewrite `src/components/seller-profile/seller-profile-screen.tsx`:
- Header: avatar via `resolveAvatarUrl`, real `followers_count`, real paid-orders count (query), `rating_avg`/`rating_count` (show `—` when 0), real `<FollowButton />`.
- Tabs "Boutique" / "Lives" / "Avis":
  - Boutique: `listSellerShopProducts(sellerId)` grid; tap → `<ShopProductSheet />` (read-only + "Voir les lives" CTA).
  - Lives: `fetchSellerLives(sellerId)` (new in `lives-db.ts`) → live / scheduled / ended sections.
  - Avis: `listSellerReviews(sellerId)` → cards with stars, comment, reviewer handle+avatar.
- Delete `src/lib/seller-mock.ts` (or leave the file, delete only shop/review/follower mock fields no longer referenced by that screen).

## 6. Reviews UX

- `src/lib/reviews-db.ts`: `leaveReview(orderId, rating, comment)`, `getMyReviewForOrder(orderId)`, `listSellerReviews(sellerId)`.
- Add "Laisser un avis ⭐" button on delivered orders in `order-timeline.tsx` (or the order detail surface) → sheet with 5 tappable stars + optional comment.
- Show existing review if already left (star row + comment).

## 7. i18n keys (fr + en)

`follow.follow`, `follow.following`, `shop.title`, `shop.empty`, `shop.add`, `shop.editItem`, `shop.name`, `shop.price`, `shop.stock`, `shop.active`, `shop.archived`, `shop.pickFromShop`, `shop.pickTitle`, `shop.availableInLives`, `reviews.title`, `reviews.leave`, `reviews.rate`, `reviews.commentPlaceholder`, `reviews.thanks`, `reviews.empty`, `profile.myShop`, `sellerProfile.tabs.shop`, `sellerProfile.tabs.lives`, `sellerProfile.tabs.reviews`, `sellerProfile.noRating`.

## Files touched

New: `src/lib/follows-db.ts`, `src/lib/shop-db.ts`, `src/lib/reviews-db.ts`, `src/components/follow-button.tsx`, `src/screens/my-shop-screen.tsx`, `src/components/shop/shop-product-form-sheet.tsx`, `src/components/shop/shop-picker-sheet.tsx`, `src/components/shop/shop-product-sheet.tsx`, `src/components/orders/leave-review-sheet.tsx`, migration file.

Edited: `src/components/live-viewer/real-live-viewer-screen.tsx`, `src/components/broadcast/add-product-sheet.tsx`, `src/components/broadcast/broadcast-setup.tsx`, `src/components/broadcast/broadcast-live.tsx`, `src/components/seller-profile/seller-profile-screen.tsx`, `src/screens/profile-screen.tsx`, `src/components/orders/order-timeline.tsx`, `src/lib/lives-db.ts`, `src/i18n/fr.json`, `src/i18n/en.json`.

## Post-implementation checklist

- Suivre/Abonné toggles work + persists + count updates in real time on two clients.
- Boutique CRUD works with photo upload; archived items hidden from viewers.
- Live setup: picking 3 shop items → 3 live_products appear with correct name/image/price and `shop_product_id`.
- Fixed-price purchase during live decrements `shop_products.stock`.
- Seller profile shows real avatar/counts/lives/reviews; no mock data remains.
- Buyer can leave 1 review per delivered order; `rating_avg` updates on seller profile.

Nothing on the seller profile stays mock after this ships.
