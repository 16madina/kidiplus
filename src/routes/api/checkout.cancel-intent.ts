// POST /api/checkout/cancel-intent
// --------------------------------
// Cancels a Stripe PaymentIntent still attached to an order after the buyer
// paid with wallet (or otherwise no longer needs the card PI). Prevents a
// second card capture on an already-paid order.

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
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...corsHeaders(origin),
    },
  });
}

const CANCELABLE = new Set([
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
  "requires_capture",
  "processing",
]);

export const Route = createFileRoute("/api/checkout/cancel-intent")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) }),

      POST: async ({ request }) => {
        const origin = request.headers.get("origin");
        if (origin && !isAllowedOrigin(origin)) return json({ error: "Origin not allowed" }, 403, origin);

        // Pin to the managed gateway (same account as the browser's publishable
        // token). The stray BYOK STRIPE_SECRET_KEY must never override the env.
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

        let body: { orderId?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: "invalid_json" }, 400, origin);
        }
        const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
        if (!orderId) return json({ error: "invalid_order" }, 400, origin);

        const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
        });
        const { data: order } = await admin
          .from("orders")
          .select("id, buyer_id, status, stripe_payment_intent_id, payment_method")
          .eq("id", orderId)
          .maybeSingle();
        if (!order) return json({ error: "order_not_found" }, 404, origin);
        if (order.buyer_id !== userId) return json({ error: "forbidden" }, 403, origin);

        const piId = order.stripe_payment_intent_id as string | null;
        if (!piId) return json({ ok: true, canceled: false, reason: "no_intent" }, 200, origin);

        // Only cancel when the order is already paid (wallet) or still pending
        // but the client explicitly abandons card checkout.
        const stripe = createStripeClient(envHint, MANAGED);
        try {
          const intent = await stripe.paymentIntents.retrieve(piId);
          if (CANCELABLE.has(intent.status)) {
            await stripe.paymentIntents.cancel(piId, {
              cancellation_reason: "requested_by_customer",
            });
            if (order.status === "paid") {
              await admin
                .from("orders")
                .update({ stripe_payment_intent_id: null })
                .eq("id", orderId)
                .eq("status", "paid");
            }
            return json({ ok: true, canceled: true }, 200, origin);
          }
          return json({ ok: true, canceled: false, status: intent.status }, 200, origin);
        } catch {
          return json({ ok: true, canceled: false, reason: "retrieve_failed" }, 200, origin);
        }
      },
    },
  },
});
