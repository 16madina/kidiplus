// POST /api/stripe-webhook
// ------------------------
// Stripe → Lovable Cloud bridge. Verifies signature (STRIPE_WEBHOOK_SECRET),
// then flips the order row to `paid` / `failed` using the service-role
// Supabase client (bypasses RLS — this is the ONLY path allowed to mutate
// order status).
//
// Configure in Stripe dashboard → Developers → Webhooks:
//   Endpoint URL:  https://<your-app>/api/stripe-webhook
//   Events:        payment_intent.succeeded, payment_intent.payment_failed,
//                  payment_intent.canceled

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

export const Route = createFileRoute("/api/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
        const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
          return new Response("stripe_not_configured", { status: 503 });
        }
        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
          return new Response("backend_not_configured", { status: 500 });
        }

        const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2026-06-24.dahlia" });
        const signature = request.headers.get("stripe-signature") ?? "";
        const rawBody = await request.text();

        let event: Stripe.Event;
        try {
          event = await stripe.webhooks.constructEventAsync(
            rawBody,
            signature,
            STRIPE_WEBHOOK_SECRET,
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : "signature verification failed";
          return new Response(`Webhook signature verification failed: ${msg}`, {
            status: 400,
          });
        }

        const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
        });

        try {
          if (event.type === "payment_intent.succeeded") {
            const intent = event.data.object as Stripe.PaymentIntent;
            const kind = intent.metadata?.kind;

            if (kind === "wallet_topup") {
              // Wallet top-up: credit the user's balance atomically + idempotently.
              const userId = intent.metadata?.userId;
              const amountStr = intent.metadata?.amount;
              const amount = amountStr ? Number(amountStr) : intent.amount_received / 100;
              if (userId && Number.isFinite(amount) && amount > 0) {
                await admin.rpc("credit_wallet_topup", {
                  _user_id: userId,
                  _amount: amount,
                  _payment_intent_id: intent.id,
                });
              }
            } else {
              // Regular order payment
              const orderId = intent.metadata?.orderId;
              const q = admin
                .from("orders")
                .update({ status: "paid", paid_at: new Date().toISOString() })
                .eq("stripe_payment_intent_id", intent.id)
                .neq("status", "paid");
              if (orderId) await q.eq("id", orderId);
              else await q;
            }
          } else if (
            event.type === "payment_intent.payment_failed" ||
            event.type === "payment_intent.canceled"
          ) {
            const intent = event.data.object as Stripe.PaymentIntent;
            if (intent.metadata?.kind !== "wallet_topup") {
              const nextStatus =
                event.type === "payment_intent.canceled" ? "cancelled" : "failed";
              await admin
                .from("orders")
                .update({ status: nextStatus })
                .eq("stripe_payment_intent_id", intent.id)
                .eq("status", "pending");
            }
          }

          // Other event types are silently acknowledged.
        } catch {
          // Never throw back to Stripe — return 200 so it doesn't retry
          // indefinitely on transient DB blips; production would log this.
          return new Response("handled_with_errors", { status: 200 });
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
