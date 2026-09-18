// POST /api/public/paydunya-ipn
// ------------------------------
// PayDunya IPN (Instant Payment Notification) webhook. Configured per-invoice
// via callback_url. Authenticity: the posted `data.hash` must equal
// sha512(PAYDUNYA_MASTER_KEY). We then re-confirm the invoice server-side
// (never trust the posted status alone) and credit idempotently.

import { createFileRoute } from "@tanstack/react-router";
import {
  getPaydunyaConfig,
  verifyPaydunyaHash,
} from "@/lib/paydunya.server";
import { finalizePaydunyaTopup } from "@/lib/paydunya-topup-finalize.server";

export const Route = createFileRoute("/api/public/paydunya-ipn")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cfgR = getPaydunyaConfig();
        if (!cfgR.ok) return new Response("not_configured", { status: 503 });

        let body: any;
        try {
          body = await request.json();
        } catch {
          return new Response("invalid_json", { status: 400 });
        }

        const hash = String(body?.data?.hash ?? body?.hash ?? "");
        const valid = await verifyPaydunyaHash(cfgR.cfg, hash);
        if (!valid) {
          console.warn("[paydunya-ipn] bad hash");
          return new Response("invalid_hash", { status: 401 });
        }

        const invoiceToken = String(
          body?.data?.invoice?.token ?? body?.invoice?.token ?? "",
        ).trim();
        if (!invoiceToken) return new Response("missing_token", { status: 400 });

        // Only act on a completed payment; other statuses are acknowledged.
        const status = String(body?.data?.status ?? body?.status ?? "").toLowerCase();
        if (status !== "completed") {
          return new Response("ok", { status: 200 });
        }

        const result = await finalizePaydunyaTopup(invoiceToken);
        if (!result.ok) {
          // 500 so PayDunya retries the IPN; log for debugging.
          console.error("[paydunya-ipn] finalize failed", result.error);
          return new Response(result.error, { status: 500 });
        }
        return new Response("ok", { status: 200 });
      },
    },
  },
});
