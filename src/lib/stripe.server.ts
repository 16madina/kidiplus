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

// Managed SANDBOX publishable token (same Stripe account as
// STRIPE_SANDBOX_API_KEY — it is the value Lovable injects as
// VITE_PAYMENTS_CLIENT_TOKEN in .env.development).
//
// A publishable key is PUBLIC by design (it ships in every browser bundle),
// so keeping it here is not a secret leak. It exists because deployed builds
// only bake in the pk_live_ token: when an admin explicitly asks for a
// sandbox wallet top-up (X-Payments-Env: sandbox on a managed-only flow) the
// server must hand back a pk_test_ token from the SAME account the
// PaymentIntent was created on, otherwise Stripe.js cannot resolve the
// client secret ("No such payment_intent").
const MANAGED_SANDBOX_PUBLISHABLE_KEY =
  "pk_test_51TpirRPyczv2Aj3VhOa9l3nPZeChZHglpkH8sYGPabcV7iIwx9hnSwndiaA5L0NeNFMtATC8uE9Xv7th3K16ooEF00jY9h264C";

function managedSandboxPublishableKey(): string {
  return (
    process.env.STRIPE_SANDBOX_PUBLISHABLE_KEY?.trim() || MANAGED_SANDBOX_PUBLISHABLE_KEY
  );
}

/** Mode of the BYOK STRIPE_SECRET_KEY, if any. */
export function byokEnv(): StripeEnv | null {
  const k = (process.env.STRIPE_SECRET_KEY ?? "").trim();
  if (!k) return null;
  if (k.startsWith("sk_test_") || k.startsWith("rk_test_")) return "sandbox";
  if (k.startsWith("sk_live_") || k.startsWith("rk_live_")) return "live";
  return null;
}

/**
 * When the ONLY BYOK secret key available is a TEST key, the whole app must
 * run in Stripe test mode — including the production build. Otherwise Connect
 * account links / connected accounts would be created live and reject test
 * bank accounts. As soon as a real sk_live_ key is provided, this returns
 * false and normal env resolution applies.
 */
export function forcedTestMode(): boolean {
  return byokEnv() === "sandbox";
}

/**
 * SINGLE SOURCE OF TRUTH for the Stripe mode.
 *
 * `PAYMENTS_MODE` ("test" | "sandbox" | "live" | "production") is a
 * server-side secret. When set, it overrides EVERY other signal (the browser
 * `X-Payments-Env` hint, the bundled pk_ token, the BYOK key prefix), so all
 * pathways — wallet top-up, checkout, Connect onboarding/status/payout,
 * webhooks — can never diverge into a half-live / half-test state.
 * When unset, the previous per-request resolution applies unchanged.
 */
export function forcedPaymentsEnv(): StripeEnv | null {
  const m = (process.env.PAYMENTS_MODE ?? "").trim().toLowerCase();
  if (m === "test" || m === "sandbox") return "sandbox";
  if (m === "live" || m === "production") return "live";
  return null;
}


/**
 * Options for callers that must bypass the legacy BYOK key entirely.
 *
 * `managedOnly` exists because the BYOK STRIPE_SECRET_KEY may belong to a
 * DIFFERENT Stripe account than the managed gateway (it is provisioned for
 * Connect testing). Any flow whose client-side confirmation uses the managed
 * publishable token (VITE_PAYMENTS_CLIENT_TOKEN) MUST create/retrieve its
 * PaymentIntents on the managed account, otherwise Stripe.js cannot resolve
 * the client secret and the PaymentElement never mounts.
 */
export type StripeClientOpts = { managedOnly?: boolean };

function pickEnv(hint?: StripeEnv | null, opts?: StripeClientOpts): StripeEnv {
  // Global override wins over everything (see forcedPaymentsEnv).
  const forced = forcedPaymentsEnv();
  if (forced) return forced;
  // A test-only BYOK key pins every Stripe operation to sandbox — but only
  // for flows that may actually use that key.
  if (!opts?.managedOnly && forcedTestMode()) return "sandbox";
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

export function envHintFromRequest(request: Request, opts?: StripeClientOpts): StripeEnv | null {
  const forced = forcedPaymentsEnv();
  if (forced) return forced;
  const h = request.headers.get("x-payments-env")?.toLowerCase().trim();
  const hinted = h === "live" || h === "sandbox" ? (h as StripeEnv) : null;
  // Managed-only flows always trust the browser: it is about to confirm with
  // the publishable key of that exact env.
  if (opts?.managedOnly) return hinted;
  // Ignore a "live" hint from the client while a test-only BYOK key is set.
  if (forcedTestMode()) return "sandbox";
  return hinted;
}


/** True when a legacy BYOK sk_ or rk_ key belongs to the requested mode. */
export function legacyMatchesEnv(env: StripeEnv): boolean {
  return byokEnv() !== null && byokEnv() === env;
}



export function getStripeConfig(hint?: StripeEnv | null, opts?: StripeClientOpts): {
  ok: boolean;
  env: StripeEnv;
  publishableKey: string;
  webhookSecret: string;
  reason?: string;
} {
  const managedOnly = !!opts?.managedOnly;
  const env = pickEnv(hint, opts);

  const gatewayKey =
    env === "live"
      ? process.env.STRIPE_LIVE_API_KEY
      : process.env.STRIPE_SANDBOX_API_KEY;
  const managedWebhook =
    env === "live"
      ? process.env.PAYMENTS_LIVE_WEBHOOK_SECRET
      : process.env.PAYMENTS_SANDBOX_WEBHOOK_SECRET;

  // When PAYMENTS_MODE pins the mode, the managed gateway is the ONE account
  // every pathway must use — the BYOK key (possibly a different account) is
  // ignored so top-ups, checkout and Connect can never diverge.
  const pinned = forcedPaymentsEnv() !== null;
  const legacySecret = managedOnly || pinned ? undefined : process.env.STRIPE_SECRET_KEY;
  const legacyWebhook = managedOnly || pinned ? undefined : process.env.STRIPE_WEBHOOK_SECRET;
  const rawPublishable =
    process.env.VITE_PAYMENTS_CLIENT_TOKEN ??
    process.env.STRIPE_PUBLISHABLE_KEY ??
    "";
  // In forced test mode never hand a pk_live_ key to the browser: the client
  // falls back to its own bundled pk_test_ token instead. Managed-only flows
  // are never served by the BYOK key, so this clamp does not apply to them.
  let publishableKey =
    !managedOnly && forcedTestMode() && rawPublishable.startsWith("pk_live_")
      ? (process.env.STRIPE_PUBLISHABLE_KEY ?? "").startsWith("pk_test_")
        ? process.env.STRIPE_PUBLISHABLE_KEY!
        : ""
      : rawPublishable;

  // BYOK: the publishable key MUST belong to the same Stripe account as
  // STRIPE_SECRET_KEY. Never fall back to the Lovable managed pk_test_.
  if (legacySecret) {
    const byokPk = (process.env.STRIPE_PUBLISHABLE_KEY ?? "").trim();
    if (env === "sandbox" && byokPk.startsWith("pk_test_")) publishableKey = byokPk;
    else if (env === "live" && byokPk.startsWith("pk_live_")) publishableKey = byokPk;
  }

  // Sandbox request: the deployed browser bundle only has the pk_live_ token,
  // so return the managed sandbox publishable key that matches
  // STRIPE_SANDBOX_API_KEY (the client prefers the server-provided key).
  if (env === "sandbox" && !publishableKey.startsWith("pk_test_") && !legacySecret) {
    publishableKey = managedSandboxPublishableKey();
  }


  const webhookSecret = legacyWebhook ?? managedWebhook ?? "";

  // An explicit mode is a strict boundary: sandbox requests require the
  // sandbox gateway and live requests require the live gateway. In particular,
  // never let a legacy sk_live_* key satisfy a sandbox request.
  const haveApi = managedOnly
    ? !!gatewayKey
    : hint === "live" || hint === "sandbox"
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

/**
 * Card charges (wallet top-up / checkout): prefer the Lovable gateway, then
 * fall back to STRIPE_SECRET_KEY + STRIPE_PUBLISHABLE_KEY on local vite.
 */
export function resolveCardStripe(request: Request): {
  ok: boolean;
  hint: StripeEnv | null;
  env: StripeEnv;
  opts: StripeClientOpts;
  publishableKey: string;
} {
  const pkOk = (k: string) => k.startsWith("pk_test_") || k.startsWith("pk_live_");
  const managedHint = envHintFromRequest(request, { managedOnly: true });
  const managedCfg = getStripeConfig(managedHint, { managedOnly: true });
  if (managedCfg.ok && pkOk(managedCfg.publishableKey)) {
    return {
      ok: true,
      hint: managedHint,
      env: managedCfg.env,
      opts: { managedOnly: true },
      publishableKey: managedCfg.publishableKey,
    };
  }
  const hint = envHintFromRequest(request);
  const cfg = getStripeConfig(hint);
  return {
    ok: cfg.ok && pkOk(cfg.publishableKey),
    hint,
    env: cfg.env,
    opts: { managedOnly: false },
    publishableKey: cfg.publishableKey,
  };
}



// Build a Stripe SDK client. When using the managed gateway key we route
// every api.stripe.com request through the Lovable connector-gateway, which
// attaches the real Stripe secret key. When a legacy STRIPE_SECRET_KEY is
// present we use it directly (BYOK mode).
export function createStripeClient(hint?: StripeEnv | null, opts_?: StripeClientOpts): Stripe {
  const managedOnly = !!opts_?.managedOnly;
  const cfg = getStripeConfig(hint, opts_);
  const env = cfg.env;

  const gatewayKey =
    env === "live"
      ? process.env.STRIPE_LIVE_API_KEY
      : process.env.STRIPE_SANDBOX_API_KEY;
  const legacySecret =
    managedOnly || forcedPaymentsEnv() !== null ? undefined : process.env.STRIPE_SECRET_KEY;


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

