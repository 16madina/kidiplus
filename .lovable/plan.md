# Final pre-submission pass — proposed plan

This request bundles two very large workstreams. To ship it honestly (no "I checked everything" hand-waving), I want to confirm the scope and order before touching code. Please skim and correct anything.

## Priority 1 — Rebuild the vertical live pager (TikTok-style)

### Architecture

```text
<LiveViewerPager>                       // fixed inset-0, bg-black
  ├─ <PagerDragLayer>                   // absolute inset-0, z-10
  │     touch-action: none              // CRITICAL for iOS
  │     -webkit-user-select: none
  │     framer-motion drag="y"
  │     onDragEnd → commit if |offset|>90 or velocity>500
  │
  ├─ <LiveSlot current />               // z-0, full video + poster
  ├─ <LiveSlot next  preloadPoster />   // z-0, offscreen translateY(100%)
  │
  └─ <InteractiveOverlay>               // z-20, pointer-events:none root
        └─ children (chat, rail, sheets, X, featured) all pointer-events:auto
```

- One `Room` connection at a time. On commit: animate current out, `disconnectRoom`, mount next slot, `connectRoom`, animate in. Reuses existing `real-live-viewer-screen` lifecycle — extracted into a `<LiveSlot>` component.
- Playlist source: `useLiveViewer().playlist` already exists and is populated by `openList`. I'll verify every home/explore/profile entry point calls `openList` (not `open`) with the real-lives array + current index, and add a fallback that queries "other currently-live streams" when the playlist has only 1 item.
- Gesture gate: disabled when any bottom sheet is open, chat input focused, or `playlist.length < 2` (rubber-band bounce instead).
- iOS specifics: `touch-action:none` on drag layer, `overscroll-behavior:none` on `<body>` while pager mounted, no parent with `overflow:auto`.
- Temporary `console.debug("[pager]", ...)` on touchstart / drag / commit, tagged so we can grep and remove later.

### Files touched
- `src/components/live-viewer/live-viewer-pager.tsx` (new)
- `src/components/live-viewer/live-slot.tsx` (new — extracted from real viewer)
- `src/components/live-viewer/real-live-viewer-screen.tsx` (thin wrapper → pager)
- `src/lib/live-viewer-context.tsx` (add `refreshPlaylist()` to top up when only 1 live)
- Call-site audit: home, explore, profile → ensure `openList`

## Priority 2 — Full A→Z interactive audit

This is genuinely large (I count ~120+ tappables across the surfaces you listed). To do it honestly I want to split it into **three sub-passes**, each with its own commit, rather than one mega-PR where I'd inevitably skim:

1. **Sub-pass A — Live viewer + Host + Home** (share w/ real Web Share + `/live/$id` public route, bell → activity, filter pills wired or removed, demo card confirmed, every rail/sheet button).
2. **Sub-pass B — Explorer + Activité + Seller profile + Wallet/Gains + Auth** (forgot-password E2E, notification rows routed, order rows → detail, tabs, product sheets).
3. **Sub-pass C — Profile (own) + Admin + dead-row cleanup** (remove every "coming soon" toast; if no feature behind a row, delete the row per your instruction).

Each sub-pass ends with:
- A concrete **audit table** (Screen · Element · Status before · Action taken · Status after).
- `tsgo` typecheck.
- Playwright smoke on the changed surfaces where meaningful.

## Questions before I start

1. **OK to split Priority 2 into 3 commits** as above? (Doing it in one turn will exceed reliable working memory and I'd rather be honest than claim-and-miss.)
2. **Public `/live/$id` route for sharing**: should an unauthenticated visitor see the live directly, or land on a "sign in / install app" page that then opens the live? (Impacts share UX + App Store review.)
3. **Dead rows in Profile**: confirm the rule is **remove** (not "grey out") when no feature exists. Any rows you want kept as-is even without a feature (e.g. legal placeholders)?
4. **Priority order**: do Priority 1 first (single commit), then Priority 2 A/B/C — correct?

Reply with answers (or "go, defaults") and I'll start with Priority 1 immediately.