// POST /api/wallet-topup/confirm
// -------------------------------
// Fallback path so wallet credits never depend solely on the Stripe webhook.
// The client calls this immediately after Stripe confirms the payment in the
// browser. We retrieve the PaymentIntent server-side, verify it belongs to the
// authenticated user + is a wallet top-up + succeeded, then call the
// idempotent credit_wallet_topup RPC. Safe even if the webhook ALSO fires.

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { createStripeClient, getStripeConfig, envHintFromRequest } from "@/lib/stripe.server";
import { isAllowedOrigin } from "@/lib/api-cors";
function corsHeaders(origin: string | null): HeadersInit {
  const base: Record<string, string> = {
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Payments-Env",
    "Access-Control-Max-Age": "86400",
  };
  if (origin && isAllowedOrigin(origin)) base["Access-Control-Allow-Origin"] = origin;
  return base;
}
function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...corsHeaders(origin) },
  });
}

export const Route = createFileRoute("/api/wallet-topup/confirm")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) }),

      POST: async ({ request }) => {
        const origin = request.headers.get("origin");
        if (origin && !isAllowedOrigin(origin)) return json({ error: "Origin not allowed" }, 403, origin);

        // Wallet top-ups are confirmed in the browser with the MANAGED publishable
        // token, so they must never be routed to the BYOK STRIPE_SECRET_KEY account
        // (a separate Connect-testing account). managedOnly pins them to the gateway.
        const MANAGED = { managedOnly: true } as const;
        const envHint = envHintFromRequest(request, MANAGED);
        const stripeCfg = getStripeConfig(envHint, MANAGED);
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
        const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!stripeCfg.ok) return json({ error: stripeCfg.reason ?? "stripe_not_configured" }, 503, origin);
        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
          return json({ error: "backend_not_configured" }, 500, origin);
        }

        const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
        if (!token) return json({ error: "unauthorized" }, 401, origin);

        const supaAuth = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
        });
        const { data: userRes, error: userErr } = await supaAuth.auth.getUser(token);
        if (userErr || !userRes.user) return json({ error: "unauthorized" }, 401, origin);
        const userId = userRes.user.id;

        let body: { paymentIntentId?: unknown };
        try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400, origin); }
        const pi = typeof body.paymentIntentId === "string" ? body.paymentIntentId.trim() : "";
        if (!pi || !pi.startsWith("pi_")) return json({ error: "invalid_payment_intent" }, 400, origin);

        const stripe = createStripeClient(envHint, MANAGED);
        let intent;
        try {
          intent = await stripe.paymentIntents.retrieve(pi);
        } catch {
          return json({ error: "intent_not_found" }, 404, origin);
        }

        if (intent.metadata?.kind !== "wallet_topup") {
          return json({ error: "not_a_topup" }, 400, origin);
        }
        if (intent.metadata?.userId !== userId) {
          return json({ error: "forbidden" }, 403, origin);
        }
        if (intent.status !== "succeeded") {
          return json({ error: "not_succeeded", status: intent.status }, 409, origin);
        }

        const cur = (intent.currency || "eur").toLowerCase();
        const divisor = cur === "xof" ? 1 : 100;
        const amount = intent.metadata?.amount
          ? Number(intent.metadata.amount)
          : intent.amount_received / divisor;
        if (!Number.isFinite(amount) || amount <= 0) {
          return json({ error: "invalid_amount" }, 400, origin);
        }

        const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
        });
        const { data: rpcData, error: rpcErr } = await admin.rpc("credit_wallet_topup", {
          _user_id: userId,
          _amount: amount,
          _payment_intent_id: intent.id,
        });
        if (rpcErr) return json({ error: rpcErr.message }, 500, origin);

        const result = (rpcData ?? {}) as { ok?: boolean; balance?: number; duplicate?: boolean; error?: string };
        if (!result.ok) return json({ error: result.error ?? "credit_failed" }, 500, origin);

        // Fetch the up-to-date wallet row (RPC returns balance for the fresh
        // credit path; duplicate path returns no balance).
        let balance = typeof result.balance === "number" ? result.balance : undefined;
        if (balance === undefined) {
          const { data: w } = await admin.from("wallets").select("balance").eq("user_id", userId).maybeSingle();
          balance = w ? Number(w.balance) : 0;
        }
        return json({ ok: true, balance, amount, duplicate: !!result.duplicate }, 200, origin);
      },
    },
  },
});
