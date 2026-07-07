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
 *  If resolution fails, null out image_url so the UI can render a placeholder
 *  instead of a broken <img> pointing at a raw storage path. */
async function hydrateImage(row: LiveProductRow): Promise<LiveProductRow> {
  if (!row.image_url) return row;
  if (/^https?:\/\//i.test(row.image_url)) return row;
  try {
    const url = await resolveLiveImage("live-products", row.image_url);
    if (url) return { ...row, image_url: url };
    console.warn("[live-room] failed to sign product image", row.image_url);
    return { ...row, image_url: null };
  } catch (err) {
    console.warn("[live-room] hydrateImage error", err, row.image_url);
    return { ...row, image_url: null };
  }
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
  finalPrice: number;
};

export type LiveRoomState = {
  ready: boolean;
  viewerCount: number;
  chat: ChatEvt[];
  heartTick: number;
  products: LiveProductRow[];
  auctionStart: AuctionStartEvt | null;
  lastAuctionEnd: AuctionEndEvt | null;
  lastBid: { productId: string; bidderId: string; bidderName: string; amount: number; ts: number } | null;
  sendChat: (text: string) => void;
  sendHeart: () => void;
  broadcastAuctionStart: (evt: AuctionStartEvt) => void;
  broadcastAuctionEnd: (evt: AuctionEndEvt) => void;
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
  const [auctionStart, setAuctionStart] = useState<AuctionStartEvt | null>(null);
  const [lastAuctionEnd, setLastAuctionEnd] = useState<AuctionEndEvt | null>(null);
  const [lastBid, setLastBid] = useState<LiveRoomState["lastBid"]>(null);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Load initial products.
  useEffect(() => {
    if (!liveId) return;
    let alive = true;
    fetchLiveProducts(liveId).then(async (p) => {
      const hydrated = await Promise.all(p.map(hydrateImage));
      if (alive) setProducts(hydrated);
    });
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
        { event: "UPDATE", schema: "public", table: "live_products", filter: `live_id=eq.${liveId}` },
        (payload) => {
          const row = payload.new as LiveProductRow;
          void hydrateImage(row).then((r) =>
            setProducts((prev) => prev.map((p) => (p.id === r.id ? r : p))),
          );
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
        return next.length > 80 ? next.slice(next.length - 80) : next;
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

    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState();
      setViewerCount(Math.max(1, Object.keys(state).length));
    });

    ch.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await ch.track({ identity, name: displayName, host: isHost, joined_at: Date.now() });
        setReady(true);
      }
    });

    return () => {
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
      auctionStart,
      lastAuctionEnd,
      lastBid,
      sendChat: (text: string) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        const evt: ChatEvt = {
          id: uid(),
          user: displayName,
          color: colorFor(identity),
          text: trimmed,
        };
        // Optimistic local echo + broadcast to others.
        setChat((prev) => [...prev, evt].slice(-80));
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
      systemMessage: (text: string) => {
        const evt: ChatEvt = { id: uid(), user: "", color: "", text, system: true };
        setChat((prev) => [...prev, evt].slice(-80));
      },
    }),
    [
      ready, viewerCount, chat, heartTick, products, auctionStart, lastAuctionEnd, lastBid,
      identity, displayName,
    ],
  );
}
