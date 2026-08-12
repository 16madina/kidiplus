// Stripe Connect (Express) helpers — server only.
//
// MODEL (deliberate): KiDi+ keeps its wallet + escrow ledger as the source of
// truth for seller earnings. Western sellers (EUR/CAD/USD/GBP) who onboard a
// Stripe Express account get their withdrawals settled by an automated Stripe
// TRANSFER from the platform balance to their connected account; Stripe then
// pays them out to their bank on their payout schedule.
//
// Destination charges (transfer_data + application_fee_amount) are NOT used
// for live/auction orders because most of those are funded from the buyer's
// KiDi+ wallet (no fresh card charge exists at purchase time) and the seller
// balance is already credited by the escrow ledger — doing both would credit
// the seller twice. See buildDestinationChargeParams() below for the helper
// kept ready if/when a fresh 1:1 card charge should be split at capture.

import { createStripeClient, type StripeEnv } from "@/lib/stripe.server";

/** Currencies eligible for Stripe Connect payouts (XOF/Africa excluded). */
export const CONNECT_CURRENCIES = new Set(["EUR", "CAD", "USD", "GBP"]);

/** Countries we allow an Express account to be created in. */
export const CONNECT_COUNTRIES = new Set([
  "CA", "US", "GB", "FR", "BE", "DE", "ES", "IT", "PT", "NL", "LU", "IE",
  "CH", "AT", "SE", "NO", "DK", "FI", "PL",
]);

const CURRENCY_DEFAULT_COUNTRY: Record<string, string> = {
  CAD: "CA",
  USD: "US",
  GBP: "GB",
  EUR: "FR",
};

/** Resolve an ISO-3166 alpha-2 country for the Express account. */
export function resolveConnectCountry(
  profileCountry: unknown,
  currency: string,
): string | null {
  const raw = typeof profileCountry === "string" ? profileCountry.trim().toUpperCase() : "";
  if (raw.length === 2 && CONNECT_COUNTRIES.has(raw)) return raw;
  return CURRENCY_DEFAULT_COUNTRY[currency.toUpperCase()] ?? null;
}

export type ConnectStatus = "none" | "pending" | "active" | "restricted";

export function statusFromAccount(acc: {
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
  requirements?: { disabled_reason?: string | null } | null;
}): ConnectStatus {
  if (acc.payouts_enabled) return "active";
  if (acc.requirements?.disabled_reason) return "restricted";
  return "pending";
}

export function stripeForEnv(hint: StripeEnv | null) {
  return createStripeClient(hint);
}

/**
 * Params for a DESTINATION CHARGE (Option 2) — kept for the case where a
 * fresh card charge maps 1:1 to one seller order. Not wired into the wallet
 * flow on purpose (see file header).
 */
export function buildDestinationChargeParams(opts: {
  connectedAccountId: string;
  applicationFeeMinor: number;
}) {
  return {
    transfer_data: { destination: opts.connectedAccountId },
    application_fee_amount: Math.max(0, Math.round(opts.applicationFeeMinor)),
  };
}
