# Delivery + Escrow

Massive but well-scoped. I'll do it in **3 migrations + code**, in this order, so each layer stabilizes before the next.

## Migration 1 — Schema

- `seller_delivery_settings`: `seller_id pk → profiles`, `mode ('zones'|'flat'|'courier') default 'flat'`, `flat_fee numeric default 0`, `zones jsonb default '[]'`, `updated_at`. RLS: owner CRUD, `authenticated` SELECT (buyers need fees at checkout).
- `addresses`: `id`, `user_id`, `label`, `full_name`, `phone NOT NULL`, `country`, `city`, `zone_or_commune`, `street_address`, `details`, `is_default`. RLS: owner CRUD only. Trigger: only one `is_default=true` per user (unset others on set).
- `orders`: add `delivery_fee`, `delivery_mode`, `delivery_zone`, `address_id → addresses`, `address_snapshot jsonb`, `fulfillment_status ('awaiting'|'shipped'|'delivered'|'disputed') default 'awaiting'`, `shipped_at`, `delivered_confirmed_at`.
- `seller_balances`: add `pending numeric default 0 check (pending >= 0)`.
- `seller_earnings`: add `status ('pending'|'released'|'reversed') default 'pending'`.
- `reports`: extend `target_type` check to include `'order'`.

## Migration 2 — Escrow RPCs (SECURITY DEFINER, atomic)

- **Rewrite `credit_seller_earning`**: credits `seller_balances.pending` (not `available`), inserts `seller_earnings` with `status='pending'`.
- `mark_order_shipped(_order_id)`: seller-only, paid orders → `fulfillment_status='shipped'`, `shipped_at=now()`.
- `confirm_order_delivered(_order_id)`: buyer-only, shipped or awaiting → `fulfillment_status='delivered'`, moves `seller_net` from `pending → available`, earnings row `→ 'released'`.
- `dispute_order(_order_id, _reason)`: buyer-only → `fulfillment_status='disputed'`, inserts `reports` row `(target_type='order', target_id=order.id, reason)`. Funds stay pending.
- `admin_release_escrow(_order_id)`: admin only → same effect as `confirm_order_delivered` + closes report.
- `admin_refund_order(_order_id)`: admin only → reverses `pending`, marks earnings `'reversed'`. Wallet-paid: refund to `wallets` + `wallet_transactions` row. Card-paid: annotate order for manual Stripe refund. Closes report.
- `release_overdue_escrow()`: shipped >7d, not delivered, not disputed → release. Called opportunistically like `expire_overdue_orders` (app load, Mes gains open, admin open).

Uses existing `has_role(_user_id, 'admin')`. Constant `ESCROW_AUTO_RELEASE_DAYS = 7` mirrored client-side in `fees.ts` (comment only — server owns the truth).

## Migration 3 — Storage & indices

Indices on `addresses(user_id, is_default)`, `orders(fulfillment_status, shipped_at)` for the overdue job.

## Code changes

### New files
- `src/lib/delivery.ts` — types, currency-aware address form spec (XOF: minimal; EUR/CAD: full postal), delivery fee resolver `resolveDeliveryFee(seller_settings, address)`.
- `src/lib/delivery-db.ts` — CRUD for `seller_delivery_settings`.
- `src/lib/addresses-db.ts` — CRUD for `addresses`.
- `src/lib/escrow-db.ts` — RPC wrappers, realtime helpers.
- `src/components/seller/delivery-settings-sheet.tsx` — mode picker + zones editor.
- `src/components/buyer/address-book-sheet.tsx` — list, add, edit, delete, set default.
- `src/components/buyer/address-form.tsx` — currency-aware fields.
- `src/components/checkout/delivery-picker.tsx` — inline in payment sheet: address + optional zone → fee.

### Modified files
- `src/lib/fees.ts` — add `ESCROW_AUTO_RELEASE_DAYS = 7`, note delivery fee has no commission.
- `src/lib/lives-db.ts` — checkout paths (fixed-price + auction winner autopay) pass `address_id`, `address_snapshot`, `delivery_fee`, `delivery_mode`, `delivery_zone`; call `release_overdue_escrow()` alongside `expire_overdue_orders()`.
- `src/routes/api/checkout.ts` + `checkout.confirm.ts` + `stripe-webhook.ts` — Stripe amount includes delivery fee; `credit_seller_earning` now credits pending (server RPC change, no callsite refactor).
- Auction-winner autopay: if seller mode='zones' and no way to auto-pick a zone → skip autopay, open payment sheet with `DeliveryPicker`.
- `src/components/payments/*` (payment sheet) — insert `DeliveryPicker`, show fee breakdown line "Livraison : 1 000 FCFA" (or "à payer au livreur 🛵" for `courier`), total = item + delivery.
- `src/screens/profile-screen.tsx` — new "Mes adresses" and (if seller) "Livraison" menu entries.
- Seller Mes gains screen — balance card shows Disponible + En attente de livraison; sales rows show fulfillment pill + "Marquer expédié 📦" button + explainer line.
- `src/screens/activity-screen.tsx` — order rows: fulfillment pill, "Confirmer la réception ✅" on shipped, "Signaler un problème" secondary.
- Admin Signalements — order disputes show two actions: "Libérer au vendeur" / "Rembourser l'acheteur".

### i18n
- `delivery.*` (modes, zones, courier note), `address.*` (form labels per market), `escrow.*` (pending, released, auto-release), `dispute.*` (buyer button, admin resolution) in both `fr.json` and `en.json`.

## What I'll skip vs. gold-plate

- **Skip**: automatic Stripe refund via API (kept as manual note per your spec "keep it simple"). Admin UI shows the refund is pending + provides amount/PI id to refund manually.
- **Skip**: pickup/carrier tracking, multiple addresses per order, cross-border rules.
- **Include**: XOF vs EUR/CAD form divergence, address snapshotting, auto-release safety net, all three UIs, full i18n.

## Ambiguities I'm resolving with defaults (tell me if wrong)

1. **Delivery fee currency** — always the SELLER's currency (matches the item). Buyer sees the same currency as the item price. Payment total = item + delivery in seller's currency, wallet check uses buyer's wallet in seller's currency (existing pattern in `wallet-topup`).
2. **Auction autopay with zones mode + buyer has address in a zone whose name matches** — I'll try exact case-insensitive match on `address.zone_or_commune` vs `zones[].name`; if unique match → autopay with that fee; otherwise fall back to opening payment sheet.
3. **"Payé au livreur" (courier)** — `delivery_fee=0` in-app; the order + escrow flow otherwise identical. Fulfillment confirmation still required to release funds.
4. **Existing paid orders (pre-migration)** — I'll backfill `fulfillment_status='delivered'`, `delivered_confirmed_at=paid_at`, all existing pending → available. This keeps old sellers whole.
5. **Address deletion** — soft rule: if referenced by any order, block delete with a toast "Adresse utilisée par une commande"; otherwise hard delete. Orders keep `address_snapshot` regardless.

## Test path (two accounts)

1. **Seller A**: Profile → Livraison → "Par zones", add "Abidjan — Cocody · 1 000 XOF". Publishes a fixed-price product.
2. **Buyer B**: Profile → Mes adresses → add default (phone + Cocody). Opens live, taps buy → payment sheet shows item + `Livraison : 1 000 XOF` + total. Pays with wallet.
3. **Seller A**: Mes gains → balance shows `Disponible: 0` / `En attente: item − commission`. Ventes row → "Marquer expédié 📦" → pill flips to "Expédié".
4. **Buyer B**: Activité → order pill "Expédié" → "Confirmer la réception ✅" → toast, pill flips to "Livré".
5. **Seller A**: balance moves pending → disponible. Payout request now succeeds.
6. **Dispute path**: repeat with Buyer B tapping "Signaler un problème" instead → admin sees it in Signalements → picks "Rembourser l'acheteur" → Buyer B wallet credited, Seller A pending reversed.
7. **Auto-release path**: manually SQL-shift `shipped_at` back 8 days → open Mes gains → `release_overdue_escrow` runs → funds released.

Once you approve, I'll ship Migration 1, then Migration 2, then all code + i18n in one push.
