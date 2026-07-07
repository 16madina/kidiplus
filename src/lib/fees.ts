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
 * Buyer total = amount (+ shipping if any). Platform commission is
 * withheld from the seller's payout.
 */
export function computeFees(
  amount: number,
  shipping = 0,
  currency: string | null | undefined = "EUR",
): FeeBreakdown {
  const cur = normalizeCurrency(currency);
  const round = (n: number) => roundForCurrency(n, cur);
  const a = round(amount);
  const s = round(shipping);
  const platformFee = round((a * PLATFORM_FEE_PERCENT) / 100);
  const sellerNet = round(a - platformFee);
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
