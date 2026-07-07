import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, animate } from "framer-motion";
import {
  RefreshCw, Eye, Mic, MicOff, Video, VideoOff, X,
} from "lucide-react";
import { Press } from "@/components/press";
import { BroadcastVideo } from "./broadcast-video";
import { LiveChat } from "@/components/live-viewer/live-chat";
import { FloatingHearts } from "@/components/live-viewer/floating-hearts";
import { Confetti } from "@/components/live-viewer/confetti";
import { BottomSheet } from "@/components/live-viewer/bottom-sheet";
import { useBroadcast, type BProduct } from "@/lib/broadcast-context";
import {
  bidStep, pickBidder, formatEuro, fmtDuration,
} from "@/lib/broadcast-mock";
import {
  nextChatMessage, systemMessage, type ChatMsg,
} from "@/lib/live-viewer-mock";
import { EASE_IOS } from "@/lib/motion";
import { haptic } from "@/lib/haptics";
import { useAppActive } from "@/lib/app-state";
import { pushStatusBarLight } from "@/lib/native";

type AuctionState = {
  productId: string;
  timeLeft: number;
  currentBid: number;
  currentBidder: string | null;
  lastBidAt: number;
};

type FixedState = {
  productId: string;
  soldCount: number; // sold during this live
};

export function BroadcastLive({ onEnd }: { onEnd: () => void }) {
  const b = useBroadcast();
  const appActive = useAppActive();

  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [viewers, setViewers] = useState(1);
  const [peak, setPeak] = useState(1);
  const [duration, setDuration] = useState(0);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [confettiTrigger, setConfettiTrigger] = useState(0);
  const [heartTrigger, setHeartTrigger] = useState(0);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [featuredId, setFeaturedId] = useState<string>(() => b.products[0]?.id ?? "");
  const [auction, setAuction] = useState<AuctionState | null>(null);
  const [fixedStates, setFixedStates] = useState<Record<string, FixedState>>({});
  const [soldList, setSoldList] = useState<
    { id: string; productId: string; productName: string; buyer: string; price: number }[]
  >([]);
  const [lastSaleFlash, setLastSaleFlash] = useState<string | null>(null);

  // Refs to avoid stale closures + track pending timers for cleanup.
  const soldListRef = useRef(soldList);
  useEffect(() => { soldListRef.current = soldList; }, [soldList]);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Force light status bar icons during broadcast
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    pushStatusBarLight().then((c) => { cleanup = c; });
    return () => cleanup?.();
  }, []);

  // ---- Live duration + viewers simulation ----
  useEffect(() => {
    if (!appActive) return;
    const t = setInterval(() => setDuration((d) => d + 1), 1000);
    return () => clearInterval(t);
  }, [appActive]);

  useEffect(() => {
    if (!appActive) return;
    const t = setInterval(() => {
      setViewers((v) => {
        const delta = Math.random() < 0.55 ? +Math.ceil(Math.random() * 3) : -Math.ceil(Math.random() * 2);
        const n = Math.max(1, v + delta);
        setPeak((p) => Math.max(p, n));
        return n;
      });
    }, 1800);
    return () => clearInterval(t);
  }, [appActive]);

  // ---- Chat simulation ----
  useEffect(() => {
    if (!appActive) return;
    let mounted = true;
    const schedule = () => {
      const delay = 1400 + Math.random() * 2200;
      setTimeout(() => {
        if (!mounted) return;
        setChat((prev) => [...prev.slice(-40), nextChatMessage()]);
        schedule();
      }, delay);
    };
    schedule();
    return () => { mounted = false; };
  }, [appActive]);

  // Seed system message once
  useEffect(() => {
    setChat([systemMessage("Le live a commencé — bienvenue 👋")]);
  }, []);

  // ---- Hearts simulation ----
  useEffect(() => {
    if (!appActive) return;
    const t = setInterval(() => setHeartTrigger((n) => n + 1), 900 + Math.random() * 1400);
    return () => clearInterval(t);
  }, [appActive]);

  // ---- Auction tick (one interval per auction) ----
  useEffect(() => {
    if (!auction || !appActive) return;
    const t = setInterval(() => {
      setAuction((a) => {
        if (!a) return a;
        if (a.timeLeft <= 0) return a; // stable ref → no re-render, no more haptics
        const nextLeft = a.timeLeft - 1;
        if (nextLeft > 0 && nextLeft <= 10) haptic.warning();
        return { ...a, timeLeft: Math.max(0, nextLeft) };
      });
    }, 1000);
    return () => clearInterval(t);
  }, [auction?.productId, appActive]);

  // finalizeSale must be declared BEFORE effects that reference it.
  const finalizeSale = useCallback(
    (product: BProduct, buyer: string, price: number) => {
      haptic.success();
      const id = `sale-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
      const entry = { id, productId: product.id, productName: product.name, buyer, price };
      setSoldList((prev) => [...prev, entry]);
      setChat((prev) => [
        ...prev,
        systemMessage(`Vendu à @${buyer} — ${formatEuro(price)} 🎉`),
      ]);
      setLastSaleFlash(`Vendu à @${buyer} · ${formatEuro(price)}`);
      setConfettiTrigger((n) => n + 1);
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
      flashTimeoutRef.current = setTimeout(() => setLastSaleFlash(null), 1800);
      // Advance featured to next non-sold product (use fresh soldList via ref).
      if (product.mode === "auction") {
        const soldIds = new Set([
          ...soldListRef.current.map((s) => s.productId),
          product.id,
        ]);
        const remaining = b.products.find(
          (p) => p.id !== product.id && !soldIds.has(p.id),
        );
        if (remaining) setFeaturedId(remaining.id);
      }
    },
    [b.products],
  );

  // Auto-bid: schedule ONE timeout per (auction lifecycle + bid change).
  // Do NOT depend on timeLeft — otherwise the timeout gets cleared each tick
  // and no bid ever fires.
  useEffect(() => {
    if (!auction || !appActive) return;
    const gap = 1600 + Math.random() * 2600;
    const t = setTimeout(() => {
      setAuction((a) => {
        if (!a || a.timeLeft <= 0) return a;
        const step = bidStep();
        const bidder = pickBidder();
        const newBid = a.currentBid + step;
        setChat((prev) => [...prev.slice(-40), systemMessage(`@${bidder} enchérit ${formatEuro(newBid)}`)]);
        return { ...a, currentBid: newBid, currentBidder: bidder, lastBidAt: Date.now() };
      });
    }, gap);
    return () => clearTimeout(t);
  }, [auction?.productId, auction?.currentBid, appActive]);

  // Auto-close auction when timer hits 0
  useEffect(() => {
    if (!auction || auction.timeLeft > 0) return;
    const prod = b.products.find((p) => p.id === auction.productId);
    if (!prod) {
      setAuction(null);
      return;
    }
    const buyer = auction.currentBidder ?? pickBidder();
    finalizeSale(prod, buyer, auction.currentBid);
    setAuction(null);
  }, [auction?.timeLeft, auction?.productId, auction?.currentBid, auction?.currentBidder, b.products, finalizeSale]);

  // Fixed price purchase simulator
  useEffect(() => {
    if (!appActive) return;
    const onSaleIds = Object.keys(fixedStates);
    if (onSaleIds.length === 0) return;
    const t = setInterval(() => {
      const pid = onSaleIds[Math.floor(Math.random() * onSaleIds.length)];
      const prod = b.products.find((p) => p.id === pid);
      if (!prod) return;
      const s = fixedStates[pid];
      if (!s || s.soldCount >= prod.stock) return;
      const buyer = pickBidder();
      setFixedStates((prev) => ({
        ...prev,
        [pid]: { ...prev[pid], soldCount: prev[pid].soldCount + 1 },
      }));
      finalizeSale(prod, buyer, prod.price);
    }, 2600 + Math.random() * 2000);
    return () => clearInterval(t);
  }, [fixedStates, b.products, appActive, finalizeSale]);

  // Clear any pending flash timeout on unmount.
  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    };
  }, []);

  // ---- Session totals ----
  const totalRevenue = useMemo(
    () => soldList.reduce((sum, s) => sum + s.price, 0),
    [soldList],
  );

  const featured = b.products.find((p) => p.id === featuredId) ?? b.products[0];

  const startAuction = (p: BProduct) => {
    if (p.mode !== "auction") return;
    haptic.medium();
    setFeaturedId(p.id);
    setAuction({
      productId: p.id,
      timeLeft: p.timerSec,
      currentBid: p.startPrice,
      currentBidder: null,
      lastBidAt: Date.now(),
    });
    setChat((prev) => [...prev, systemMessage(`Enchère lancée — ${p.name} dès ${formatEuro(p.startPrice)}`)]);
  };

  const endAuctionNow = () => {
    if (!auction) return;
    setAuction((a) => (a ? { ...a, timeLeft: 0 } : a));
  };

  const toggleFixedSale = (p: BProduct) => {
    if (p.mode !== "fixed") return;
    haptic.medium();
    setFeaturedId(p.id);
    setFixedStates((prev) => {
      if (prev[p.id]) {
        const { [p.id]: _, ...rest } = prev;
        setChat((c) => [...c, systemMessage(`Vente arrêtée — ${p.name}`)]);
        return rest;
      }
      setChat((c) => [...c, systemMessage(`En vente maintenant — ${p.name} à ${formatEuro(p.price)}`)]);
      return { ...prev, [p.id]: { productId: p.id, soldCount: 0 } };
    });
  };

  const endLive = () => {
    haptic.success();
    b.setSession({
      title: b.title,
      category: b.category,
      cover: b.cover,
      durationSec: duration,
      peakViewers: peak,
      sales: soldList,
    });
    onEnd();
  };

  return (
    <motion.div
      key="live"
      initial={{ opacity: 0, scale: 1.02 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.3, ease: EASE_IOS }}
      className="relative h-full w-full overflow-hidden bg-black"
    >
      <BroadcastVideo
        facing={facing}
        enabled={cameraOn}
        micEnabled={micOn}
        fallbackImage={b.cover}
        livekit={
          b.roomName && b.hostIdentity
            ? { room: b.roomName, identity: b.hostIdentity, name: b.hostName }
            : undefined
        }
      />



      {/* Top bar */}
      <div
        className="absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-2 px-3"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 8px)" }}
      >
        <div className="flex items-center gap-2">
          <div
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-white"
            style={{ backgroundColor: "rgba(220, 30, 40, 0.95)" }}
          >
            <motion.span
              animate={{ opacity: [1, 0.35, 1] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
              className="h-1.5 w-1.5 rounded-full bg-white"
            />
            <span className="text-[11px] font-bold tracking-wide">EN DIRECT</span>
          </div>
          <div
            className="rounded-full px-2 py-1 text-[11px] font-semibold text-white"
            style={{
              backgroundColor: "rgba(0,0,0,0.45)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
            }}
          >
            {fmtDuration(duration)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold text-white"
            style={{
              backgroundColor: "rgba(0,0,0,0.45)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
            }}
          >
            <Eye size={13} />
            {viewers}
          </div>
          <Press
            onClick={() => {
              haptic.selection();
              setFacing((f) => (f === "user" ? "environment" : "user"));
            }}
            aria-label="Changer de caméra"
            className="!min-h-9 !min-w-9 h-9 w-9 rounded-full text-white"
            style={{
              backgroundColor: "rgba(0,0,0,0.45)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
            }}
          >
            <RefreshCw size={16} />
          </Press>
          <Press
            onClick={() => setConfirmEnd(true)}
            className="!min-h-9 h-9 rounded-full px-3 text-[12px] font-bold text-white"
            style={{ backgroundColor: "rgba(220, 30, 40, 0.95)" }}
          >
            Terminer
          </Press>
        </div>
      </div>

      {/* Session stat strip */}
      <div
        className="absolute z-30"
        style={{
          top: "calc(env(safe-area-inset-top) + 60px)",
          left: 12,
        }}
      >
        <div
          className="flex items-center gap-3 rounded-2xl px-3 py-1.5 text-white"
          style={{
            backgroundColor: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
          }}
        >
          <div className="flex flex-col leading-tight">
            <span className="text-[9px] uppercase tracking-wide text-white/60">Ventes</span>
            <AnimatedEuro value={totalRevenue} />
          </div>
          <div className="h-6 w-px bg-white/20" />
          <div className="flex flex-col leading-tight">
            <span className="text-[9px] uppercase tracking-wide text-white/60">Articles</span>
            <span className="text-[14px] font-bold tabular-nums">{soldList.length}</span>
          </div>
        </div>
      </div>

      <FloatingHearts trigger={heartTrigger} />
      <Confetti trigger={confettiTrigger} />
      <LiveChat messages={chat} />

      {/* Sale flash banner */}
      <AnimatePresence>
        {lastSaleFlash && (
          <motion.div
            key={lastSaleFlash}
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.25, ease: EASE_IOS }}
            className="absolute left-1/2 top-24 z-40 -translate-x-1/2 rounded-full px-4 py-2 text-[13px] font-bold text-white"
            style={{
              background: "linear-gradient(135deg, oklch(0.72 0.2 145), oklch(0.62 0.2 155))",
              boxShadow: "0 8px 24px rgba(0,180,80,0.3)",
            }}
          >
            {lastSaleFlash}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Featured / auction overlay */}
      {featured && auction && auction.productId === featured.id && (
        <div className="absolute right-3 z-30" style={{ top: "calc(env(safe-area-inset-top) + 110px)" }}>
          <div
            className="w-40 rounded-2xl p-2 text-white"
            style={{
              backgroundColor: "rgba(0,0,0,0.55)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
            }}
          >
            <img src={featured.image} alt="" className="mb-1.5 h-20 w-full rounded-lg object-cover" />
            <div className="text-[10px] font-semibold text-white/70">Enchère en cours</div>
            <motion.div
              key={auction.currentBid}
              initial={{ scale: 1.15 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.2, ease: EASE_IOS }}
              className="text-[18px] font-bold tabular-nums"
            >
              {formatEuro(auction.currentBid)}
            </motion.div>
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-white/70">
                {auction.currentBidder ? `@${auction.currentBidder}` : "aucune enchère"}
              </span>
              <span
                className="font-bold tabular-nums"
                style={{ color: auction.timeLeft <= 10 ? "oklch(0.75 0.2 25)" : "white" }}
              >
                {String(auction.timeLeft).padStart(2, "0")}s
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Seller control dock */}
      <div
        className="absolute inset-x-0 bottom-0 z-30 pb-safe"
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom) + 10px)",
        }}
      >
        {/* Mic/camera row */}
        <div className="mb-2 flex items-center justify-center gap-3 px-4">
          <Press
            onClick={() => { haptic.selection(); setMicOn((m) => !m); }}
            aria-label="Micro"
            className="!min-h-10 !min-w-10 h-10 w-10 rounded-full text-white"
            style={{
              backgroundColor: micOn ? "rgba(255,255,255,0.18)" : "rgba(220,30,40,0.9)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
            }}
          >
            {micOn ? <Mic size={16} /> : <MicOff size={16} />}
          </Press>
          <Press
            onClick={() => { haptic.selection(); setCameraOn((c) => !c); }}
            aria-label="Caméra"
            className="!min-h-10 !min-w-10 h-10 w-10 rounded-full text-white"
            style={{
              backgroundColor: cameraOn ? "rgba(255,255,255,0.18)" : "rgba(220,30,40,0.9)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
            }}
          >
            {cameraOn ? <Video size={16} /> : <VideoOff size={16} />}
          </Press>
        </div>

        {/* Product control dock — right-aligned so it doesn't cover the chat.
            The next auction product gets a highlight ring so the host always
            knows which "Démarrer" button to tap next. */}
        <div
          className="flex justify-end gap-2 overflow-x-auto pl-[30%] pr-3 pb-1"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {(() => {
            const nextAuctionId = !auction
              ? b.products.find(
                  (p) => p.mode === "auction" && !soldList.some((s) => s.productId === p.id),
                )?.id ?? null
              : null;
            return b.products.map((p) => {
              const soldOut = p.mode === "auction"
                ? soldList.some((s) => s.productId === p.id)
                : (fixedStates[p.id]?.soldCount ?? 0) >= p.stock;
              const auctionActive = auction?.productId === p.id;
              const onSale = p.mode === "fixed" && !!fixedStates[p.id];
              const soldCount = fixedStates[p.id]?.soldCount ?? 0;
              const isFeatured = p.id === featuredId;
              const isNextAuction = p.id === nextAuctionId;
              return (
                <SellerProductCard
                  key={p.id}
                  product={p}
                  soldOut={soldOut}
                  featured={isFeatured}
                  auctionActive={auctionActive}
                  isNextAuction={isNextAuction}
                  onSale={onSale}
                  soldCount={soldCount}
                  onStartAuction={() => startAuction(p)}
                  onEndAuction={endAuctionNow}
                  onToggleFixed={() => toggleFixedSale(p)}
                  onFeature={() => { haptic.selection(); setFeaturedId(p.id); }}
                />
              );
            });
          })()}
        </div>


      </div>

      {/* End confirm sheet */}
      <BottomSheet open={confirmEnd} onClose={() => setConfirmEnd(false)} heightPercent={38}>
        <div className="flex h-full flex-col px-6 pb-4">
          <h2 className="text-[20px] font-bold">Terminer le live ?</h2>
          <p className="mt-1 text-[14px] text-muted-foreground">
            Ton live sera clôturé et un récap sera généré.
          </p>
          <div className="flex-1" />
          <div className="flex flex-col gap-2">
            <Press
              onClick={endLive}
              className="!min-h-12 h-12 w-full rounded-2xl text-[15px] font-bold text-white"
              style={{
                background: "linear-gradient(135deg, oklch(0.7 0.26 15), oklch(0.62 0.24 20))",
              }}
            >
              Terminer maintenant
            </Press>
            <Press
              onClick={() => setConfirmEnd(false)}
              className="!min-h-12 h-12 w-full rounded-2xl bg-muted text-[15px] font-semibold"
            >
              Annuler
            </Press>
          </div>
        </div>
      </BottomSheet>
    </motion.div>
  );
}

function SellerProductCard({
  product, featured, auctionActive, isNextAuction, onSale, soldOut, soldCount,
  onStartAuction, onEndAuction, onToggleFixed, onFeature,
}: {
  product: BProduct;
  featured: boolean;
  auctionActive: boolean;
  isNextAuction: boolean;
  onSale: boolean;
  soldOut: boolean;
  soldCount: number;
  onStartAuction: () => void;
  onEndAuction: () => void;
  onToggleFixed: () => void;
  onFeature: () => void;
}) {
  const ringColor = auctionActive
    ? "oklch(0.62 0.24 20)"
    : featured
      ? "white"
      : isNextAuction
        ? "oklch(0.85 0.18 90)"
        : "transparent";
  return (
    <motion.div
      layout
      animate={isNextAuction && !auctionActive ? { scale: [1, 1.03, 1] } : { scale: 1 }}
      transition={isNextAuction && !auctionActive
        ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" }
        : { duration: 0.2 }}
      className="relative flex w-32 shrink-0 flex-col overflow-hidden rounded-xl text-white"
      style={{
        backgroundColor: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        outline: `2px solid ${ringColor}`,
        outlineOffset: -2,
        opacity: soldOut ? 0.7 : 1,
      }}
    >
      <button
        onClick={onFeature}
        className="relative h-20 w-full overflow-hidden text-left"
      >
        <img src={product.image} alt="" className="h-full w-full object-cover" />
        {featured && (
          <span className="absolute left-1 top-1 rounded-full bg-white px-1.5 py-0.5 text-[9px] font-bold text-black">
            À l'écran
          </span>
        )}
        {isNextAuction && !featured && (
          <span className="absolute left-1 top-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold text-black"
            style={{ backgroundColor: "oklch(0.85 0.18 90)" }}>
            À suivre
          </span>
        )}
        {soldOut && (
          <div className="absolute inset-0 grid place-items-center bg-black/60 text-[12px] font-bold">
            VENDU
          </div>
        )}
      </button>

      <div className="flex flex-1 flex-col gap-0.5 p-1.5">
        <span className="truncate text-[11px] font-semibold leading-tight">{product.name}</span>
        {product.mode === "auction" ? (
          <>
            <span className="text-[10px] leading-tight text-white/70">
              {formatEuro(product.startPrice)} · {product.timerSec}s
            </span>
            {!soldOut && (
              auctionActive ? (
                <Press
                  onClick={onEndAuction}
                  className="!min-h-8 mt-1 h-8 rounded-full text-[11px] font-bold text-white"
                  style={{ backgroundColor: "oklch(0.62 0.24 20)" }}
                >
                  Stop enchère
                </Press>
              ) : (
                <Press
                  onClick={onStartAuction}
                  hapticOnTap={false}
                  className="!min-h-8 mt-1 h-8 rounded-full text-[11px] font-bold"
                  style={{
                    backgroundColor: isNextAuction ? "oklch(0.85 0.18 90)" : "white",
                    color: "black",
                  }}
                >
                  {isNextAuction ? "Démarrer ▸" : "Démarrer"}
                </Press>
              )
            )}
          </>
        ) : (
          <>
            <span className="text-[10px] leading-tight text-white/70">
              {formatEuro(product.price)} · {Math.max(0, product.stock - soldCount)}/{product.stock}
            </span>
            {soldOut ? (
              <div className="mt-1 grid h-8 place-items-center rounded-full bg-white/10 text-[11px] font-bold text-white/70">
                Rupture
              </div>
            ) : (
              <Press
                onClick={onToggleFixed}
                hapticOnTap={false}
                className="!min-h-8 mt-1 h-8 rounded-full text-[11px] font-bold"
                style={{
                  backgroundColor: onSale ? "oklch(0.72 0.2 145)" : "white",
                  color: onSale ? "white" : "black",
                }}
              >
                {onSale ? "Arrêter" : "Vendre"}
              </Press>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}



function AnimatedEuro({ value }: { value: number }) {
  const mv = useMotionValue(0);
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const ctrl = animate(mv, value, {
      duration: 0.5,
      ease: [0.32, 0.72, 0, 1],
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => ctrl.stop();
  }, [value, mv]);
  return <span className="text-[14px] font-bold tabular-nums">{formatEuro(display)}</span>;
}
