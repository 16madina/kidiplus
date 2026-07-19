// POST /api/paypal-payout           → send a payout via PayPal Payouts API
// POST /api/paypal-payout/status    → poll status
// GET  /api/paypal-payout/config    → check if PayPal secrets are configured

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { isAllowedOrigin } from "@/lib/api-cors";
import {
  getPaypalConfig,
  getPaypalAccessToken,
  createPaypalPayout,
  PAYPAL_SUPPORTED_CURRENCIES,
} from "@/lib/paypal.server";

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

export const Route = createFileRoute("/api/paypal-payout")({
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
        const adminId = userRes.user.id;

        const supaAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
        });

        // Verify admin flag
        const { data: prof } = await supaAdmin
          .from("profiles")
          .select("is_admin")
          .eq("id", adminId)
          .maybeSingle();
        if (!prof || (prof as any).is_admin !== true) return json({ error: "forbidden" }, 403, origin);

        // Parse input
        let body: { payoutId?: unknown };
        try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400, origin); }
        const payoutId = typeof body.payoutId === "string" ? body.payoutId.trim() : "";
        if (!payoutId) return json({ error: "invalid_payout_id" }, 400, origin);

        // PayPal config
        const cfg = getPaypalConfig();
        if (!cfg.ok) return json({ error: "paypal_not_configured" }, 503, origin);

        // Load payout
        const { data: payout, error: pErr } = await supaAdmin
          .from("payouts")
          .select("id, amount, currency, method, destination, status, paypal_batch_id")
          .eq("id", payoutId)
          .maybeSingle();
        if (pErr || !payout) return json({ error: "payout_not_found" }, 404, origin);
        const p = payout as any;

        if (p.method !== "paypal") return json({ error: "not_paypal_method" }, 400, origin);
        if (p.status === "paid" || p.status === "rejected") {
          return json({ error: "already_processed", status: p.status }, 409, origin);
        }

        // Idempotency: if we already have a batch id, do not re-send.
        if (p.paypal_batch_id) {
          return json(
            { ok: true, batchId: p.paypal_batch_id, alreadySent: true, message: "Batch déjà créé, vérifier le statut." },
            200,
            origin,
          );
        }

        const currency = String(p.currency ?? "").toUpperCase();
        if (currency === "XOF" || currency === "XAF") {
          return json(
            { error: "currency_not_supported", message: "PayPal ne supporte pas le FCFA — utilise Wave/Orange Money." },
            400,
            origin,
          );
        }
        if (!PAYPAL_SUPPORTED_CURRENCIES.has(currency)) {
          return json(
            { error: "currency_not_supported", message: `PayPal ne supporte pas la devise ${currency}.` },
            400,
            origin,
          );
        }

        const dest = (p.destination ?? {}) as Record<string, string>;
        const email = (dest.paypalEmail ?? dest.email ?? "").toString().trim();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return json({ error: "invalid_email", message: "Email PayPal du vendeur manquant ou invalide." }, 400, origin);
        }

        // Get token
        const tk = await getPaypalAccessToken(cfg.cfg);
        if (!tk.ok) {
          console.error("[paypal-payout] OAuth error:", tk.error);
          return json({ error: "paypal_oauth_failed", message: tk.error }, 502, origin);
        }

        const amountStr = Number(p.amount).toFixed(2);

        const created = await createPaypalPayout(cfg.cfg, tk.token, {
          senderBatchId: p.id,
          receiverEmail: email,
          amount: amountStr,
          currency,
          note: "Retrait KiDi+",
        });
        if (!created.ok) {
          console.error("[paypal-payout] Create error:", created.error, JSON.stringify(created.raw).slice(0, 500));
          // Persist error for admin visibility, do NOT mark rejected — keep as 'requested' so admin can retry.
          await supaAdmin
            .from("payouts")
            .update({ paypal_error: created.error })
            .eq("id", p.id);
          return json({ error: "paypal_create_failed", message: created.error }, 502, origin);
        }

        // Persist batch id and flip to processing
        const { error: upErr } = await supaAdmin
          .from("payouts")
          .update({
            paypal_batch_id: created.batchId,
            paypal_error: null,
            status: "processing",
          })
          .eq("id", p.id)
          .in("status", ["requested", "processing"]);
        if (upErr) {
          console.error("[paypal-payout] Update failed after batch created:", upErr.message);
          // The money order is out — still return ok so the admin sees the batch id.
        }

        return json(
          { ok: true, batchId: created.batchId, batchStatus: created.batchStatus, mode: cfg.cfg.mode },
          200,
          origin,
        );
      },
    },
  },
});
