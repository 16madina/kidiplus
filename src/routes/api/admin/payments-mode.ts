// GET /api/admin/payments-mode — admin-only Stripe/PayPal MODE report.
//
// Returns ONLY the *kind* of each credential (test / live / configured), never
// the values themselves. Used by the admin panel badge so it's always obvious
// whether the app is talking to Stripe test or live.

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { envHintFromRequest, getStripeConfig } from "@/lib/stripe.server";

type KeyKind = "test" | "live" | "missing" | "unknown";

function keyKind(v: string | undefined): KeyKind {
  const s = (v ?? "").trim();
  if (!s) return "missing";
  if (s.startsWith("sk_test_") || s.startsWith("pk_test_") || s.startsWith("rk_test_")) return "test";
  if (s.startsWith("sk_live_") || s.startsWith("pk_live_") || s.startsWith("rk_live_")) return "live";
  return "unknown"; // e.g. opaque Lovable gateway connection key
}

export const Route = createFileRoute("/api/admin/payments-mode")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.replace(/^Bearer\s+/i, "").trim();
        if (!token) return new Response("Unauthorized", { status: 401 });

        const supa = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY!,
          { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } },
        );
        const { data: userData } = await supa.auth.getUser();
        if (!userData?.user) return new Response("Unauthorized", { status: 401 });
        const { data: isAdmin } = await supa.rpc("is_admin", { _user_id: userData.user.id });
        if (!isAdmin) return new Response("Forbidden", { status: 403 });

        const hint = envHintFromRequest(request);
        const cfg = getStripeConfig(hint);

        const legacySecretKind = keyKind(process.env.STRIPE_SECRET_KEY);
        const publishableKind = keyKind(cfg.publishableKey);
        const paypalMode =
          (process.env.PAYPAL_MODE ?? "sandbox").trim().toLowerCase() === "live" ? "live" : "sandbox";

        // Effective mode: a legacy sk_* key wins (used directly by the SDK),
        // otherwise the gateway env selected by the client publishable key.
        const effective: "test" | "live" =
          legacySecretKind === "live"
            ? "live"
            : legacySecretKind === "test"
              ? "test"
              : cfg.env === "live"
                ? "live"
                : "test";

        return Response.json(
          {
            ok: true,
            effective, // "test" | "live"
            stripe: {
              gatewayEnv: cfg.env, // sandbox | live (which gateway key is used)
              configured: cfg.ok,
              legacySecretKey: legacySecretKind, // test | live | missing | unknown
              publishableKey: publishableKind,
              webhookSecretConfigured: Boolean(cfg.webhookSecret),
              sandboxGatewayKey: Boolean(process.env.STRIPE_SANDBOX_API_KEY),
              liveGatewayKey: Boolean(process.env.STRIPE_LIVE_API_KEY),
            },
            paypal: {
              mode: paypalMode,
              configured: Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET),
            },
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
    },
  },
});
