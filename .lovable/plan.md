## Seller Earnings System — Implementation Plan

Big multi-part change (fee model flip + DB + seller UI + admin). Confirm before I ship.

### Part 0 — Fee model flip (buyer pays price only)
- `src/lib/fees.ts`: keep `PLATFORM_FEE_PERCENT = 5`, add `computeSellerFees(amount, currency)` returning `{ amount, platformFee, sellerNet, currency }`. Deprecate `processingFee` in new totals (kept as column, always 0 going forward).
- `src/lib/orders-db.ts` `createPendingOrder`: `total = amount`, `platform_fee = round(amount * 5%)`, `processing_fee = 0`, `seller_net = amount − platform_fee`.
- `PaymentSheet`: remove "Frais de service" / processing line. Show only item price = total.
- `SellerSalesScreen` rows: `prix → commission KiDi+ −5% → net` breakdown.

### Part 1 — DB migration (single migration, GRANTs + RLS)
Tables:
- `seller_balances(seller_id pk→profiles, available numeric ≥0, currency, updated_at)`
- `seller_earnings(id, seller_id, order_id UNIQUE→orders, amount, balance_after, created_at)`
- `payouts(id, seller_id→profiles, amount, currency, method ∈ wave|orange_money|bank_transfer, destination jsonb, status ∈ requested|processing|paid|rejected default requested, note, requested_at, processed_at)`
- `profiles.is_admin boolean default false`

RLS: sellers SELECT own balance/earnings/payouts. No client INSERT/UPDATE anywhere on these tables. Admins SELECT all payouts.

RPCs (SECURITY DEFINER):
- `credit_seller_earning(_order_id)` — idempotent via unique `order_id`; reads `orders.seller_net`; creates balance row lazily in seller's currency; called from webhook + `pay_order_with_wallet`.
- `request_payout(_amount, _method, _destination jsonb)` — caller = seller; min 5000 XOF / 10 EUR / 15 CAD; debits `available`; inserts payout.
- `admin_process_payout(_payout_id, _action)` — checks `is_admin`; `paid` → status+processed_at; `rejected` → credit back atomically.
- Extend refund logic: reverse seller credit; block if insufficient.
- Modify `pay_order_with_wallet` to also call `credit_seller_earning`.

### Part 2 — Seller UI ("Mes gains")
- New `src/components/seller/earnings-screen.tsx` replacing entry to `SellerSalesScreen`:
  - Gold gradient balance card (realtime via `seller_balances` channel).
  - "Retirer mes gains" button → `WithdrawSheet`.
  - Tabs: **Ventes** (existing list with new breakdown) + **Retraits** (payout history with status pills).
- `src/components/seller/withdraw-sheet.tsx`: amount (prefill=available, min/max validation), method picker (Wave green, Orange orange, Bank navy), destination fields conditional on method, confirm step, success state, haptics.
- `src/lib/earnings-db.ts`: fetchers + realtime subscriptions.

### Part 3 — Admin mini-dashboard
- `src/components/admin/admin-payouts-screen.tsx`: list oldest-first, realtime, copyable destination, "Marquer payé" / "Rejeter" (confirm dialog), counters (en attente / payés ce mois).
- Profile menu: add "Administration" row visible only when `profile.is_admin`.
- Extend `profiles` type + auth-context to expose `is_admin`.

### i18n
Add `gains.*`, `payout.*`, `admin.*` keys to `fr.json` and `en.json`.

### Admin flag
After migration, I'll give you the exact SQL to promote yourself once you share your handle:
```sql
UPDATE profiles SET is_admin = true WHERE handle = '<your_handle>';
```

### Money flow (sanity)
Buyer pays 10 000 XOF → order.total=10 000, platform_fee=500, seller_net=9 500 → on `paid`, webhook calls `credit_seller_earning` → seller balance +9 500 → seller requests payout 9 500 Wave → admin marks paid → status=paid, processed_at set. If rejected → 9 500 credited back.

### Test path
1. Buy fixed-price product via card 4242 → check seller_balances +net, seller_earnings row.
2. Buy via wallet → same effect through `pay_order_with_wallet`.
3. Request payout → verify balance debits.
4. Admin reject → balance restored. Admin pay → status flips.
5. Refund → seller balance reversed.

Confirm and I'll implement in one pass (migration first for approval, then code).
