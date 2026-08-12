// Wallet data layer — client-side (browser Supabase client).
//
// SECURITY MODEL
// - Users can only SELECT their own wallet + wallet_transactions rows.
// - There are NO client INSERT/UPDATE/DELETE policies on either table.
// - Balance mutations happen exclusively through:
//     • pay_order_with_wallet(order_id)  — SECURITY DEFINER RPC (user-callable)
//     • credit_wallet_topup(...)         — SECURITY DEFINER, service_role only
//       invoked by /api/stripe-webhook on payment_intent.succeeded.

import { supabase } from "@/integrations/supabase/client";

export type WalletRow = {
  user_id: string;
  balance: number;
  currency: string;
  updated_at: string;
};

export type WalletTxType =
  | "topup"
  | "purchase"
  | "refund"
  | "adjustment"
  | "gift"
  /** Wallet withdrawal to bank / PayPal / mobile money (via `request_payout`). */
  | "withdrawal";
export type WalletTxStatus = "pending" | "completed" | "failed";

export type WalletTxRow = {
  id: string;
  user_id: string;
  type: WalletTxType;
  amount: number; // signed: +topup/+refund, -purchase
  balance_after: number;
  order_id: string | null;
  stripe_payment_intent_id: string | null;
  status: WalletTxStatus;
  created_at: string;
};

// Types file is regenerated after the migration is applied; until then, we
// cast the supabase client to `any` for these tables to avoid stale-type
// build errors. Runtime shape is enforced by the migration.
type AnySupabase = {
  from: (table: string) => any;
  channel: (name: string) => any;
  removeChannel: (ch: any) => void;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};
const sb = supabase as unknown as AnySupabase;

export async function fetchMyWallet(userId: string): Promise<WalletRow | null> {
  const { data } = await sb.from("wallets").select("*").eq("user_id", userId).maybeSingle();
  return (data ?? null) as WalletRow | null;
}

export async function fetchMyWalletTransactions(
  userId: string,
  limit = 50,
): Promise<WalletTxRow[]> {
  const { data } = await sb
    .from("wallet_transactions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as WalletTxRow[];
}

export function subscribeMyWallet(userId: string, onChange: () => void): () => void {
  const ch = sb
    .channel(`wallet:${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "wallets", filter: `user_id=eq.${userId}` },
      () => onChange(),
    )
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "wallet_transactions",
        filter: `user_id=eq.${userId}`,
      },
      () => onChange(),
    )
    .subscribe();
  return () => sb.removeChannel(ch);
}

export type PayWithWalletResult =
  | {
      ok: true;
      balance: number;
      /** Amount actually debited from the wallet (in wallet currency). */
      debitAmount?: number;
      debitCurrency?: string;
      /** Original order amount + currency, echoed for UI display. */
      orderAmount?: number;
      orderCurrency?: string;
      rate?: number;
    }
  | {
      ok: false;
      error: string;
      balance?: number;
      total?: number;
      orderAmount?: number;
      orderCurrency?: string;
      rate?: number;
    };

export async function payOrderWithWallet(orderId: string): Promise<PayWithWalletResult> {
  const { data, error } = await sb.rpc("pay_order_with_wallet", { _order_id: orderId });
  if (error) {
    const msg = String(error.message ?? "");
    const code =
      /account_banned/i.test(msg) ? "account_banned"
      : /account_suspended/i.test(msg) ? "account_suspended"
      : /order_expired|payment_deadline/i.test(msg) ? "order_expired"
      : /insufficient/i.test(msg) ? "insufficient_funds"
      : /updated_at/i.test(msg) ? "wallet_pay_schema"
      : /permission denied|42501/i.test(msg) ? "forbidden"
      : msg.trim() || "unknown";
    return { ok: false, error: code };
  }
  const raw = (data ?? {}) as {
    ok: boolean;
    error?: string;
    balance?: number;
    total?: number;
    debit_amount?: number;
    debit_currency?: string;
    order_amount?: number;
    order_currency?: string;
    rate?: number;
  };
  if (!raw?.ok) {
    return {
      ok: false,
      error: raw?.error ?? "unknown",
      balance: raw?.balance,
      total: raw?.total,
      orderAmount: raw?.order_amount,
      orderCurrency: raw?.order_currency,
      rate: raw?.rate,
    };
  }
  return {
    ok: true,
    balance: Number(raw.balance ?? 0),
    debitAmount: raw.debit_amount !== undefined ? Number(raw.debit_amount) : undefined,
    debitCurrency: raw.debit_currency,
    orderAmount: raw.order_amount !== undefined ? Number(raw.order_amount) : undefined,
    orderCurrency: raw.order_currency,
    rate: raw.rate !== undefined ? Number(raw.rate) : undefined,
  };
}
