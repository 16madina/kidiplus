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
import { CONNECT_COUNTRY_CODES } from "@/lib/connect-countries";

/** Currencies eligible for Stripe Connect payouts (XOF/Africa excluded). */
export const CONNECT_CURRENCIES = new Set(["EUR", "CAD", "USD", "GBP"]);

/** Countries we allow an Express account to be created in (Stripe Connect Express). */
export const CONNECT_COUNTRIES = CONNECT_COUNTRY_CODES;

const CURRENCY_DEFAULT_COUNTRY: Record<string, string> = {
  CAD: "CA",
  USD: "US",
  GBP: "GB",
  EUR: "FR",
};

/**
 * Resolve an ISO-3166 alpha-2 country for the Express account.
 * The seller's explicit choice wins, then their profile country, then a
 * currency-based default.
 */
export function resolveConnectCountry(
  profileCountry: unknown,
  currency: string,
  chosenCountry?: unknown,
): string | null {
  const pick = (v: unknown) => {
    const raw = typeof v === "string" ? v.trim().toUpperCase() : "";
    return raw.length === 2 && CONNECT_COUNTRIES.has(raw) ? raw : null;
  };
  return (
    pick(chosenCountry) ?? pick(profileCountry) ?? CURRENCY_DEFAULT_COUNTRY[currency.toUpperCase()] ?? null
  );
}

/**
 * True when Stripe refuses a requested capability for this country (typical
 * for `card_payments` on cross-border payout-only accounts). Callers retry
 * with `transfers` only.
 */
export function isCapabilityUnsupportedError(e: unknown): boolean {
  const err = e as { raw?: { message?: string; param?: string }; message?: string; param?: string };
  const msg = (err?.raw?.message ?? err?.message ?? "").toLowerCase();
  const param = (err?.raw?.param ?? err?.param ?? "").toLowerCase();
  if (param.includes("card_payments")) return true;
  return (
    msg.includes("card_payments") ||
    (msg.includes("capabilit") &&
      (msg.includes("not available") ||
        msg.includes("unsupported") ||
        msg.includes("cannot be requested") ||
        msg.includes("is not supported")))
  );
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

/**
 * True when Stripe replies that the account isn't a Connect platform — i.e.
 * Connect is not enabled on the Stripe account behind the current key/mode.
 * This is a dashboard configuration issue, not a runtime failure, so callers
 * should degrade gracefully instead of returning a 502.
 */
export function isConnectNotEnabledError(e: unknown): boolean {
  const err = e as { raw?: { message?: string }; message?: string };
  const msg = (err?.raw?.message ?? err?.message ?? "").toLowerCase();
  return msg.includes("only stripe connect platforms");
}

/** Platform commission applied on Connect destination charges. */
export const CONNECT_APPLICATION_FEE_PERCENT = 10;

/** 10% of the charge amount (minor units), rounded to the nearest cent. */
export function connectApplicationFee(amountMinor: number): number {
  return Math.max(
    0,
    Math.round((amountMinor * CONNECT_APPLICATION_FEE_PERCENT) / 100),
  );
}
