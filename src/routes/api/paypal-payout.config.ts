// GET /api/paypal-payout/config — public, returns whether PayPal secrets are set.
// No PayPal credentials are exposed. Used by the admin UI to enable/disable
// the "Envoyer via PayPal" button without failing the click.

import { createFileRoute } from "@tanstack/react-router";
import { isAllowedOrigin } from "@/lib/api-cors";
import { getPaypalConfig } from "@/lib/paypal.server";

function corsHeaders(origin: string | null): HeadersInit {
  const h: Record<string, string> = {
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
  if (origin && isAllowedOrigin(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

export const Route = createFileRoute("/api/paypal-payout/config")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) }),
      GET: async ({ request }) => {
        const origin = request.headers.get("origin");
        const cfg = getPaypalConfig();
        return new Response(
          JSON.stringify({ configured: cfg.ok, mode: cfg.ok ? cfg.cfg.mode : null }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } },
        );
      },
    },
  },
});
