import { useEffect, useRef } from "react";
import type { LiveRoomState } from "@/lib/live-room";
import { nextBidAmount, normalizeCurrency } from "@/lib/money";
import {
  initialSimViewerCount,
  isPrelaunchLiveSimEnabled,
  isSimBidderId,
  nextSimViewerCount,
  randomSimChat,
  randomSimName,
  simBidderId,
  simColorFor,
} from "@/lib/prelaunch-live-sim";

/** Host-only crowd for pre-launch filming. No-op when the flag is off. */
export function usePrelaunchLiveSim(args: {
  room: LiveRoomState;
  currency: string;
  appActive: boolean;
}) {
  const { room, currency, appActive } = args;
  const enabled = isPrelaunchLiveSimEnabled();
  const roomRef = useRef(room);
  roomRef.current = room;
  const cur = normalizeCurrency(currency);

  // Viewer pill 50–160, oscillating.
  useEffect(() => {
    if (!enabled || !appActive || !room.ready) return;
    let count = initialSimViewerCount();
    let dir: 1 | -1 = 1;
    roomRef.current.broadcastSimViewers(count);
    let timer = 0;
    const tick = () => {
      const next = nextSimViewerCount(count, dir);
      count = next.count;
      dir = next.dir;
      roomRef.current.broadcastSimViewers(count);
      timer = window.setTimeout(tick, 1600 + Math.random() * 2400);
    };
    timer = window.setTimeout(tick, 900);
    return () => window.clearTimeout(timer);
  }, [enabled, appActive, room.ready]);

  // Chat + join lines + occasional hearts.
  useEffect(() => {
    if (!enabled || !appActive || !room.ready) return;
    let seq = 0;
    let timer = 0;
    const tick = () => {
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
      if (Math.random() < 0.18) r.sendHeart();
      timer = window.setTimeout(tick, 700 + Math.random() * 1600);
    };
    timer = window.setTimeout(tick, 600);
    return () => window.clearTimeout(timer);
  }, [enabled, appActive, room.ready]);

  // Fake bids for the running auction until ~1.2s before the bell.
  useEffect(() => {
    if (!enabled || !appActive || !room.ready) return;
    const auction = room.auctionStart;
    if (!auction) return;
    let timer = 0;
    let used = new Set<string>();
    const tick = () => {
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
        // A real viewer took over — stop stacking fake bids on top.
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
      timer = window.setTimeout(tick, 1100 + Math.random() * 2000);
    };
    timer = window.setTimeout(tick, 900 + Math.random() * 700);
    return () => window.clearTimeout(timer);
  }, [
    enabled,
    appActive,
    room.ready,
    room.auctionStart?.productId,
    room.auctionStart?.deadlineMs,
    cur,
  ]);
}
