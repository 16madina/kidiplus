# Broadcast host overhaul + Live Moderators

Big scope — grouping into 4 parallel workstreams. Approving this plan runs a DB migration for moderators; the rest is code only.

## 1. Compact top bar (broadcast-live.tsx)

Rebuild the top row so nothing overflows at 320pt:

```text
[● 00:28] [👁 1]                        [📦³] [❌ Fin]
```

- Merge red dot + timer into one glass pill: pulsing red dot + `mm:ss` (no "EN DIRECT" text).
- Viewer count: eye icon + number, glass pill.
- Products: icon-only glass button (📦) with count badge; no text.
- REMOVE the top-bar refresh/flip button (moves to the rail).
- "Terminer" becomes a compact red icon+word pill (`min-w-0`, tight padding).
- Stats strip (Ventes / Articles) stays below, one size smaller.
- Layout uses `grid-cols-[auto_auto_1fr_auto_auto]` + `min-w-0` to guarantee no overflow.

## 2. Right-side tool rail (new component `HostToolRail`)

Vertical column pinned to the right edge, vertically centered above the featured card, safe-area aware. TikTok-style 44pt circular glass buttons, tiny label under each:

- 🎤 mic on/off
- 📷 camera on/off
- 🔄 flip camera (hidden when only 1 videoinput device)
- ✨ filters (hidden when `captureStream` unavailable)
- ➕ add product

Bottom-center dock becomes chat-only (mic/cam buttons removed from there).

## 3. Fix camera flip (broadcast-video.tsx)

- Track the current `facingMode` in a ref; on flip button, call `localParticipant.getTrackPublication(Video).videoTrack.restartTrack({ facingMode })` when live; on the setup preview, re-`getUserMedia` with the new constraint.
- Detect single-camera devices with `navigator.mediaDevices.enumerateDevices()` and expose an `canFlip` flag through `onStatus`/a new callback so the rail hides the button.
- Haptic + 180° spin animation on tap.

## 4. Camera filters (new `camera-filter-pipeline.ts` + rail integration)

Real filter — not CSS on the local preview:

1. Get the raw camera `MediaStreamTrack` (max 720p already enforced by LiveKit config; add `resolution: { width: 1280, height: 720 }` if not).
2. Draw it into an offscreen `<canvas>` via a hidden `<video>` element inside a `requestAnimationFrame` loop, applying `ctx.filter = "brightness(1.1) contrast(1.05) …"` per preset.
3. `canvas.captureStream(30)` → replace the published video track using LiveKit's `LocalTrack.replaceTrack(newTrack)` (or unpublish/publish if replace is unavailable).
4. "Aucun" stops the rAF loop and republishes the raw track (zero overhead).
5. Basic fps guard: sample `performance.now()` deltas over 2s; if avg fps < 18, toast "Filtres indisponibles sur cet appareil" and revert to raw.
6. Hide the Filters button when `HTMLCanvasElement.prototype.captureStream` is missing.

Presets (CSS filter strings):
- Aucun: none
- Lumineux: `brightness(1.12) contrast(1.06)`
- Chaleur: `saturate(1.15) sepia(0.12) hue-rotate(-8deg)`
- Doux: `brightness(1.05) blur(0.6px) contrast(0.95)`
- N&B: `grayscale(1) contrast(1.05)`
- Vif: `saturate(1.35) contrast(1.12)`

Picker UI: tapping the Filters rail button toggles a horizontal chip strip anchored just left of the rail. Selected chip gets a gold ring. Persisted in `sessionStorage`.

## 5. Add product mid-live (already exists — verify + wire)

`AddProductSheet` + `onAddProductMidLive` already exist in `broadcast-live.tsx`. Wire the new rail's "+" button to open the same sheet. Also verify the "Ajouter un article" row appears at the top of the Products bottom sheet (add if missing).

## 6. Live moderators (DB + UX)

### DB migration

```sql
create table public.live_moderators (
  live_id  uuid not null references public.lives(id) on delete cascade,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  added_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (live_id, user_id)
);
grant select, insert, delete on public.live_moderators to authenticated;
grant all on public.live_moderators to service_role;
alter table public.live_moderators enable row level security;

-- Any authenticated user can read moderators for a live
create policy "read moderators" on public.live_moderators
  for select to authenticated using (true);

-- Only the live's host can add / remove moderators
create policy "host manages moderators" on public.live_moderators
  for insert to authenticated
  with check (exists (select 1 from public.lives l where l.id = live_id and l.user_id = auth.uid()));
create policy "host removes moderators" on public.live_moderators
  for delete to authenticated
  using (exists (select 1 from public.lives l where l.id = live_id and l.user_id = auth.uid()));

-- Extend live_products policies: seller OR moderator can manage products
create or replace function public.is_live_moderator(_live_id uuid, _user_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.live_moderators where live_id=_live_id and user_id=_user_id)
$$;

-- Replace existing seller-only INSERT/UPDATE policies on live_products
-- to also allow moderators (see migration file for full policy names).

alter publication supabase_realtime add table public.live_moderators;
```

### Client

- New `src/lib/moderators-db.ts`: `fetchModerators`, `addModerator`, `removeModerator`, `useIsModerator(liveId)` hook (realtime `postgres_changes` on `live_moderators` filtered by `live_id=eq.<liveId>` and `user_id=eq.<me>`).
- HOST UX: tapping a chat message author opens a mini profile sheet with "Nommer modérateur 🛡️" / "Retirer modérateur". Products sheet gets a "Modérateurs" section listing current mods with a remove action + an "Ajouter" flow that opens the same author-picker (or an input).
- MODERATOR UX (viewer side): when `useIsModerator` returns true for the current live, show a 🛡️ badge next to their own chat messages (LiveChat already renders per-user color; add an optional `isModerator` flag), and surface a compact "Gérer" dock button that opens a moderator products sheet with feature / start auction / put on sale actions + add-product. Start-auction is allowed for moderators. End-live and end-auction stay host-only (finalize uses server-authoritative logic; keep the RPC seller-only for now).

### i18n (fr + en)

`moderator.title`, `moderator.promote`, `moderator.demote`, `moderator.badge`, `moderator.list`, `moderator.empty`, `moderator.manage`, `moderator.startAuction`, `moderator.addProduct`, `moderator.confirmDemote`.

## Files touched

- `src/components/broadcast/broadcast-live.tsx` — top bar rebuild, remove bottom center mic/cam, mount rail.
- `src/components/broadcast/broadcast-video.tsx` — flip + filter pipeline hooks.
- `src/components/broadcast/host-tool-rail.tsx` — new.
- `src/components/broadcast/filter-picker.tsx` — new.
- `src/lib/camera-filter-pipeline.ts` — new.
- `src/lib/moderators-db.ts` — new.
- `src/components/live-viewer/moderator-dock.tsx` — new (viewer moderator surface).
- `src/components/live-viewer/live-chat.tsx` — add shield badge.
- `src/components/live-viewer/real-live-viewer-screen.tsx` — wire moderator surface.
- `src/i18n/fr.json`, `src/i18n/en.json` — moderator keys + rail labels.
- `supabase/migrations/<ts>_live_moderators.sql` — table + policies + policy update on live_products.

## Testing checklist

- 320pt viewport: top bar has no clipped element; "Terminer" fully visible.
- Rail vertically stacked, doesn't collide with featured card or safe-area.
- Camera flip actually toggles the published track (viewers see the new camera).
- Single-camera device: flip button hidden.
- Each filter visible to a second-tab viewer within ~1s of selection.
- Slow device fps guard: force a heavy filter on low-end → reverts + toast.
- "Aucun" republishes raw (verify by checking CPU drops / no rAF running).
- Add-product from rail: new row appears in queue for host + viewers.
- Host promotes a viewer → viewer sees shield badge + moderator dock within 2s.
- Moderator can add product + start auction; cannot end live or end auction.
- Removing a moderator revokes badge + dock within 2s.
