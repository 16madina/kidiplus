// Small config layer that adapts the Lovable-managed Stripe integration
// (which exposes gateway-proxied credentials, not raw sk_* keys) to the
// shape our existing /api/checkout, /api/wallet-topup and /api/stripe-webhook
// routes expect. Flow logic in those routes is untouched.
//
// Managed integration env vars:
//   STRIPE_SANDBOX_API_KEY / STRIPE_LIVE_API_KEY   -> gateway connection key
//   PAYMENTS_SANDBOX_WEBHOOK_SECRET / _LIVE_...    -> webhook signing secret
//   VITE_PAYMENTS_CLIENT_TOKEN                     -> pk_test_ / pk_live_ (client)
//
// We ALSO honour classic BYOK env vars (STRIPE_SECRET_KEY,
// STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET) so nothing breaks if the
// project is later switched to a user-owned Stripe account.

import Stripe from "stripe";

export type StripeEnv = "sandbox" | "live";

const GATEWAY_STRIPE_BASE = "https://connector-gateway.lovable.dev/stripe";

function pickEnv(): StripeEnv {
  const pk = process.env.VITE_PAYMENTS_CLIENT_TOKEN ?? process.env.STRIPE_PUBLISHABLE_KEY ?? "";
  if (pk.startsWith("pk_live_")) return "live";
  if (process.env.STRIPE_LIVE_API_KEY && !process.env.STRIPE_SANDBOX_API_KEY) return "live";
  return "sandbox";
}

export function getStripeConfig(): {
  ok: boolean;
  env: StripeEnv;
  publishableKey: string;
  webhookSecret: string;
  reason?: string;
} {
  const env = pickEnv();

  const gatewayKey =
    env === "live"
      ? process.env.STRIPE_LIVE_API_KEY
      : process.env.STRIPE_SANDBOX_API_KEY;
  const managedWebhook =
    env === "live"
      ? process.env.PAYMENTS_LIVE_WEBHOOK_SECRET
      : process.env.PAYMENTS_SANDBOX_WEBHOOK_SECRET;

  const legacySecret = process.env.STRIPE_SECRET_KEY;
  const legacyWebhook = process.env.STRIPE_WEBHOOK_SECRET;
  const publishableKey =
    process.env.VITE_PAYMENTS_CLIENT_TOKEN ??
    process.env.STRIPE_PUBLISHABLE_KEY ??
    "";
  // Prefer the manually-configured STRIPE_WEBHOOK_SECRET (user's own endpoint
  // pointed at /api/stripe-webhook) over the Lovable-managed webhook secret,
  // which is bound to a different endpoint URL and won't match our signatures.
  const webhookSecret = legacyWebhook ?? managedWebhook ?? "";

  const haveApi = !!(gatewayKey || legacySecret);
  if (!haveApi) {
    return {
      ok: false,
      env,
      publishableKey,
      webhookSecret,
      reason: "stripe_not_configured",
    };
  }

  return { ok: true, env, publishableKey, webhookSecret };
}

// Build a Stripe SDK client. When using the managed gateway key we route
// every api.stripe.com request through the Lovable connector-gateway, which
// attaches the real Stripe secret key. When a legacy STRIPE_SECRET_KEY is
// present we use it directly (BYOK mode).
export function createStripeClient(): Stripe {
  const cfg = getStripeConfig();
  const env = cfg.env;
  const gatewayKey =
    env === "live"
      ? process.env.STRIPE_LIVE_API_KEY
      : process.env.STRIPE_SANDBOX_API_KEY;
  const legacySecret = process.env.STRIPE_SECRET_KEY;

  const opts = { apiVersion: "2026-06-24.dahlia" as const };

  if (gatewayKey) {
    const lovableApiKey = process.env.LOVABLE_API_KEY ?? "";
    return new Stripe(gatewayKey, {
      ...opts,
      httpClient: Stripe.createFetchHttpClient((input, init) => {
        const url = input instanceof Request ? input.url : input.toString();
        const gatewayUrl = url.replace("https://api.stripe.com", GATEWAY_STRIPE_BASE);
        const inHeaders = new Headers(
          init?.headers ?? (input instanceof Request ? input.headers : undefined),
        );
        return fetch(gatewayUrl, {
          ...init,
          headers: {
            ...Object.fromEntries(inHeaders.entries()),
            "X-Connection-Api-Key": gatewayKey,
            "Lovable-API-Key": lovableApiKey,
          },
        });
      }),
    });
  }

  return new Stripe(legacySecret ?? "", opts);
}

// Map a raw Stripe error (code / type / message) to a stable slug the client
// can use to look up a localized error message. Keep the set small — the
// client's i18n table (`pay.errors.*`) must have a matching key.
export function mapStripeError(
  code?: string,
  type?: string,
  message?: string,
): string {
  const c = (code ?? "").toLowerCase();
  const t = (type ?? "").toLowerCase();
  const m = (message ?? "").toLowerCase();

  if (
    c === "card_declined" ||
    c === "expired_card" ||
    c === "incorrect_cvc" ||
    c === "incorrect_number" ||
    c === "invalid_cvc" ||
    c === "invalid_expiry_month" ||
    c === "invalid_expiry_year" ||
    c === "processing_error" ||
    t === "card_error"
  ) {
    return "card_declined";
  }
  if (
    m.includes("currency") &&
    (m.includes("not supported") || m.includes("invalid") || m.includes("not allowed"))
  ) {
    return "currency_not_supported";
  }
  if (c === "amount_too_small" || c === "amount_too_large") return "invalid_amount";
  if (c === "rate_limit" || t === "rate_limit_error") return "rate_limited";
  if (t === "authentication_error" || t === "api_error" || t === "invalid_request_error") {
    return "stripe_error";
  }
  return "stripe_error";
}

