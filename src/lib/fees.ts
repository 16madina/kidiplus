// Platform economics — single source of truth for fee math.
//
// COMMISSION MODEL (Whatnot-style):
//   - Buyer pays exactly the item price. total = amount (+ shipping).
//   - Platform commission (PLATFORM_FEE_PERCENT) is DEDUCTED from the seller.
//     seller_net = amount − platform_fee.
//   - `processing_fee` is kept in the schema for backward compatibility but
//     is always 0 for new orders.
//
// Fees are calculated in the ORDER's currency. XOF is zero-decimal.

import { normalizeCurrency, roundForCurrency, isZeroDecimal, type Currency } from "@/lib/money";

export const PLATFORM_FEE_PERCENT = 5;

/**
 * Virtual-gift platform cut (percent of the gift price kept by KiDi+).
 * The remainder credits the seller's available balance instantly (no escrow —
 * nothing to deliver). Mirrored server-side in the `send_gift` RPC.
 */
export const GIFT_FEE_PERCENT = 30;

/**
 * Escrow window: seller funds move from `pending` to `available` once the
 * buyer confirms delivery, OR automatically after this many days from the
 * shipped_at timestamp (mirrored in the SQL fn `release_overdue_escrow`).
 * NOTE: delivery fee bypasses the platform commission and is passed through
 * to the seller in full — see computeFees below.
 */
export const ESCROW_AUTO_RELEASE_DAYS = 7;

/** Buyer reminder timing — a notification is generated when a shipped order
 *  reaches this many days without confirmation, i.e. 2 days before auto-release.
 *  Enforced in SQL by `release_overdue_escrow`. */
export const ESCROW_REMINDER_DAYS = 5;

/** Hours a winning bidder has to pay before the order auto-cancels. */
export const AUCTION_PAYMENT_DEADLINE_HOURS = 24;

/**
 * Anti-snipe / "sudden death" — if a bid lands while fewer than this many
 * seconds remain on the auction clock, the deadline resets to
 * AUCTION_EXTENSION_RESET_SECONDS from now (for everyone, in sync).
 * Extensions can chain indefinitely while bids keep coming.
 */
export const AUCTION_EXTENSION_WINDOW_SECONDS = 10;
export const AUCTION_EXTENSION_RESET_SECONDS = 10;

/**
 * Minimum payout amount per currency. Single source of truth used by both
 * the withdraw sheet (UI validation + hint text) and mirrored in the
 * `request_payout` SQL function.
 */
export const PAYOUT_MINIMUMS: Record<Currency, number> = {
  XOF: 5000,
  EUR: 10,
  CAD: 15,
};

/**
 * Anti-fraud / AML limits. Mirrored in the SQL functions
 * `credit_wallet_topup` and `request_payout`. Update both together.
 */
export const MAX_WALLET_BALANCE: Record<Currency, number> = {
  XOF: 1_000_000,
  EUR: 2_000,
  CAD: 3_000,
};
export const MAX_TOPUP_PER_DAY: Record<Currency, number> = MAX_WALLET_BALANCE;
export const MAX_PAYOUT_PER_DAY: Record<Currency, number> = MAX_WALLET_BALANCE;


export function payoutMinimumFor(currency: string | null | undefined): number {
  return PAYOUT_MINIMUMS[normalizeCurrency(currency)];
}

export type FeeBreakdown = {
  amount: number;
  shipping: number;
  platformFee: number;
  processingFee: number;
  sellerNet: number;
  total: number;
  currency: Currency;
};

/**
 * Compute the full fee breakdown for an order.
 * Buyer total = amount + delivery. Platform commission is 5% of `amount`
 * (item only — delivery pays no commission and passes through to the seller
 * in full). Seller net = (amount − commission) + delivery.
 */
export function computeFees(
  amount: number,
  delivery = 0,
  currency: string | null | undefined = "EUR",
): FeeBreakdown {
  const cur = normalizeCurrency(currency);
  const round = (n: number) => roundForCurrency(n, cur);
  const a = round(amount);
  const s = round(delivery);
  const platformFee = round((a * PLATFORM_FEE_PERCENT) / 100);
  // Delivery bypasses commission: seller gets item-net + full delivery fee.
  const sellerNet = round(a - platformFee + s);
  const total = round(a + s);
  return {
    amount: a,
    shipping: s,
    platformFee,
    processingFee: 0,
    sellerNet,
    total,
    currency: cur,
  };
}

/** Legacy: Stripe minor units for EUR (kept for callers not updated yet). */
export function toStripeAmount(euros: number): number {
  return Math.round(euros * 100);
}

/** Currency-aware Stripe amount (XOF has no minor units). */
export function toStripeAmountFor(amount: number, currency: string): number {
  const cur = normalizeCurrency(currency);
  return isZeroDecimal(cur) ? Math.round(amount) : Math.round(amount * 100);
}
