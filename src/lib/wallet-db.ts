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

export type WalletTxType = "topup" | "purchase" | "refund" | "adjustment";
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
  | { ok: true; balance: number }
  | { ok: false; error: string; balance?: number; total?: number };

export async function payOrderWithWallet(orderId: string): Promise<PayWithWalletResult> {
  const { data, error } = await sb.rpc("pay_order_with_wallet", { _order_id: orderId });
  if (error) return { ok: false, error: error.message };
  const r = (data ?? {}) as PayWithWalletResult;
  return r;
}
