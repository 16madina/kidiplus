// POST /api/paypal-topup/create
// -----------------------------
// Authenticated buyer creates a PayPal CAPTURE-intent order to top up their
// KiDi+ wallet. EUR / CAD / USD only — XOF is rejected (PayPal doesn't
// support FCFA). The order's custom_id encodes "topup:<userId>:<uuid>" so
// the capture endpoint can trust the wallet target without client input.

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { isAllowedOrigin } from "@/lib/api-cors";
import {
  getPaypalConfig,
  getPaypalAccessToken,
  createPaypalOrder,
  PAYPAL_TOPUP_CURRENCIES,
} from "@/lib/paypal.server";
import { normalizeCurrency, roundForCurrency, topUpLimits, convertMoney, fxRate } from "@/lib/money";
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

export const Route = createFileRoute("/api/paypal-topup/create")({
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

        const cfg = getPaypalConfig();
        if (!cfg.ok) return json({ error: "paypal_not_configured" }, 503, origin);

        const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
        });
        const { data: wallet } = await admin
          .from("wallets")
          .select("currency")
          .eq("user_id", userId)
          .maybeSingle();
        const currency = normalizeCurrency(wallet?.currency ?? "EUR");
        // XOF isn't a PayPal currency, but we bridge it: user picks an XOF
        // amount, we charge the EUR equivalent at the fixed BCEAO peg (no
        // margin) and credit the wallet with the original XOF amount.
        const isBridgedXof = currency === "XOF";
        if (!isBridgedXof && !PAYPAL_TOPUP_CURRENCIES.has(currency)) {
          return json(
            {
              error: "currency_not_supported",
              currency,
              message: "PayPal ne supporte pas cette devise pour la recharge. Utilise la carte bancaire.",
            },
            400,
            origin,
          );
        }

        let body: { amount?: unknown };
        try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400, origin); }
        const raw = Number(body.amount);
        const { min: MIN, max: MAX } = topUpLimits(currency);
        if (!Number.isFinite(raw) || raw < MIN || raw > MAX) {
          return json({ error: "invalid_amount", currency, min: MIN, max: MAX }, 400, origin);
        }
        const amount = roundForCurrency(raw, currency);

        // Anti-fraud pre-check (same as Stripe path — do NOT consume yet;
        // credit_wallet_topup consumes on successful credit).
        const { data: riskRaw, error: riskErr } = await admin.rpc("risk_assert_can_topup", {
          _user_id: userId,
          _amount: amount,
          _currency: currency,
        });
        if (riskErr) return json({ error: "risk_check_failed" }, 500, origin);
        const risk = riskRaw as { ok?: boolean; error?: string; cap?: number; used?: number } | null;
        if (!risk?.ok) {
          const code = risk?.error ?? "daily_limit";
          const status =
            code === "account_banned" || code === "account_suspended" || code === "risk_restricted" ? 403 : 429;
          return json({ error: code, cap: risk?.cap, used: risk?.used, currency }, status, origin);
        }

        const tk = await getPaypalAccessToken(cfg.cfg);
        if (!tk.ok) {
          console.error("[paypal-topup] OAuth error:", tk.error);
          return json({ error: "paypal_oauth_failed", message: tk.error }, 502, origin);
        }

        // Wire currency + amount that PayPal actually charges.
        const wireCurrency = isBridgedXof ? "EUR" : currency;
        const wireAmount = isBridgedXof ? convertMoney(amount, "XOF", "EUR") : amount;
        const rate = isBridgedXof ? fxRate("XOF", "EUR") : 1;

        // Random invoice id for idempotency at PayPal + our own trail.
        const invoiceId = `t_${crypto.randomUUID()}`;
        // Encode the XOF native amount into custom_id so capture can trust it
        // without any pending-record lookup.
        const customId = isBridgedXof
          ? `topup:${userId}:${invoiceId}:xof:${amount}`
          : `topup:${userId}:${invoiceId}`;

        // Return URL must be a public https host (prefer APP_URL / kidiplus.com).
        // capacitor://localhost or https://localhost break PayPal + lose the
        // Supabase session when the page opens in Safari outside the WebView.
        const pubOrigin = publicAppOrigin(request);
        const returnUrl = `${pubOrigin}/paypal-return`;
        const cancelUrl = `${pubOrigin}/paypal-return?cancelled=1`;

        const created = await createPaypalOrder(cfg.cfg, tk.token, {
          amount: wireAmount.toFixed(2),
          currency: wireCurrency,
          customId,
          invoiceId,
          returnUrl,
          cancelUrl,
          description: isBridgedXof
            ? `KiDi+ Recharge (${amount} XOF ≈ ${wireAmount.toFixed(2)} EUR)`
            : `KiDi+ Recharge (${amount} ${currency})`,
        });
        if (!created.ok) {
          console.error("[paypal-topup] create failed:", created.error);
          return json({ error: "paypal_create_failed", message: created.error }, 502, origin);
        }

        return json(
          {
            ok: true,
            orderId: created.orderId,
            approveUrl: created.approveUrl,
            amount,                 // wallet-currency amount (what will be credited)
            currency,               // wallet currency
            chargedAmount: wireAmount,
            chargedCurrency: wireCurrency,
            fxRate: rate,
            mode: cfg.cfg.mode,
          },
          200,
          origin,
        );
      },
    },
  },
});
