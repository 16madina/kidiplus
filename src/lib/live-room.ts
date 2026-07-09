// Realtime layer for a single live shopping room, backed by Supabase Realtime
// (broadcast for ephemeral events + presence for viewer count + postgres_changes
// for durable product / bid state). Both host and viewer subscribe here.
//
// Ephemeral events (broadcast):
//   - chat  { user, color, text, ts }
//   - heart { }
//   - auction:start { productId, deadlineMs, timerSec }
//   - auction:end   { productId, winnerName, finalPrice }
//
// Durable events (postgres_changes):
//   - live_products UPDATE — price / status / stock
//   - live_bids     INSERT — bidder name + amount

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchLiveProducts,
  updateLiveViewerCount,
  resolveLiveImage,
  type LiveProductRow,
} from "@/lib/lives-db";

/** Resolve the stored image_url path (bucket path) into a signed/absolute URL.
 *  Signing can transiently fail (auth not yet attached / network warmup); we
 *  retry once before giving up. If it still fails, keep image_url = null so
 *  the UI shows a placeholder rather than a broken <img>. */
async function hydrateImage(row: LiveProductRow): Promise<LiveProductRow> {
  if (!row.image_url) return row;
  if (/^(https?:|blob:|data:)/i.test(row.image_url)) return row;
  const path = row.image_url;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const url = await resolveLiveImage("live-products", path);
      if (url) return { ...row, image_url: url };
    } catch (err) {
      console.warn("[live-room] hydrateImage error", err, path);
    }
    if (attempt < 3) await new Promise((r) => setTimeout(r, attempt === 0 ? 700 : 1400));
  }
  console.warn("[live-room] failed to sign product image after retry", path);
  return row;
}

export type ChatEvt = {
  id: string;
  user: string;
  color: string;
  text: string;
  system?: boolean;
};

export type AuctionStartEvt = {
  productId: string;
  deadlineMs: number;
  timerSec: number;
};

export type AuctionEndEvt = {
  productId: string;
  winnerId: string | null;
  winnerName: string | null;
  winnerAvatarUrl?: string | null;
  finalPrice: number;
  orderId?: string | null;
  autoPaid?: boolean;
};

export type AuctionExtendEvt = {
  productId: string;
  deadlineMs: number;
  /** Client-side timestamp so viewers can dedupe / flash once. */
  ts: number;
};

export type GiftEvt = {
  id: string;
  giftKey: string;
  senderId: string;
  senderName: string;
  ts: number;
};

export type LiveRoomState = {
  ready: boolean;
  viewerCount: number;
  chat: ChatEvt[];
  heartTick: number;
  products: LiveProductRow[];
  liveStatus: "live" | "ended" | null;
  auctionStart: AuctionStartEvt | null;
  lastAuctionEnd: AuctionEndEvt | null;
  lastExtension: AuctionExtendEvt | null;
  lastBid: { productId: string; bidderId: string; bidderName: string; amount: number; ts: number } | null;
  lastGift: GiftEvt | null;
  sendChat: (text: string) => void;
  sendHeart: () => void;
  broadcastGift: (evt: Omit<GiftEvt, "ts" | "id">) => void;
  broadcastAuctionStart: (evt: AuctionStartEvt) => void;
  broadcastAuctionEnd: (evt: AuctionEndEvt) => void;
  broadcastAuctionExtend: (evt: Omit<AuctionExtendEvt, "ts">) => void;
  systemMessage: (text: string) => void;
};

const COLOR_POOL = [
  "oklch(0.75 0.16 30)",
  "oklch(0.78 0.14 200)",
  "oklch(0.8 0.16 140)",
  "oklch(0.78 0.16 60)",
  "oklch(0.75 0.18 320)",
  "oklch(0.8 0.14 260)",
];

function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return COLOR_POOL[Math.abs(h) % COLOR_POOL.length];
}

let localSeq = 0;
const uid = () => `evt-${Date.now()}-${++localSeq}`;

export function useLiveRoom(params: {
  liveId: string | null | undefined;
  identity: string; // stable id (user.id or anon)
  displayName: string;
  isHost: boolean;
}): LiveRoomState {
  const { liveId, identity, displayName, isHost } = params;
  const [ready, setReady] = useState(false);
  const [viewerCount, setViewerCount] = useState(1);
  const [chat, setChat] = useState<ChatEvt[]>([]);
  const [heartTick, setHeartTick] = useState(0);
  const [products, setProducts] = useState<LiveProductRow[]>([]);
  const [liveStatus, setLiveStatus] = useState<"live" | "ended" | null>(null);
  const [auctionStart, setAuctionStart] = useState<AuctionStartEvt | null>(null);
  const [lastAuctionEnd, setLastAuctionEnd] = useState<AuctionEndEvt | null>(null);
  const [lastExtension, setLastExtension] = useState<AuctionExtendEvt | null>(null);
  const [lastBid, setLastBid] = useState<LiveRoomState["lastBid"]>(null);
  const [lastGift, setLastGift] = useState<GiftEvt | null>(null);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Load initial products + rehydrate an already-running auction so late
  // joiners see the same countdown as everyone else. `auction_deadline_at`
  // is stored on the live_products row by the start_auction RPC.
  useEffect(() => {
    if (!liveId) return;
    let alive = true;
    void (async () => {
      const [p, liveRes, bidRes] = await Promise.all([
        fetchLiveProducts(liveId),
        supabase.from("lives").select("status").eq("id", liveId).maybeSingle(),
        supabase
          .from("live_bids")
          .select("product_id, bidder_id, bidder_name, amount")
          .eq("live_id", liveId)
          .order("amount", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      const hydrated = await Promise.all(p.map(hydrateImage));
      if (!alive) return;
      setProducts(hydrated);
      setLiveStatus((liveRes.data?.status as "live" | "ended" | undefined) ?? null);
      // Rehydrate any active auction whose deadline is still in the future.
      const running = hydrated.find(
        (row) =>
          row.mode === "auction" &&
          row.status === "active" &&
          row.auction_deadline_at &&
          new Date(row.auction_deadline_at).getTime() > Date.now(),
      );
      if (running && running.auction_deadline_at) {
        setAuctionStart({
          productId: running.id,
          deadlineMs: new Date(running.auction_deadline_at).getTime(),
          timerSec: running.timer_seconds,
        });
      }
      if (bidRes.data) {
        setLastBid({
          productId: bidRes.data.product_id,
          bidderId: bidRes.data.bidder_id,
          bidderName: bidRes.data.bidder_name,
          amount: Number(bidRes.data.amount),
          ts: Date.now(),
        });
      }
    })();
    return () => {
      alive = false;
    };
  }, [liveId]);


  // Postgres realtime for products + bids.
  useEffect(() => {
    if (!liveId) return;
    const ch = supabase
      .channel(`live-db:${liveId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "lives", filter: `id=eq.${liveId}` },
        (payload) => {
          // CRITICAL: only transition to "ended" when the row's status column
          // ACTUALLY becomes "ended" (a real state change from "live" to
          // "ended"). Realtime UPDATEs also fire for viewer_count writes and
          // any other column write; payload.new is the full row so a bare
          // read of row.status is safe, but we still explicitly guard against
          // partial payloads (REPLICA IDENTITY DEFAULT), and we never
          // downgrade a known status to null from a realtime frame — the
          // initial load is the only source of truth for that.
          const newRow = payload.new as { status?: "live" | "ended" };
          const oldRow = payload.old as { status?: "live" | "ended" } | null;
          if (newRow.status === "ended" && oldRow?.status !== "ended") {
            setLiveStatus("ended");
          } else if (newRow.status === "live") {
            setLiveStatus("live");
          }
          // Any other update (viewer_count, ended_at without status, sparse
          // payload) is ignored — we do NOT touch liveStatus.
        },
      )

      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "live_products", filter: `live_id=eq.${liveId}` },
        (payload) => {
          const row = payload.new as LiveProductRow;
          void hydrateImage(row).then((r) =>
            setProducts((prev) => prev.map((p) => (p.id === r.id ? r : p))),
          );
          // Fallback deadline sync — if the broadcast frame was missed, this
          // ensures viewers still adopt the persisted absolute deadline.
          if (
            row.mode === "auction" &&
            row.status === "active" &&
            row.auction_deadline_at
          ) {
            const deadlineMs = new Date(row.auction_deadline_at).getTime();
            if (Number.isFinite(deadlineMs) && deadlineMs > Date.now()) {
              setAuctionStart((cur) =>
                cur && cur.productId === row.id && cur.deadlineMs === deadlineMs
                  ? cur
                  : { productId: row.id, deadlineMs, timerSec: row.timer_seconds },
              );
            }
          }
        },
      )

      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "live_products", filter: `live_id=eq.${liveId}` },
        (payload) => {
          const row = payload.new as LiveProductRow;
          void hydrateImage(row).then((r) =>
            setProducts((prev) =>
              prev.some((p) => p.id === r.id) ? prev : [...prev, r].sort((a, b) => a.position - b.position),
            ),
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "live_bids", filter: `live_id=eq.${liveId}` },
        (payload) => {
          const row = payload.new as {
            product_id: string;
            bidder_id: string;
            bidder_name: string;
            amount: number;
          };
          setLastBid({
            productId: row.product_id,
            bidderId: row.bidder_id,
            bidderName: row.bidder_name,
            amount: Number(row.amount),
            ts: Date.now(),
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [liveId]);

  // Broadcast + presence channel.
  useEffect(() => {
    if (!liveId) return;
    const ch = supabase.channel(`live:${liveId}`, {
      config: { presence: { key: identity } },
    });
    channelRef.current = ch;

    ch.on("broadcast", { event: "chat" }, ({ payload }) => {
      const p = payload as ChatEvt;
      setChat((prev) => {
        const next = [...prev, p];
        return next.length > 60 ? next.slice(next.length - 60) : next;
      });
    });
    ch.on("broadcast", { event: "heart" }, () => {
      setHeartTick((n) => n + 1);
    });
    ch.on("broadcast", { event: "auction:start" }, ({ payload }) => {
      setAuctionStart(payload as AuctionStartEvt);
    });
    ch.on("broadcast", { event: "auction:end" }, ({ payload }) => {
      const evt = payload as AuctionEndEvt;
      setLastAuctionEnd(evt);
      setAuctionStart((cur) => (cur && cur.productId === evt.productId ? null : cur));
    });
    ch.on("broadcast", { event: "auction:extend" }, ({ payload }) => {
      const evt = payload as AuctionExtendEvt;
      setAuctionStart((cur) =>
        cur && cur.productId === evt.productId ? { ...cur, deadlineMs: evt.deadlineMs } : cur,
      );
      setLastExtension(evt);
    });
    ch.on("broadcast", { event: "gift" }, ({ payload }) => {
      const p = payload as GiftEvt;
      setLastGift(p);
    });

    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState();
      setViewerCount(Math.max(1, Object.keys(state).length));
    });

    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryDelay = 1_000;
    ch.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        retryDelay = 1_000;
        await ch.track({ identity, name: displayName, host: isHost, joined_at: Date.now() });
        setReady(true);
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        // Supabase realtime doesn't auto-resubscribe on error/close — do it
        // ourselves with exponential backoff so a network blip during a
        // live doesn't kill chat/hearts/presence for the rest of the
        // session. 15s ceiling keeps recovery fast without stampeding.
        setReady(false);
        if (retryTimer != null) return;
        retryTimer = setTimeout(() => {
          retryTimer = null;
          try { void ch.subscribe(); } catch { /* channel already gone */ }
        }, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 15_000);
      }
    });


    return () => {
      if (retryTimer != null) clearTimeout(retryTimer);
      setReady(false);
      supabase.removeChannel(ch);
      channelRef.current = null;
    };

  }, [liveId, identity, displayName, isHost]);

  // Host: periodically persist viewer_count so feed cards reflect reality.
  useEffect(() => {
    if (!liveId || !isHost) return;
    let alive = true;
    const t = setInterval(() => {
      if (alive) void updateLiveViewerCount(liveId, viewerCount);
    }, 15_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [liveId, isHost, viewerCount]);

  return useMemo<LiveRoomState>(
    () => ({
      ready,
      viewerCount,
      chat,
      heartTick,
      products,
      liveStatus,
      auctionStart,
      lastAuctionEnd,
      lastExtension,
      lastBid,
      lastGift,
      broadcastGift: (evt) => {
        const full: GiftEvt = { ...evt, id: uid(), ts: Date.now() };
        setLastGift(full);
        void channelRef.current?.send({ type: "broadcast", event: "gift", payload: full });
      },
        const trimmed = text.trim();
        if (!trimmed) return;
        const evt: ChatEvt = {
          id: uid(),
          user: displayName,
          color: colorFor(identity),
          text: trimmed,
        };
        // Optimistic local echo + broadcast to others.
        setChat((prev) => [...prev, evt].slice(-60));
        void channelRef.current?.send({ type: "broadcast", event: "chat", payload: evt });
      },
      sendHeart: () => {
        setHeartTick((n) => n + 1); // local
        void channelRef.current?.send({ type: "broadcast", event: "heart", payload: {} });
      },
      broadcastAuctionStart: (evt) => {
        setAuctionStart(evt);
        void channelRef.current?.send({ type: "broadcast", event: "auction:start", payload: evt });
      },
      broadcastAuctionEnd: (evt) => {
        setLastAuctionEnd(evt);
        setAuctionStart((cur) => (cur && cur.productId === evt.productId ? null : cur));
        void channelRef.current?.send({ type: "broadcast", event: "auction:end", payload: evt });
      },
      broadcastAuctionExtend: (evt) => {
        const full: AuctionExtendEvt = { ...evt, ts: Date.now() };
        setAuctionStart((cur) =>
          cur && cur.productId === full.productId ? { ...cur, deadlineMs: full.deadlineMs } : cur,
        );
        setLastExtension(full);
        void channelRef.current?.send({ type: "broadcast", event: "auction:extend", payload: full });
      },
      systemMessage: (text: string) => {
        const evt: ChatEvt = { id: uid(), user: "", color: "", text, system: true };
        setChat((prev) => [...prev, evt].slice(-60));
      },
    }),
    [
      ready, viewerCount, chat, heartTick, products, liveStatus, auctionStart, lastAuctionEnd, lastExtension, lastBid,
      identity, displayName,
    ],
  );
}
