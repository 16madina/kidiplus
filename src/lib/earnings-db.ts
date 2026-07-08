// Seller earnings + payouts data layer (client-side).
//
// RLS: sellers SELECT their own rows only. All writes go through SECURITY
// DEFINER RPCs (credit_seller_earning is service-role only; request_payout
// and admin_process_payout run on behalf of the caller).

import { supabase } from "@/integrations/supabase/client";

export type SellerBalance = {
  seller_id: string;
  available: number;
  currency: string;
  updated_at: string;
};

export type SellerEarning = {
  id: string;
  seller_id: string;
  order_id: string;
  amount: number;
  balance_after: number;
  created_at: string;
};

export type PayoutMethod = "wave" | "orange_money" | "bank_transfer" | "paypal";
export type PayoutStatus = "requested" | "processing" | "paid" | "rejected";

export type PayoutRow = {
  id: string;
  seller_id: string;
  amount: number;
  currency: string;
  method: PayoutMethod;
  destination: Record<string, string>;
  status: PayoutStatus;
  note: string | null;
  admin_note: string | null;
  proof_url: string | null;
  processed_by: string | null;
  requested_at: string;
  processed_at: string | null;
};


// Types file is regenerated after migrations; cast to any for the new tables.
type AnySb = {
  from: (t: string) => any;
  channel: (n: string) => any;
  removeChannel: (c: any) => void;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};
const sb = supabase as unknown as AnySb;

export async function fetchMyBalance(userId: string): Promise<SellerBalance | null> {
  const { data } = await sb.from("seller_balances").select("*").eq("seller_id", userId).maybeSingle();
  return (data ?? null) as SellerBalance | null;
}

export async function fetchMyPayouts(userId: string, limit = 50): Promise<PayoutRow[]> {
  const { data } = await sb
    .from("payouts")
    .select("*")
    .eq("seller_id", userId)
    .order("requested_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as PayoutRow[];
}

export function subscribeMyEarnings(userId: string, onChange: () => void): () => void {
  const ch = sb
    .channel(`earnings:${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "seller_balances", filter: `seller_id=eq.${userId}` },
      () => onChange(),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "payouts", filter: `seller_id=eq.${userId}` },
      () => onChange(),
    )
    .subscribe();
  return () => sb.removeChannel(ch);
}

export type RequestPayoutResult =
  | { ok: true; payoutId: string }
  | { ok: false; error: string; min?: number; available?: number };

export async function requestPayout(
  amount: number,
  method: PayoutMethod,
  destination: Record<string, string>,
): Promise<RequestPayoutResult> {
  const { data, error } = await sb.rpc("request_payout", {
    _amount: amount,
    _method: method,
    _destination: destination,
  });
  if (error) return { ok: false, error: error.message };
  const r = (data ?? {}) as any;
  if (r.ok) return { ok: true, payoutId: r.payout_id as string };
  return { ok: false, error: r.error as string, min: r.min, available: r.available };
}

// ---- Admin ----

export async function fetchAllPayouts(limit = 200): Promise<PayoutRow[]> {
  const { data } = await sb
    .from("payouts")
    .select("*")
    .order("requested_at", { ascending: true })
    .limit(limit);
  return (data ?? []) as PayoutRow[];
}

export function subscribeAllPayouts(onChange: () => void): () => void {
  const ch = sb
    .channel(`payouts:all`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "payouts" },
      () => onChange(),
    )
    .subscribe();
  return () => sb.removeChannel(ch);
}

export async function adminProcessPayout(
  payoutId: string,
  action: "paid" | "rejected",
  opts?: { proofUrl?: string | null; adminNote?: string | null; note?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await sb.rpc("admin_process_payout", {
    _payout_id: payoutId,
    _action: action,
    _note: opts?.note ?? null,
    _proof_url: opts?.proofUrl ?? null,
    _admin_note: opts?.adminNote ?? null,
  });
  if (error) return { ok: false, error: error.message };
  const r = (data ?? {}) as any;
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

// Upload a payment-proof image to the private payout-proofs bucket.
// Returns the storage path (not a URL). Use signPayoutProofUrl to render it.
export async function uploadPayoutProof(
  payoutId: string,
  file: File,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${payoutId}/${Date.now()}.${ext}`;
  const { error } = await (supabase as any).storage
    .from("payout-proofs")
    .upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, path };
}

export async function signPayoutProofUrl(path: string, expiresIn = 60 * 10): Promise<string | null> {
  const { data, error } = await (supabase as any).storage
    .from("payout-proofs")
    .createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl as string;
}

