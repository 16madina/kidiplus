// Orders data layer — client-side (browser Supabase client).
// Writes are restricted by RLS to (buyer_id = auth.uid(), status='pending').
// Status transitions (paid/failed) happen server-side via /api/stripe-webhook.

import { supabase } from "@/integrations/supabase/client";
import { computeFees } from "@/lib/fees";

export type OrderStatus = "pending" | "paid" | "failed" | "cancelled" | "refunded";
export type OrderKind = "auction" | "fixed";
export type PaymentMethod = "card" | "wave" | "orange_money" | "wallet";
export type FulfillmentStatus = "awaiting" | "shipped" | "delivered" | "disputed";
export type DeliveryMode = "zones" | "flat" | "courier";

export type OrderRow = {
  id: string;
  live_id: string | null;
  product_id: string | null;
  buyer_id: string;
  seller_id: string;
  kind: OrderKind;
  item_name: string;
  item_image: string | null;
  amount: number;
  platform_fee: number;
  processing_fee: number;
  seller_net: number;
  total: number;
  currency: string;
  status: OrderStatus;
  payment_method: PaymentMethod;
  stripe_payment_intent_id: string | null;
  created_at: string;
  paid_at: string | null;
  payment_deadline: string | null;
  cancelled_reason: string | null;
  // Delivery + escrow (added in Migration 1)
  delivery_fee: number;
  delivery_mode: DeliveryMode | null;
  delivery_zone: string | null;
  address_id: string | null;
  address_snapshot: Record<string, unknown> | null;
  fulfillment_status: FulfillmentStatus;
  shipped_at: string | null;
  delivered_confirmed_at: string | null;
  refund_status: "pending_manual" | "refunded_wallet" | "refunded_card" | "none" | null;
};

export type CreatePendingOrderInput = {
  buyerId: string;
  sellerId: string;
  liveId: string | null;
  productId: string | null;
  kind: OrderKind;
  itemName: string;
  itemImage: string | null;
  amount: number; // item price expressed in the live/order currency
  /** Currency of the live (falls back to EUR). Order & fees use this. */
  currency?: string;
  /** Delivery (all optional — omit when not applicable, e.g. digital goods). */
  deliveryFee?: number;
  deliveryMode?: DeliveryMode | null;
  deliveryZone?: string | null;
  addressId?: string | null;
  addressSnapshot?: Record<string, unknown> | null;
};

/**
 * Insert a pending order for the current user. Fee math is derived from
 * src/lib/fees.ts in the order's currency so the checkout summary and DB
 * numbers stay in lockstep. A DB trigger also stamps the live's currency
 * on insert as a belt-and-braces safety.
 */
export async function createPendingOrder(
  input: CreatePendingOrderInput,
): Promise<{ ok: true; order: OrderRow } | { ok: false; error: string }> {
  const deliveryFee = Number(input.deliveryFee ?? 0);
  const fees = computeFees(input.amount, deliveryFee, input.currency ?? "EUR");
  const { data, error } = await supabase
    .from("orders")
    .insert({
      buyer_id: input.buyerId,
      seller_id: input.sellerId,
      live_id: input.liveId,
      product_id: input.productId,
      kind: input.kind,
      item_name: input.itemName,
      item_image: input.itemImage,
      amount: fees.amount,
      platform_fee: fees.platformFee,
      processing_fee: 0,
      seller_net: fees.sellerNet,
      total: fees.total,
      currency: fees.currency,
      status: "pending",
      payment_method: "card",
      delivery_fee: fees.shipping,
      delivery_mode: input.deliveryMode ?? null,
      delivery_zone: input.deliveryZone ?? null,
      address_id: input.addressId ?? null,
      address_snapshot: (input.addressSnapshot ?? null) as never,
    } as never)
    .select("*")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "insert failed" };
  return { ok: true, order: data as OrderRow };
}

export async function fetchOrderById(orderId: string): Promise<OrderRow | null> {
  const { data } = await supabase.from("orders").select("*").eq("id", orderId).maybeSingle();
  return (data ?? null) as OrderRow | null;
}

export async function fetchMyOrders(buyerId: string, limit = 50): Promise<OrderRow[]> {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("buyer_id", buyerId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as OrderRow[];
}

export async function fetchSellerOrders(sellerId: string, limit = 100): Promise<OrderRow[]> {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("seller_id", sellerId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as OrderRow[];
}

export async function fetchOrdersForLive(liveId: string): Promise<OrderRow[]> {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("live_id", liveId)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data as OrderRow[];
}

/** Realtime subscription for a given buyer or seller filter. */
export function subscribeOrders(
  filter: { buyerId?: string; sellerId?: string },
  onChange: () => void,
): () => void {
  const key = filter.buyerId
    ? `orders-buyer:${filter.buyerId}`
    : `orders-seller:${filter.sellerId ?? "?"}`;
  const col = filter.buyerId ? "buyer_id" : "seller_id";
  const val = filter.buyerId ?? filter.sellerId ?? "";
  const ch = supabase
    .channel(key)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "orders", filter: `${col}=eq.${val}` },
      () => onChange(),
    )
    .subscribe();
  return () => {
    supabase.removeChannel(ch);
  };
}

/** Buyer names for a batch of orders — used in seller sales list. */
export async function fetchProfilesByIds(
  ids: string[],
): Promise<Record<string, { display_name: string; handle: string; avatar_url: string | null }>> {
  if (ids.length === 0) return {};
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, handle, avatar_url")
    .in("id", ids);
  const out: Record<string, { display_name: string; handle: string; avatar_url: string | null }> = {};
  for (const p of data ?? []) {
    out[p.id] = {
      display_name: p.display_name,
      handle: p.handle,
      avatar_url: p.avatar_url,
    };
  }
  return out;
}
