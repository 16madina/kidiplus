// POST /api/paypal-checkout/capture
// ---------------------------------
// After PayPal approval, capture + mark the KiDi+ order paid.

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { isAllowedOrigin } from "@/lib/api-cors";
import { finalizePaypalOrderPayment } from "@/lib/paypal-order-finalize.server";

function corsHeaders(origin: string | null): HeadersInit {
  const h: Record<string, string> = {
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
  if (origin && isAllowedOrigin(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}
function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...corsHeaders(origin) },
  });
}

export const Route = createFileRoute("/api/paypal-checkout/capture")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) }),

      POST: async ({ request }) => {
        const origin = request.headers.get("origin");
        if (origin && !isAllowedOrigin(origin)) return json({ error: "Origin not allowed" }, 403, origin);

        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
          return json({ error: "backend_not_configured" }, 500, origin);
        }

        let expectedBuyerId: string | null = null;
        const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
        if (token) {
          const supaAuth = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
          });
          const { data: userRes } = await supaAuth.auth.getUser(token);
          if (userRes.user) expectedBuyerId = userRes.user.id;
        }

        let body: { orderId?: unknown; paypalOrderId?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: "invalid_json" }, 400, origin);
        }
        const paypalOrderId =
          typeof body.paypalOrderId === "string"
            ? body.paypalOrderId.trim()
            : typeof body.orderId === "string"
              ? body.orderId.trim()
              : "";
        if (!paypalOrderId) return json({ error: "invalid_order_id" }, 400, origin);

        const result = await finalizePaypalOrderPayment(paypalOrderId, { expectedBuyerId });
        if (!result.ok) {
          return json(
            { error: result.error, message: result.message },
            result.status ?? 502,
            origin,
          );
        }

        return json(
          {
            ok: true,
            orderId: result.orderId,
            captureId: result.captureId,
            duplicate: result.duplicate,
          },
          200,
          origin,
        );
      },
    },
  },
});
