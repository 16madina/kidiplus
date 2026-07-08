// Order event timeline data layer. RLS: buyer/seller of the order and admins
// can SELECT. Writes happen server-side inside SECURITY DEFINER RPCs.

import { supabase } from "@/integrations/supabase/client";

export type OrderEventKind =
  | "created"
  | "paid"
  | "shipped"
  | "delivery_confirmed"
  | "auto_released"
  | "disputed"
  | "dispute_released"
  | "dispute_refunded"
  | "cancelled";

export type OrderEventRow = {
  id: string;
  order_id: string;
  event: OrderEventKind;
  actor_id: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
};

export async function fetchOrderEvents(orderId: string): Promise<OrderEventRow[]> {
  const { data, error } = await supabase
    .from("order_events" as never)
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data as unknown as OrderEventRow[];
}

export function subscribeOrderEvents(
  orderId: string,
  onChange: () => void,
): () => void {
  const ch = supabase
    .channel(`order_events:${orderId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "order_events", filter: `order_id=eq.${orderId}` },
      onChange,
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(ch);
  };
}
