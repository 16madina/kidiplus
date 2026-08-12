// POST /api/connect/login-link
// Returns a one-time Stripe Express dashboard login link for the seller's
// connected account, so an active seller can review payouts on Stripe.

import { createFileRoute } from "@tanstack/react-router";
import { isAllowedOrigin } from "@/lib/api-cors";
import { authenticate, corsHeaders, json } from "@/lib/connect-api.server";
import { envHintFromRequest, getStripeConfig } from "@/lib/stripe.server";
import { isConnectNotEnabledError, stripeForEnv } from "@/lib/stripe-connect.server";

export const Route = createFileRoute("/api/connect/login-link")({
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

        const envHint = envHintFromRequest(request);
        const cfg = getStripeConfig(envHint);
        if (!cfg.ok) return json({ error: "stripe_not_configured" }, 503, origin);

        const { data: profile } = await admin
          .from("profiles")
          .select("stripe_connect_id")
          .eq("id", userId)
          .maybeSingle();
        const accountId = (profile as { stripe_connect_id?: string } | null)?.stripe_connect_id;
        if (!accountId) return json({ error: "no_connect_account" }, 400, origin);

        try {
          const stripe = stripeForEnv(envHint);
          const link = await stripe.accounts.createLoginLink(accountId);
          return json({ ok: true, url: link.url }, 200, origin);
        } catch (e) {
          const msg = (e as { raw?: { message?: string }; message?: string }).raw?.message
            ?? (e as Error).message
            ?? "stripe_error";
          if (isConnectNotEnabledError(e)) {
            return json({ error: "connect_not_enabled" }, 200, origin);
          }
          console.error("[connect/login-link] stripe error", msg);
          return json({ error: "stripe_error", message: msg }, 200, origin);
        }
      },
    },
  },
});
