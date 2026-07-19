/**
 * Anti-fraud limits by risk tier.
 * Payout day/week caps mirrored in
 * `supabase/migrations/20260719010000_payout_tier_limits.sql`.
 */

import { normalizeCurrency, topUpLimits, type Currency } from "@/lib/money";

/** new = unverified · trusted = badge · kyc = ID verified · restricted = admin freeze */
export type RiskTier = "new" | "trusted" | "kyc" | "restricted";

export type RiskLimitKind = "topup" | "spend" | "gift_received" | "payout";

/** Daily spend (wallet purchases + gifts sent) by tier + currency. */
const DAILY_SPEND: Record<"new" | "trusted" | "kyc", Record<Currency, number>> = {
  new: { XOF: 150_000, EUR: 200, CAD: 250 },
  trusted: { XOF: 1_000_000, EUR: 1_500, CAD: 2_000 },
  kyc: { XOF: 2_000_000, EUR: 3_000, CAD: 4_000 },
};

/** Daily gift net credited to seller available balance. */
const DAILY_GIFT_RECEIVED: Record<"new" | "trusted" | "kyc", Record<Currency, number>> = {
  new: { XOF: 100_000, EUR: 150, CAD: 200 },
  trusted: { XOF: 500_000, EUR: 750, CAD: 1_000 },
  kyc: { XOF: 1_000_000, EUR: 1_500, CAD: 2_000 },
};

/**
 * Payout caps (~USD tiers converted):
 * new: $500/day · $1,500/week
 * trusted: $1,000/day · $2,500/week
 * kyc: $2,000/day · $5,000/week
 * XOF via EUR peg ≈ 655.957
 */
const PAYOUT_DAILY: Record<"new" | "trusted" | "kyc", Record<Currency, number>> = {
  new: { EUR: 500, CAD: 500, XOF: 328_000 },
  trusted: { EUR: 1_000, CAD: 1_000, XOF: 656_000 },
  kyc: { EUR: 2_000, CAD: 2_000, XOF: 1_312_000 },
};

const PAYOUT_WEEKLY: Record<"new" | "trusted" | "kyc", Record<Currency, number>> = {
  new: { EUR: 1_500, CAD: 1_500, XOF: 984_000 },
  trusted: { EUR: 2_500, CAD: 2_500, XOF: 1_640_000 },
  kyc: { EUR: 5_000, CAD: 5_000, XOF: 3_280_000 },
};

const TOPUP_DAY_MULT: Record<"new" | "trusted" | "kyc", number> = {
  new: 1,
  trusted: 3,
  kyc: 5,
};

export const NEW_ACCOUNT_TOPUP_FRACTION = 0.5;
export const NEW_ACCOUNT_TOPUP_HOURS = 24;

function activeTier(tier: RiskTier): "new" | "trusted" | "kyc" | null {
  if (tier === "restricted") return null;
  if (tier === "kyc") return "kyc";
  if (tier === "trusted") return "trusted";
  return "new";
}

export function riskTierFromProfile(p: {
  is_verified?: boolean | null;
  kyc_verified?: boolean | null;
  risk_restricted?: boolean | null;
} | null | undefined): RiskTier {
  if (!p) return "new";
  if (p.risk_restricted) return "restricted";
  if (p.kyc_verified) return "kyc";
  if (p.is_verified) return "trusted";
  return "new";
}

export function dailyTopUpCap(
  tier: RiskTier,
  currency: string | null | undefined,
  accountAgeHours: number,
): number {
  const t = activeTier(tier);
  if (!t) return 0;
  const cur = normalizeCurrency(currency);
  const unitMax = topUpLimits(cur).max;
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
  const t = activeTier(tier);
  if (!t) return 0;
  return DAILY_SPEND[t][normalizeCurrency(currency)];
}

export function dailyGiftReceivedCap(
  tier: RiskTier,
  currency: string | null | undefined,
): number {
  const t = activeTier(tier);
  if (!t) return 0;
  return DAILY_GIFT_RECEIVED[t][normalizeCurrency(currency)];
}

export function payoutDailyCap(
  tier: RiskTier,
  currency: string | null | undefined,
): number {
  const t = activeTier(tier);
  if (!t) return 0;
  return PAYOUT_DAILY[t][normalizeCurrency(currency)];
}

export function payoutWeeklyCap(
  tier: RiskTier,
  currency: string | null | undefined,
): number {
  const t = activeTier(tier);
  if (!t) return 0;
  return PAYOUT_WEEKLY[t][normalizeCurrency(currency)];
}
