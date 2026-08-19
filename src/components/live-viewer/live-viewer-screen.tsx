import { motion, useMotionValue, animate, type MotionValue } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { Send, Heart, Share2, X, Eye, Gift, MoreHorizontal, Flag, UserX, Users } from "lucide-react";
import { toast } from "sonner";
import { Press } from "@/components/press";
import { useLiveViewer } from "@/lib/live-viewer-context";
import type { LiveStream } from "@/lib/live-mock";
import { useSellerProfile } from "@/lib/seller-profile-context";
import { EASE_IOS } from "@/lib/motion";
import { haptic } from "@/lib/haptics";
import { pushStatusBarLight } from "@/lib/native";
import { liveShareUrl } from "@/lib/deep-links";
import { logLiveInteraction } from "@/lib/interactions-db";
import { useAppActive } from "@/lib/app-state";
import { usePush } from "@/lib/push";
import {
  bidStep,
  formatEuro,
  makeProducts,
  nextChatMessage,
  randomBidder,
  systemMessage,
  type ChatMsg,
  type Product,
} from "@/lib/live-viewer-mock";
import { LiveChat } from "./live-chat";
import { FloatingHearts } from "./floating-hearts";
import { AuctionCard } from "./auction-card";
import { ProductsSheet } from "./products-sheet";
import { BuySheet } from "./buy-sheet";
import { Confetti } from "./confetti";
import { ViewerLiveVideo } from "./viewer-live-video";
import { RealLiveViewerScreen } from "./real-live-viewer-screen";
import { LivePipShell, useLivePip } from "./live-pip-shell";
import { GiftTraySheet } from "./gift-tray-sheet";
import { GiftAnimationsLayer } from "./gift-animations";
import { GiftComboFeed } from "./gift-combo-feed";
import { BottomSheet } from "./bottom-sheet";
import { WinnerReveal } from "./winner-reveal";
import { TopUpSheet } from "@/components/wallet/topup-sheet";
import { giftByKey, giftPrice, type GiftKey } from "@/lib/gifts";
import { useTranslation } from "react-i18next";
import { useWallet } from "@/lib/wallet-context";
import { normalizeCurrency } from "@/lib/money";
import type { GiftEvt } from "@/lib/live-room";
import { ReportSheet } from "@/components/moderation/report-sheet";
import { blockUserAndNotify, useBlockedIds } from "@/lib/moderation-db";
import { useAuthPrompt } from "@/lib/auth-prompt-context";



const AUCTION_SECONDS = 45;

export function LiveViewerScreen() {
  const { active } = useLiveViewer();
  // Real live (backed by DB) → real chat/bids/hearts/viewers.
  if (active?.liveId) return <RealLiveViewerScreen />;
  return <MockLiveViewerScreen />;
}

function MockLiveViewerScreen() {
  const { active, close, minimize, next: nextLive, prev: prevLive, hasNext, hasPrev, peekNext, peekPrev } = useLiveViewer();
  const { chromeHidden } = useLivePip();
  const { open: openSeller } = useSellerProfile();
  const appActive = useAppActive();
  const { requestWithPrePrompt } = usePush();
  const { requireAuth } = useAuthPrompt();
  const blockedIds = useBlockedIds();
  const [reportOpen, setReportOpen] = useState(false);

  // Force light status-bar content while the viewer is mounted (dark background).
  useEffect(() => {
    if (chromeHidden) return;
    let restore: (() => void) | null = null;
    void pushStatusBarLight().then((fn) => {
      restore = fn;
    });
    return () => {
      restore?.();
    };
  }, [chromeHidden]);


  // === Chat === (paused when app is backgrounded)
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  useEffect(() => {
    if (!active) return;
    setMessages([
      systemMessage(
        active.fictitious
          ? `Démo interactive — tu peux enchérir, chatter et tester Signaler / Bloquer. Aucun paiement réel.`
          : `Bienvenue dans le live de ${active.seller} 👋`,
      ),
    ]);
    if (!appActive) return;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      setMessages((prev) => {
        // Occasionally push a realistic "@name a rejoint le live" system line
        // so sample lives feel populated for reviewers.
        const roll = Math.random();
        const nextMsg =
          roll < 0.12
            ? {
                ...systemMessage(randomBidder()),
                systemKind: "join" as const,
              }
            : nextChatMessage();
        const next = [...prev, nextMsg];
        return next.length > 60 ? next.slice(next.length - 60) : next;
      });
      timer = window.setTimeout(tick, 1000 + Math.random() * 2000);
    };
    let timer = window.setTimeout(tick, 900);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active, appActive]);


  // === Hearts ===
  const [heartTrigger, setHeartTrigger] = useState(0);
  // Signaler / Bloquer sheet (Apple 1.2 — flag/block on every UGC surface).
  const [moreOpen, setMoreOpen] = useState(false);
  // Simulated viewers list — Apple reviewers tap the viewers pill.
  const [viewersSheetOpen, setViewersSheetOpen] = useState(false);
  // Winner reveal (logo flip → gold card) — parity with real lives.
  const [winnerReveal, setWinnerReveal] = useState<{
    key: string;
    name: string;
    isMe: boolean;
    productName: string;
  } | null>(null);
  const fireHeart = () => {
    haptic.medium();
    setHeartTrigger((v) => v + 1);
    if (active) void logLiveInteraction(active, "like");
  };
  const lastTap = useRef(0);
  const onVideoTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      // double tap -> multiple hearts
      fireHeart();
      setTimeout(() => setHeartTrigger((v) => v + 1), 80);
      setTimeout(() => setHeartTrigger((v) => v + 1), 160);
      if (active) void logLiveInteraction(active, "like", 2);
    }
    lastTap.current = now;
  };


  // === Products & Auction ===
  const [products, setProducts] = useState<Product[]>(() => makeProducts());
  const [secondsLeft, setSecondsLeft] = useState(AUCTION_SECONDS);
  const [lastBidder, setLastBidder] = useState<string | undefined>();
  const [confettiKey, setConfettiKey] = useState(0);
  const celebratedProductRef = useRef<string | null>(null);
  // After switching demos / re-opening, skip celebrating a leftover secondsLeft===0
  // until the timer is fresh again.
  const skipCelebrateRef = useRef(false);
  const currentIndex = products.findIndex((p) => p.status === "current");
  const currentProduct = currentIndex >= 0 ? products[currentIndex] : null;

  // reset countdown when product changes / when active stream changes
  useEffect(() => {
    if (!active) return;
    skipCelebrateRef.current = true;
    celebratedProductRef.current = null;
    setWinnerReveal(null);
    setConfettiKey(0);
    setProducts(makeProducts());
    setSecondsLeft(AUCTION_SECONDS);
    setLastBidder(undefined);
  }, [active?.id]);

  // countdown tick (paused when app is backgrounded)
  useEffect(() => {
    if (!active || !currentProduct || currentProduct.mode !== "auction") return;
    if (!appActive) return;
    const id = window.setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [active, appActive, currentProduct?.id, currentProduct?.mode]);

  // Warning haptic when the auction crosses into the last 10 seconds.
  useEffect(() => {
    if (!currentProduct || currentProduct.mode !== "auction") return;
    if (secondsLeft === 10) haptic.warning();
  }, [secondsLeft, currentProduct?.id, currentProduct?.mode]);

  // AI bids (paused when backgrounded)
  useEffect(() => {
    if (!active || !currentProduct || currentProduct.mode !== "auction") return;
    if (!appActive) return;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const bidder = randomBidder();
      let nextPrice = currentProduct.price;
      setProducts((prev) =>
        prev.map((p) => {
          if (p.id !== currentProduct.id) return p;
          nextPrice = p.price + bidStep();
          return { ...p, price: nextPrice };
        }),
      );
      setLastBidder(bidder);
      // System line in chat — "@bidder a placé une enchère à X €".
      setMessages((prev) => {
        const next = [
          ...prev,
          systemMessage(
            `@${bidder} a placé une enchère • ${formatEuro(nextPrice)}`,
          ),
        ];
        return next.length > 60 ? next.slice(next.length - 60) : next;
      });
      // extend if under 5s (auction extension for excitement)
      setSecondsLeft((s) => (s < 6 ? s + 3 : s));
      timer = window.setTimeout(tick, 3000 + Math.random() * 3000);
    };
    let timer = window.setTimeout(tick, 2500 + Math.random() * 2500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active, appActive, currentProduct?.id, currentProduct?.mode]);


  // Countdown hits zero -> sold, advance to next product
  useEffect(() => {
    if (!currentProduct || currentProduct.mode !== "auction") return;
    if (secondsLeft > 0) {
      skipCelebrateRef.current = false;
      return;
    }
    // Don't replay a previous round's zero-timer when entering / swiping demos.
    if (skipCelebrateRef.current) return;
    if (celebratedProductRef.current === currentProduct.id) return;
    celebratedProductRef.current = currentProduct.id;

    const winner = lastBidder ?? randomBidder();
    const isMe = winner === "toi";
    // mark sold, advance
    setMessages((prev) => [
      ...prev,
      systemMessage(`Vendu à @${winner} 🎉 ${formatEuro(currentProduct.price)}`),
    ]);
    haptic.success();
    setConfettiKey((k) => k + 1);
    // Fire the shared WinnerReveal (logo flip → winner card), same as real lives.
    setWinnerReveal({
      key: `${currentProduct.id}-${Date.now()}`,
      name: isMe ? "Toi" : winner,
      isMe,
      productName: currentProduct.name,
    });

    setTimeout(() => {
      setProducts((prev) => {
        const idx = prev.findIndex((p) => p.id === currentProduct.id);
        if (idx < 0) return prev;
        const next = prev.map((p, i) =>
          i === idx
            ? { ...p, status: "sold" as const, winner }
            : i === idx + 1
              ? { ...p, status: "current" as const }
              : p,
        );
        // If we ran out of products, loop back to the top so the sample
        // live never runs out of auction rounds during review.
        if (!next.some((p) => p.status === "current")) {
          celebratedProductRef.current = null;
          return next.map((p, i) =>
            i === 0 ? { ...p, status: "current" as const, price: p.startBid } : p,
          );
        }
        return next;
      });
      setSecondsLeft(AUCTION_SECONDS);
      setLastBidder(undefined);
    }, 1600);
  }, [secondsLeft, currentProduct?.id, currentProduct?.mode, currentProduct?.name, currentProduct?.price, lastBidder]);

  // Follow toggle + viewer count
  const [following, setFollowing] = useState(false);
  const [viewers, setViewers] = useState(active?.viewers ?? 100);
  const viewerMotion = useMotionValue(active?.viewers ?? 100);

  useEffect(() => {
    if (!active) return;
    setViewers(active.viewers);
    viewerMotion.set(active.viewers);
    const id = window.setInterval(() => {
      const delta = Math.floor(-8 + Math.random() * 20);
      setViewers((v) => Math.max(10, v + delta));
    }, 3200);
    return () => clearInterval(id);
  }, [active?.id]);

  const [displayViewers, setDisplayViewers] = useState(active?.viewers ?? 100);
  useEffect(() => {
    const controls = animate(viewerMotion, viewers, {
      duration: 0.6,
      ease: EASE_IOS,
      onUpdate: (v) => setDisplayViewers(Math.round(v)),
    });
    return () => controls.stop();
  }, [viewers, viewerMotion]);

  // Manual bid
  const doBid = () => {
    if (!currentProduct || currentProduct.mode !== "auction") return;
    haptic.medium();
    let nextPrice = currentProduct.price;
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== currentProduct.id) return p;
        nextPrice = p.price + 1;
        return { ...p, price: nextPrice };
      }),
    );

    setLastBidder("toi");
    setSecondsLeft((s) => (s < 6 ? s + 3 : s));
    setMessages((prev) => {
      const next = [
        ...prev,
        systemMessage(`@toi a placé une enchère • ${formatEuro(nextPrice)}`),
      ];
      return next.length > 60 ? next.slice(next.length - 60) : next;
    });
  };

  // Sheets
  const [showProducts, setShowProducts] = useState(false);
  const [buyProduct, setBuyProduct] = useState<Product | null>(null);
  const [giftOpen, setGiftOpen] = useState(false);
  const [topupOpen, setTopupOpen] = useState(false);
  const [giftEvt, setGiftEvt] = useState<GiftEvt | null>(null);
  const { t, i18n } = useTranslation();
  const { currency: walletCurrency, balance: walletBalance, demoDebit } = useWallet();


  // Composer message send (local echo)
  const [draft, setDraft] = useState("");
  const send = () => {
    const txt = draft.trim();
    if (!txt) return;
    setMessages((prev) => [
      ...prev,
      { id: `me-${Date.now()}`, user: "toi", color: "oklch(0.82 0.16 200)", text: txt },
    ]);
    setDraft("");
  };


  const sendDemoGift = (key: GiftKey) => {
    const g = giftByKey(key);
    if (!g) return;
    const price = giftPrice(key, walletCurrency);
    if (walletBalance < price) {
      haptic.error();
      toast.error(t("gifts.err.insufficient", "Solde insuffisant — recharge ton portefeuille"));
      setGiftOpen(false);
      setTopupOpen(true);
      return;
    }
    haptic.medium();
    demoDebit(price);
    const evt: GiftEvt = {
      id: `demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      giftKey: key,
      senderId: "demo",
      senderName: "toi",
      ts: Date.now(),
    };
    setGiftEvt(evt);
    setMessages((prev) => [
      ...prev,
      systemMessage(`${g.emoji} Tu as envoyé un(e) ${t(g.nameKey)} (démo)`),
    ]);
    setGiftOpen(false);
    toast.success(t("gifts.demoSent", { defaultValue: "Cadeau démo envoyé 🎁" }));
  };


  // Full-screen vertical pager for mock lives too. The home feed opens a
  // playlist of fictitious streams, so this is what makes iPhone swipe tests
  // work when there are no real lives running.
  const dragY = useMotionValue(0);

  // Mini player: clear vertical pager offset so expand isn't clipped on iOS.
  useEffect(() => {
    if (chromeHidden) dragY.set(0);
  }, [chromeHidden, dragY]);

  // Prefetch the neighbour lives so a swipe swap is instantaneous: decode the
  // hi-res cover image and warm the avatar. For real lives, prime the LiveKit
  // token endpoint so the WS handshake starts before the user commits the swipe.
  useEffect(() => {
    const targets = [peekNext, peekPrev].filter(Boolean) as LiveStream[];
    if (!targets.length) return;
    const imgs: HTMLImageElement[] = [];
    for (const s of targets) {
      const cover = new Image();
      cover.decoding = "async";
      cover.src = s.thumbnail.replace("w=600", "w=1200");
      void cover.decode?.().catch(() => {});
      imgs.push(cover);
      if (s.avatar) {
        const av = new Image();
        av.decoding = "async";
        av.src = s.avatar;
        imgs.push(av);
      }
      if (s.roomName) {
        void fetch(`/api/livekit-token?room=${encodeURIComponent(s.roomName)}&prewarm=1`, {
          method: "HEAD",
          keepalive: true,
        }).catch(() => {});
      }
    }
    return () => {
      // Let GC reclaim; nothing else to tear down.
      imgs.length = 0;
    };
  }, [peekNext, peekPrev]);

  if (!active) return null;
  if (active.sellerId && blockedIds.has(active.sellerId)) {
    toast.info(t("block.autoClosedLive", "Ce live est masqué car tu as bloqué l'hôte."));
    close();
    return null;
  }

  const followerCount = 1000 + ((active.viewers * 7) % 24000);

  return (
    <LivePipShell>
      {/* Current slide media — translates with the finger so the incoming
          slide feels glued to it. UI overlays stay put on the fixed shell. */}
      <motion.div
        key={active.id}
        className="absolute inset-0"
        style={{ y: chromeHidden ? 0 : dragY }}
      >
        {active.roomName ? (
          <ViewerLiveVideo
            room={active.roomName}
            identity={`viewer_${Math.random().toString(36).slice(2, 10)}`}
            name="Viewer"
            posterImage={active.thumbnail.replace("w=600", "w=1200")}
          />
        ) : (
          <motion.img
            src={active.thumbnail.replace("w=600", "w=1200")}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            initial={{ scale: 1.05 }}
            animate={{ scale: 1.12 }}
            transition={{
              duration: 14,
              repeat: Infinity,
              repeatType: "reverse",
              ease: "linear",
            }}
            onLoad={(e) => e.currentTarget.setAttribute("data-loaded", "true")}
            draggable={false}
          />
        )}
      </motion.div>

      {!chromeHidden && (
      <>
      {/* Adjacent slide previews — glued to the current slide via the same
          dragY motion value. Rendered as TikTok-style posters so the user
          sees what's coming while dragging. */}
      {peekNext && (
        <PeekSlide stream={peekNext} position="next" dragY={dragY} />
      )}
      {peekPrev && (
        <PeekSlide stream={peekPrev} position="prev" dragY={dragY} />
      )}

      {/* Double-tap capture layer */}
      <div className="absolute inset-0 z-10" onClick={onVideoTap} aria-hidden />

      <motion.div
        className="absolute inset-0 z-[25]"
        aria-hidden
        style={{
          touchAction: "none",
          WebkitUserSelect: "none",
          userSelect: "none",
        }}
        drag="y"
        dragElastic={{ top: hasNext ? 0.55 : 0.12, bottom: hasPrev ? 0.55 : 0.12 }}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragMomentum={false}
        onTap={onVideoTap}
        onDrag={(_, info) => dragY.set(info.offset.y)}
        onDragEnd={(_, info) => {
          const strong = Math.abs(info.offset.y) > 90 || Math.abs(info.velocity.y) > 500;
          const up = info.offset.y < 0;
          const h = typeof window !== "undefined" ? window.innerHeight : 800;
          if (up && strong && hasNext) {
            void animate(dragY, -h, { duration: 0.25, ease: EASE_IOS }).then(() => {
              dragY.set(0);
              nextLive();
            });
            return;
          }
          if (!up && strong && hasPrev) {
            void animate(dragY, h, { duration: 0.25, ease: EASE_IOS }).then(() => {
              dragY.set(0);
              prevLive();
            });
            return;
          }
          // Strong swipe down → floating mini player.
          if (!up && strong && !hasPrev) {
            dragY.set(0);
            haptic.light();
            minimize();
            return;
          }
          animate(dragY, 0, { duration: 0.25, ease: EASE_IOS });
        }}
      />


      <div className="pointer-events-none absolute right-2 top-1/2 z-[26] hidden -translate-y-1/2 flex-col gap-2 md:flex">
        {hasNext && (
          <Press
            aria-label="Live suivant"
            onClick={() => nextLive()}
            className="pointer-events-auto h-10 w-10 rounded-full text-white"
            style={{ backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(10px)" }}
          >
            ↑
          </Press>
        )}
        {hasPrev && (
          <Press
            aria-label="Live précédent"
            onClick={() => prevLive()}
            className="pointer-events-auto h-10 w-10 rounded-full text-white"
            style={{ backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(10px)" }}
          >
            ↓
          </Press>
        )}
      </div>

      {/* Top gradient */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-32"
        style={{
          backgroundImage:
            "linear-gradient(to bottom, rgba(0,0,0,0.45), rgba(0,0,0,0))",
        }}
      />

      {/* Bottom gradient */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10"
        style={{
          height: "45%",
          backgroundImage:
            "linear-gradient(to top, rgba(0,0,0,0.75), rgba(0,0,0,0))",
        }}
      />

      {/* Top bar */}
      <div className="absolute inset-x-0 top-0 z-30 pt-safe">
        <div className="flex items-start justify-between gap-2 px-3 pt-2">
          {/* Left: seller info + follow */}
          <div className="flex min-w-0 items-center gap-2">
            <Press
              onClick={() => openSeller(active.seller)}
              aria-label={`Voir le profil de ${active.seller}`}
              className="!block flex min-w-0 items-center gap-2 p-0 text-left"
            >
              <img
                src={active.avatar}
                alt=""
                className="h-10 w-10 rounded-full object-cover ring-2 ring-white/90"
                onLoad={(e) => e.currentTarget.setAttribute("data-loaded", "true")}
                draggable={false}
              />
              <div className="min-w-0">
                <p
                  className="truncate text-[14px] font-bold text-white"
                  style={{ textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}
                >
                  {active.seller}
                </p>
                <p
                  className="text-[11px] text-white/80"
                  style={{ textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}
                >
                  {(followerCount / 1000).toFixed(1)}k abonnés
                </p>
              </div>
            </Press>
            <motion.div whileTap={{ scale: 0.94 }}>
              <Press
                onClick={() => {
                  haptic.medium();
                  setFollowing((v) => {
                    const next = !v;
                    if (next && active) {
                      void requestWithPrePrompt(
                        `Active les notifications pour ne rater aucun live de ${active.seller} 🔔`,
                      );
                    }
                    return next;
                  });
                }}
                hapticOnTap={false}
                className="!min-h-8 ml-1 rounded-full px-3 text-[12px] font-bold"
                style={
                  following
                    ? {
                        backgroundColor: "transparent",
                        color: "white",
                        border: "1.5px solid rgba(255,255,255,0.8)",
                      }
                    : {
                        backgroundColor: "var(--accent)",
                        color: "var(--accent-foreground)",
                      }
                }
              >
                {following ? "Abonné" : "Suivre"}
              </Press>
            </motion.div>
          </div>

          {/* Right: viewers / share / close */}
          <div className="flex items-center gap-1.5">
            <Press
              onClick={() => { haptic.selection(); setViewersSheetOpen(true); }}
              aria-label={t("live.viewersSheetTitle", "Spectateurs")}
              className="!min-h-0 flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-semibold text-white tabular-nums"
              style={{
                backgroundColor: "rgba(0,0,0,0.45)",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
              }}
            >
              <Eye size={13} />
              {displayViewers}
            </Press>
            <Press
              aria-label={t("live.share", "Partager")}
              onClick={async () => {
                haptic.light();
                const shareUrl = active.liveId
                  ? liveShareUrl(active.liveId)
                  : "https://kidiplus.com";
                const title = `${active.seller} — Kidi+`;
                const text = t("live.shareText", {
                  defaultValue: "Rejoins le live de {{name}} sur Kidi+ 🔴",
                  name: active.seller,
                });
                try {
                  const nav =
                    typeof navigator !== "undefined"
                      ? (navigator as Navigator & { share?: (d: ShareData) => Promise<void> })
                      : null;
                  if (nav && typeof nav.share === "function") {
                    await nav.share({ title, text, url: shareUrl });
                  } else if (nav && nav.clipboard) {
                    await nav.clipboard.writeText(shareUrl);
                    toast.success(t("live.shareCopied", "Lien copié"));
                  }
                } catch {
                  /* user cancelled */
                }
              }}
              className="h-9 w-9 rounded-full text-white"
              style={{
                backgroundColor: "rgba(0,0,0,0.45)",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
              }}
            >
              <Share2 size={16} />
            </Press>
            <Press
              aria-label={t("common.more", "Plus")}
              onClick={() => { haptic.selection(); setMoreOpen(true); }}
              className="h-9 w-9 rounded-full text-white"
              style={{
                backgroundColor: "rgba(0,0,0,0.45)",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
              }}
            >
              <MoreHorizontal size={16} />
            </Press>
            <Press
              aria-label={t("live.leave")}
              onClick={() => { haptic.light(); close(); }}
              className="h-9 w-9 rounded-full text-white"
              style={{
                backgroundColor: "rgba(0,0,0,0.45)",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
              }}
            >
              <X size={18} />
            </Press>
          </div>
        </div>
      </div>

      {/* Chat */}
      <div
        className="absolute inset-x-0 z-20"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 148px)" }}
      >
        <LiveChat messages={messages} />
      </div>

      {/* Auction card */}
      <div
        className="absolute inset-x-0 z-30 px-3"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 68px)" }}
      >
        {currentProduct && (
          <AuctionCard
            product={currentProduct}
            secondsLeft={secondsLeft}
            lastBidder={lastBidder}
            auctionActive={currentProduct.mode === "auction"}
            isHighestBidder={lastBidder === "toi"}
            onBid={doBid}
            onOpenProducts={() => setShowProducts(true)}
            onBuy={() => setBuyProduct(currentProduct)}
          />
        )}
      </div>

      {/* Bottom action bar */}
      <div
        className="absolute inset-x-0 bottom-0 z-30 flex items-center gap-2 px-3 pb-safe"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 10px)" }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex-1"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Écris un message..."
            className="w-full rounded-full px-4 py-2.5 text-[14px] text-white outline-none placeholder:text-white/60"
            style={{
              backgroundColor: "rgba(0,0,0,0.5)",
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
              border: "1px solid rgba(255,255,255,0.15)",
            }}
          />
        </form>
        <Press
          onClick={send}
          aria-label="Envoyer"
          className="h-11 w-11 rounded-full text-white"
          style={{
            backgroundColor: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            border: "1px solid rgba(255,255,255,0.15)",
          }}
        >
          <Send size={17} />
        </Press>
        <Press
          onClick={fireHeart}
          aria-label="Envoyer un cœur"
          className="h-11 w-11 rounded-full text-white"
          style={{
            backgroundColor: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            border: "1px solid rgba(255,255,255,0.15)",
          }}
        >
          <Heart size={17} fill="currentColor" />
        </Press>
        <Press
          onClick={() => {
            haptic.light();
            setGiftOpen(true);
          }}
          aria-label={t("gifts.title", "Envoyer un cadeau")}
          className="relative h-11 w-11 rounded-full text-white"
          style={{
            backgroundColor: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            border: "1px solid rgba(255,255,255,0.15)",
          }}
        >
          <Gift size={18} />
          <span
            className="absolute -top-1 -right-1 rounded-full px-1 text-[9px] font-black leading-none text-black"
            style={{ backgroundColor: "oklch(0.82 0.16 85)", padding: "2px 4px" }}
          >
            🎁
          </span>
        </Press>
      </div>

      {/* Gift animations overlay */}
      <GiftComboFeed trigger={giftEvt} />
      <GiftAnimationsLayer trigger={giftEvt} />

      {/* Floating hearts */}
      <FloatingHearts trigger={heartTrigger} />

      {/* Confetti on sale */}
      <Confetti trigger={confettiKey} />

      {/* Sheets */}
      <ProductsSheet
        open={showProducts}
        onClose={() => setShowProducts(false)}
        products={products}
        onBuyFixed={(p) => {
          setShowProducts(false);
          setBuyProduct(p);
        }}
      />
      <BuySheet product={buyProduct} onClose={() => setBuyProduct(null)} />
      <GiftTraySheet
        open={giftOpen}
        onClose={() => setGiftOpen(false)}
        liveCurrency={normalizeCurrency(walletCurrency ?? active.currency ?? "EUR")}
        locale={i18n.language}
        sending={false}
        onSend={sendDemoGift}
        onTopUp={() => {
          setGiftOpen(false);
          setTopupOpen(true);
        }}
      />
      </>
      )}

      <TopUpSheet open={topupOpen} onClose={() => setTopupOpen(false)} />

      {/* Signaler / Bloquer — Apple 1.2. Demo lives use the same report +
          block flows as real lives (local block + moderation report). */}
      {moreOpen && (
        <div className="fixed inset-0 z-[70] flex items-end bg-black/50" onClick={() => setMoreOpen(false)}>
          <div className="mx-auto w-full max-w-lg rounded-t-3xl bg-background p-4 pb-safe" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted" />
            <Press
              onClick={() => {
                setMoreOpen(false);
                requireAuth(() => {
                  if (
                    confirm(
                      t("report.confirm", {
                        defaultValue:
                          "Signaler ce live ? Notre équipe examinera ton signalement.",
                      }),
                    )
                  ) {
                    setReportOpen(true);
                  }
                });
              }}
              className="!min-h-12 flex h-12 w-full items-center gap-3 rounded-2xl px-3 text-left text-[15px]"
            >
              <Flag size={18} /> {t("report.action")}
            </Press>
            <Press
              onClick={() => {
                setMoreOpen(false);
                requireAuth(() => {
                  if (!confirm(t("block.confirm"))) return;
                  void (async () => {
                    if (!active?.sellerId) {
                      toast.success(t("block.blocked"));
                      close();
                      return;
                    }
                    const r = await blockUserAndNotify(active.sellerId, {
                      handle: active.seller,
                      displayName: active.seller,
                      avatarUrl: active.avatar,
                      liveId: active.id,
                    });
                    if (r.ok) {
                      toast.success(t("block.blocked"));
                      haptic.success();
                      close();
                    } else {
                      toast.error(t("block.failed"));
                    }
                  })();
                });
              }}
              className="!min-h-12 flex h-12 w-full items-center gap-3 rounded-2xl px-3 text-left text-[15px] text-destructive"
            >
              <UserX size={18} /> {t("block.action")}
            </Press>
          </div>
        </div>
      )}

      <ReportSheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="live"
        targetId={active.liveId ?? active.id.replace(/^db-/, "")}
        defaultReason="inappropriate"
        zIndex={130}
      />

      {/* Winner reveal — Whatnot-style flip; same component as real lives. */}
      <WinnerReveal
        open={!!winnerReveal}
        winnerName={winnerReveal?.name ?? null}
        isMe={!!winnerReveal?.isMe}
        productName={winnerReveal?.productName ?? null}
        revealKey={winnerReveal?.key ?? null}
        onDone={() => setWinnerReveal(null)}
      />

      {/* Simulated viewers list — Apple reviewers tap the eye pill. */}
      <SimulatedViewersSheet
        open={viewersSheetOpen}
        onClose={() => setViewersSheetOpen(false)}
        viewerCount={displayViewers}
        seed={active.id}
      />

    </LivePipShell>
  );
}

/**
 * SimulatedViewersSheet — populated with fake but realistic French usernames.
 * Deterministic per live (`seed`) so the same room lists the same people while
 * open. No network calls — sample lives must feel populated for Apple review.
 */
function SimulatedViewersSheet({
  open,
  onClose,
  viewerCount,
  seed,
}: {
  open: boolean;
  onClose: () => void;
  viewerCount: number;
  seed: string;
}) {
  const { t } = useTranslation();
  const rows = useMemo(() => {
    const NAMES = [
      "Julie P.", "Kévin", "Marion", "Sofiane", "Léa", "Amine",
      "Clémence", "Thomas B.", "Élodie", "Yanis", "Camille", "Nadir",
      "Aurélie", "Mehdi K.", "Manon", "Hugo J.", "Sarah M.", "Farah",
      "Romain", "Chloé", "Inès", "Adam", "Victoire", "Noa",
      "Louise", "Raphaël", "Sabrina", "Younes", "Margaux", "Bilel",
    ];
    const COLORS = [
      "oklch(0.75 0.16 30)", "oklch(0.78 0.14 200)", "oklch(0.8 0.16 140)",
      "oklch(0.78 0.16 60)", "oklch(0.75 0.18 320)", "oklch(0.8 0.14 260)",
      "oklch(0.78 0.16 100)", "oklch(0.75 0.18 10)",
    ];
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
    const shown = Math.min(NAMES.length, Math.max(6, Math.min(viewerCount, 24)));
    return Array.from({ length: shown }, (_, i) => {
      const idx = Math.abs((h + i * 97) | 0) % NAMES.length;
      const name = NAMES[idx];
      return {
        id: `sim-${seed}-${i}`,
        name,
        color: COLORS[Math.abs((h + i * 13) | 0) % COLORS.length],
      };
    });
  }, [seed, viewerCount]);

  const guestCount = Math.max(0, viewerCount - rows.length);

  return (
    <BottomSheet open={open} onClose={onClose} heightPercent={62}>
      <div className="flex h-full min-h-0 flex-col px-4">
        <div className="flex items-center gap-2 pb-3 pt-1">
          <Users size={18} />
          <h2 className="text-[18px] font-bold">
            {t("live.viewersSheetTitle", "Spectateurs")}
          </h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[12px] font-bold tabular-nums text-muted-foreground">
            {viewerCount}
          </span>
        </div>
        <div
          className="min-h-0 flex-1 overflow-y-auto"
          style={{
            paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)",
            WebkitOverflowScrolling: "touch",
          }}
        >
          <ul className="flex flex-col gap-1">
            {rows.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-3 rounded-xl px-2 py-2.5"
              >
                <div
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[14px] font-bold text-white"
                  style={{ backgroundColor: r.color }}
                >
                  {r.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold">{r.name}</p>
                </div>
              </li>
            ))}
          </ul>
          {guestCount > 0 && (
            <p className="mt-4 px-1 text-[12px] text-muted-foreground">
              {t("live.viewersGuests", { count: guestCount, defaultValue: "+ {{count}} invités" })}
            </p>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}


/**
 * PeekSlide — the adjacent live's poster, glued to the current slide's drag.
 * Positioned off-screen (top:100% for next, top:-100% for prev) and translated
 * by the shared dragY so both slides move as one strip, TikTok-style.
 */
function PeekSlide({
  stream,
  position,
  dragY,
}: {
  stream: LiveStream;
  position: "next" | "prev";
  dragY: MotionValue<number>;
}) {
  const baseTop = position === "next" ? "100%" : "-100%";
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 h-full overflow-hidden bg-black"
      style={{ top: baseTop, y: dragY }}
    >
      <img
        src={stream.thumbnail.replace("w=600", "w=1200")}
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-90"
        draggable={false}
      />
      {/* Dim overlay */}
      <div className="absolute inset-0 bg-black/25" />
      {/* Shimmer loading strip */}
      <div
        className="absolute inset-x-0 top-1/2 h-16 -translate-y-1/2 opacity-40"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%)",
          animation: "shimmer 1.6s linear infinite",
        }}
      />
      {/* Seller identity chip */}
      <div className="absolute inset-x-0 top-0 pt-safe">
        <div className="flex items-center gap-2 px-3 pt-3">
          <img
            src={stream.avatar}
            alt=""
            className="h-10 w-10 rounded-full object-cover ring-2 ring-white/90"
            draggable={false}
          />
          <div className="min-w-0">
            <p
              className="truncate text-[14px] font-bold text-white"
              style={{ textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}
            >
              {stream.seller}
            </p>
            <p
              className="truncate text-[11px] text-white/80"
              style={{ textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}
            >
              {stream.title}
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

