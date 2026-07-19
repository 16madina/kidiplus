/**
 * Anti-fraud V1 — daily limits by risk tier.
 * Mirrored in SQL migration `20260718200000_risk_anti_fraud_v1.sql`.
 * Keep both in sync when changing numbers.
 */

import { normalizeCurrency, topUpLimits, type Currency } from "@/lib/money";

export type RiskTier = "new" | "trusted" | "restricted";

export type RiskLimitKind = "topup" | "spend" | "gift_received";

/** Daily spend (wallet purchases + gifts sent) by tier + currency. */
const DAILY_SPEND: Record<"new" | "trusted", Record<Currency, number>> = {
  new: { XOF: 150_000, EUR: 200, CAD: 250 },
  trusted: { XOF: 1_000_000, EUR: 1_500, CAD: 2_000 },
};

/** Daily gift net credited to seller available balance. */
const DAILY_GIFT_RECEIVED: Record<"new" | "trusted", Record<Currency, number>> = {
  new: { XOF: 100_000, EUR: 150, CAD: 200 },
  trusted: { XOF: 500_000, EUR: 750, CAD: 1_000 },
};

/** Multiplier of per-transaction top-up max for the daily top-up cap. */
const TOPUP_DAY_MULT: Record<"new" | "trusted", number> = {
  new: 1,
  trusted: 3,
};

/** New accounts (< 24h) get this fraction of the per-tx top-up max as daily cap. */
export const NEW_ACCOUNT_TOPUP_FRACTION = 0.5;

/** Hours after signup during which the reduced top-up cap applies. */
export const NEW_ACCOUNT_TOPUP_HOURS = 24;

export function dailyTopUpCap(
  tier: RiskTier,
  currency: string | null | undefined,
  accountAgeHours: number,
): number {
  if (tier === "restricted") return 0;
  const cur = normalizeCurrency(currency);
  const unitMax = topUpLimits(cur).max;
  const t = tier === "trusted" ? "trusted" : "new";
  let cap = unitMax * TOPUP_DAY_MULT[t];
  if (t === "new" && accountAgeHours < NEW_ACCOUNT_TOPUP_HOURS) {
    cap = unitMax * NEW_ACCOUNT_TOPUP_FRACTION;
  }
  return cap;
}

export function dailySpendCap(
  tier: RiskTier,
  currency: string | null | undefined,
): number {
  if (tier === "restricted") return 0;
  const cur = normalizeCurrency(currency);
  const t = tier === "trusted" ? "trusted" : "new";
  return DAILY_SPEND[t][cur];
}

export function dailyGiftReceivedCap(
  tier: RiskTier,
  currency: string | null | undefined,
): number {
  if (tier === "restricted") return 0;
  const cur = normalizeCurrency(currency);
  const t = tier === "trusted" ? "trusted" : "new";
  return DAILY_GIFT_RECEIVED[t][cur];
}

/** Seller payouts require verified badge (unless admin overrides in SQL). */
export function payoutRequiresVerification(): boolean {
  return true;
}
