import { useCallback, useMemo, useState } from "react";
import { Eye, Heart, Send, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { LiveChat } from "./live-chat";
import { FloatingHearts } from "./floating-hearts";
import { StressTestPanel } from "./stress-test-panel";
import type { ChatEvt, LiveRoomState } from "@/lib/live-room";

const MAX_CHAT = 150;

export function LocalStressLiveScreen() {
  const [chat, setChat] = useState<ChatEvt[]>([
    {
      id: "stress-welcome",
      user: "",
      color: "",
      text: "Mode test local prêt — appuie sur Burst 1k ou Burst 2k.",
      system: true,
    },
  ]);
  const [heartTick, setHeartTick] = useState(0);
  const [viewerCount, setViewerCount] = useState(1_247);

  const injectLocalChat = useCallback((msgs: ChatEvt[]) => {
    if (msgs.length === 0) return;
    setChat((prev) => {
      const next = prev.concat(msgs);
      return next.length > MAX_CHAT ? next.slice(next.length - MAX_CHAT) : next;
    });
    setViewerCount((n) => Math.min(2_000, n + Math.max(1, Math.floor(msgs.length / 40))));
  }, []);

  const injectLocalHearts = useCallback((n: number) => {
    if (n <= 0) return;
    setHeartTick((v) => v + n);
  }, []);

  const room = useMemo<LiveRoomState>(
    () => ({
      ready: true,
      viewerCount,
      chat,
      heartTick,
      products: [],
      liveStatus: "live",
      auctionStart: null,
      lastAuctionEnd: null,
      lastExtension: null,
      lastBid: null,
      sendChat: (text: string) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        injectLocalChat([
          {
            id: `local-${Date.now()}`,
            user: "toi",
            color: "oklch(0.78 0.14 200)",
            text: trimmed,
          },
        ]);
      },
      sendHeart: () => injectLocalHearts(1),
      broadcastAuctionStart: () => {},
      broadcastAuctionEnd: () => {},
      broadcastAuctionExtend: () => {},
      systemMessage: (text: string) =>
        injectLocalChat([{ id: `system-${Date.now()}`, user: "", color: "", text, system: true }]),
      injectLocalChat,
      injectLocalHearts,
    }),
    [chat, heartTick, injectLocalChat, injectLocalHearts, viewerCount],
  );

  return (
    <main className="fixed inset-0 overflow-hidden bg-black text-white">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage:
            "url(https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=1200&q=70)",
        }}
      />
      <div className="absolute inset-0 bg-black/35" />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2"
        style={{ backgroundImage: "linear-gradient(to top, rgba(0,0,0,0.82), rgba(0,0,0,0))" }}
      />

      <header className="absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-3 px-3 pt-3">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-black" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.7)" }}>
            KiDi+ Stress Live
          </p>
          <p className="mt-0.5 text-[12px] text-white/80" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.7)" }}>
            Simulation locale · aucun vrai message envoyé
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1 rounded-full bg-black/45 px-2 py-1 text-[12px] font-semibold tabular-nums backdrop-blur">
            <Eye size={13} /> {viewerCount}
          </div>
          <Link
            to="/"
            aria-label="Fermer"
            className="grid h-9 w-9 place-items-center rounded-full bg-black/45 backdrop-blur"
          >
            <X size={18} />
          </Link>
        </div>
      </header>

      <div className="absolute inset-x-0 z-20" style={{ bottom: "calc(env(safe-area-inset-bottom) + 148px)" }}>
        <LiveChat messages={chat} />
      </div>

      <div
        className="absolute inset-x-0 bottom-0 z-30 flex items-center gap-2 px-3 pb-safe"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 10px)" }}
      >
        <input
          readOnly
          value=""
          placeholder="Test local..."
          className="min-w-0 flex-1 rounded-full px-4 py-2.5 text-[14px] text-white outline-none placeholder:text-white/60"
          style={{
            backgroundColor: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            border: "1px solid rgba(255,255,255,0.15)",
          }}
        />
        <button className="grid h-11 w-11 place-items-center rounded-full bg-black/50 text-white" aria-label="Envoyer">
          <Send size={17} />
        </button>
        <button
          className="grid h-11 w-11 place-items-center rounded-full bg-black/50 text-white"
          aria-label="Cœur"
          onClick={() => injectLocalHearts(1)}
        >
          <Heart size={17} fill="currentColor" />
        </button>
      </div>

      <FloatingHearts trigger={heartTick} />
      <StressTestPanel room={room} />
    </main>
  );
}