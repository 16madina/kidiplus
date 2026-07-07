// POST /api/wallet-topup
// -----------------------
// Creates a Stripe PaymentIntent to credit the authenticated user's wallet.
// The webhook (/api/stripe-webhook) reads metadata.kind === 'wallet_topup'
// and calls credit_wallet_topup() to atomically bump the balance.
//
// Validation:
//   - Bearer token required (Supabase auth).
//   - amount is a number in [2, 500] EUR (2-decimal max).

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

const MIN_AMOUNT = 2;
const MAX_AMOUNT = 500;
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

        const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
        const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY;
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

        if (!STRIPE_SECRET_KEY || !STRIPE_PUBLISHABLE_KEY) {
          return json({ error: "stripe_not_configured" }, 503, origin);
        }
        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
          return json({ error: "backend_not_configured" }, 500, origin);
        }

        const authHeader = request.headers.get("authorization") ?? "";
        const token = authHeader.replace(/^Bearer\s+/i, "").trim();
        if (!token) return json({ error: "unauthorized" }, 401, origin);

        const supaAuth = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
        });
        const { data: userRes, error: userErr } = await supaAuth.auth.getUser(token);
        if (userErr || !userRes.user) return json({ error: "unauthorized" }, 401, origin);
        const userId = userRes.user.id;

        let body: { amount?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: "invalid_json" }, 400, origin);
        }
        const raw = Number(body.amount);
        if (!Number.isFinite(raw) || raw < MIN_AMOUNT || raw > MAX_AMOUNT) {
          return json({ error: "invalid_amount" }, 400, origin);
        }
        const amount = Math.round(raw * 100) / 100;
        const amountCents = Math.round(amount * 100);

        const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2026-06-24.dahlia" });
        const intent = await stripe.paymentIntents.create({
          amount: amountCents,
          currency: "eur",
          automatic_payment_methods: { enabled: true },
          metadata: {
            kind: "wallet_topup",
            userId,
            amount: String(amount),
          },
          description: `KiDi+ · Recharge portefeuille (${amount.toFixed(2)} €)`,
        });

        return json(
          {
            clientSecret: intent.client_secret,
            publishableKey: STRIPE_PUBLISHABLE_KEY,
            amount,
          },
          200,
          origin,
        );
      },
    },
  },
});
