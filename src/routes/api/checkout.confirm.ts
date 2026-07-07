// POST /api/checkout/confirm
// ---------------------------
// Fallback path so a direct-purchase order is marked paid immediately after
// Stripe confirms in the browser, without waiting on the webhook. Retrieves
// the PaymentIntent server-side, verifies buyer + orderId, then flips the
// order to `paid` and credits the seller — idempotently. Safe if the webhook
// also fires.

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { createStripeClient, getStripeConfig } from "@/lib/stripe.server";

const ALLOWED_ORIGIN_SUFFIXES = ["lovable.app", "lovableproject.com", "localhost", "127.0.0.1"];
function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true;
  try {
    const host = new URL(origin).hostname;
    return ALLOWED_ORIGIN_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`));
  } catch { return false; }
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
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...corsHeaders(origin) },
  });
}

export const Route = createFileRoute("/api/checkout/confirm")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) }),

      POST: async ({ request }) => {
        const origin = request.headers.get("origin");
        if (origin && !isAllowedOrigin(origin)) return json({ error: "Origin not allowed" }, 403, origin);

        const stripeCfg = getStripeConfig();
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

        const stripe = createStripeClient();
        let intent;
        try {
          intent = await stripe.paymentIntents.retrieve(pi);
        } catch {
          return json({ error: "intent_not_found" }, 404, origin);
        }

        const orderId = intent.metadata?.orderId;
        if (!orderId) return json({ error: "no_order_metadata" }, 400, origin);
        if (intent.metadata?.buyerId && intent.metadata.buyerId !== userId) {
          return json({ error: "forbidden" }, 403, origin);
        }
        if (intent.status !== "succeeded") {
          return json({ error: "not_succeeded", status: intent.status }, 409, origin);
        }

        const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
        });

        // Idempotent update: only flip pending → paid; if already paid, we still
        // return ok. Double-check buyer server-side (metadata could be stale).
        const { data: order } = await admin
          .from("orders")
          .select("id, buyer_id, status")
          .eq("id", orderId)
          .maybeSingle();
        if (!order) return json({ error: "order_not_found" }, 404, origin);
        if (order.buyer_id !== userId) return json({ error: "forbidden" }, 403, origin);

        let paid = order.status === "paid";
        if (!paid) {
          const { data: upd } = await admin
            .from("orders")
            .update({ status: "paid", paid_at: new Date().toISOString(), stripe_payment_intent_id: intent.id })
            .eq("id", orderId)
            .neq("status", "paid")
            .select("id");
          if (upd && upd.length > 0) paid = true;
        }
        if (paid) {
          // Idempotent — the RPC checks for an existing earning row.
          await admin.rpc("credit_seller_earning", { _order_id: orderId });
        }

        return json({ ok: true, orderId, status: "paid" }, 200, origin);
      },
    },
  },
});
