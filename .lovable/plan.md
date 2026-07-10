## Three-part scope

### 1) Vertical swipe between lives (fix)

**Root cause:** the swipe surface at `z-10` is under the top-bar drag layer (`z-30`) and the chat layer at `z-20`; on mobile, chat + gradient overlays sit on top over most of the screen, so touches on the video area (top-center) still hit gradient wrappers or top bar first. Even where nothing overlays, `LiveChat` and product areas eat gestures. Also `hasNext`/`hasPrev` in `useLiveViewer` may return false when there aren't multiple live streams cached.

**Fixes** in `src/components/live-viewer/real-live-viewer-screen.tsx` + `src/lib/live-viewer-context.tsx`:
- Verify/repair the "other lives" list: query `lives` where `status='live'` and `id != current`, ordered by viewers desc; expose ordered list to context (log length for debug).
- Lower thresholds: `Math.abs(info.offset.y) > 60 || Math.abs(info.velocity.y) > 400`.
- Move the swipe overlay above chat's non-interactive rows: keep `LiveChat` `pointer-events-none` on its container with only messages having `pointer-events-auto` — verify. Add `touch-action: pan-y` to the swipe layer (framer-motion sets this but confirm).
- Ensure the swipe layer is a full-height surface excluding: composer area, product carousel, top-bar, moderator dock, gift tray button — those already sit at higher z with `pointer-events-auto`.
- Add desktop up/down chevron buttons on the right edge (mobile hidden) as fallback.
- One-time onboarding hint stored in `localStorage` key `hint.liveSwipe.v1`: floating "Glisse vers le haut pour le live suivant ↑", auto-hides after 3s or first swipe.

### 2) Camera flip lag (fix)

**Root causes to address** in the broadcaster flip logic (find via `rg`):
- Stop every old track (`.stop()`) before/after `replaceTrack` and unpublish stale LocalVideoTrack. Also stop any preview `MediaStream`.
- Request lightweight constraints: `{ width:{ max:1280 }, height:{ max:720 }, frameRate:{ ideal:30, max:30 }, facingMode:{ exact:'user'|'environment' } }`.
- Reuse existing publish options (simulcast + encodings) when calling `publishTrack` or better `LocalParticipant.setCameraEnabled(false)` → `switchActiveDevice('videoinput', deviceId)` from LiveKit which preserves simulcast.
- Confirm no `canvas.captureStream()` remains in the pipeline.
- Add `console.time('camera.flip.total')` around the swap with intermediate marks.

### 3) Verified badge system (new)

**DB migration:**
- Add `profiles.is_verified boolean default false`.
- Create `verification_requests(id, user_id, message text, status text default 'pending' check in ('pending','approved','rejected'), reviewed_by uuid, reviewed_at timestamptz, note text, created_at timestamptz default now())`.
- GRANTs, RLS: user can insert own (partial unique on `(user_id) where status='pending'` — one pending max), select own; admins select all via `has_role`.
- RPCs:
  - `request_verification(_message text)`: checks eligibility (`is_seller`, ≥10 delivered orders as seller, avg rating from `seller_reviews` ≥4.0 with ≥5 reviews, `now()-created_at ≥ interval '30 days'`, no active row in `user_sanctions`); inserts pending; blocks duplicates.
  - `admin_review_verification(_id uuid, _approve boolean, _note text)`: admin-only via `has_role`; on approve sets `profiles.is_verified=true`, sends an `admin_messages` row "Félicitations, ton compte est certifié ✓".
  - `admin_set_verified(_user uuid, _verified boolean)`: revoke/re-grant.
  - `verification_eligibility(_user uuid)`: returns booleans `{is_seller, sales_ok, rating_ok, age_ok, no_sanction, sales_count, rating_avg, review_count, age_days}` for the checklist UI.

**Client:**
- `src/components/verified-badge.tsx`: shared small gold/blue check with tooltip. Props: `verified: boolean`, `size?: number`.
- Wire into: seller profile header, search results, live viewer seller chip, chat messages (author line), feed cards, winner reveal — grep and edit.
- `src/lib/verification-db.ts`: fetch eligibility, submit request, admin list/approve/reject.
- Profile screen: "Certification ✓" row for sellers with checklist + button + pending/verified states.
- Admin panel: new "Certifications" tab (or section) listing pending requests with stats snapshot + Approve/Reject; user detail drawer gets revoke toggle.
- i18n `verify.*` keys in fr+en.
- Typecheck.

## Assumptions
- Live count with two concurrent lives is testable; I'll add a debug log.
- Admin panel already exists (I'll locate it via ripgrep).
- Broadcaster uses LiveKit `Room` — will confirm before editing.
- `admin_messages` schema supports system messages to a specific user.

Proceeding as three commits: (A) swipe, (B) camera flip, (C) verified badge. Typecheck after all three.