// Capture a PayPal order whose custom_id encodes a KiDi+ commerce order:
//   order:<buyerId>:<orderId>
//   order:<buyerId>:<orderId>:xof:<xofTotal>   (XOF → EUR wire bridge)
// Then mark the commerce order paid + credit the seller (idempotent).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { convertMoney, normalizeCurrency } from "@/lib/money";
import {
  capturePaypalOrder,
  getPaypalAccessToken,
  getPaypalConfig,
} from "@/lib/paypal.server";

export type FinalizePaypalOrderResult =
  | {
      ok: true;
      orderId: string;
      captureId: string;
      duplicate: boolean;
      buyerId: string;
    }
  | { ok: false; error: string; message?: string; status?: number };

function parseOrderCustomId(custom: string): {
  buyerId: string;
  orderId: string;
  bridgedXof: number | null;
} | null {
  const parts = custom.split(":");
  // order:<buyerId>:<orderId>
  // order:<buyerId>:<orderId>:xof:<amount>
  if (parts[0] !== "order" || !parts[1] || !parts[2]) return null;
  const bridgedXof =
    parts[3] === "xof" && Number.isFinite(Number(parts[4])) ? Number(parts[4]) : null;
  return { buyerId: parts[1], orderId: parts[2], bridgedXof };
}

function coalesceReason(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Apply a completed PayPal capture to a KiDi+ order (no PayPal API call). */
export async function applyPaypalOrderCapture(args: {
  captureId: string;
  customId: string;
  amount: number;
  currency: string;
  expectedBuyerId?: string | null;
}): Promise<FinalizePaypalOrderResult> {
  const parsed = parseOrderCustomId(String(args.customId ?? ""));
  if (!parsed) {
    return { ok: false, error: "forbidden", message: "Commande PayPal invalide.", status: 403 };
  }
  if (args.expectedBuyerId && args.expectedBuyerId !== parsed.buyerId) {
    return { ok: false, error: "forbidden", status: 403 };
  }

  const capturedAmount = Number(args.amount);
  const capturedCurrency = String(args.currency ?? "").toUpperCase();
  const captureId = String(args.captureId ?? "").trim();
  if (!captureId || !Number.isFinite(capturedAmount) || capturedAmount <= 0) {
    return { ok: false, error: "invalid_amount", status: 400 };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, error: "backend_not_configured", status: 500 };
  }

  const admin: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });

  const { data: order, error: orderErr } = await admin
    .from("orders")
    .select(
      "id, buyer_id, seller_id, status, total, currency, payment_deadline, cancelled_reason, stripe_payment_intent_id",
    )
    .eq("id", parsed.orderId)
    .maybeSingle();
  if (orderErr || !order) return { ok: false, error: "order_not_found", status: 404 };
  if (order.buyer_id !== parsed.buyerId) {
    return { ok: false, error: "forbidden", status: 403 };
  }

  const captureKey = `paypal:${captureId}`;

  // Already paid with this capture → idempotent success.
  if (order.status === "paid" && order.stripe_payment_intent_id === captureKey) {
    return {
      ok: true,
      orderId: order.id,
      captureId,
      duplicate: true,
      buyerId: parsed.buyerId,
    };
  }

  // Already paid another way — do not overwrite; treat as success for the buyer UI.
  if (order.status === "paid") {
    return {
      ok: true,
      orderId: order.id,
      captureId,
      duplicate: true,
      buyerId: parsed.buyerId,
    };
  }

  if (
    order.status === "cancelled" &&
    coalesceReason(order.cancelled_reason) === "payment_timeout"
  ) {
    return { ok: false, error: "order_expired", status: 409 };
  }
  if (!["pending", "failed", "cancelled"].includes(String(order.status))) {
    return { ok: false, error: "order_not_pending", status: 409 };
  }
  if (order.payment_deadline && new Date(order.payment_deadline).getTime() < Date.now()) {
    return { ok: false, error: "order_expired", status: 409 };
  }

  const orderCur = normalizeCurrency(order.currency);
  const orderTotal = Number(order.total);
  if (!(orderTotal > 0)) return { ok: false, error: "invalid_amount", status: 400 };

  if (parsed.bridgedXof != null) {
    if (orderCur !== "XOF" || capturedCurrency !== "EUR") {
      return { ok: false, error: "currency_mismatch", status: 400 };
    }
    if (Math.abs(parsed.bridgedXof - orderTotal) > 0.5) {
      return { ok: false, error: "amount_mismatch", status: 400 };
    }
    const expectedEur = convertMoney(orderTotal, "XOF", "EUR");
    if (Math.abs(expectedEur - capturedAmount) > 0.02) {
      return { ok: false, error: "amount_mismatch", status: 400 };
    }
  } else {
    if (capturedCurrency !== orderCur) {
      return { ok: false, error: "currency_mismatch", status: 400 };
    }
    if (Math.abs(capturedAmount - orderTotal) > 0.02) {
      return { ok: false, error: "amount_mismatch", status: 400 };
    }
  }

  // Soft spend risk (same bucket as wallet purchases).
  try {
    const { data: riskRaw } = await admin.rpc("risk_check_and_consume", {
      _user_id: parsed.buyerId,
      _kind: "spend",
      _amount: orderTotal,
      _currency: orderCur,
      _consume: true,
    });
    const risk = riskRaw as { ok?: boolean; error?: string } | null;
    if (risk && risk.ok === false) {
      return {
        ok: false,
        error: risk.error ?? "daily_limit",
        status: 429,
      };
    }
  } catch {
    /* risk RPC missing in older envs — don't block a completed PayPal capture */
  }

  const { data: upd } = await admin
    .from("orders")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      payment_method: "paypal",
      stripe_payment_intent_id: captureKey,
      cancelled_reason: null,
    })
    .eq("id", order.id)
    .neq("status", "paid")
    .select("id");

  if (!upd || upd.length === 0) {
    return {
      ok: true,
      orderId: order.id,
      captureId,
      duplicate: true,
      buyerId: parsed.buyerId,
    };
  }

  try {
    await admin.rpc("credit_seller_earning", { _order_id: order.id });
  } catch (e) {
    console.error("[paypal-order/finalize] credit_seller_earning failed", e);
  }

  return {
    ok: true,
    orderId: order.id,
    captureId,
    duplicate: false,
    buyerId: parsed.buyerId,
  };
}

export async function finalizePaypalOrderPayment(
  paypalOrderId: string,
  opts?: { expectedBuyerId?: string | null },
): Promise<FinalizePaypalOrderResult> {
  const id = paypalOrderId.trim();
  if (!id) return { ok: false, error: "invalid_order_id", status: 400 };

  const cfg = getPaypalConfig();
  if (!cfg.ok) return { ok: false, error: "paypal_not_configured", status: 503 };

  const tk = await getPaypalAccessToken(cfg.cfg);
  if (!tk.ok) {
    return { ok: false, error: "paypal_oauth_failed", message: tk.error, status: 502 };
  }

  const cap = await capturePaypalOrder(cfg.cfg, tk.token, id);
  if (!cap.ok) {
    const errMsg = String(cap.error ?? "");
    const isUpstream5xx = /Erreur PayPal \(5\d\d\)/.test(errMsg);
    return {
      ok: false,
      error: isUpstream5xx ? "paypal_capture_failed" : "not_approved",
      message: errMsg,
      status: isUpstream5xx ? 502 : 409,
    };
  }
  if (String(cap.status).toUpperCase() !== "COMPLETED") {
    return {
      ok: false,
      error: "not_completed",
      message: "Le paiement PayPal n'a pas été finalisé.",
      status: 409,
    };
  }

  return applyPaypalOrderCapture({
    captureId: cap.captureId,
    customId: String(cap.customId ?? ""),
    amount: Number(cap.amount),
    currency: String(cap.currency ?? ""),
    expectedBuyerId: opts?.expectedBuyerId,
  });
}
