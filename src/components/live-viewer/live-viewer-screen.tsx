import { motion, useMotionValue, animate } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Send, Heart, Share2, X, Eye, Gift } from "lucide-react";
import { toast } from "sonner";
import { Press } from "@/components/press";
import { useLiveViewer } from "@/lib/live-viewer-context";
import { useSellerProfile } from "@/lib/seller-profile-context";
import { EASE_IOS } from "@/lib/motion";
import { haptic } from "@/lib/haptics";
import { pushStatusBarLight } from "@/lib/native";
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
import { GiftTraySheet } from "./gift-tray-sheet";
import { GiftAnimationsLayer } from "./gift-animations";
import { TopUpSheet } from "@/components/wallet/topup-sheet";
import { giftByKey, type GiftKey } from "@/lib/gifts";
import { useTranslation } from "react-i18next";
import { useWallet } from "@/lib/wallet-context";
import { normalizeCurrency } from "@/lib/money";
import type { GiftEvt } from "@/lib/live-room";



const AUCTION_SECONDS = 45;

export function LiveViewerScreen() {
  const { active } = useLiveViewer();
  // Real live (backed by DB) → real chat/bids/hearts/viewers.
  if (active?.liveId) return <RealLiveViewerScreen />;
  return <MockLiveViewerScreen />;
}

function MockLiveViewerScreen() {
  const { active, close } = useLiveViewer();
  const { open: openSeller } = useSellerProfile();
  const appActive = useAppActive();
  const { requestWithPrePrompt } = usePush();

  // Force light status-bar content while the viewer is mounted (dark background).
  useEffect(() => {
    let restore: (() => void) | null = null;
    void pushStatusBarLight().then((fn) => {
      restore = fn;
    });
    return () => {
      restore?.();
    };
  }, []);


  // === Chat === (paused when app is backgrounded)
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  useEffect(() => {
    if (!active) return;
    setMessages([
      systemMessage(`Bienvenue dans le live de ${active.seller} 👋`),
    ]);
    if (!appActive) return;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      setMessages((prev) => {
        const next = [...prev, nextChatMessage()];
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
  const fireHeart = () => {
    haptic.medium();
    setHeartTrigger((v) => v + 1);
  };
  const lastTap = useRef(0);
  const onVideoTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      // double tap -> multiple hearts
      fireHeart();
      setTimeout(() => setHeartTrigger((v) => v + 1), 80);
      setTimeout(() => setHeartTrigger((v) => v + 1), 160);
    }
    lastTap.current = now;
  };


  // === Products & Auction ===
  const [products, setProducts] = useState<Product[]>(() => makeProducts());
  const [secondsLeft, setSecondsLeft] = useState(AUCTION_SECONDS);
  const [lastBidder, setLastBidder] = useState<string | undefined>();
  const [confettiKey, setConfettiKey] = useState(0);
  const currentIndex = products.findIndex((p) => p.status === "current");
  const currentProduct = currentIndex >= 0 ? products[currentIndex] : null;

  // reset countdown when product changes / when active stream changes
  useEffect(() => {
    if (!active) return;
    setProducts(makeProducts());
    setSecondsLeft(AUCTION_SECONDS);
    setLastBidder(undefined);
  }, [active]);

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
      setProducts((prev) =>
        prev.map((p) =>
          p.id === currentProduct.id
            ? { ...p, price: p.price + bidStep() }
            : p,
        ),
      );
      setLastBidder(bidder);
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
    if (secondsLeft > 0) return;
    const winner = lastBidder ?? randomBidder();
    // mark sold, advance
    setMessages((prev) => [
      ...prev,
      systemMessage(`Vendu à @${winner} 🎉 ${formatEuro(currentProduct.price)}`),
    ]);
    haptic.success();
    setConfettiKey((k) => k + 1);

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
        return next;
      });
      setSecondsLeft(AUCTION_SECONDS);
      setLastBidder(undefined);
    }, 1600);
  }, [secondsLeft, currentProduct, lastBidder]);

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
    setProducts((prev) =>
      prev.map((p) =>
        p.id === currentProduct.id ? { ...p, price: p.price + 1 } : p,
      ),
    );

    setLastBidder("toi");
    setSecondsLeft((s) => (s < 6 ? s + 3 : s));
  };

  // Sheets
  const [showProducts, setShowProducts] = useState(false);
  const [buyProduct, setBuyProduct] = useState<Product | null>(null);
  const [giftOpen, setGiftOpen] = useState(false);
  const [topupOpen, setTopupOpen] = useState(false);
  const [giftEvt, setGiftEvt] = useState<GiftEvt | null>(null);
  const { t, i18n } = useTranslation();
  const { currency: walletCurrency } = useWallet();


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
    haptic.medium();
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


  // Swipe-down to dismiss on the top area
  const dragY = useMotionValue(0);

  if (!active) return null;

  const followerCount = 1000 + ((active.viewers * 7) % 24000);

  return (
    <motion.div
      key={active.id}
      initial={{ y: "100%", opacity: 0.6 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: "100%", opacity: 0.4 }}
      transition={{ duration: 0.3, ease: EASE_IOS }}
      className="fixed inset-0 z-[60] overflow-hidden bg-black"
      style={{ y: dragY }}
    >
      {/* Background media — real LiveKit video when a room is attached,
          otherwise the mock cover thumbnail. */}
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


      {/* Double-tap capture layer */}
      <div
        className="absolute inset-0 z-10"
        onClick={onVideoTap}
        aria-hidden
      />

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

      {/* Top bar — draggable to dismiss */}
      <motion.div
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.5 }}
        onDrag={(_, info) => dragY.set(Math.max(0, info.offset.y))}
        onDragEnd={(_, info) => {
          if (info.offset.y > 120 || info.velocity.y > 600) {
            close();
          } else {
            animate(dragY, 0, { duration: 0.25, ease: EASE_IOS });
          }
        }}
        className="absolute inset-x-0 top-0 z-30 pt-safe"
      >
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
            <div
              className="flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-semibold text-white tabular-nums"
              style={{
                backgroundColor: "rgba(0,0,0,0.45)",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
              }}
            >
              <Eye size={13} />
              {displayViewers}
            </div>
            <Press
              aria-label="Partager"
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
              aria-label="Fermer"
              onClick={close}
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
      </motion.div>

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
      <TopUpSheet open={topupOpen} onClose={() => setTopupOpen(false)} />

    </motion.div>
  );
}
