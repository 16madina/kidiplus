// POST /api/connect/payout
// Settles a `stripe_connect` payout row with an automated Stripe TRANSFER
// from the platform balance to the seller's connected account. Stripe then
// pays the seller's bank on their own payout schedule — no manual admin step.
//
// The payout row was already created by the `request_payout` RPC, which
// enforced: escrow-released available balance, minimum, and the tier
// daily/weekly caps (500 / 1000 / 5000). This route only moves the money.

import { createFileRoute } from "@tanstack/react-router";
import { isAllowedOrigin } from "@/lib/api-cors";
import { authenticate, corsHeaders, json } from "@/lib/connect-api.server";
import { CONNECT_CURRENCIES, resolveConnectStripe, stripeForEnv } from "@/lib/stripe-connect.server";
import { toStripeAmountFor } from "@/lib/fees";

export const Route = createFileRoute("/api/connect/payout")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) }),

      POST: async ({ request }) => {
        const origin = request.headers.get("origin");
        if (origin && !isAllowedOrigin(origin)) return json({ error: "Origin not allowed" }, 403, origin);

        const connect = resolveConnectStripe(request);
        if (!connect.ok) return json({ error: "stripe_not_configured" }, 503, origin);

        const auth = await authenticate(request);
        if (!auth.ok) return json({ error: auth.error }, auth.status, origin);
        const { userId, admin } = auth.ctx;

        let body: { payoutId?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: "invalid_json" }, 400, origin);
        }
        const payoutId = typeof body.payoutId === "string" ? body.payoutId.trim() : "";
        if (!payoutId || !/^[0-9a-f-]{36}$/i.test(payoutId)) {
          return json({ error: "invalid_payout_id" }, 400, origin);
        }

        const { data: payout } = await admin
          .from("payouts")
          .select("id, seller_id, amount, currency, method, status, stripe_transfer_id")
          .eq("id", payoutId)
          .maybeSingle();
        if (!payout) return json({ error: "payout_not_found" }, 404, origin);
        const row = payout as Record<string, unknown>;

        // The payout must belong to the caller (sellers settle their own).
        if (row.seller_id !== userId) return json({ error: "forbidden" }, 403, origin);
        if (row.method !== "stripe_connect") return json({ error: "not_connect_method" }, 400, origin);
        if (row.status === "paid" || row.status === "rejected") {
          return json({ error: "already_processed", status: row.status }, 409, origin);
        }
        if (typeof row.stripe_transfer_id === "string" && row.stripe_transfer_id) {
          return json({ ok: true, transferId: row.stripe_transfer_id, alreadySent: true }, 200, origin);
        }

        const currency = String(row.currency ?? "EUR").toUpperCase();
        if (!CONNECT_CURRENCIES.has(currency)) {
          return json({ error: "connect_currency_unsupported", currency }, 400, origin);
        }

        const { data: profile } = await admin
          .from("profiles")
          .select("stripe_connect_id, connect_status")
          .eq("id", userId)
          .maybeSingle();
        const p = (profile ?? {}) as Record<string, unknown>;
        const accountId = typeof p.stripe_connect_id === "string" ? p.stripe_connect_id : "";
        if (!accountId || p.connect_status !== "active") {
          return json({ error: "connect_not_ready", status: p.connect_status ?? "none" }, 409, origin);
        }

        const amountMinor = toStripeAmountFor(Number(row.amount), currency.toLowerCase());
        if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
          return json({ error: "invalid_amount" }, 400, origin);
        }

        try {
          const stripe = stripeForEnv(connect.hint, connect.opts);
          const transfer = await stripe.transfers.create(
            {
              amount: amountMinor,
              currency: currency.toLowerCase(),
              destination: accountId,
              description: `KiDi+ retrait ${payoutId}`,
              metadata: { payoutId, sellerId: userId },
            },
            { idempotencyKey: `kidi-payout-${payoutId}` },
          );

          await admin
            .from("payouts")
            .update({
              stripe_transfer_id: transfer.id,
              stripe_error: null,
              status: "paid",
              processed_at: new Date().toISOString(),
              admin_note: "Stripe Connect (automatique)",
            })
            .eq("id", payoutId);

          return json({ ok: true, transferId: transfer.id }, 200, origin);
        } catch (e) {
          const msg =
            (e as { raw?: { message?: string }; message?: string }).raw?.message ??
            (e as Error).message ??
            "stripe_error";
          console.error("[connect/payout] transfer failed", msg);
          // Leave the row 'requested' so an admin can retry / reject manually.
          await admin.from("payouts").update({ stripe_error: msg }).eq("id", payoutId);
          return json({ error: "transfer_failed", message: msg }, 502, origin);
        }
      },
    },
  },
});
