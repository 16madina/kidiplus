// Client wrapper around the send_gift RPC + realtime feed for a live.
import { useEffect, useState } from "react";
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

/** Subscribe to gift INSERTs for a live (resilient backup for the LiveKit broadcast). */
export function useLiveGiftsFeed(liveId: string | null | undefined): {
  lastGift: LiveGiftEvent | null;
} {
  const [lastGift, setLastGift] = useState<LiveGiftEvent | null>(null);
  useEffect(() => {
    if (!liveId) return;
    const ch = supabase
      .channel(`live-gifts:${liveId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "live_gifts", filter: `live_id=eq.${liveId}` },
        (payload) => {
          const row = payload.new as {
            id: string;
            live_id: string;
            sender_id: string;
            gift_key: string;
            amount: number;
            currency: string;
            seller_net: number;
            created_at: string;
          };
          // Enrich with sender name (best-effort).
          void (async () => {
            const { data } = await supabase
              .from("profiles")
              .select("display_name, handle")
              .eq("id", row.sender_id)
              .maybeSingle();
            setLastGift({
              id: row.id,
              liveId: row.live_id,
              senderId: row.sender_id,
              senderName: data?.display_name || data?.handle || "invité",
              giftKey: row.gift_key,
              amount: Number(row.amount),
              currency: row.currency,
              sellerNet: Number(row.seller_net),
              createdAt: new Date(row.created_at).getTime(),
            });
          })();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [liveId]);
  return { lastGift };
}
