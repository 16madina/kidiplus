// Shared PayPal top-up capture + wallet credit.
// Identity comes from PayPal order custom_id (topup:<userId>:…), so the
// return page can finalize even when the browser has no Supabase session
// (common after SFSafariViewController / Universal Link handoff).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { convertMoney } from "@/lib/money";
import {
  capturePaypalOrder,
  getPaypalAccessToken,
  getPaypalConfig,
} from "@/lib/paypal.server";

export type FinalizePaypalTopupResult =
  | {
      ok: true;
      balance: number;
      amount: number;
      currency: string;
      chargedAmount: number;
      chargedCurrency: string;
      fxRate: number;
      captureId: string;
      duplicate: boolean;
      alreadyCaptured: boolean;
      userId: string;
    }
  | { ok: false; error: string; message?: string; status?: number };

export async function finalizePaypalTopupOrder(
  orderId: string,
  opts?: { expectedUserId?: string | null },
): Promise<FinalizePaypalTopupResult> {
  const id = orderId.trim();
  if (!id) return { ok: false, error: "invalid_order_id", status: 400 };

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, error: "backend_not_configured", status: 500 };
  }

  const cfg = getPaypalConfig();
  if (!cfg.ok) return { ok: false, error: "paypal_not_configured", status: 503 };

  const tk = await getPaypalAccessToken(cfg.cfg);
  if (!tk.ok) {
    console.error("[paypal-topup/finalize] OAuth error:", tk.error);
    return { ok: false, error: "paypal_oauth_failed", message: tk.error, status: 502 };
  }

  const cap = await capturePaypalOrder(cfg.cfg, tk.token, id);
  if (!cap.ok) {
    console.error("[paypal-topup/finalize] capture failed:", cap.error);
    // PayPal business-validation failures (422: not approved, payer action
    // required, order voided, etc.) are 4xx from our side — not upstream 5xx.
    // Returning 502 makes Cloudflare log a proxy error and blank the UI.
    const raw = (cap as { raw?: unknown }).raw as any;
    const issue = raw?.details?.[0]?.issue as string | undefined;
    // Any PayPal 4xx (422 business-validation: not approved, transaction
    // refused, instrument declined, payer/payee restricted, etc.) is a
    // client-side failure — return 409 so Cloudflare doesn't blank the UI
    // with a 502 proxy page. Only true upstream 5xx / network errors keep 502.
    const errMsg = String(cap.error ?? "");
    const isUpstream5xx = /Erreur PayPal \(5\d\d\)/.test(errMsg);
    return {
      ok: false,
      error: isUpstream5xx ? "paypal_capture_failed" : "not_approved",
      message: issue ? `${issue}: ${errMsg}` : errMsg,
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

  const custom = String(cap.customId ?? "");
  const parts = custom.split(":");
  if (parts[0] !== "topup" || !parts[1]) {
    console.error("[paypal-topup/finalize] bad custom_id", { custom });
    return { ok: false, error: "forbidden", message: "Commande PayPal invalide.", status: 403 };
  }
  const userId = parts[1];
  if (opts?.expectedUserId && opts.expectedUserId !== userId) {
    console.error("[paypal-topup/finalize] custom_id mismatch", { custom, expected: opts.expectedUserId });
    return {
      ok: false,
      error: "forbidden",
      message: "Cette commande PayPal n'appartient pas à cet utilisateur.",
      status: 403,
    };
  }

  const isBridgedXof = parts[3] === "xof";
  const bridgedXofAmount = isBridgedXof ? Number(parts[4]) : 0;
  const capturedAmount = Number(cap.amount);
  const capturedCurrency = String(cap.currency ?? "").toUpperCase();
  if (!Number.isFinite(capturedAmount) || capturedAmount <= 0) {
    return { ok: false, error: "invalid_amount", status: 400 };
  }

  const admin: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });

  const { data: wallet } = await admin
    .from("wallets")
    .select("currency")
    .eq("user_id", userId)
    .maybeSingle();
  const walletCur = String((wallet?.currency ?? "EUR")).toUpperCase();
  const expectedWireCurrency = isBridgedXof ? "EUR" : walletCur;
  if (capturedCurrency !== expectedWireCurrency) {
    console.error("[paypal-topup/finalize] currency mismatch", { walletCur, capturedCurrency, isBridgedXof });
    return { ok: false, error: "currency_mismatch", status: 400 };
  }

  let creditAmount = capturedAmount;
  let fxRateUsed = 1;
  if (isBridgedXof) {
    if (walletCur !== "XOF" || !Number.isFinite(bridgedXofAmount) || bridgedXofAmount <= 0) {
      return { ok: false, error: "bridge_mismatch", status: 400 };
    }
    const expectedEur = convertMoney(bridgedXofAmount, "XOF", "EUR");
    if (Math.abs(expectedEur - capturedAmount) > 0.02) {
      console.error("[paypal-topup/finalize] EUR mismatch", { expectedEur, capturedAmount, bridgedXofAmount });
      return { ok: false, error: "amount_mismatch", status: 400 };
    }
    creditAmount = bridgedXofAmount;
    fxRateUsed = expectedEur / bridgedXofAmount;
  } else if (walletCur !== capturedCurrency) {
    return { ok: false, error: "currency_mismatch", status: 400 };
  }

  const idKey = `paypal:${cap.captureId}`;
  const { data: rpcData, error: rpcErr } = await admin.rpc("credit_wallet_topup", {
    _user_id: userId,
    _amount: creditAmount,
    _payment_intent_id: idKey,
  });
  if (rpcErr) return { ok: false, error: rpcErr.message, status: 500 };

  const result = (rpcData ?? {}) as {
    ok?: boolean;
    balance?: number;
    already?: boolean;
    duplicate?: boolean;
    error?: string;
  };
  if (!result.ok) return { ok: false, error: result.error ?? "credit_failed", status: 500 };

  let balance = typeof result.balance === "number" ? result.balance : undefined;
  if (balance === undefined) {
    const { data: w } = await admin.from("wallets").select("balance").eq("user_id", userId).maybeSingle();
    balance = w ? Number(w.balance) : 0;
  }

  return {
    ok: true,
    balance,
    amount: creditAmount,
    currency: walletCur,
    chargedAmount: capturedAmount,
    chargedCurrency: capturedCurrency,
    fxRate: fxRateUsed,
    captureId: cap.captureId,
    duplicate: !!(result.already || result.duplicate),
    alreadyCaptured: !!(cap as { alreadyCaptured?: boolean }).alreadyCaptured,
    userId,
  };
}
