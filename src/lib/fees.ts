// Platform economics — single source of truth for fee math.
//
// PLATFORM_FEE_PERCENT: commission the platform keeps on every paid order.
// Change this constant to update fees everywhere (checkout summary, DB rows,
// seller totals). No other file should hard-code fee numbers.
//
// PROCESSING_FEE: pass-through cost of the card processor. We approximate
// Stripe's European standard pricing (1.5% + 0.25€) — good enough to display
// a transparent breakdown at checkout. Stripe's exact fee is only known at
// capture time, but this estimate never leaves the client except as an
// advisory line item; we do NOT rely on it for reconciliation.

export const PLATFORM_FEE_PERCENT = 5;
export const PROCESSING_FEE_PERCENT = 1.5;
export const PROCESSING_FEE_FIXED_EUR = 0.25;

export type FeeBreakdown = {
  amount: number;         // item price
  shipping: number;       // 0 for phase 1
  platformFee: number;    // amount * PLATFORM_FEE_PERCENT / 100
  processingFee: number;  // (amount+shipping)*% + fixed
  total: number;          // what the buyer pays
  currency: "eur";
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeFees(amount: number, shipping = 0): FeeBreakdown {
  const platformFee = round2((amount * PLATFORM_FEE_PERCENT) / 100);
  const subtotal = amount + shipping;
  const processingFee = round2(
    (subtotal * PROCESSING_FEE_PERCENT) / 100 + PROCESSING_FEE_FIXED_EUR,
  );
  const total = round2(subtotal + platformFee + processingFee);
  return {
    amount: round2(amount),
    shipping: round2(shipping),
    platformFee,
    processingFee,
    total,
    currency: "eur",
  };
}

/** Stripe wants integer minor units (cents). */
export function toStripeAmount(euros: number): number {
  return Math.round(euros * 100);
}
