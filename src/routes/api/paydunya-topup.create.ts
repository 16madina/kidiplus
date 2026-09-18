// POST /api/paydunya-topup/create
// --------------------------------
// Authenticated buyer creates a hosted PayDunya checkout invoice to top up
// their KiDi+ wallet with Wave / Orange Money / card. XOF wallets ONLY —
// PayDunya settles in FCFA. The invoice custom_data encodes
// { kind: "wallet_topup", user_id, amount } so the return/IPN/confirm paths
// can trust the credit target without client input.

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { isAllowedOrigin } from "@/lib/api-cors";
import { getPaydunyaConfig, createPaydunyaInvoice, type PaydunyaChannel } from "@/lib/paydunya.server";
import { normalizeCurrency, roundForCurrency, topUpLimits } from "@/lib/money";
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

export const Route = createFileRoute("/api/paydunya-topup/create")({
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

        const cfg = getPaydunyaConfig();
        if (!cfg.ok) return json({ error: "paydunya_not_configured" }, 503, origin);

        const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
        });
        const { data: wallet } = await admin
          .from("wallets")
          .select("currency")
          .eq("user_id", userId)
          .maybeSingle();
        const currency = normalizeCurrency(wallet?.currency ?? "EUR");
        if (currency !== "XOF") {
          return json(
            {
              error: "currency_not_supported",
              currency,
              message: "Wave / Orange Money ne fonctionnent qu'avec un portefeuille en FCFA.",
            },
            400,
            origin,
          );
        }

        let body: { amount?: unknown; channel?: unknown; native?: unknown; returnOrigin?: unknown };
        try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400, origin); }
        const nativeFlag = body.native === true || body.native === 1 || body.native === "1";
        const channel: PaydunyaChannel | undefined =
          body.channel === "wave" || body.channel === "orange_money" || body.channel === "card"
            ? body.channel
            : undefined;

        const raw = Number(body.amount);
        const { min: MIN, max: MAX } = topUpLimits("XOF");
        if (!Number.isFinite(raw) || raw < MIN || raw > MAX) {
          return json({ error: "invalid_amount", currency, min: MIN, max: MAX }, 400, origin);
        }
        const amount = Math.round(roundForCurrency(raw, "XOF"));

        // Anti-fraud pre-check (same as Stripe/PayPal paths — do NOT consume
        // yet; credit_wallet_topup consumes on successful credit).
        const { data: riskRaw, error: riskErr } = await admin.rpc("risk_assert_can_topup", {
          _user_id: userId,
          _amount: amount,
          _currency: "XOF",
        });
        if (riskErr) return json({ error: "risk_check_failed" }, 500, origin);
        const risk = riskRaw as { ok?: boolean; error?: string; cap?: number; used?: number } | null;
        if (!risk?.ok) {
          const code = risk?.error ?? "daily_limit";
          const status =
            code === "account_banned" || code === "account_suspended" || code === "risk_restricted" ? 403 : 429;
          return json({ error: code, cap: risk?.cap, used: risk?.used, currency }, status, origin);
        }

        let pubOrigin = publicAppOrigin(request);
        if (!nativeFlag) {
          const wanted = typeof body.returnOrigin === "string" ? body.returnOrigin.trim() : "";
          if (wanted && isAllowedOrigin(wanted)) {
            try {
              const u = new URL(wanted);
              if (u.protocol === "https:") pubOrigin = u.origin;
            } catch {
              /* ignore */
            }
          }
        }
        const roQs = `ro=${encodeURIComponent(pubOrigin)}`;
        const returnUrl = `${pubOrigin}/api/paydunya-topup/return?${roQs}${nativeFlag ? "&native=1" : ""}`;
        const cancelUrl = `${pubOrigin}/api/paydunya-topup/return?cancelled=1&${roQs}${nativeFlag ? "&native=1" : ""}`;
        const callbackUrl = `${pubOrigin}/api/public/paydunya-ipn`;

        const created = await createPaydunyaInvoice(cfg.cfg, {
          amountXof: amount,
          description: `KiDi+ · Recharge portefeuille (${amount} FCFA)`,
          itemName: "Recharge KiDi+",
          returnUrl,
          cancelUrl,
          callbackUrl,
          channel,
          customData: {
            kind: "wallet_topup",
            user_id: userId,
            amount: String(amount),
          },
        });
        if (!created.ok) {
          console.error("[paydunya-topup] create failed:", created.error, created.detail, {
            amount,
            mode: cfg.cfg.mode,
          });
          return json({ error: "paydunya_create_failed", message: created.detail }, 502, origin);
        }

        return json(
          {
            ok: true,
            invoiceToken: created.token,
            checkoutUrl: created.checkoutUrl,
            amount,
            currency: "XOF",
            mode: cfg.cfg.mode,
          },
          200,
          origin,
        );
      },
    },
  },
});
