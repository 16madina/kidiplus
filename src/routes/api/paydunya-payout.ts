// POST /api/paydunya-payout
// --------------------------
// Settles a `wave` / `orange_money` payout row with an automated PayDunya
// disbursement to the seller's mobile-money number. XOF only — PayDunya
// settles in FCFA. Mirrors /api/connect/payout: the `request_payout` RPC
// already debited the balance and enforced minimums + tier caps; this route
// only moves the money. The seller settles their own payout (authenticated).

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { isAllowedOrigin } from "@/lib/api-cors";
import {
  getPaydunyaConfig,
  paydunyaDisburse,
  withdrawModeFor,
} from "@/lib/paydunya.server";
import { publicAppOrigin } from "@/lib/paypal-public-origin";

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

export const Route = createFileRoute("/api/paydunya-payout")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) }),

      POST: async ({ request }) => {
        const origin = request.headers.get("origin");
        if (origin && !isAllowedOrigin(origin)) return json({ error: "Origin not allowed" }, 403, origin);

        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
        const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
          return json({ error: "backend_not_configured" }, 500, origin);
        }

        const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
        if (!token) return json({ error: "unauthorized" }, 401, origin);

        const supaAuth = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
        });
        const { data: userRes, error: userErr } = await supaAuth.auth.getUser(token);
        if (userErr || !userRes.user) return json({ error: "unauthorized" }, 401, origin);
        const userId = userRes.user.id;

        let body: { payoutId?: unknown };
        try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400, origin); }
        const payoutId = typeof body.payoutId === "string" ? body.payoutId.trim() : "";
        if (!payoutId || !/^[0-9a-f-]{36}$/i.test(payoutId)) {
          return json({ error: "invalid_payout_id" }, 400, origin);
        }

        const cfg = getPaydunyaConfig();
        if (!cfg.ok) return json({ error: "paydunya_not_configured" }, 503, origin);

        const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
        });
        const { data: payout } = await admin
          .from("payouts")
          .select("id, seller_id, amount, currency, method, status, destination, paydunya_token")
          .eq("id", payoutId)
          .maybeSingle();
        if (!payout) return json({ error: "payout_not_found" }, 404, origin);
        const p = payout as Record<string, unknown>;

        // The payout must belong to the caller (sellers settle their own).
        if (p.seller_id !== userId) return json({ error: "forbidden" }, 403, origin);
        const method = String(p.method ?? "");
        if (method !== "wave" && method !== "orange_money") {
          return json({ error: "not_mobile_money_method" }, 400, origin);
        }
        if (p.status === "paid" || p.status === "rejected") {
          return json({ error: "already_processed", status: p.status }, 409, origin);
        }
        // Idempotency: a token means we already sent the disbursement.
        if (typeof p.paydunya_token === "string" && p.paydunya_token) {
          return json({ ok: true, disburseToken: p.paydunya_token, alreadySent: true }, 200, origin);
        }

        const currency = String(p.currency ?? "").toUpperCase();
        if (currency !== "XOF") {
          return json({ error: "currency_not_supported", currency }, 400, origin);
        }

        const dest = (p.destination ?? {}) as Record<string, string>;
        const phone = String(dest.phone ?? "").trim();
        if (phone.replace(/[^\d]/g, "").length < 8) {
          return json({ error: "invalid_phone", message: "Numéro mobile money manquant ou invalide." }, 400, origin);
        }

        // Country heuristic: 225 → Côte d'Ivoire, otherwise Sénégal.
        const digits = phone.replace(/[^\d]/g, "");
        const country = digits.startsWith("225") ? "CI" : "SN";
        const withdrawMode = withdrawModeFor(method as "wave" | "orange_money", country);

        const amount = Math.round(Number(p.amount));
        if (!Number.isFinite(amount) || amount <= 0) {
          return json({ error: "invalid_amount" }, 400, origin);
        }

        const callbackUrl = `${publicAppOrigin(request)}/api/public/paydunya-ipn`;
        const sent = await paydunyaDisburse(cfg.cfg, {
          accountAlias: phone,
          amountXof: amount,
          withdrawMode,
          callbackUrl,
        });
        if (!sent.ok) {
          console.error("[paydunya-payout] disburse failed", sent.error, sent.detail);
          await (admin.from("payouts") as any)
            .update({ paydunya_error: `${sent.error}: ${sent.detail ?? ""}`.slice(0, 400) })
            .eq("id", payoutId);
          // The payout row stays queued for manual processing — this is an
          // expected outcome, not a server fault, so answer 200 with ok:false.
          return json({ ok: false, pendingManual: true, error: sent.error, message: sent.detail }, 200, origin);
        }

        await (admin.from("payouts") as any)
          .update({
            paydunya_token: sent.disburseToken,
            paydunya_error: null,
            status: "paid",
            processed_at: new Date().toISOString(),
            admin_note: `PayDunya (automatique)${sent.transactionId ? ` — ${sent.transactionId}` : ""}`,
          })
          .eq("id", payoutId)
          .in("status", ["requested", "processing"]);

        return json(
          { ok: true, disburseToken: sent.disburseToken, transactionId: sent.transactionId, mode: cfg.cfg.mode },
          200,
          origin,
        );
      },
    },
  },
});
