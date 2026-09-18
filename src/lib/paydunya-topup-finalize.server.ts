// Shared finalizer for PayDunya wallet top-ups.
// Called from: /api/paydunya-topup/return (GET), /api/paydunya-topup/confirm
// (POST, client polling) and /api/public/paydunya-ipn (PayDunya webhook).
// Idempotent — credit_wallet_topup dedupes on `paydunya:<invoiceToken>`.

import { createClient } from "@supabase/supabase-js";
import {
  getPaydunyaConfig,
  confirmPaydunyaInvoice,
} from "@/lib/paydunya.server";

export type FinalizePaydunyaResult =
  | {
      ok: true;
      balance: number;
      amount: number;
      currency: string;
      duplicate: boolean;
      userId: string;
    }
  | { ok: false; error: string; message?: string; status?: number };

export async function finalizePaydunyaTopup(
  invoiceToken: string,
  opts?: { expectedUserId?: string | null },
): Promise<FinalizePaydunyaResult> {
  const token = (invoiceToken ?? "").trim();
  if (!token) return { ok: false, error: "invalid_invoice_token", status: 400 };

  const cfgR = getPaydunyaConfig();
  if (!cfgR.ok) return { ok: false, error: "paydunya_not_configured", status: 503 };

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, error: "backend_not_configured", status: 500 };
  }

  const conf = await confirmPaydunyaInvoice(cfgR.cfg, token);
  if (!conf.ok) {
    return { ok: false, error: conf.error, message: conf.detail, status: 502 };
  }
  if (conf.status === "cancelled" || conf.status === "failed") {
    return { ok: false, error: conf.status, status: 409 };
  }
  if (conf.status !== "completed") {
    return { ok: false, error: "not_completed", status: 409 };
  }

  const cd = (conf.customData ?? {}) as Record<string, unknown>;
  if (cd.kind !== "wallet_topup") {
    return { ok: false, error: "not_a_topup", status: 400 };
  }
  const userId = String(cd.user_id ?? "").trim();
  if (!userId) return { ok: false, error: "bad_custom_data", status: 400 };
  if (opts?.expectedUserId && opts.expectedUserId !== userId) {
    return { ok: false, error: "forbidden", status: 403 };
  }

  const amount = Number(cd.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "invalid_amount", status: 400 };
  }
  // Sanity: the charged invoice total must match what we asked for (±1 FCFA).
  if (conf.amount > 0 && Math.abs(conf.amount - amount) > 1) {
    console.error("[paydunya-topup/finalize] amount mismatch", {
      invoice: conf.amount,
      expected: amount,
    });
    return { ok: false, error: "amount_mismatch", status: 400 };
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
  const { data: wallet } = await admin
    .from("wallets")
    .select("currency")
    .eq("user_id", userId)
    .maybeSingle();
  const walletCur = String(wallet?.currency ?? "XOF").toUpperCase();
  if (walletCur !== "XOF") {
    // PayDunya settles in FCFA only — never credit another currency.
    return { ok: false, error: "currency_mismatch", status: 400 };
  }

  const { data: rpcData, error: rpcErr } = await admin.rpc("credit_wallet_topup", {
    _user_id: userId,
    _amount: Math.round(amount),
    _payment_intent_id: `paydunya:${token}`,
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
    const { data: w } = await admin
      .from("wallets")
      .select("balance")
      .eq("user_id", userId)
      .maybeSingle();
    balance = w ? Number(w.balance) : 0;
  }

  return {
    ok: true,
    balance,
    amount: Math.round(amount),
    currency: walletCur,
    duplicate: !!(result.already || result.duplicate),
    userId,
  };
}
