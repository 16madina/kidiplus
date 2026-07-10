## Goals

1. Each of the 6 gifts gets its own choreography that escalates with price. A 100 F Rose feels modest; a 5000 F Lion feels premium.
2. Currency never blocks participation. Gifts, bids and purchases work across currencies via server-side conversion. Bid/buy is gated by **delivery**, not currency.

---

## 1. Distinct gift animations

Rewrite `src/components/live-viewer/gift-animations.tsx` with one component per gift key. All animations use `transform`/`opacity`/`filter`; particles are precomputed with `useMemo`. Only 1 tier-3 (rocket, lion) plays at a time; tier-1/2 keep the existing max-2 queue.

- **Rose (100)** — ~2s. 3–5 rose petals (🌹/🌸) float up from the bottom center with slight lateral sway (`sin`). Small sender chip. No screen effect.
- **Cœur d'or (250)** — ~2s. One large 💛 pops in centre-low with a two-beat pulse (`scale [0, 1.3, 1, 1.2, 1]`), 4–6 tiny ✨ orbit outward. Soft gold glow.
- **Diamant (500)** — ~2.5s. 💎 drops from top-centre, lands, then a horizontal light-ray glint sweeps left→right across the diamond and a 6-point sparkle burst radiates on landing.
- **Couronne (1000)** — ~3s. 👑 descends and settles centre. A vertical royal-shine sweep passes across it (linear-gradient band translating). Gold particle rain (✨) falls full-width, delayed & staggered.
- **Fusée (2500)** — ~3s. 🚀 flies bottom-left → top-right with a particle trail (💨/🔥 spawned along the path). Edge glow pulses. Very subtle screen shake (±4 px, 3 oscillations, 0.6 s). Streak line behind the rocket.
- **Lion (5000)** — ~4s. Sequence: (a) 200 ms gold radial flash filling the screen, (b) 🦁 scale-in with 6-frame shake to centre, (c) full-width gold banner `🦁 {sender} a envoyé un LION !` slides in from left and rests, (d) heavy gold confetti rains over ~2 s, (e) fade. Sender gets `haptic.heavy()`; other viewers get `haptic.medium()`.

Queue rule: tier-3 items acquire an exclusive slot; if one is already playing, new tier-3 events queue FIFO.

## 2. Cross-currency money layer

### 2.1 `src/lib/money.ts`

Add:
- `FX_MARGIN = 0.015` (1.5 % safety margin, applied to non-peg pairs).
- `convertMoney(amount, from, to, { margin?: boolean }): number` — the settlement-grade converter. Uses fixed peg XOF↔EUR (655.957, margin **off** because it's a peg), and EUR↔CAD with `FX_MARGIN` applied when `margin: true` (default true). Rounds via `roundForCurrency`.
- `formatConvertedHint(amount, from, to, locale)` — returns `"≈ 7,62 €"` (empty when currencies equal).
- Keep the existing `approxConvert` as a thin alias so no other call site breaks.

### 2.2 New SQL migration

- `public.fx_rate(_from text, _to text)` — returns `numeric`, single source of truth for rates + margin (mirrors `money.ts`).
- `public.convert_money(_amount numeric, _from text, _to text)` — applies rate + margin + currency-aware rounding (XOF integer, others 2 dp).
- Replace `public.send_gift`:
  - Look up `v_price_live` in the live currency via `_gift_price`.
  - Read sender wallet; if `wallet.currency <> live.currency` → `v_price_debit := convert_money(v_price_live, live.currency, wallet.currency)`; else `v_price_debit := v_price_live`.
  - Remove the `currency_mismatch` early return.
  - Balance check uses `v_price_debit`.
  - Debit wallet by `v_price_debit`; record `wallet_transactions` with the debit and store `meta jsonb` (add column if missing) `{ live_currency, live_amount, wallet_currency, wallet_amount, rate }`.
  - Credit the seller in the **live** currency: `v_seller_net := v_price_live - platform_fee` (fee 30 % of live amount).
  - `live_gifts` row already stores `amount`/`currency` in live currency; add `debit_amount`/`debit_currency` columns for audit.
- Replace `public.pay_order_with_wallet(_order_id)`:
  - Read order `total` in order currency, wallet in wallet currency.
  - Compute `v_debit := convert_money(order.total, order.currency, wallet.currency)`.
  - Debit wallet by `v_debit` (record both amounts + rate in tx meta). Seller credit unchanged (already in order currency via `credit_seller_earning`).
  - Return `{ ok, balance, debit_amount, debit_currency, order_amount, order_currency, rate }` so the UI can show the exact debit.
- `wallet_transactions`: add nullable `meta jsonb` if not present. Grants unchanged.
- `live_gifts`: add nullable `debit_amount numeric`, `debit_currency text` for audit only.

### 2.3 Client wiring

- `src/lib/live-gifts-db.ts`: drop `"currency_mismatch"` from the error union. Surface converted amounts on success.
- `src/components/live-viewer/gift-tray-sheet.tsx`:
  - Remove `walletMatches` logic and the "Portefeuille en X" hint.
  - For each gift show: primary price in **live** currency, secondary muted `≈ … {walletCurrency}` under it (using `convertMoney`).
  - Balance check compares wallet balance ≥ converted debit, not live price.
  - Header shows wallet balance in wallet currency (unchanged), plus a tiny "1 EUR ≈ 655,957 FCFA" style hint when currencies differ.
- `src/lib/wallet-db.ts` `PayWithWalletResult`: expand with `debit_amount`, `debit_currency`, `rate` (optional). Callers use them to render the converted line in `payment-sheet.tsx` (`Total : 5 000 FCFA ≈ 7,62 €`).
- `payment-sheet.tsx`: when order currency ≠ wallet currency, show the "≈ converted" line and, on success, use the returned `debit_amount` in the toast.

### 2.4 Auction auto-pay

Any server path that debits the wallet after an auction win (search for `pay_order_with_wallet` callers + any auction-close RPC) already goes through `pay_order_with_wallet`. Because we update that RPC in place, nothing else changes there.

## 3. Delivery-based eligibility for bid/buy

New helper `src/lib/delivery-eligibility.ts`:

```
canDeliver({ sellerSettings, sellerCountry, buyerCountry }): {
  eligible: boolean
  reason?: "no_country_coverage" | "courier_country_mismatch"
}
```

Rules (matrix):

| Seller mode | Buyer has address? | Rule                                                                 |
|-------------|--------------------|----------------------------------------------------------------------|
| `flat`      | any                | eligible (delivers everywhere).                                       |
| `courier`   | no address         | eligible (checked at checkout).                                       |
| `courier`   | has address        | eligible iff `buyer.country == seller.country` (ISO-2 compare).       |
| `zones`     | no address         | eligible (address prompt at checkout).                                |
| `zones`     | has address        | eligible iff `zonesForCountry(zones, buyer.country).length > 0`.      |
| no settings | any                | eligible (treated as flat/0).                                         |

Missing buyer address never blocks — checkout already prompts for it.

Fetch inputs in `real-live-viewer-screen.tsx` on mount:
- `fetchDeliverySettings(active.sellerId)` (already available)
- Seller country: pass it through with the room / active state (add `sellerCountry` to `LiveViewerActive`; source it from the profile the home feed already loads, else fetch once).
- Buyer default address country via `fetchDefaultAddress(user.id)`.

Compute a single `deliveryEligible` boolean, memoized. When `false`:
- Bid button / stepper: rendered but disabled with label `t("delivery.notInYourCountry", "Livraison indisponible dans ton pays 🌍")`.
- Buy-fixed CTA: same treatment inside `AuctionCard` / `ProductsSheet`.
- Chat, hearts, gifts remain enabled.

Add matching i18n keys (fr + en).

Remove any residual currency-based disable on bid/buy paths (`purchaseFixedPriceRpc`, `placeBidRpc`) — currency was never a hard block server-side there, only in the UI. Grep for any remaining "wallet currency" gate outside the gift tray and delete.

## 4. Verification

- `bunx tsgo --noEmit`.
- Preview `send_gift` with an XOF wallet against a demo mock still uses the client-side demo debit (already implemented), so the animation and balance update remain visible for demo lives.
- Manual matrix (mental smoke test): EUR wallet in an XOF live → tray shows "100 FCFA ≈ 0,16 €", debit 0,16 € matches, balance drops accordingly.

## Files to change

- `src/components/live-viewer/gift-animations.tsx` (full rewrite)
- `src/lib/money.ts` (add margin + `convertMoney` + hint)
- `src/lib/delivery-eligibility.ts` (new)
- `src/lib/live-viewer-context.tsx` (add `sellerCountry` to active state)
- `src/lib/live-gifts-db.ts` (types)
- `src/lib/wallet-db.ts` (types)
- `src/components/live-viewer/gift-tray-sheet.tsx` (remove blockers, show converted)
- `src/components/live-viewer/real-live-viewer-screen.tsx` (delivery gate on bid/buy)
- `src/components/live-viewer/auction-card.tsx` + `products-sheet.tsx` (disabled state)
- `src/components/payments/payment-sheet.tsx` (converted line)
- `src/i18n/fr.json` + `src/i18n/en.json` (new keys)
- New migration: `fx_rate`, `convert_money`, revised `send_gift`, revised `pay_order_with_wallet`, `wallet_transactions.meta`, `live_gifts.debit_*`.

## Summary of rules

**Conversion**
- Rates centralized in `money.ts` and `public.fx_rate()`; XOF↔EUR fixed peg 655.957 (no margin); EUR↔CAD 1.47 with 1.5 % safety margin on non-peg pairs.
- Rounding: XOF integer, EUR/CAD 2 decimals.
- Gift/purchase amount is denominated in the **live/order** currency; wallet is debited in the **sender's** currency; seller is credited in the **live/order** currency. Both amounts + rate stored in tx meta.

**Eligibility matrix** (viewer × seller mode)

```
                      flat        courier                    zones
viewer no address     ok          ok                         ok
viewer w/ address     ok          same country as seller     ≥1 zone for buyer country
```

Currency is never a factor.
