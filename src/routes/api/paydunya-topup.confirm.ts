// POST /api/paydunya-topup/confirm
// ---------------------------------
// Client-driven confirmation (polling from the WebView while the hosted
// PayDunya page is open, or after returning). Auth is optional: if a Bearer
// token is present we verify it matches the invoice custom_data; if absent we
// still credit using custom_data from PayDunya (return can land without a
// Supabase session — Safari / Universal Link). Idempotent.

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { isAllowedOrigin } from "@/lib/api-cors";
import { finalizePaydunyaTopup } from "@/lib/paydunya-topup-finalize.server";

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

export const Route = createFileRoute("/api/paydunya-topup/confirm")({
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

        let expectedUserId: string | null = null;
        const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
        if (token) {
          const supaAuth = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
          });
          const { data: userRes } = await supaAuth.auth.getUser(token);
          if (userRes.user) expectedUserId = userRes.user.id;
        }

        let body: { invoiceToken?: unknown };
        try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400, origin); }
        const invoiceToken = typeof body.invoiceToken === "string" ? body.invoiceToken.trim() : "";
        if (!invoiceToken) return json({ error: "invalid_invoice_token" }, 400, origin);

        const result = await finalizePaydunyaTopup(invoiceToken, { expectedUserId });
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
            balance: result.balance,
            amount: result.amount,
            currency: result.currency,
            duplicate: result.duplicate,
          },
          200,
          origin,
        );
      },
    },
  },
});
