# Go Live Entry Screen + Scheduled Lives

## Overview
Replace the direct-to-setup Go Live tap with a branded choice screen (Start now / Schedule) and add end-to-end scheduling: create, edit, cancel, start-when-ready, viewer "coming up" section with reminders.

## Flow

### Seller
```
Tap Go Live (center tab)
   │
   ▼
Entry Screen (navy gradient, KiDi+ branding, X close)
 ├── 🔴 Commencer un live      → existing setup → live
 ├── 📅 Programmer un live     → setup + date/time → scheduled
 └── Mes lives programmés (list)
        • Démarrer maintenant  → flips to live, lands in broadcast
        • Modifier             → setup pre-filled, save updates row
        • Annuler (confirm)    → delete row + products
```

If a scheduled live's time has arrived, its row shows a pulsing gold "C'est l'heure ! Démarrer" pill.

### Viewer
- Home feed gets a "À venir 📅" horizontal section listing `status='scheduled' AND scheduled_at > now() - 1h`.
- Card = cover + seller + title + date chip ("Ce soir 20h", "Demain 14h", "Jeu. 12 juin 15:00").
- Tap opens a preview sheet (cover, seller + Suivre, title, product count, scheduled date, "Me rappeler 🔔").
- Reminder button inserts into `live_reminders (user_id, live_id)`.
- Scheduled lives are never joinable; the viewer route only opens when `status='live'`.

## Data Model

Migration:
- `ALTER TABLE lives` drop existing status check; re-add including `'scheduled'`.
- `ALTER TABLE lives ADD COLUMN scheduled_at timestamptz` (nullable).
- Index on `(status, scheduled_at)` for feed queries.
- New `live_reminders` table:
  - `user_id uuid` + `live_id uuid` composite PK
  - FKs to `auth.users` (cascade) and `public.lives` (cascade)
  - `created_at timestamptz default now()`
  - GRANTs: `authenticated` (all), `service_role` (all)
  - RLS: owner-only (`auth.uid() = user_id`), plus a permissive read for the live's seller so start-hook can fanout via RLS if needed (we'll use `supabaseAdmin` for fanout, so seller-read policy is optional; keep strict owner-only).

Ghost cleanup: extend `expireOverdueOrders`-style opportunistic call — new `cancelStaleScheduledLives()` deletes scheduled rows where `scheduled_at < now() - interval '24 hours'`.

## Server-side pieces

- `lives-db.ts`:
  - `createScheduledLive(...)` — insert `status='scheduled'`, `scheduled_at`, upload cover + products immediately (reuse existing product-image upload path).
  - `updateScheduledLive(id, patch)` — title/cover/scheduled_at + product diff (simplest: replace all products).
  - `cancelScheduledLive(id)` — delete row (products cascade).
  - `startScheduledLive(id)` — `UPDATE lives SET status='live', started_at=now(), room_name=... WHERE id=... AND status='scheduled' AND seller_id=auth.uid()` (RLS enforces seller). Returns the row.
  - `fetchMyScheduledLives(sellerId)`.
  - `fetchUpcomingScheduledLives()` — public feed query, `status='scheduled' AND scheduled_at > now() - interval '1 hour'`, order by `scheduled_at asc`, limit 20.
  - `cancelStaleScheduledLives()` — opportunistic cleanup.
- `live-reminders-db.ts`:
  - `addReminder(liveId)`, `removeReminder(liveId)`, `hasReminder(liveId)`.
- Start-transition fanout: in `startScheduledLive` (client-side, so no server fn needed for MVP), after flipping to live, insert `notifications` rows for every `live_reminders.user_id`. Use a simple `.from('live_reminders').select('user_id')` then bulk insert via existing notifications helper. If notifications table already has a fanout pattern for live starts, reuse it; otherwise plain insert.

## UI

### New files
- `src/screens/golive-entry-screen.tsx` — the choice screen.
- `src/components/broadcast/scheduled-lives-list.tsx` — seller's scheduled list.
- `src/components/broadcast/schedule-datetime-sheet.tsx` — French-locale date/time picker (native `<input type="datetime-local">` styled as a big pill, min = now+15min, max = now+30d).
- `src/components/home/upcoming-lives-row.tsx` — viewer horizontal carousel.
- `src/components/home/scheduled-live-sheet.tsx` — preview sheet with Me rappeler.
- `src/lib/live-reminders-db.ts`.

### Modified
- `src/screens/live-screen.tsx` — new stages: `entry`, `setup` (existing), `schedule` (setup variant with datetime), `live`, `summary`. Entry is the default when seller has no in-progress flow. `mode: 'now' | 'schedule' | 'edit'` on the setup component drives CTA label + submission path.
- `src/lib/broadcast-context.tsx` — extra state: `mode`, `scheduledAt`, `editingLiveId`. New actions: `goEntry`, `goSchedule`, `startFromScheduled(id)`, `loadScheduledIntoForm(id)`.
- `src/components/broadcast/broadcast-setup.tsx` — accept `mode`, render datetime block in schedule/edit mode, CTA text switches ("Lancer le live" / "Programmer le live 📅" / "Enregistrer les modifications"), submission calls the right db helper. Keep the existing camera preview only in `mode==='now'`.
- `src/lib/lives-db.ts` — new helpers + extend `LiveRow` types.
- `src/screens/home-screen.tsx` — mount `UpcomingLivesRow` above/below grid depending on live count.
- Opportunistic cleanup call: `cancelStaleScheduledLives()` invoked alongside `expireOverdueOrders` in `src/components/app-shell.tsx`.
- `src/i18n/fr.json` + `src/i18n/en.json` — `golive.entry.*`, `schedule.*`.

### Design language
Entry screen: full-bleed navy gradient (`oklch(0.18 0.05 260)` → `oklch(0.12 0.03 260)`) matching existing dark surfaces, KiDi+ wordmark up top, X (top-left, safe-area), two big cards with rounded-3xl, gold 1px border (`oklch(0.78 0.13 85)` at 40%), soft inner shadow, icon in a gold-tinted circle, title in white bold, subtitle muted. Press states use existing `<Press>` scale. Below the two cards, a compact list of scheduled lives if any.

## Guardrails / assumptions
- One-scheduled-live edit reuses the existing setup UI to keep behaviour identical; on save we replace all products (users editing a schedule expect this).
- "Me rappeler" fanout runs client-side in `startScheduledLive` — good enough for MVP, avoids new cron.
- Datetime picker uses native `<input type="datetime-local">` styled to match; keeps things reliable across iOS/Android/web with French locale via `Intl.DateTimeFormat('fr-FR')` for display.
- If no live-start push infra exists, insert in-app notifications only; do not attempt to send FCM push (avoids new server plumbing).

## Order of work
1. Migration (status check + `scheduled_at` + `live_reminders`).
2. `lives-db.ts` + `live-reminders-db.ts` helpers.
3. i18n keys.
4. `broadcast-context.tsx` + `live-screen.tsx` stages.
5. `golive-entry-screen.tsx`, scheduled list, schedule sheet.
6. `broadcast-setup.tsx` mode support.
7. Viewer: `UpcomingLivesRow`, `ScheduledLiveSheet`, home wiring.
8. Opportunistic cleanup hook in app-shell.
9. Typecheck.

## What the buyer sees (summary)
- New "À venir 📅" row on home listing upcoming lives with a friendly date chip.
- Tap → preview sheet with cover, seller (+Suivre), product count, scheduled time, and "Me rappeler 🔔".
- Reminder is stored per user; when the seller flips the schedule to live, the buyer gets an in-app notification and can then join the live normally through the existing home grid.
- Scheduled cards never open the live viewer directly.
