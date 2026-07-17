// Client wrapper around the send_gift RPC + helpers for a live.
// Gift realtime (broadcast + postgres backup) lives in `useLiveRoom`.
import { supabase } from "@/integrations/supabase/client";
import type { GiftKey } from "@/lib/gifts";

export type SendGiftResult =
  | {
      ok: true;
      giftId: string;
      amount: number;
      currency: string;
      debitAmount: number;
      debitCurrency: string;
      rate: number;
      balance: number;
      senderName: string;
    }
  | {
      ok: false;
      error:
        | "unauthorized"
        | "live_not_found"
        | "live_not_active"
        | "cannot_gift_self"
        | "unknown_gift"
        | "insufficient_funds"
        | "conversion_unavailable"
        | "sanctioned"
        | "unknown";
      balance?: number;
      price?: number;
      walletCurrency?: string;
      liveCurrency?: string;
    };

export async function sendGiftRpc(liveId: string, giftKey: GiftKey): Promise<SendGiftResult> {
  const { data, error } = await supabase.rpc("send_gift", {
    _live_id: liveId,
    _gift_key: giftKey,
  });
  if (error) {
    const msg = (error.message || "").toLowerCase();
    if (msg.includes("suspend") || msg.includes("ban")) {
      return { ok: false, error: "sanctioned" };
    }
    return { ok: false, error: "unknown" };
  }
  const d = data as {
    ok: boolean;
    error?: string;
    balance?: number;
    price?: number;
    wallet_currency?: string;
    live_currency?: string;
    gift_id?: string;
    amount?: number;
    currency?: string;
    debit_amount?: number;
    debit_currency?: string;
    rate?: number;
    sender_name?: string;
  };
  if (!d?.ok) {
    return {
      ok: false,
      error: (d?.error as SendGiftResult extends { ok: false; error: infer E } ? E : never) ?? "unknown",
      balance: d?.balance,
      price: d?.price,
      walletCurrency: d?.wallet_currency,
      liveCurrency: d?.live_currency,
    };
  }
  return {
    ok: true,
    giftId: d.gift_id!,
    amount: Number(d.amount),
    currency: d.currency!,
    debitAmount: Number(d.debit_amount ?? d.amount ?? 0),
    debitCurrency: d.debit_currency ?? d.currency ?? "EUR",
    rate: Number(d.rate ?? 1),
    balance: Number(d.balance ?? 0),
    senderName: d.sender_name ?? "invité",
  };
}

export type LiveGiftEvent = {
  id: string;
  liveId: string;
  senderId: string;
  senderName: string;
  giftKey: string;
  amount: number;
  currency: string;
  sellerNet: number;
  createdAt: number;
};

/** Aggregate helpers: totals per live for host UI. */
export async function fetchLiveGiftsTotal(liveId: string): Promise<{
  count: number;
  sellerNet: number;
  currency: string | null;
}> {
  const { data } = await supabase
    .from("live_gifts")
    .select("seller_net, currency")
    .eq("live_id", liveId);
  const rows = (data ?? []) as { seller_net: number; currency: string }[];
  return {
    count: rows.length,
    sellerNet: rows.reduce((s, r) => s + Number(r.seller_net ?? 0), 0),
    currency: rows[0]?.currency ?? null,
  };
}

