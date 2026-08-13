// Admin-only, device-local override that forces the WALLET TOP-UP flow into
// Stripe sandbox mode.
//
// Why this exists: every deployed build (production AND preview URL) is
// compiled with `.env.production`'s pk_live_ publishable token, so an admin
// has no way to test a real card top-up without moving real money. When this
// flag is ON we send `X-Payments-Env: sandbox` on the wallet-topup requests
// only; the server then creates the PaymentIntent on the managed SANDBOX
// gateway and returns the matching pk_test_ publishable key so Stripe.js can
// resolve the client secret.
//
// Scope guarantees:
//   - stored in localStorage → per browser/device, never in the database,
//     never visible to another user or session;
//   - only read by the wallet top-up flow (topup-sheet + wallet-topup confirm);
//   - default OFF → the live path is byte-for-byte unchanged.

import { paymentsEnvHeaders } from "@/lib/stripe-publishable";

const KEY = "kidi:force_stripe_test";

export function isForceStripeTest(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setForceStripeTest(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Env headers for the wallet top-up flow ONLY. Falls back to the normal
 * (publishable-key derived) headers when the override is off.
 */
export function walletPaymentsEnvHeaders(): Record<string, string> {
  if (isForceStripeTest()) return { "X-Payments-Env": "sandbox" };
  return paymentsEnvHeaders();
}
