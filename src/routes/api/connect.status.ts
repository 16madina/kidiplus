// POST /api/connect/status
// Refreshes the seller's connected-account state from Stripe and mirrors
// charges_enabled / payouts_enabled into profiles.connect_status.

import { createFileRoute } from "@tanstack/react-router";
import { isAllowedOrigin } from "@/lib/api-cors";
import { authenticate, corsHeaders, json } from "@/lib/connect-api.server";
import { envHintFromRequest, getStripeConfig } from "@/lib/stripe.server";
import { CONNECT_CURRENCIES, statusFromAccount, stripeForEnv } from "@/lib/stripe-connect.server";

export const Route = createFileRoute("/api/connect/status")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) }),

      POST: async ({ request }) => {
        const origin = request.headers.get("origin");
        if (origin && !isAllowedOrigin(origin)) return json({ error: "Origin not allowed" }, 403, origin);

        const auth = await authenticate(request);
        if (!auth.ok) return json({ error: auth.error }, auth.status, origin);
        const { userId, admin } = auth.ctx;

        const { data: profile } = await admin
          .from("profiles")
          .select("stripe_connect_id, connect_status")
          .eq("id", userId)
          .maybeSingle();
        const p = (profile ?? {}) as Record<string, unknown>;

        const { data: bal } = await admin
          .from("seller_balances")
          .select("currency")
          .eq("seller_id", userId)
          .maybeSingle();
        const currency = String((bal as { currency?: string } | null)?.currency ?? "EUR").toUpperCase();
        const eligible = CONNECT_CURRENCIES.has(currency);

        const accountId = typeof p.stripe_connect_id === "string" ? p.stripe_connect_id : "";
        if (!accountId) {
          return json(
            { ok: true, status: "none", eligible, currency, chargesEnabled: false, payoutsEnabled: false },
            200,
            origin,
          );
        }

        const envHint = envHintFromRequest(request);
        const cfg = getStripeConfig(envHint);
        if (!cfg.ok) return json({ error: "stripe_not_configured" }, 503, origin);

        try {
          const stripe = stripeForEnv(envHint);
          const acc = await stripe.accounts.retrieve(accountId);
          const status = statusFromAccount(acc as never);
          await admin
            .from("profiles")
            .update({
              connect_status: status,
              connect_charges_enabled: Boolean(acc.charges_enabled),
              connect_payouts_enabled: Boolean(acc.payouts_enabled),
              connect_updated_at: new Date().toISOString(),
            })
            .eq("id", userId);

          return json(
            {
              ok: true,
              status,
              eligible,
              currency,
              accountId,
              chargesEnabled: Boolean(acc.charges_enabled),
              payoutsEnabled: Boolean(acc.payouts_enabled),
              disabledReason: acc.requirements?.disabled_reason ?? null,
            },
            200,
            origin,
          );
        } catch (e) {
          const msg = (e as Error).message ?? "stripe_error";
          console.error("[connect/status] stripe error", msg);
          return json({ error: "stripe_error", message: msg }, 502, origin);
        }
      },
    },
  },
});
