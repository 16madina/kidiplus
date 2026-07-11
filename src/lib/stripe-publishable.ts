// Publishable Stripe key + environment for the browser.
//
// The publishable token (pk_test_… / pk_live_…) is PUBLIC and safe in the
// client bundle. We prefer the value returned by the API (in case the
// server ever overrides it), and fall back to the compile-time env var
// injected by Vite. This is important because in the Cloudflare Worker
// runtime `process.env.VITE_*` is NOT exposed to server functions, so the
// server may legitimately return an empty publishableKey while the browser
// still has it locally.
//
// The env prefix (`pk_live_` vs `pk_test_`) determines which Stripe
// account/mode the client is targeting. The client MUST send this to the
// server so the server picks the matching gateway key — otherwise a PI can
// be created in one account and confirmed with a publishable key from
// another, producing Stripe's "No such payment_intent" error.

export type PaymentsEnv = "sandbox" | "live";

export function resolvePublishableKey(fromServer?: string | null): string {
  const server = (fromServer ?? "").trim();
  if (server) return server;
  const client = (import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN ?? "").trim();
  return client;
}

export function resolvePaymentsEnv(fromServerKey?: string | null): PaymentsEnv {
  const key = resolvePublishableKey(fromServerKey);
  if (key.startsWith("pk_live_")) return "live";
  return "sandbox";
}

// Request headers to attach to every /api/wallet-topup, /api/checkout, and
// the corresponding .confirm calls so the server routes PI creation to the
// same Stripe account whose publishable key the browser is about to use.
export function paymentsEnvHeaders(): Record<string, string> {
  return { "X-Payments-Env": resolvePaymentsEnv() };
}
