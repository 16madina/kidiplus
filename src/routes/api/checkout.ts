// POST /api/checkout
// -------------------
// Creates a Stripe PaymentIntent for a pending order that belongs to the
// authenticated user.
//
// Security model:
// - Stripe SECRET key is read from process.env inside the handler (never
//   at module scope, never with a VITE_ prefix, never returned in body).
// - Callers must present a Supabase user bearer token in Authorization.
//   We verify the token with Supabase Auth via the publishable client
//   (never trusting a userId sent by the client).
// - Order ownership is re-checked server-side using the service-role
//   client (RLS-bypass), so a hostile client can never pay another user's
//   order or mutate amount/currency.
// - Phase 1: money flows to the PLATFORM's Stripe account. The order row
//   records seller_id + amounts owed; seller payouts (Stripe Connect) are
//   a future phase.

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { createStripeClient, resolveCardStripe, mapStripeError } from "@/lib/stripe.server";
import { toStripeAmountFor } from "@/lib/fees";
import { isZeroDecimal, normalizeCurrency } from "@/lib/money";
import { isAllowedOrigin } from "@/lib/api-cors";
import { connectApplicationFee } from "@/lib/stripe-connect.server";
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

export const Route = createFileRoute("/api/checkout")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        return new Response(null, {
          status: 204,
          headers: corsHeaders(request.headers.get("origin")),
        });
      },

      POST: async ({ request }) => {
        const origin = request.headers.get("origin");
        if (origin && !isAllowedOrigin(origin)) {
          return json({ error: "Origin not allowed" }, 403, origin);
        }

        const card = resolveCardStripe(request);
        const stripeCfg = card;
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
        const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!stripeCfg.ok) {
          return json({ error: "stripe_not_configured" }, 503, origin);
        }
        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
          return json({ error: "backend_not_configured" }, 500, origin);
        }
        const STRIPE_PUBLISHABLE_KEY = stripeCfg.publishableKey;

        // Verify caller identity via Supabase bearer token.
        const authHeader = request.headers.get("authorization") ?? "";
        const token = authHeader.replace(/^Bearer\s+/i, "").trim();
        if (!token) return json({ error: "unauthorized" }, 401, origin);

        const supaAuth = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
        });
        const { data: userRes, error: userErr } = await supaAuth.auth.getUser(token);
        if (userErr || !userRes.user) return json({ error: "unauthorized" }, 401, origin);
        const userId = userRes.user.id;

        // Parse body.
        let body: { orderId?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: "invalid_json" }, 400, origin);
        }
        const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
        if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) {
          return json({ error: "invalid_order_id" }, 400, origin);
        }

        // Fetch + re-verify the order server-side (service role, bypasses RLS).
        const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
        });
        const { data: order, error: orderErr } = await admin
          .from("orders")
          .select("*")
          .eq("id", orderId)
          .maybeSingle();
        if (orderErr) return json({ error: "db_error" }, 500, origin);
        if (!order) return json({ error: "order_not_found" }, 404, origin);
        if (order.buyer_id !== userId) return json({ error: "forbidden" }, 403, origin);
        if (order.status !== "pending") {
          return json({ error: "order_not_pending" }, 409, origin);
        }

        // Anti-fraud: block card checkout for banned / suspended / risk-restricted.
        const { data: buyerProfile } = await admin
          .from("profiles")
          .select("moderation_status, risk_restricted")
          .eq("id", userId)
          .maybeSingle();
        const modStatus = (buyerProfile as { moderation_status?: string } | null)?.moderation_status;
        const riskRestricted = Boolean(
          (buyerProfile as { risk_restricted?: boolean } | null)?.risk_restricted,
        );
        if (modStatus === "banned") {
          return json({ error: "account_banned" }, 403, origin);
        }
        if (modStatus === "suspended") {
          return json({ error: "account_suspended" }, 403, origin);
        }
        if (riskRestricted) {
          return json({ error: "risk_restricted" }, 403, origin);
        }

        const currency = normalizeCurrency(order.currency).toLowerCase();
        const amountMinor = toStripeAmountFor(Number(order.total), currency);
        // Stripe requires a minimum charge of ~0.50 in the currency's *minor unit
        // equivalent*. For XOF (zero-decimal, ≈655/EUR) the practical floor is
        // handled by our topUpLimits — just guard against non-positive amounts.
        if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
          return json({ error: "invalid_amount" }, 400, origin);
        }
        // The `currency` const is already prepared above (lowercase).

        const stripe = createStripeClient(card.hint, card.opts);

        // Marketplace split: when the seller has an ACTIVE Stripe Express
        // account, the card charge becomes a DESTINATION CHARGE — funds are
        // transferred to the seller's connected account and KiDi+ keeps a 10%
        // application fee. The webhook then skips credit_seller_earning so the
        // seller is never paid twice (Stripe transfer + wallet escrow).
        let connectDestination = "";
        {
          const { data: sellerProfile } = await admin
            .from("profiles")
            .select("stripe_connect_id, connect_status, connect_charges_enabled")
            .eq("id", order.seller_id)
            .maybeSingle();
          const sp = (sellerProfile ?? {}) as Record<string, unknown>;
          if (
            typeof sp.stripe_connect_id === "string" &&
            sp.stripe_connect_id.startsWith("acct_") &&
            sp.connect_status === "active" &&
            sp.connect_charges_enabled === true
          ) {
            connectDestination = sp.stripe_connect_id;
          }
        }
        const applicationFeeMinor = connectDestination
          ? connectApplicationFee(amountMinor)
          : 0;

        // Reuse an existing intent if we already created one for this order.
        let intent;
        if (order.stripe_payment_intent_id) {
          try {
            intent = await stripe.paymentIntents.retrieve(order.stripe_payment_intent_id);
            if (intent.status === "succeeded" || intent.status === "canceled") {
              intent = undefined; // create a fresh one
            }
          } catch {
            intent = undefined;
          }
        }

        if (!intent) {
          try {
            intent = await stripe.paymentIntents.create({
              amount: amountMinor,
              currency,
              automatic_payment_methods: { enabled: true },
              ...(connectDestination
                ? {
                    transfer_data: { destination: connectDestination },
                    application_fee_amount: applicationFeeMinor,
                  }
                : {}),
              metadata: {
                orderId: order.id,
                buyerId: order.buyer_id,
                sellerId: order.seller_id,
                liveId: order.live_id ?? "",
                productId: order.product_id ?? "",
                kind: order.kind,
                platformFee: String(order.platform_fee),
                processingFee: String(order.processing_fee),
                connectTransfer: connectDestination ? "1" : "0",
                connectDestination,
                applicationFee: String(applicationFeeMinor),
              },
              description: `KiDi+ · ${order.item_name}`,
            });
          } catch (e) {
            const err = e as {
              message?: string;
              code?: string;
              type?: string;
              param?: string;
              raw?: { message?: string; code?: string; type?: string; param?: string };
            };
            const rawMsg = err.raw?.message ?? err.message ?? "stripe_error";
            const rawCode = err.raw?.code ?? err.code;
            const rawType = err.raw?.type ?? err.type;
            console.error("[checkout] stripe_error", {
              orderId: order.id,
              currency,
              amount: amountMinor,
              code: rawCode,
              type: rawType,
              param: err.raw?.param ?? err.param,
              message: rawMsg,
            });
            const code = mapStripeError(rawCode, rawType, rawMsg);
            return json({ error: code, detail: rawMsg }, 502, origin);
          }
          await admin
            .from("orders")
            .update({ stripe_payment_intent_id: intent.id })
            .eq("id", order.id);
        }


        return json(
          {
            clientSecret: intent.client_secret,
            publishableKey: STRIPE_PUBLISHABLE_KEY,
            orderId: order.id,
            total: Number(order.total),
            currency,
          },
          200,
          origin,
        );
      },
    },
  },
});
