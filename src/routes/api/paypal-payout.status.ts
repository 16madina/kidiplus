// POST /api/paypal-payout/status — admin polls PayPal batch status and flips
// the payout row to 'paid' on SUCCESS, or back to 'requested' + surface error
// on FAILED / UNCLAIMED / DENIED / RETURNED.

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { isAllowedOrigin } from "@/lib/api-cors";
import {
  getPaypalConfig,
  getPaypalAccessToken,
  getPaypalPayoutStatus,
  classifyItemStatus,
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

export const Route = createFileRoute("/api/paypal-payout/status")({
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

        const { data: prof } = await supaAdmin
          .from("profiles")
          .select("is_admin")
          .eq("id", adminId)
          .maybeSingle();
        if (!prof || (prof as any).is_admin !== true) return json({ error: "forbidden" }, 403, origin);

        let body: { payoutId?: unknown };
        try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400, origin); }
        const payoutId = typeof body.payoutId === "string" ? body.payoutId.trim() : "";
        if (!payoutId) return json({ error: "invalid_payout_id" }, 400, origin);

        const cfg = getPaypalConfig();
        if (!cfg.ok) return json({ error: "paypal_not_configured" }, 503, origin);

        const { data: payout } = await supaAdmin
          .from("payouts")
          .select("id, status, paypal_batch_id")
          .eq("id", payoutId)
          .maybeSingle();
        if (!payout) return json({ error: "payout_not_found" }, 404, origin);
        const p = payout as any;
        const batchId = p.paypal_batch_id as string | null;
        if (!batchId) return json({ error: "no_batch_id" }, 400, origin);

        const tk = await getPaypalAccessToken(cfg.cfg);
        if (!tk.ok) return json({ error: "paypal_oauth_failed", message: tk.error }, 502, origin);

        const st = await getPaypalPayoutStatus(cfg.cfg, tk.token, batchId);
        if (!st.ok) return json({ error: "paypal_status_failed", message: st.error }, 502, origin);

        const cls = classifyItemStatus(st.itemStatus, st.batchStatus);

        // Only mutate the row if the terminal state is reached and we haven't already updated it.
        if (cls.outcome === "success" && p.status !== "paid") {
          // Use admin_process_payout to keep the same audit trail + admin_note.
          const { error: rpcErr } = await supaAdmin.rpc("admin_process_payout", {
            _payout_id: p.id,
            _action: "paid",
            _note: null,
            _proof_url: null,
            _admin_note: `Payé via PayPal API (batch ${batchId})`,
          });
          if (rpcErr) console.error("[paypal-payout/status] admin_process_payout error:", rpcErr.message);
        } else if ((cls.outcome === "failed" || cls.outcome === "unclaimed") && p.status !== "rejected") {
          // Do NOT auto-reject — money can still be reclaimed / retried. Just flip back to 'requested'
          // so the admin can decide, and surface the error.
          await supaAdmin
            .from("payouts")
            .update({
              status: "requested",
              paypal_error: `${st.itemStatus ?? st.batchStatus}: ${st.errors ?? cls.message}`,
            })
            .eq("id", p.id);
        }

        return json(
          {
            ok: true,
            outcome: cls.outcome,
            message: cls.message,
            batchStatus: st.batchStatus,
            itemStatus: st.itemStatus,
            errors: st.errors,
          },
          200,
          origin,
        );
      },
    },
  },
});
