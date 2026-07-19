// POST /api/paypal-topup/capture
// -------------------------------
// After the buyer approves the PayPal order (returns to /paypal-return),
// the client calls this endpoint with the orderId. We capture server-side,
// verify status COMPLETED and that custom_id points to the caller's user id,
// then credit the wallet via credit_wallet_topup with the PayPal capture id
// as the idempotency key. Safe to call twice — the RPC is idempotent.

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { isAllowedOrigin } from "@/lib/api-cors";
import {
  getPaypalConfig,
  getPaypalAccessToken,
  capturePaypalOrder,
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

export const Route = createFileRoute("/api/paypal-topup/capture")({
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

        let body: { orderId?: unknown };
        try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400, origin); }
        const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
        if (!orderId) return json({ error: "invalid_order_id" }, 400, origin);

        const cfg = getPaypalConfig();
        if (!cfg.ok) return json({ error: "paypal_not_configured" }, 503, origin);

        const tk = await getPaypalAccessToken(cfg.cfg);
        if (!tk.ok) {
          console.error("[paypal-topup/capture] OAuth error:", tk.error);
          return json({ error: "paypal_oauth_failed", message: tk.error }, 502, origin);
        }

        const cap = await capturePaypalOrder(cfg.cfg, tk.token, orderId);
        if (!cap.ok) {
          console.error("[paypal-topup/capture] capture failed:", cap.error);
          return json({ error: "paypal_capture_failed", message: cap.error }, 502, origin);
        }
        if (String(cap.status).toUpperCase() !== "COMPLETED") {
          return json(
            { error: "not_completed", status: cap.status, message: "Le paiement PayPal n'a pas été finalisé." },
            409,
            origin,
          );
        }

        // Verify the order was created for THIS user.
        const custom = String(cap.customId ?? "");
        const parts = custom.split(":");
        if (parts[0] !== "topup" || parts[1] !== userId) {
          console.error("[paypal-topup/capture] custom_id mismatch", { custom, userId });
          return json({ error: "forbidden", message: "Cette commande PayPal n'appartient pas à cet utilisateur." }, 403, origin);
        }

        const amount = Number(cap.amount);
        const currency = String(cap.currency ?? "").toUpperCase();
        if (!Number.isFinite(amount) || amount <= 0) {
          return json({ error: "invalid_amount" }, 400, origin);
        }

        const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
        });

        // Verify captured currency matches the wallet currency (defensive).
        const { data: wallet } = await admin
          .from("wallets")
          .select("currency")
          .eq("user_id", userId)
          .maybeSingle();
        const walletCur = String((wallet?.currency ?? "EUR")).toUpperCase();
        if (walletCur !== currency) {
          console.error("[paypal-topup/capture] currency mismatch", { walletCur, currency });
          return json({ error: "currency_mismatch" }, 400, origin);
        }

        // Idempotency key: prefix disambiguates from Stripe PIs (both stored
        // in wallet_transactions.stripe_payment_intent_id).
        const idKey = `paypal:${cap.captureId}`;

        const { data: rpcData, error: rpcErr } = await admin.rpc("credit_wallet_topup", {
          _user_id: userId,
          _amount: amount,
          _payment_intent_id: idKey,
        });
        if (rpcErr) return json({ error: rpcErr.message }, 500, origin);

        const result = (rpcData ?? {}) as { ok?: boolean; balance?: number; already?: boolean; error?: string };
        if (!result.ok) return json({ error: result.error ?? "credit_failed" }, 500, origin);

        let balance = typeof result.balance === "number" ? result.balance : undefined;
        if (balance === undefined) {
          const { data: w } = await admin.from("wallets").select("balance").eq("user_id", userId).maybeSingle();
          balance = w ? Number(w.balance) : 0;
        }

        return json(
          {
            ok: true,
            balance,
            amount,
            currency,
            captureId: cap.captureId,
            duplicate: !!result.already,
            alreadyCaptured: !!(cap as { alreadyCaptured?: boolean }).alreadyCaptured,
          },
          200,
          origin,
        );
      },
    },
  },
});
