// Platform economics — single source of truth for fee math.
//
// PLATFORM_FEE_PERCENT: commission the platform keeps on every paid order.
// PROCESSING_FEE: approximates Stripe European standard pricing.
//
// Fees are calculated in the ORDER's currency. XOF is zero-decimal; the
// fixed processing surcharge scales accordingly (~0.25 € -> 164 FCFA).

import { normalizeCurrency, roundForCurrency, isZeroDecimal, type Currency } from "@/lib/money";

export const PLATFORM_FEE_PERCENT = 5;
export const PROCESSING_FEE_PERCENT = 1.5;

// Per-currency fixed component (rough parity with Stripe pricing in each region).
const PROCESSING_FEE_FIXED: Record<Currency, number> = {
  EUR: 0.25,
  CAD: 0.35,
  XOF: 164, // ≈ 0.25 €
};

export type FeeBreakdown = {
  amount: number;
  shipping: number;
  platformFee: number;
  processingFee: number;
  total: number;
  currency: Currency;
};

export function computeFees(
  amount: number,
  shipping = 0,
  currency: string | null | undefined = "EUR",
): FeeBreakdown {
  const cur = normalizeCurrency(currency);
  const round = (n: number) => roundForCurrency(n, cur);
  const platformFee = round((amount * PLATFORM_FEE_PERCENT) / 100);
  const subtotal = amount + shipping;
  const processingFee = round(
    (subtotal * PROCESSING_FEE_PERCENT) / 100 + PROCESSING_FEE_FIXED[cur],
  );
  const total = round(subtotal + platformFee + processingFee);
  return {
    amount: round(amount),
    shipping: round(shipping),
    platformFee,
    processingFee,
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
