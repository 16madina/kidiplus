// POST /api/wallet-topup
// -----------------------
// Creates a Stripe PaymentIntent to credit the authenticated user's wallet
// in the wallet's own currency (XOF / EUR / CAD). The webhook
// (/api/stripe-webhook) reads metadata.kind === 'wallet_topup' and calls
// credit_wallet_topup() to atomically bump the balance.
//
// Validation:
//   - Bearer token required (Supabase auth).
//   - Amount must fall inside topUpLimits(walletCurrency).
//   - XOF is zero-decimal (Stripe amount = amount, NOT amount*100).

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { createStripeClient, getStripeConfig } from "@/lib/stripe.server";
import { normalizeCurrency, roundForCurrency, toStripeMinor, topUpLimits } from "@/lib/money";

const ALLOWED_ORIGIN_SUFFIXES = ["lovable.app", "lovableproject.com", "localhost", "127.0.0.1"];

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true;
  try {
    const host = new URL(origin).hostname;
    return ALLOWED_ORIGIN_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`));
  } catch {
    return false;
  }
}
function corsHeaders(origin: string | null): HeadersInit {
  const base: Record<string, string> = {
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
  if (origin && isAllowedOrigin(origin)) base["Access-Control-Allow-Origin"] = origin;
  return base;
}
function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...corsHeaders(origin),
    },
  });
}

export const Route = createFileRoute("/api/wallet-topup")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, {
          status: 204,
          headers: corsHeaders(request.headers.get("origin")),
        }),

      POST: async ({ request }) => {
        const origin = request.headers.get("origin");
        if (origin && !isAllowedOrigin(origin)) {
          return json({ error: "Origin not allowed" }, 403, origin);
        }

        const stripeCfg = getStripeConfig();
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
        const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!stripeCfg.ok) {
          return json({ error: stripeCfg.reason ?? "stripe_not_configured" }, 503, origin);
        }
        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
          return json({ error: "backend_not_configured" }, 500, origin);
        }
        const STRIPE_PUBLISHABLE_KEY = stripeCfg.publishableKey;

        const authHeader = request.headers.get("authorization") ?? "";
        const token = authHeader.replace(/^Bearer\s+/i, "").trim();
        if (!token) return json({ error: "unauthorized" }, 401, origin);

        const supaAuth = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
        });
        const { data: userRes, error: userErr } = await supaAuth.auth.getUser(token);
        if (userErr || !userRes.user) return json({ error: "unauthorized" }, 401, origin);
        const userId = userRes.user.id;

        // Look up the user's wallet currency (admin client — read-only).
        const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
        });
        const { data: wallet } = await admin
          .from("wallets")
          .select("currency")
          .eq("user_id", userId)
          .maybeSingle();
        const currency = normalizeCurrency(wallet?.currency ?? "EUR");

        let body: { amount?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: "invalid_json" }, 400, origin);
        }
        const raw = Number(body.amount);
        const { min: MIN_AMOUNT, max: MAX_AMOUNT } = topUpLimits(currency);
        if (!Number.isFinite(raw) || raw < MIN_AMOUNT || raw > MAX_AMOUNT) {
          return json({ error: "invalid_amount", currency, min: MIN_AMOUNT, max: MAX_AMOUNT }, 400, origin);
        }
        const amount = roundForCurrency(raw, currency);
        const amountMinor = toStripeMinor(amount, currency);

        const stripe = createStripeClient();
        const intent = await stripe.paymentIntents.create({
          amount: amountMinor,
          currency: currency.toLowerCase(),
          automatic_payment_methods: { enabled: true },
          metadata: {
            kind: "wallet_topup",
            userId,
            amount: String(amount),
            currency,
          },
          description: `KiDi+ · Recharge portefeuille (${amount} ${currency})`,
        });

        return json(
          {
            clientSecret: intent.client_secret,
            publishableKey: STRIPE_PUBLISHABLE_KEY,
            amount,
            currency,
          },
          200,
          origin,
        );
      },
    },
  },
});
