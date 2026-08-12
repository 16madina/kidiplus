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
// Legacy BYOK variables are only considered when no explicit payment mode was
// supplied. A client-selected sandbox request must never fall back to a live
// STRIPE_SECRET_KEY.

import Stripe from "stripe";

export type StripeEnv = "sandbox" | "live";

const GATEWAY_STRIPE_BASE = "https://connector-gateway.lovable.dev/stripe";

function pickEnv(hint?: StripeEnv | null): StripeEnv {
  // Explicit hint from the client (x-payments-env header) is authoritative —
  // this is the only reliable signal at Worker runtime, since VITE_* env
  // vars are NOT injected into `process.env` on Cloudflare Workers, so any
  // fallback based on VITE_PAYMENTS_CLIENT_TOKEN is unreliable and can
  // silently route PI creation to the wrong Stripe account.
  if (hint === "live" || hint === "sandbox") return hint;
  const pk = process.env.VITE_PAYMENTS_CLIENT_TOKEN ?? process.env.STRIPE_PUBLISHABLE_KEY ?? "";
  if (pk.startsWith("pk_live_")) return "live";
  if (pk.startsWith("pk_test_")) return "sandbox";
  // Last resort: prefer live if only the live gateway key exists, else sandbox.
  if (process.env.STRIPE_LIVE_API_KEY && !process.env.STRIPE_SANDBOX_API_KEY) return "live";
  return "sandbox";
}

export function envHintFromRequest(request: Request): StripeEnv | null {
  const h = request.headers.get("x-payments-env")?.toLowerCase().trim();
  if (h === "live" || h === "sandbox") return h;
  return null;
}

/** True when a legacy BYOK sk_*/rk_* key belongs to the requested mode. */
export function legacyMatchesEnv(env: StripeEnv): boolean {
  const k = (process.env.STRIPE_SECRET_KEY ?? "").trim();
  if (!k) return false;
  const isTest = k.startsWith("sk_test_") || k.startsWith("rk_test_");
  const isLive = k.startsWith("sk_live_") || k.startsWith("rk_live_");
  return env === "sandbox" ? isTest : isLive;
}

export function getStripeConfig(hint?: StripeEnv | null): {
  ok: boolean;
  env: StripeEnv;
  publishableKey: string;
  webhookSecret: string;
  reason?: string;
} {
  const env = pickEnv(hint);

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
  const webhookSecret = legacyWebhook ?? managedWebhook ?? "";

  // An explicit mode is a strict boundary: sandbox requests require the
  // sandbox gateway and live requests require the live gateway. In particular,
  // never let a legacy sk_live_* key satisfy a sandbox request.
  const haveApi = hint === "live" || hint === "sandbox"
    ? !!(gatewayKey || legacyMatchesEnv(env))
    : !!(gatewayKey || legacySecret);
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
export function createStripeClient(hint?: StripeEnv | null): Stripe {
  const cfg = getStripeConfig(hint);
  const env = cfg.env;

  const gatewayKey =
    env === "live"
      ? process.env.STRIPE_LIVE_API_KEY
      : process.env.STRIPE_SANDBOX_API_KEY;
  const legacySecret = process.env.STRIPE_SECRET_KEY;

  const opts = { apiVersion: "2026-06-24.dahlia" as const };

  // A BYOK key that matches the requested mode wins: it targets the user's own
  // Stripe account (where Connect is enabled) instead of the managed gateway.
  if (legacySecret && legacyMatchesEnv(env)) {
    return new Stripe(legacySecret, opts);
  }

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

  if (hint === "live" || hint === "sandbox") {
    throw new Error(`STRIPE_${hint.toUpperCase()}_API_KEY is not configured`);
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

