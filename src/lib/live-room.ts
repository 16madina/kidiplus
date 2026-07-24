// Realtime layer for a single live shopping room, backed by Supabase Realtime
// (broadcast for ephemeral events + presence for viewer count + postgres_changes
// for durable product / bid state). Both host and viewer subscribe here.
//
// Ephemeral events (broadcast):
//   - chat  { user, color, text, ts }
//   - heart { }
//   - gift  { id, giftKey, senderId, senderName, ts }  (id = live_gifts.id)
//   - auction:start { productId, deadlineMs, timerSec }
//   - auction:end   { productId, winnerName, finalPrice }
//
// Durable events (postgres_changes):
//   - live_products UPDATE — price / status / stock
//   - live_bids     INSERT — bidder name + amount
//   - live_gifts    INSERT — backup path for gift anim/chat if broadcast drops

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchLiveProducts,
  updateLiveViewerCount,
  resolveLiveImage,
  normalizeLiveProductRow,
  type LiveProductRow,
} from "@/lib/lives-db";

/** Resolve the stored image_url path (bucket path) into a signed/absolute URL.
 *  Signing can transiently fail (auth not yet attached / network warmup); we
 *  retry once before giving up. If it still fails, keep image_url = null so
 *  the UI shows a placeholder rather than a broken <img>. */
async function hydrateImage(row: LiveProductRow): Promise<LiveProductRow> {
  const normalized = normalizeLiveProductRow(row);
  if (!normalized.image_url) return normalized;
  if (/^(https?:|blob:|data:)/i.test(normalized.image_url)) return normalized;
  const path = normalized.image_url;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const url = await resolveLiveImage("live-products", path);
      if (url) return { ...normalized, image_url: url };
    } catch (err) {
      console.warn("[live-room] hydrateImage error", err, path);
    }
    if (attempt < 3) await new Promise((r) => setTimeout(r, attempt === 0 ? 700 : 1400));
  }
  console.warn("[live-room] failed to sign product image after retry", path);
  return normalized;
}

function isTerminalProductStatus(status: string | null | undefined): boolean {
  return status === "sold" || status === "unsold" || status === "out";
}

/** Build an auction:start payload from a DB product row when the broadcast
 *  frame was missed. Allow a wide grace past the deadline so a client with
 *  a fast clock (or laggy realtime) still attaches instead of staying stuck
 *  on "waiting for seller" while others bid. */
function auctionStartFromProduct(row: {
  id: string;
  mode?: string | null;
  status?: string | null;
  auction_deadline_at?: string | null;
  timer_seconds?: number | null;
  auction_round?: number | null;
}): AuctionStartEvt | null {
  if (row.mode !== "auction" || row.status !== "active" || !row.auction_deadline_at) return null;
  const deadlineMs = new Date(row.auction_deadline_at).getTime();
  if (!Number.isFinite(deadlineMs)) return null;
  // Wide grace: phone clocks are often minutes off; DB `status=active` is
  // the source of truth for "still running".
  if (deadlineMs <= Date.now() - 120_000) return null;
  return {
    productId: row.id,
    deadlineMs,
    timerSec: Math.max(1, Number(row.timer_seconds ?? 30)),
    ...(row.auction_round != null ? { auctionRound: Number(row.auction_round) } : {}),
  };
}

/** Merge a realtime/hydrated row without letting a stale frame revive a
 *  finished auction (sold/unsold/out → active), which pinned the star card
 *  on the item that just ended. A higher auction_round means relaunch. */
function mergeLiveProductRow(prev: LiveProductRow, incoming: LiveProductRow): LiveProductRow {
  const keepImage =
    !!prev.image_url &&
    /^(https?:|blob:|data:)/i.test(prev.image_url) &&
    !!incoming.image_url &&
    !/^(https?:|blob:|data:)/i.test(incoming.image_url);

  const prevRound = prev.auction_round ?? 1;
  const nextRound = incoming.auction_round ?? 1;
  const roundBumped = nextRound > prevRound;
  const protectTerminal =
    isTerminalProductStatus(prev.status) &&
    !isTerminalProductStatus(incoming.status) &&
    !roundBumped;

  const merged: LiveProductRow = protectTerminal
    ? {
        ...incoming,
        status: prev.status,
        sold_to_identity: prev.sold_to_identity,
        final_price: prev.final_price,
        price: prev.price,
        auction_deadline_at: null,
        auction_round: prev.auction_round,
      }
    : { ...prev, ...incoming };

  if (keepImage) merged.image_url = prev.image_url;
  return merged;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ChatReplyTo = {
  user: string;
  userId?: string;
  text: string;
};

export type ChatSource = "kidi" | "youtube" | "facebook";

export type ChatEvt = {
  id: string;
  user: string;
  color: string;
  text: string;
  system?: boolean;
  /** Structured system lines — UI localizes (e.g. "{{name}} a rejoint"). */
  systemKind?: "join";
  /** Profile UUID when identity is a signed-in user. */
  userId?: string;
  /** True when the sender is a live moderator (TikTok-style chat badge). */
  isModerator?: boolean;
  /** True when the sender is the live host. */
  isHost?: boolean;
  /** Origin when repatriated from YouTube / Facebook live chat. */
  source?: ChatSource;
  /** Stable platform message id for dedupe + reply. */
  externalId?: string;
  /** Optional reply target (TikTok-style quote). */
  replyTo?: ChatReplyTo;
};

export type AuctionStartEvt = {
  productId: string;
  deadlineMs: number;
  timerSec: number;
  /** live_products.auction_round of this launch — lets clients tell a
   *  relaunch apart from a stale frame of the round they saw end. */
  auctionRound?: number;
};

export type AuctionEndEvt = {
  productId: string;
  winnerId: string | null;
  winnerName: string | null;
  winnerAvatarUrl?: string | null;
  finalPrice: number;
  orderId?: string | null;
  autoPaid?: boolean;
  /** Current live_products.auction_round when the auction ended. */
  auctionRound?: number;
  /** Unique id per end event — required so every win can show a reveal. */
  endId?: string;
  ts?: number;
};

export type AuctionExtendEvt = {
  productId: string;
  deadlineMs: number;
  /** Client-side timestamp so viewers can dedupe / flash once. */
  ts: number;
};

export type GiftEvt = {
  /** Prefer the DB `live_gifts.id` so broadcast + postgres backup can dedupe. */
  id: string;
  giftKey: string;
  senderId: string;
  senderName: string;
  ts: number;
};

export type LivePresenceViewer = {
  /** Presence key / identity — for signed-in users this is their profile UUID. */
  identity: string;
  name: string;
  isHost: boolean;
};

export type LiveRoomState = {
  ready: boolean;
  viewerCount: number;
  /** Logged-in viewers currently in the Supabase presence channel (excludes guests + host). */
  presentViewers: LivePresenceViewer[];
  chat: ChatEvt[];
  heartTick: number;
  products: LiveProductRow[];
  liveStatus: "live" | "ended" | null;
  auctionStart: AuctionStartEvt | null;
  lastAuctionEnd: AuctionEndEvt | null;
  lastExtension: AuctionExtendEvt | null;
  lastBid: {
    productId: string;
    bidderId: string;
    bidderName: string;
    amount: number;
    ts: number;
    auctionRound: number;
  } | null;
  lastGift: GiftEvt | null;
  sendChat: (text: string, replyTo?: ChatReplyTo) => void;
  /**
   * Inject a repatriated YouTube/Facebook comment into the room chat
   * (host bridge). Dedupes by `id` / `externalId`.
   */
  ingestExternalChat: (evt: ChatEvt) => void;
  sendHeart: () => void;
  /** Pass `id` = RPC `gift_id` so anim/chat stay in sync with the DB backup feed. */
  broadcastGift: (evt: {
    id?: string;
    giftKey: string;
    senderId: string;
    senderName: string;
  }) => void;
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
  /** Stamp chat messages with a moderator badge when true. */
  isModerator?: boolean;
  /**
   * Silent observer (e.g. YouTube Web Egress Chrome): still receives chat /
   * auctions / gifts, but does not announce a join or inflate presence UX.
   */
  silent?: boolean;
}): LiveRoomState {
  const {
    liveId,
    identity,
    displayName,
    isHost,
    isModerator = false,
    silent = false,
  } = params;
  const [ready, setReady] = useState(false);
  const [viewerCount, setViewerCount] = useState(1);
  const [presentViewers, setPresentViewers] = useState<LivePresenceViewer[]>([]);
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
  const readyRef = useRef(false);
  const lastAuctionEndRef = useRef<AuctionEndEvt | null>(null);
  lastAuctionEndRef.current = lastAuctionEnd;

  /** Don't re-adopt a product we already celebrated as ended (finalize lag) —
   *  UNLESS the auction_round is newer, which means the host relaunched the
   *  same product. Without the round check, a quick relaunch left every
   *  viewer who received the `auction:end` stuck on "waiting for seller" for
   *  90s (the rescue poll was neutralized) while others could bid. */
  const canAdoptAuctionStart = (productId: string, round?: number) => {
    const end = lastAuctionEndRef.current;
    if (!end || end.productId !== productId) return true;
    const endRound = Number(end.auctionRound ?? 0);
    if (round != null && endRound > 0 && round > endRound) return true;
    const age = Date.now() - (end.ts ?? 0);
    return age > 90_000;
  };
  /** Single adoption path for every rescue mechanism (postgres_changes,
   *  bid recovery, poll, broadcast confirm). Round-aware:
   *  - a newer auction_round always supersedes local state (relaunch),
   *  - within the same round the deadline never moves backwards, so the
   *    1.5s rescue poll cannot revert an anti-snipe extension,
   *  - adopting a newer round clears the stale auction end (unfreezes the
   *    winner overlay / CTA on clients that celebrated the previous round). */
  const tryAdoptAuctionStart = (adopted: AuctionStartEvt | null): boolean => {
    if (!adopted) return false;
    if (!canAdoptAuctionStart(adopted.productId, adopted.auctionRound)) return false;
    setAuctionStart((cur) => {
      if (cur && cur.productId === adopted.productId) {
        const curRound = Number(cur.auctionRound ?? 0);
        const nextRound = Number(adopted.auctionRound ?? 0);
        if (curRound > 0 && nextRound > 0 && curRound !== nextRound) {
          return nextRound > curRound ? adopted : cur;
        }
        if (cur.deadlineMs >= adopted.deadlineMs) return cur;
      }
      return adopted;
    });
    setLastAuctionEnd((cur) => {
      if (!cur || cur.productId !== adopted.productId) return cur;
      const endRound = Number(cur.auctionRound ?? 0);
      return endRound > 0 && Number(adopted.auctionRound ?? 0) > endRound ? null : cur;
    });
    return true;
  };
  /** One "X joined" announcement per viewer session (not on every reconnect). */
  const joinAnnouncedRef = useRef(false);
  /** Deduplicate gift events across broadcast + postgres_changes. */
  const seenGiftIdsRef = useRef<Set<string>>(new Set());
  const ingestGiftRef = useRef<(evt: GiftEvt) => void>(() => {});
  ingestGiftRef.current = (evt: GiftEvt) => {
    if (!evt?.id || !evt.giftKey) return;
    if (seenGiftIdsRef.current.has(evt.id)) return;
    // Only drop truly ancient events (e.g. replay on rejoin). Keep a wide
    // window — phone clocks can be minutes off and were dropping live gifts.
    if (evt.ts && Date.now() - evt.ts > 5 * 60_000) return;
    seenGiftIdsRef.current.add(evt.id);
    if (seenGiftIdsRef.current.size > 200) {
      const arr = Array.from(seenGiftIdsRef.current);
      seenGiftIdsRef.current = new Set(arr.slice(arr.length - 100));
    }
    setLastGift(evt);
  };

  // Drop ephemeral room state whenever the live changes — otherwise a prior
  // auction:end / bid / countdown can leak into the next live (or a re-open)
  // and replay confetti / winner reveal for late joiners.
  useEffect(() => {
    setReady(false);
    readyRef.current = false;
    joinAnnouncedRef.current = false;
    seenGiftIdsRef.current = new Set();
    setViewerCount(1);
    setPresentViewers([]);
    setChat([]);
    setHeartTick(0);
    setProducts([]);
    setLiveStatus(null);
    setAuctionStart(null);
    setLastAuctionEnd(null);
    setLastExtension(null);
    setLastBid(null);
    setLastGift(null);
  }, [liveId]);

  // Drop lastGift after the animation window so remounting the viewer
  // (leave → re-enter) cannot re-trigger GiftAnimationsLayer / combo.
  useEffect(() => {
    if (!lastGift) return;
    const t = window.setTimeout(() => {
      setLastGift((cur) => (cur?.id === lastGift.id ? null : cur));
    }, 8_000);
    return () => window.clearTimeout(t);
  }, [lastGift]);

  // Load initial products + rehydrate an already-running auction so late
  // joiners see the same countdown as everyone else. `auction_deadline_at`
  // is stored on the live_products row by the start_auction RPC.
  useEffect(() => {
    if (!liveId) return;
    let alive = true;
    void (async () => {
      const [p, liveRes] = await Promise.all([
        fetchLiveProducts(liveId),
        supabase.from("lives").select("status").eq("id", liveId).maybeSingle(),
      ]);
      const hydrated = await Promise.all(p.map(hydrateImage));
      if (!alive) return;
      setProducts(hydrated);
      setLiveStatus((liveRes.data?.status as "live" | "ended" | undefined) ?? null);
      // Rehydrate any active auction whose deadline is still in the future
      // (or within grace — see auctionStartFromProduct).
      const running = hydrated.find((row) => auctionStartFromProduct(row));
      if (running) {
        const start = auctionStartFromProduct(running)!;
        setAuctionStart(start);
        // Only load lastBid for the CURRENTLY active auction AND its current
        // round. Loading unfiltered would return a stale winning bid from a
        // previous auction/round, making the host finalize with a stale
        // winner (or against the wrong product) and preventing the current
        // round's actual highest bidder from being credited — the exact
        // "bidding into the void" symptom on re-auctioned items.
        const runningRound =
          (running as unknown as { auction_round?: number }).auction_round ?? 1;
        const { data: bid } = await supabase
          .from("live_bids")
          .select("product_id, bidder_id, bidder_name, amount, auction_round")
          .eq("live_id", liveId)
          .eq("product_id", running.id)
          .eq("auction_round", runningRound)
          .order("amount", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (bid && alive) {
          setLastBid({
            productId: (bid as { product_id: string }).product_id,
            bidderId: (bid as { bidder_id: string }).bidder_id,
            bidderName: (bid as { bidder_name: string }).bidder_name,
            amount: Number((bid as { amount: number }).amount),
            ts: Date.now(),
            auctionRound: Number((bid as { auction_round?: number }).auction_round ?? runningRound),
          });
        }
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
            console.warn("[live-end diag] db realtime → lives.status became 'ended'", { liveId, payload });
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
          // Apply status/price immediately — don't wait on image signing
          // (retries) or the star card stays on a finished item for seconds.
          setProducts((prev) =>
            prev.map((p) => {
              if (p.id !== row.id) return p;
              return mergeLiveProductRow(p, row);
            }),
          );
          void hydrateImage(row).then((r) =>
            setProducts((prev) =>
              prev.map((p) => (p.id === r.id ? mergeLiveProductRow(p, r) : p)),
            ),
          );
          // Fallback deadline sync — if the broadcast frame was missed, this
          // ensures viewers still adopt the persisted absolute deadline.
          tryAdoptAuctionStart(auctionStartFromProduct(row));
          // Auction finished in DB — clear local countdown if it was this product.
          if (
            row.mode === "auction" &&
            (row.status === "sold" || row.status === "unsold" || row.status === "out")
          ) {
            setAuctionStart((cur) => (cur && cur.productId === row.id ? null : cur));
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
            auction_round?: number;
          };
          const round = Number(row.auction_round ?? 1);
          console.debug("[auction-round diag] live_bids INSERT", {
            product_id: row.product_id,
            round,
            amount: row.amount,
          });
          setLastBid({
            productId: row.product_id,
            bidderId: row.bidder_id,
            bidderName: row.bidder_name,
            amount: Number(row.amount),
            ts: Date.now(),
            auctionRound: round,
          });
          // If someone else is bidding, this auction is live — recover
          // auctionStart when auction:start broadcast / product UPDATE were missed
          // (classic "En attente du vendeur" while friends keep bidding).
          void (async () => {
            const { data } = await supabase
              .from("live_products")
              .select("id, mode, status, auction_deadline_at, timer_seconds, auction_round")
              .eq("id", row.product_id)
              .maybeSingle();
            if (!data) return;
            tryAdoptAuctionStart(auctionStartFromProduct(data));
          })();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [liveId]);

  // Local rescue from already-hydrated rows — no network. Fixes viewers who
  // dropped `auction:start` / postgres_changes but still have product state
  // (classic "En attente du vendeur" while friends keep bidding).
  useEffect(() => {
    const running = products.find((row) => auctionStartFromProduct(row));
    if (!running) return;
    tryAdoptAuctionStart(auctionStartFromProduct(running));
  }, [products]);

  // Periodic rescue: some Android/iOS WebViews drop realtime frames. If the
  // DB says an auction is active but we have no local auctionStart (or the
  // wrong product), adopt it so the bid CTA unlocks. Also opportunistically
  // settle auctions whose deadline passed while the host was offline.
  useEffect(() => {
    if (!liveId) return;
    let alive = true;
    let settleCooldownUntil = 0;
    const rescue = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }
      const { data, error } = await supabase
        .from("live_products")
        .select("id, mode, status, auction_deadline_at, timer_seconds, auction_round, updated_at")
        .eq("live_id", liveId)
        .eq("mode", "auction")
        .eq("status", "active")
        .not("auction_deadline_at", "is", null)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!alive) return;
      if (error) {
        console.warn("[live-room] auction rescue fetch failed", error.message);
        return;
      }
      if (!data) return;
      const deadlineMs = data.auction_deadline_at
        ? new Date(data.auction_deadline_at).getTime()
        : 0;
      // Past deadline by >20s → ask the server sweeper to settle (host offline).
      if (deadlineMs > 0 && deadlineMs < Date.now() - 20_000 && Date.now() >= settleCooldownUntil) {
        settleCooldownUntil = Date.now() + 30_000;
        try {
          await (supabase as unknown as { rpc: (n: string, a: object) => Promise<unknown> })
            .rpc("settle_expired_auctions", { _live_id: liveId });
        } catch {
          /* ignore — next tick retries */
        }
        // Unstick local UI if the host never finalized (zombie 00:01).
        if (deadlineMs < Date.now() - 120_000) {
          setAuctionStart((cur) => (cur && cur.productId === data.id ? null : cur));
        }
        return;
      }
      if (!tryAdoptAuctionStart(auctionStartFromProduct(data))) return;
      // Keep product row fresh so the star card matches the running auction.
      setProducts((prev) => {
        const idx = prev.findIndex((p) => p.id === data.id);
        if (idx < 0) return prev;
        const row = prev[idx]!;
        if (
          row.status === data.status &&
          row.auction_deadline_at === data.auction_deadline_at
        ) {
          return prev;
        }
        return prev.map((p) =>
          p.id === data.id
            ? {
                ...p,
                status: data.status as LiveProductRow["status"],
                auction_deadline_at: data.auction_deadline_at,
                timer_seconds: data.timer_seconds ?? p.timer_seconds,
                auction_round: data.auction_round ?? p.auction_round,
              }
            : p,
        );
      });
    };
    void rescue();
    // 8s (was 1.5s): realtime + visibility rescue cover the fast path; this
    // poll is a safety net and must not keep the radio awake every 1.5s.
    const timer = window.setInterval(() => { void rescue(); }, 8_000);
    const onVis = () => {
      if (document.visibilityState === "visible") void rescue();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [liveId]);

  // Broadcast + presence channel.
  useEffect(() => {
    if (!liveId) return;
    let dead = false;
    const ch = supabase.channel(`live:${liveId}`, {
      config: { presence: { key: identity } },
    });
    channelRef.current = ch;

    ch.on("broadcast", { event: "chat" }, ({ payload }) => {
      const p = payload as ChatEvt;
      if (!p?.id || !p.text) return;
      setChat((prev) => {
        if (prev.some((m) => m.id === p.id || (p.externalId && m.externalId === p.externalId))) {
          return prev;
        }
        const next = [...prev, p];
        return next.length > 80 ? next.slice(next.length - 80) : next;
      });
    });
    ch.on("broadcast", { event: "join" }, ({ payload }) => {
      const p = payload as { id?: string; name?: string; userId?: string };
      const name = String(p?.name ?? "").trim();
      if (!name) return;
      const evt: ChatEvt = {
        id: p.id || uid(),
        user: "",
        color: "",
        text: name,
        system: true,
        systemKind: "join",
        ...(p.userId ? { userId: p.userId } : {}),
      };
      setChat((prev) => {
        if (prev.some((m) => m.id === evt.id)) return prev;
        const next = [...prev, evt];
        return next.length > 60 ? next.slice(next.length - 60) : next;
      });
    });
    ch.on("broadcast", { event: "heart" }, () => {
      setHeartTick((n) => n + 1);
    });
    ch.on("broadcast", { event: "auction:start" }, ({ payload }) => {
      const evt = payload as AuctionStartEvt;
      if (!evt?.productId || !Number.isFinite(Number(evt.deadlineMs))) return;
      const local: AuctionStartEvt = {
        productId: evt.productId,
        deadlineMs: Number(evt.deadlineMs),
        timerSec: Math.max(1, Number(evt.timerSec ?? 30)),
        ...(evt.auctionRound != null ? { auctionRound: Number(evt.auctionRound) } : {}),
      };
      // A live start frame from the host is the strongest signal — adopt it
      // and drop any celebrated end for this product (relaunch case), so the
      // CTA unfreezes immediately instead of waiting out the 90s guard.
      setAuctionStart(local);
      setLastAuctionEnd((cur) => (cur && cur.productId === local.productId ? null : cur));
      // Fresh auction round: any lastBid from the previous round MUST NOT
      // carry over — otherwise the host would auto-finalize with the
      // previous winner, and the viewer UI would still show them as the
      // current highest bidder (which is exactly the "previous winner
      // blocked from bidding" symptom on the client side).
      setLastBid((cur) => (cur && cur.productId === evt.productId ? null : cur));
      // Prefer the absolute server deadline (start_auction RPC) over the
      // broadcast payload — host/viewer phone clocks often disagree.
      void (async () => {
        const { data } = await supabase
          .from("live_products")
          .select("id, mode, status, auction_deadline_at, timer_seconds, auction_round")
          .eq("id", evt.productId)
          .maybeSingle();
        if (!data) return;
        if (!tryAdoptAuctionStart(auctionStartFromProduct(data))) return;
        setProducts((prev) =>
          prev.map((p) =>
            p.id === data.id
              ? {
                  ...p,
                  status: (data.status as LiveProductRow["status"]) ?? p.status,
                  auction_deadline_at: data.auction_deadline_at,
                  timer_seconds: data.timer_seconds ?? p.timer_seconds,
                  auction_round: data.auction_round ?? p.auction_round,
                }
              : p,
          ),
        );
      })();
    });
    ch.on("broadcast", { event: "auction:end" }, ({ payload }) => {
      const evt = payload as AuctionEndEvt;
      const full: AuctionEndEvt = {
        ...evt,
        endId: evt.endId || uid(),
        ts: evt.ts ?? Date.now(),
      };
      // Confirm with DB — a stale/replayed end must not freeze viewers on
      // "waiting for seller" while the auction is still active for others.
      void (async () => {
        const { data } = await supabase
          .from("live_products")
          .select("id, mode, status, auction_deadline_at, timer_seconds, auction_round")
          .eq("id", full.productId)
          .maybeSingle();
        if (data) {
          const adopted = auctionStartFromProduct(data);
          // DB still says active — if it's a newer round than the received
          // end (host relaunched), or adoption is otherwise allowed, keep
          // the auction running and ignore this end frame.
          if (adopted && tryAdoptAuctionStart(adopted)) return;
        }
        setLastAuctionEnd(full);
        setAuctionStart((cur) => (cur && cur.productId === full.productId ? null : cur));
        setProducts((prev) =>
          prev.map((p) => {
            if (p.id !== full.productId) return p;
            if (p.status === "sold" || p.status === "out" || p.status === "unsold") return p;
            const won = !!(full.winnerId && full.winnerName);
            return {
              ...p,
              status: won ? "sold" : "unsold",
              sold_to_identity: won ? full.winnerName : null,
              final_price: won ? full.finalPrice : null,
              price: won ? Number(full.finalPrice ?? p.price) : p.start_price,
              auction_deadline_at: null,
            };
          }),
        );
      })();
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
      ingestGiftRef.current(p);
    });

    // Durable backup: if the ephemeral broadcast is dropped, every client
    // still learns about the gift from the live_gifts INSERT (same gift id).
    ch.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "live_gifts",
        filter: `live_id=eq.${liveId}`,
      },
      (payload) => {
        const row = payload.new as {
          id: string;
          sender_id: string;
          gift_key: string;
          created_at?: string;
        };
        if (!row?.id || !row.gift_key) return;
        void (async () => {
          let senderName = "invité";
          try {
            const { data } = await supabase
              .from("profiles")
              .select("display_name, handle")
              .eq("id", row.sender_id)
              .maybeSingle();
            senderName = data?.display_name || data?.handle || senderName;
          } catch {
            /* best-effort */
          }
          ingestGiftRef.current({
            id: row.id,
            giftKey: row.gift_key,
            senderId: row.sender_id,
            senderName,
            ts: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
          });
        })();
      },
    );

    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState();
      setViewerCount(Math.max(1, Object.keys(state).length));
      const people: LivePresenceViewer[] = [];
      const seen = new Set<string>();
      for (const [key, metas] of Object.entries(state)) {
        const list = metas as Array<{
          identity?: string;
          name?: string;
          host?: boolean;
        }>;
        const m = list?.[0];
        const identity = String(m?.identity ?? key);
        if (!identity || seen.has(identity)) continue;
        seen.add(identity);
        const isHost = !!m?.host;
        // Guests / truncated LiveKit ids can't be promoted — only real profile UUIDs.
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identity);
        if (isHost || !isUuid) continue;
        people.push({
          identity,
          name: String(m?.name ?? "").trim() || identity.slice(0, 8),
          isHost,
        });
      }
      setPresentViewers(people);
    });

    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryDelay = 1_000;
    ch.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        retryDelay = 1_000;
        readyRef.current = true;
        if (!silent) {
          await ch.track({
            identity,
            name: displayName,
            host: isHost,
            joined_at: Date.now(),
          });
        }
        setReady(true);
        // TikTok-style join line for viewers (not the host, once per session).
        if (!silent && !isHost && !joinAnnouncedRef.current) {
          joinAnnouncedRef.current = true;
          const joinPayload = {
            id: uid(),
            name: displayName,
            ...(UUID_RE.test(identity) ? { userId: identity } : {}),
          };
          const joinEvt: ChatEvt = {
            id: joinPayload.id,
            user: "",
            color: "",
            text: displayName,
            system: true,
            systemKind: "join",
            ...(joinPayload.userId ? { userId: joinPayload.userId } : {}),
          };
          setChat((prev) => {
            const next = [...prev, joinEvt];
            return next.length > 60 ? next.slice(next.length - 60) : next;
          });
          void ch.send({ type: "broadcast", event: "join", payload: joinPayload });
        }
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        // Supabase realtime doesn't auto-resubscribe on error/close — do it
        // ourselves with exponential backoff so a network blip during a
        // live doesn't kill chat/hearts/presence for the rest of the
        // session. 15s ceiling keeps recovery fast without stampeding.
        // `dead` stops removeChannel's own CLOSED from arming a zombie retry.
        if (dead) return;
        readyRef.current = false;
        setReady(false);
        if (retryTimer != null) return;
        retryTimer = setTimeout(() => {
          retryTimer = null;
          if (dead) return;
          try { void ch.subscribe(); } catch { /* channel already gone */ }
        }, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 15_000);
      }
    });


    return () => {
      dead = true;
      if (retryTimer != null) clearTimeout(retryTimer);
      retryTimer = null;
      readyRef.current = false;
      setReady(false);
      setPresentViewers([]);
      supabase.removeChannel(ch);
      channelRef.current = null;
    };

  }, [liveId, identity, displayName, isHost, silent]);

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
      presentViewers,
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
        const full: GiftEvt = {
          giftKey: evt.giftKey,
          senderId: evt.senderId,
          senderName: evt.senderName,
          id: evt.id || uid(),
          ts: Date.now(),
        };
        ingestGiftRef.current(full);
        // Retry while the channel is reconnecting — money already moved via RPC;
        // postgres_changes is the backup if every attempt still fails.
        void (async () => {
          for (let attempt = 0; attempt < 6; attempt++) {
            const ch = channelRef.current;
            if (ch && readyRef.current) {
              try {
                const status = await ch.send({
                  type: "broadcast",
                  event: "gift",
                  payload: full,
                });
                if (status === "ok") return;
              } catch {
                /* retry */
              }
            }
            await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
          }
        })();
      },
      sendChat: (text: string, replyTo?: ChatReplyTo) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        const reply = replyTo
          ? {
              user: replyTo.user,
              text: replyTo.text.trim().slice(0, 120),
              ...(replyTo.userId ? { userId: replyTo.userId } : {}),
            }
          : undefined;
        const evt: ChatEvt = {
          id: uid(),
          user: displayName,
          color: colorFor(identity),
          text: trimmed,
          source: "kidi",
          ...(UUID_RE.test(identity) ? { userId: identity } : {}),
          ...(isModerator && !isHost ? { isModerator: true } : {}),
          ...(isHost ? { isHost: true } : {}),
          ...(reply ? { replyTo: reply } : {}),
        };
        // Optimistic local echo + broadcast to others.
        setChat((prev) => [...prev, evt].slice(-80));
        void channelRef.current?.send({ type: "broadcast", event: "chat", payload: evt });
      },
      ingestExternalChat: (evt: ChatEvt) => {
        if (!evt?.id || !evt.text?.trim()) return;
        setChat((prev) => {
          if (
            prev.some(
              (m) =>
                m.id === evt.id ||
                (!!evt.externalId && m.externalId === evt.externalId),
            )
          ) {
            return prev;
          }
          const next = [...prev, evt];
          return next.length > 80 ? next.slice(next.length - 80) : next;
        });
        void channelRef.current?.send({
          type: "broadcast",
          event: "chat",
          payload: evt,
        });
      },
      sendHeart: () => {
        setHeartTick((n) => n + 1); // local
        void channelRef.current?.send({ type: "broadcast", event: "heart", payload: {} });
      },
      broadcastAuctionStart: (evt) => {
        setAuctionStart(evt);
        // Relaunch: the celebrated end of the previous round must not linger
        // (it blocks re-adoption guards and the winner overlay).
        setLastAuctionEnd((cur) => (cur && cur.productId === evt.productId ? null : cur));
        // Fresh round on the host too — do NOT carry over the previous
        // round's lastBid (see auction:start receiver comment).
        setLastBid((cur) => (cur && cur.productId === evt.productId ? null : cur));
        void channelRef.current?.send({ type: "broadcast", event: "auction:start", payload: evt });
      },
      broadcastAuctionEnd: (evt) => {
        // Always stamp a unique endId so host echo + every re-win can be
        // distinguished (orderId / price / winner alone are NOT unique enough).
        const full: AuctionEndEvt = {
          ...evt,
          endId: evt.endId || uid(),
          ts: evt.ts ?? Date.now(),
        };
        setLastAuctionEnd(full);
        setAuctionStart((cur) => (cur && cur.productId === full.productId ? null : cur));
        // Optimistic status so the host star card can advance to the next
        // article immediately — don't wait for postgres_changes + image hydrate.
        setProducts((prev) =>
          prev.map((p) => {
            if (p.id !== full.productId) return p;
            if (p.status === "sold" || p.status === "out" || p.status === "unsold") return p;
            const won = !!(full.winnerId && full.winnerName);
            return {
              ...p,
              status: won ? "sold" : "unsold",
              sold_to_identity: won ? full.winnerName : null,
              final_price: won ? full.finalPrice : null,
              price: won ? Number(full.finalPrice ?? p.price) : p.start_price,
              auction_deadline_at: null,
            };
          }),
        );
        void channelRef.current?.send({ type: "broadcast", event: "auction:end", payload: full });
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
        const trimmed = text.trim();
        if (!trimmed) return;
        const evt: ChatEvt = {
          id: uid(),
          user: "",
          color: "",
          text: trimmed,
          system: true,
        };
        setChat((prev) => [...prev, evt].slice(-60));
        // Broadcast so viewers + social egress see host system lines
        // (e.g. "Mettre en vente — …"), not only the host's local chat.
        void channelRef.current?.send({
          type: "broadcast",
          event: "chat",
          payload: evt,
        });
      },
    }),
    [
      ready,
      viewerCount,
      presentViewers,
      chat,
      heartTick,
      products,
      liveStatus,
      auctionStart,
      lastAuctionEnd,
      lastExtension,
      lastBid,
      lastGift,
      identity,
      displayName,
      isHost,
      isModerator,
    ],
  );
}
