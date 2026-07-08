// Escrow RPC wrappers — thin, typed calls to the SECURITY DEFINER server
// functions defined in migration 2. All server-side ownership + state
// checks live in the SQL; the client is just a UI dispatcher.

import { supabase } from "@/integrations/supabase/client";

type RpcResult<T = Record<string, unknown>> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

type AnyRpc = { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }> };
const sb = supabase as unknown as AnyRpc;

async function callRpc<T = Record<string, unknown>>(
  fn: string,
  args: Record<string, unknown>,
): Promise<RpcResult<T>> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) return { ok: false, error: error.message };
  const r = (data ?? {}) as any;
  if (r?.ok) return r as RpcResult<T>;
  return { ok: false, error: (r?.error as string) ?? "unknown_error" };
}

export function markOrderShipped(orderId: string) {
  return callRpc("mark_order_shipped", { _order_id: orderId });
}

export function confirmOrderDelivered(orderId: string) {
  return callRpc<{ pending?: number; available?: number; noop?: boolean }>(
    "confirm_order_delivered",
    { _order_id: orderId },
  );
}

export function disputeOrder(orderId: string, reason: string, note?: string | null) {
  return callRpc<{ report_id: string }>("dispute_order", {
    _order_id: orderId,
    _reason: reason,
    _note: note ?? null,
  });
}

export function adminReleaseEscrow(orderId: string, note?: string | null) {
  return callRpc("admin_release_escrow", { _order_id: orderId, _note: note ?? null });
}

export function adminRefundOrder(orderId: string, note?: string | null) {
  return callRpc<{ refund_status: string }>("admin_refund_order", {
    _order_id: orderId,
    _note: note ?? null,
  });
}

/** Opportunistic auto-release trigger. Safe to call from any authenticated
 *  entry point (app boot, Mes gains open, admin dashboard open). */
export async function releaseOverdueEscrow(): Promise<{ released: number } | null> {
  const { data, error } = await sb.rpc("release_overdue_escrow", {});
  if (error) return null;
  const r = (data ?? {}) as any;
  if (!r?.ok) return null;
  return { released: Number(r.released ?? 0) };
}
