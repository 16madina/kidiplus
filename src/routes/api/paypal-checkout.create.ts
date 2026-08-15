// POST /api/paypal-checkout/create
// --------------------------------
// Authenticated buyer creates a PayPal CAPTURE-intent order for a pending
// KiDi+ commerce order. custom_id: order:<buyerId>:<orderId>[:xof:<total>]

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { isAllowedOrigin } from "@/lib/api-cors";
import {
  getPaypalConfig,
  getPaypalAccessToken,
  createPaypalOrder,
  PAYPAL_TOPUP_CURRENCIES,
} from "@/lib/paypal.server";
import { normalizeCurrency, convertMoney, fxRate } from "@/lib/money";
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

export const Route = createFileRoute("/api/paypal-checkout/create")({
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

        let body: { orderId?: unknown; native?: unknown; returnOrigin?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: "invalid_json" }, 400, origin);
        }
        const kidiOrderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
        if (!kidiOrderId) return json({ error: "invalid_order_id" }, 400, origin);
        const nativeFlag = body.native === true || body.native === 1 || body.native === "1";

        const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
        });
        const { data: order, error: orderErr } = await admin
          .from("orders")
          .select("id, buyer_id, status, total, currency, payment_deadline, cancelled_reason")
          .eq("id", kidiOrderId)
          .maybeSingle();
        if (orderErr || !order) return json({ error: "order_not_found" }, 404, origin);
        if (order.buyer_id !== userId) return json({ error: "forbidden" }, 403, origin);
        if (order.status === "paid") {
          return json({ error: "already_paid", message: "Cette commande est déjà payée." }, 409, origin);
        }
        if (
          order.status === "cancelled" &&
          String(order.cancelled_reason ?? "") === "payment_timeout"
        ) {
          return json({ error: "order_expired" }, 409, origin);
        }
        if (!["pending", "failed", "cancelled"].includes(String(order.status))) {
          return json({ error: "order_not_pending" }, 409, origin);
        }
        if (order.payment_deadline && new Date(order.payment_deadline).getTime() < Date.now()) {
          return json({ error: "order_expired" }, 409, origin);
        }

        const currency = normalizeCurrency(order.currency);
        const amount = Number(order.total);
        if (!(amount > 0)) return json({ error: "invalid_amount" }, 400, origin);

        const isBridgedXof = currency === "XOF";
        if (!isBridgedXof && !PAYPAL_TOPUP_CURRENCIES.has(currency)) {
          // GBP is supported by PayPal Checkout even if not in top-up set.
          if (currency !== "GBP") {
            return json(
              {
                error: "currency_not_supported",
                currency,
                message:
                  "PayPal ne supporte pas cette devise pour le paiement. Utilise la carte ou le portefeuille.",
              },
              400,
              origin,
            );
          }
        }

        const tk = await getPaypalAccessToken(cfg.cfg);
        if (!tk.ok) {
          console.error("[paypal-checkout] OAuth error:", tk.error);
          return json({ error: "paypal_oauth_failed", message: tk.error }, 502, origin);
        }

        const wireCurrency = isBridgedXof ? "EUR" : currency;
        const wireAmount = isBridgedXof ? convertMoney(amount, "XOF", "EUR") : amount;
        const rate = isBridgedXof ? fxRate("XOF", "EUR") : 1;

        const invoiceId = `o_${crypto.randomUUID()}`;
        const customId = isBridgedXof
          ? `order:${userId}:${kidiOrderId}:xof:${amount}`
          : `order:${userId}:${kidiOrderId}`;

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
        const nativeQs = nativeFlag ? "?native=1" : "";
        const returnUrl = `${pubOrigin}/api/paypal-checkout/return?${roQs}${nativeFlag ? "&native=1" : ""}`;
        const cancelUrl = `${pubOrigin}/api/paypal-checkout/return?cancelled=1&${roQs}${nativeFlag ? "&native=1" : ""}`;

        const wireValue = Number(wireAmount.toFixed(2));
        if (!(wireValue >= 0.01)) {
          return json(
            {
              error: "invalid_amount",
              message: "Montant trop faible après conversion pour PayPal (min 0,01).",
            },
            400,
            origin,
          );
        }

        const created = await createPaypalOrder(cfg.cfg, tk.token, {
          amount: wireValue.toFixed(2),
          currency: wireCurrency,
          customId,
          invoiceId,
          returnUrl,
          cancelUrl,
          description: `KiDi+ commande ${amount} ${currency}`,
        });
        if (!created.ok) {
          console.error("[paypal-checkout] create failed:", created.error, {
            wireValue,
            wireCurrency,
            returnUrl,
            mode: cfg.cfg.mode,
          });
          return json({ error: "paypal_create_failed", message: created.error }, 502, origin);
        }

        return json(
          {
            ok: true,
            paypalOrderId: created.orderId,
            approveUrl: created.approveUrl,
            orderId: kidiOrderId,
            amount,
            currency,
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
