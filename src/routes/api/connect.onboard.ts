// POST /api/connect/onboard
// Creates (or reuses) the seller's Stripe Express account and returns a
// fresh Account Link so they can complete onboarding. Called the moment a
// Western (EUR/CAD/USD/GBP) seller tries to withdraw — never at signup.
//
// XOF / African sellers are rejected here on purpose: they keep the existing
// manual Wave / Orange Money / PayPal payout flow.

import { createFileRoute } from "@tanstack/react-router";
import { isAllowedOrigin } from "@/lib/api-cors";
import { authenticate, corsHeaders, json } from "@/lib/connect-api.server";
import { envHintFromRequest, getStripeConfig } from "@/lib/stripe.server";
import {
  CONNECT_CURRENCIES,
  resolveConnectCountry,
  statusFromAccount,
  stripeForEnv,
} from "@/lib/stripe-connect.server";
import { publicAppOrigin } from "@/lib/paypal-public-origin";

export const Route = createFileRoute("/api/connect/onboard")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) }),

      POST: async ({ request }) => {
        const origin = request.headers.get("origin");
        if (origin && !isAllowedOrigin(origin)) return json({ error: "Origin not allowed" }, 403, origin);

        const envHint = envHintFromRequest(request);
        const cfg = getStripeConfig(envHint);
        if (!cfg.ok) return json({ error: "stripe_not_configured" }, 503, origin);

        const auth = await authenticate(request);
        if (!auth.ok) return json({ error: auth.error }, auth.status, origin);
        const { userId, admin } = auth.ctx;

        const { data: profile } = await admin
          .from("profiles")
          .select("id, email, country, stripe_connect_id, connect_status")
          .eq("id", userId)
          .maybeSingle();
        const p = (profile ?? {}) as Record<string, unknown>;

        const { data: bal } = await admin
          .from("seller_balances")
          .select("currency")
          .eq("seller_id", userId)
          .maybeSingle();
        const currency = String((bal as { currency?: string } | null)?.currency ?? "EUR").toUpperCase();

        if (!CONNECT_CURRENCIES.has(currency)) {
          // XOF & co → manual payout flow, untouched.
          return json({ error: "connect_currency_unsupported", currency }, 400, origin);
        }
        const country = resolveConnectCountry(p.country, currency);
        if (!country) return json({ error: "connect_country_unsupported" }, 400, origin);

        const stripe = stripeForEnv(envHint);
        let accountId = typeof p.stripe_connect_id === "string" ? p.stripe_connect_id : "";

        try {
          if (!accountId) {
            const account = await stripe.accounts.create({
              type: "express",
              country,
              email: typeof p.email === "string" ? p.email : undefined,
              default_currency: currency.toLowerCase(),
              capabilities: {
                transfers: { requested: true },
              },
              business_type: "individual",
              metadata: { kidiplus_user_id: userId },
            });
            accountId = account.id;
            await admin
              .from("profiles")
              .update({
                stripe_connect_id: accountId,
                connect_status: "pending",
                connect_updated_at: new Date().toISOString(),
              })
              .eq("id", userId);
          }

          const appOrigin = publicAppOrigin(request);
          const link = await stripe.accountLinks.create({
            account: accountId,
            refresh_url: `${appOrigin}/connect-return?refresh=1`,
            return_url: `${appOrigin}/connect-return`,
            type: "account_onboarding",
          });

          // Report the current status alongside the link.
          const acc = await stripe.accounts.retrieve(accountId);
          const status = statusFromAccount(acc as never);

          return json(
            { ok: true, url: link.url, accountId, status, currency, country },
            200,
            origin,
          );
        } catch (e) {
          const msg = (e as { raw?: { message?: string }; message?: string }).raw?.message
            ?? (e as Error).message
            ?? "stripe_error";
          console.error("[connect/onboard] stripe error", msg);
          return json({ error: "stripe_error", message: msg }, 502, origin);
        }
      },
    },
  },
});
