import { useEffect, useRef, useState } from "react";
import type { LiveRoomState } from "@/lib/live-room";
import { nextBidAmount, normalizeCurrency } from "@/lib/money";
import {
  fetchPrelaunchLiveSimConfig,
  getCachedPrelaunchLiveSimConfig,
  initialSimViewerCount,
  isSimBidderId,
  nextBidDelayMs,
  nextCommentDelayMs,
  nextSimViewerCount,
  nextViewerTickMs,
  randomSimChat,
  randomSimName,
  simBidderId,
  simColorFor,
  subscribePrelaunchLiveSim,
  type PrelaunchLiveSimConfig,
} from "@/lib/prelaunch-live-sim";

/** Host-only crowd for pre-launch filming. Driven by admin « Simu » config — no per-live UI. */
export function usePrelaunchLiveSim(args: {
  room: LiveRoomState;
  currency: string;
  appActive: boolean;
}) {
  const { room, currency, appActive } = args;
  const [cfg, setCfg] = useState<PrelaunchLiveSimConfig>(() => getCachedPrelaunchLiveSimConfig());
  const roomRef = useRef(room);
  roomRef.current = room;
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;
  const cur = normalizeCurrency(currency);
  const enabled = cfg.enabled;

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const next = await fetchPrelaunchLiveSimConfig();
      if (!cancelled) setCfg(next);
    };
    void refresh();
    const id = window.setInterval(() => {
      void refresh();
    }, 20_000);
    const onVis = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    const unsub = subscribePrelaunchLiveSim((next) => {
      if (!cancelled) setCfg(next);
    });
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      unsub();
    };
  }, []);

  // Viewer pill oscillating between admin min/max.
  useEffect(() => {
    if (!enabled || !appActive || !room.ready) return;
    const { viewersMin, viewersMax } = cfgRef.current;
    let count = initialSimViewerCount(viewersMin, viewersMax);
    let dir: 1 | -1 = 1;
    roomRef.current.broadcastSimViewers(count);
    let timer = 0;
    const tick = () => {
      const c = cfgRef.current;
      const next = nextSimViewerCount(count, dir, c.viewersMin, c.viewersMax);
      count = next.count;
      dir = next.dir;
      roomRef.current.broadcastSimViewers(count);
      timer = window.setTimeout(tick, nextViewerTickMs());
    };
    timer = window.setTimeout(tick, 900);
    return () => window.clearTimeout(timer);
  }, [enabled, appActive, room.ready, cfg.viewersMin, cfg.viewersMax]);

  // Chat + join lines + occasional hearts.
  useEffect(() => {
    if (!enabled || !appActive || !room.ready) return;
    let seq = 0;
    let timer = 0;
    const tick = () => {
      const c = cfgRef.current;
      const r = roomRef.current;
      const auctionHot = !!r.auctionStart;
      const line = randomSimChat(auctionHot);
      seq += 1;
      if (line.join) {
        r.ingestExternalChat({
          id: `sim-join-${Date.now()}-${seq}`,
          user: "",
          color: "",
          text: line.name,
          system: true,
          systemKind: "join",
        });
      } else {
        r.ingestExternalChat({
          id: `sim-chat-${Date.now()}-${seq}`,
          user: line.name,
          color: simColorFor(line.name),
          text: line.text,
        });
      }
      if (Math.random() * 100 < c.heartChancePct) r.sendHeart();
      timer = window.setTimeout(tick, nextCommentDelayMs(c));
    };
    timer = window.setTimeout(tick, 600);
    return () => window.clearTimeout(timer);
  }, [
    enabled,
    appActive,
    room.ready,
    cfg.commentEverySecMin,
    cfg.commentEverySecMax,
    cfg.heartChancePct,
  ]);

  // Fake bids for the running auction until ~1.2s before the bell.
  useEffect(() => {
    if (!enabled || !cfg.fakeBids || !appActive || !room.ready) return;
    const auction = room.auctionStart;
    if (!auction) return;
    let timer = 0;
    let used = new Set<string>();
    const tick = () => {
      const c = cfgRef.current;
      if (!c.fakeBids) return;
      const r = roomRef.current;
      const start = r.auctionStart;
      if (!start || start.productId !== auction.productId) return;
      const left = start.deadlineMs - Date.now();
      if (left < 1200) return;
      const product = r.products.find((p) => p.id === start.productId);
      if (!product || product.status !== "active") {
        timer = window.setTimeout(tick, 1200);
        return;
      }
      const last = r.lastBid;
      if (
        last &&
        last.productId === start.productId &&
        !isSimBidderId(last.bidderId)
      ) {
        timer = window.setTimeout(tick, 2000);
        return;
      }
      let name = randomSimName();
      if (used.has(name) && used.size < 20) {
        for (let i = 0; i < 6; i++) {
          const n = randomSimName();
          if (!used.has(n)) {
            name = n;
            break;
          }
        }
      }
      used.add(name);
      const amount = nextBidAmount(Number(product.price) || 0, cur);
      const round = Number(product.auction_round ?? start.auctionRound ?? 1);
      r.broadcastSimBid({
        productId: start.productId,
        bidderId: simBidderId(name),
        bidderName: name,
        amount,
        auctionRound: round,
      });
      timer = window.setTimeout(tick, nextBidDelayMs(c));
    };
    timer = window.setTimeout(tick, 900 + Math.random() * 700);
    return () => window.clearTimeout(timer);
  }, [
    enabled,
    cfg.fakeBids,
    cfg.bidEverySecMin,
    cfg.bidEverySecMax,
    appActive,
    room.ready,
    room.auctionStart?.productId,
    room.auctionStart?.deadlineMs,
    cur,
  ]);
}
