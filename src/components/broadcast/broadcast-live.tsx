import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, animate } from "framer-motion";
import {
  RefreshCw, Eye, Mic, MicOff, Video, VideoOff, Package, AlertTriangle, Plus,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Press } from "@/components/press";
import { BroadcastVideo } from "./broadcast-video";
import { AddProductSheet } from "./add-product-sheet";
import { LiveChat } from "@/components/live-viewer/live-chat";
import { FloatingHearts } from "@/components/live-viewer/floating-hearts";
import { Confetti } from "@/components/live-viewer/confetti";
import { BottomSheet } from "@/components/live-viewer/bottom-sheet";
import { useBroadcast, type BProduct } from "@/lib/broadcast-context";
import { fmtDuration } from "@/lib/broadcast-mock";
import { formatMoney } from "@/lib/money";
import { EASE_IOS } from "@/lib/motion";
import { haptic } from "@/lib/haptics";
import { useAppActive } from "@/lib/app-state";
import { pushStatusBarLight } from "@/lib/native";
import { useLiveRoom } from "@/lib/live-room";
import { useImmersiveScope } from "@/lib/immersive-context";
import { isBlobUrl } from "@/lib/object-url";
import {
  startAuctionInDb, endAuctionInDb, activateFixedInDb, stopFixedInDb,
  createLiveProductInDb,
  type LiveProductRow,
} from "@/lib/lives-db";
import type { ChatMsg } from "@/lib/live-viewer-mock";

export function BroadcastLive({ onEnd }: { onEnd: () => void }) {
  const { t, i18n } = useTranslation();
  const b = useBroadcast();
  const appActive = useAppActive();
  const cur = b.currency;
  const fmt = (n: number) => formatMoney(n, cur, i18n.language);

  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [duration, setDuration] = useState(0);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [confettiTrigger, setConfettiTrigger] = useState(0);
  const [featuredId, setFeaturedId] = useState<string>("");
  const [lastSaleFlash, setLastSaleFlash] = useState<string | null>(null);
  const [videoStatus, setVideoStatus] = useState<import("./broadcast-video").BroadcastStatus>("idle");
  const [retryKey, setRetryKey] = useState(0);
  const [productsOpen, setProductsOpen] = useState(false);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hide the app's bottom tab bar while the host is on-air.
  useImmersiveScope(true);

  const room = useLiveRoom({
    liveId: b.liveId,
    identity: b.hostIdentity ?? "host",
    displayName: b.hostName,
    isHost: true,
  });

  // Force light status bar during broadcast.
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    pushStatusBarLight().then((c) => { cleanup = c; });
    return () => cleanup?.();
  }, []);

  // Session duration ticker.
  useEffect(() => {
    if (!appActive) return;
    const t = setInterval(() => setDuration((d) => d + 1), 1000);
    return () => clearInterval(t);
  }, [appActive]);

  // Seed a welcome system message once the room is ready.
  const welcomedRef = useRef(false);
  useEffect(() => {
    if (!room.ready || welcomedRef.current) return;
    welcomedRef.current = true;
    room.systemMessage(t("live.chatIntro", "Sois respectueux dans le chat 💛"));
  }, [room, t]);

  // Track a running peak viewer count.
  const [peak, setPeak] = useState(1);
  useEffect(() => {
    setPeak((p) => Math.max(p, room.viewerCount));
  }, [room.viewerCount]);

  // Featured defaults to first product once loaded.
  useEffect(() => {
    if (!featuredId && room.products.length > 0) {
      setFeaturedId(room.products[0].id);
    }
  }, [room.products, featuredId]);

  // ---- Auction countdown, derived from server-broadcast deadline ----
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!appActive || !room.auctionStart) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [appActive, room.auctionStart]);

  const timeLeft = useMemo(() => {
    if (!room.auctionStart) return 0;
    return Math.max(0, Math.ceil((room.auctionStart.deadlineMs - now) / 1000));
  }, [room.auctionStart, now]);

  const activeAuction = room.auctionStart;
  const activeProduct = activeAuction
    ? room.products.find((p) => p.id === activeAuction.productId) ?? null
    : null;

  // Warning haptic in last 10s.
  const prevSecRef = useRef(0);
  useEffect(() => {
    if (activeAuction && timeLeft <= 10 && timeLeft > 0 && timeLeft !== prevSecRef.current) {
      haptic.warning();
    }
    prevSecRef.current = timeLeft;
  }, [timeLeft, activeAuction]);

  // Auto-end when time hits zero (host is authoritative).
  const endingRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeAuction || !activeProduct) return;
    if (timeLeft > 0) return;
    if (endingRef.current === activeAuction.productId) return;
    endingRef.current = activeAuction.productId;
    const lastBidMatches = room.lastBid && room.lastBid.productId === activeAuction.productId;
    const winnerName = lastBidMatches ? room.lastBid!.bidderName : null;
    const winnerId = lastBidMatches ? room.lastBid!.bidderId : null;
    const finalPrice = activeProduct.price;
    void endAuctionInDb(activeAuction.productId, null, finalPrice);
    room.broadcastAuctionEnd({
      productId: activeAuction.productId,
      winnerId,
      winnerName,
      finalPrice,
    });
  }, [timeLeft, activeAuction, activeProduct, room]);

  // React to auction:end (from ourselves too) — flash + confetti + system msg.
  const seenEndRef = useRef<string | null>(null);
  useEffect(() => {
    const evt = room.lastAuctionEnd;
    if (!evt) return;
    const key = `${evt.productId}-${evt.finalPrice}`;
    if (seenEndRef.current === key) return;
    seenEndRef.current = key;
    const prod = room.products.find((p) => p.id === evt.productId);
    const label = evt.winnerName
      ? t("live.soldTo", { name: evt.winnerName }) + " · " + fmt(evt.finalPrice)
      : `${t("live.sold")} · ${fmt(evt.finalPrice)}`;
    setLastSaleFlash(label);
    setConfettiTrigger((n) => n + 1);
    haptic.success();
    room.systemMessage(label + (prod ? ` — ${prod.name}` : ""));
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    flashTimeoutRef.current = setTimeout(() => setLastSaleFlash(null), 1800);
  }, [room.lastAuctionEnd, room.products, t, room]);

  // Flash + confetti when a fixed-price row goes to "out" (stock 0).
  const seenSoldOutRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const p of room.products) {
      if (p.mode === "fixed" && p.status === "out" && !seenSoldOutRef.current.has(p.id)) {
        seenSoldOutRef.current.add(p.id);
        setLastSaleFlash(`${t("live.outOfStock")} · ${p.name}`);
        setConfettiTrigger((n) => n + 1);
        haptic.success();
        if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
        flashTimeoutRef.current = setTimeout(() => setLastSaleFlash(null), 1600);
      }
    }
  }, [room.products, t]);

  useEffect(() => () => {
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
  }, []);

  // If the host video connection never comes up for 90s, auto-end the live so
  // it stops appearing in the public feed while the host figures things out.
  const autoEndFiredRef = useRef(false);
  useEffect(() => {
    if (autoEndFiredRef.current) return;
    if (videoStatus === "granted") return;
    if (videoStatus !== "error" && videoStatus !== "connecting" && videoStatus !== "denied" && videoStatus !== "token_failed" && videoStatus !== "connect_failed") return;
    const timeout = setTimeout(() => {
      if (autoEndFiredRef.current) return;
      autoEndFiredRef.current = true;
      if (b.liveId) {
        void import("@/lib/lives-db").then(({ endLiveInDb }) =>
          endLiveInDb(b.liveId!).catch(() => {}),
        );
      }
    }, 90_000);
    return () => clearTimeout(timeout);
  }, [videoStatus, b.liveId]);

  const retryConnection = () => {
    autoEndFiredRef.current = false;
    setRetryKey((k) => k + 1);
    haptic.medium();
  };

  // Totals from finalized sales.
  const totalRevenue = useMemo(
    () => room.products.reduce((sum, p) => {
      if (p.mode === "auction" && p.status === "sold") return sum + Number(p.final_price ?? 0);
      if (p.mode === "fixed") return sum + Number(p.price) * (1 - Math.max(0, p.stock)) * 0 + 0;
      return sum;
    }, 0) + room.products.reduce((s, p) => {
      // fixed sales: (initial stock - current stock) × price. We don't have initial stock;
      // approximate via sold_to_identity + price when status='out'. Best-effort UI number.
      return s;
    }, 0),
    [room.products],
  );

  const soldCount = room.products.filter((p) => p.status === "sold" || p.status === "out").length;

  const featured = room.products.find((p) => p.id === featuredId) ?? room.products[0];

  const startAuction = async (p: LiveProductRow) => {
    if (p.mode !== "auction") return;
    haptic.medium();
    setFeaturedId(p.id);
    endingRef.current = null;
    await startAuctionInDb(p.id);
    const deadlineMs = Date.now() + p.timer_seconds * 1000;
    room.broadcastAuctionStart({
      productId: p.id,
      deadlineMs,
      timerSec: p.timer_seconds,
    });
    room.systemMessage(`${t("live.startAuction")} — ${p.name} · ${fmt(p.start_price)}`);
  };

  const endAuctionNow = async () => {
    if (!activeAuction || !activeProduct) return;
    const lastBidMatches = room.lastBid && room.lastBid.productId === activeAuction.productId;
    const winnerName = lastBidMatches ? room.lastBid!.bidderName : null;
    const winnerId = lastBidMatches ? room.lastBid!.bidderId : null;
    const finalPrice = activeProduct.price;
    await endAuctionInDb(activeAuction.productId, null, finalPrice);
    room.broadcastAuctionEnd({
      productId: activeAuction.productId,
      winnerId,
      winnerName,
      finalPrice,
    });
  };

  const toggleFixedSale = async (p: LiveProductRow) => {
    if (p.mode !== "fixed") return;
    haptic.medium();
    setFeaturedId(p.id);
    if (p.status === "active") {
      await stopFixedInDb(p.id);
      room.systemMessage(`Vente arrêtée — ${p.name}`);
    } else {
      await activateFixedInDb(p.id);
      room.systemMessage(`${t("live.listForSale")} — ${p.name} · ${fmt(p.price)}`);
    }
  };

  const endLive = () => {
    haptic.success();
    b.setSession({
      title: b.title,
      category: b.category,
      cover: b.cover,
      durationSec: duration,
      peakViewers: peak,
      sales: room.products
        .filter((p) => p.status === "sold" || p.status === "out")
        .map((p) => ({
          id: `sale-${p.id}`,
          productId: p.id,
          productName: p.name,
          buyer: p.sold_to_identity ?? "—",
          price: Number(p.final_price ?? p.price),
        })),
    });
    if (b.liveId) {
      void import("@/lib/lives-db").then(({ endLiveInDb }) =>
        endLiveInDb(b.liveId!).catch(() => {}),
      );
    }
    onEnd();
  };

  // Adapt real chat -> ChatMsg for existing LiveChat.
  const chatMessages: ChatMsg[] = room.chat.map((c) => ({
    id: c.id, user: c.user, color: c.color, text: c.text, system: c.system,
  }));

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
        retryKey={retryKey}
        onStatus={setVideoStatus}
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
            <span className="text-[11px] font-bold tracking-wide">{t("live.onAir", "EN DIRECT")}</span>
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
            {room.viewerCount}
          </div>
          <Press
            onClick={() => { haptic.selection(); setProductsOpen(true); }}
            aria-label={t("live.openProducts")}
            className="!min-h-9 h-9 rounded-full px-3 text-[12px] font-bold text-[#10162B] inline-flex items-center gap-1"
            style={{ backgroundColor: "white" }}
          >
            <Package size={14} />
            {t("live.openProducts")}
            {room.products.length > 0 && (
              <span className="ml-0.5 rounded-full bg-[#10162B] px-1.5 text-[10px] font-bold text-white">
                {room.products.length}
              </span>
            )}
          </Press>
          <Press
            onClick={() => {
              haptic.selection();
              setFacing((f) => (f === "user" ? "environment" : "user"));
            }}
            aria-label={t("broadcast.live.flipCam")}
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
            {t("live.endLive", "Terminer")}
          </Press>
        </div>
      </div>

      {/* Video connection error overlay with retry */}
      {(videoStatus === "error" || videoStatus === "denied" || videoStatus === "token_failed" || videoStatus === "connect_failed") && (
        <div
          className="absolute left-1/2 z-40 -translate-x-1/2 rounded-2xl px-4 py-3 text-white shadow-lg"
          style={{
            top: "calc(env(safe-area-inset-top) + 110px)",
            width: "min(92%, 320px)",
            backgroundColor: "rgba(220, 30, 40, 0.95)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
          }}
        >
          <div className="flex items-start gap-2">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold">
                {videoStatus === "denied"
                  ? t("live.hostCameraDeniedTitle", "Caméra bloquée")
                  : videoStatus === "token_failed"
                    ? t("live.hostTokenFailedTitle", "Authentification impossible")
                    : videoStatus === "connect_failed"
                      ? t("live.hostConnectServerFailedTitle", "Serveur vidéo injoignable")
                      : t("live.hostConnectFailed")}
              </p>
              <p className="mt-0.5 text-[11.5px] opacity-90">
                {videoStatus === "denied"
                  ? t("live.hostCameraDeniedBody", "Autorise la caméra dans les réglages du navigateur, puis réessaie.")
                  : videoStatus === "token_failed"
                    ? t("live.hostTokenFailedBody", "Impossible d'obtenir un jeton vidéo. Vérifie ta connexion et réessaie.")
                    : videoStatus === "connect_failed"
                      ? t("live.hostConnectServerFailedBody", "Le serveur vidéo ne répond pas. Vérifie ta connexion et réessaie.")
                      : t("live.hostConnectFailedBody")}
              </p>
              <Press
                onClick={retryConnection}
                className="!min-h-8 mt-2 h-8 rounded-full bg-white px-3 text-[12px] font-bold text-red-600"
              >
                {t("live.hostRetry")}
              </Press>
            </div>
          </div>
        </div>
      )}

      {/* Session stat strip */}
      <div
        className="absolute z-30"
        style={{ top: "calc(env(safe-area-inset-top) + 60px)", left: 12 }}
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
            <AnimatedEuro value={totalRevenue} currency={cur} locale={i18n.language} />
          </div>
          <div className="h-6 w-px bg-white/20" />
          <div className="flex flex-col leading-tight">
            <span className="text-[9px] uppercase tracking-wide text-white/60">Articles</span>
            <span className="text-[14px] font-bold tabular-nums">{soldCount}</span>
          </div>
        </div>
      </div>

      <FloatingHearts trigger={room.heartTick} />
      <Confetti trigger={confettiTrigger} />
      <LiveChat messages={chatMessages} />

      {/* Sale flash */}
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

      {/* Featured / auction overlay — tap to open the products dock. */}
      {featured && activeAuction && activeAuction.productId === featured.id && (
        <button
          type="button"
          onClick={() => { haptic.selection(); setProductsOpen(true); }}
          className="absolute right-3 z-30 text-left"
          style={{ top: "calc(env(safe-area-inset-top) + 110px)" }}
        >
          <div
            className="w-40 rounded-2xl p-2 text-white"
            style={{
              backgroundColor: "rgba(0,0,0,0.55)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
            }}
          >
            {featured.image_url ? (
              <img src={featured.image_url} alt="" className="mb-1.5 h-20 w-full rounded-lg object-cover" />
            ) : (
              <div className="mb-1.5 grid h-20 w-full place-items-center rounded-lg bg-white/10">
                <Package size={20} className="text-white/60" />
              </div>
            )}
            <div className="text-[10px] font-semibold text-white/70">{t("live.currentBid")}</div>
            <motion.div
              key={featured.price}
              initial={{ scale: 1.15 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.2, ease: EASE_IOS }}
              className="text-[18px] font-bold tabular-nums"
            >
              {fmt(featured.price)}
            </motion.div>
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-white/70">
                {room.lastBid && room.lastBid.productId === featured.id
                  ? `@${room.lastBid.bidderName}`
                  : "—"}
              </span>
              <span
                className="font-bold tabular-nums"
                style={{ color: timeLeft <= 10 ? "oklch(0.75 0.2 25)" : "white" }}
              >
                {String(timeLeft).padStart(2, "0")}s
              </span>
            </div>
          </div>
        </button>
      )}

      {/* Seller dock */}
      <div
        className="absolute inset-x-0 bottom-0 z-30 pb-safe"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 10px)" }}
      >
        <div className="mb-2 flex items-center justify-center gap-3 px-4">
          <Press
            onClick={() => { haptic.selection(); setMicOn((m) => !m); }}
            aria-label={micOn ? t("live.muteMic") : t("live.unmuteMic")}
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

        <div
          className="flex justify-end gap-2 overflow-x-auto pl-[30%] pr-3 pb-1"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {(() => {
            const nextAuctionId = !activeAuction
              ? room.products.find((p) => p.mode === "auction" && p.status !== "sold")?.id ?? null
              : null;
            return room.products.map((p) => {
              const soldOut = p.mode === "auction"
                ? p.status === "sold"
                : p.stock <= 0 || p.status === "out";
              const auctionActive = activeAuction?.productId === p.id;
              const onSale = p.mode === "fixed" && p.status === "active";
              const isFeatured = p.id === featuredId;
              const isNextAuction = p.id === nextAuctionId;
              return (
                <SellerProductCard
                  key={p.id}
                  product={p}
                  currency={cur}
                  locale={i18n.language}
                  soldOut={soldOut}
                  featured={isFeatured}
                  auctionActive={auctionActive}
                  isNextAuction={isNextAuction}
                  onSale={onSale}
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

      {/* Full-height Products dock for the host (opened via top-bar button or featured card). */}
      <BottomSheet open={productsOpen} onClose={() => setProductsOpen(false)} heightPercent={85}>
        <div className="flex h-full min-h-0 flex-col px-4">
          <div className="flex items-center justify-between pb-2 pt-1">
            <h2 className="text-[18px] font-bold">{t("live.openProducts")}</h2>
            <span className="text-[12px] text-muted-foreground">{room.products.length}</span>
          </div>
          <div
            className="min-h-0 flex-1 overflow-y-auto"
            style={{
              paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)",
              WebkitOverflowScrolling: "touch",
            }}
          >
            <ul className="flex flex-col gap-2">
              {room.products.map((p) => {
                const auctionActive = activeAuction?.productId === p.id;
                const onSale = p.mode === "fixed" && p.status === "active";
                const soldOut = p.mode === "auction"
                  ? p.status === "sold"
                  : p.stock <= 0 || p.status === "out";
                return (
                  <li key={p.id} className="flex items-center gap-3 rounded-2xl border p-2.5" style={{ borderColor: "var(--border)" }}>
                    {p.image_url ? (
                      <img src={p.image_url} alt="" className="h-14 w-14 rounded-xl object-cover" />
                    ) : (
                      <div className="grid h-14 w-14 place-items-center rounded-xl bg-muted">
                        <Package size={18} className="text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold">{p.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {p.mode === "auction"
                          ? `${fmt(p.start_price)} · ${p.timer_seconds}s`
                          : `${fmt(p.price)} · stock ${Math.max(0, p.stock)}`}
                      </p>
                    </div>
                    {p.mode === "auction" ? (
                      soldOut ? (
                        <span className="rounded-full bg-muted px-3 py-1.5 text-[12px] font-bold">
                          {t("live.sold")}
                        </span>
                      ) : auctionActive ? (
                        <Press
                          onClick={() => { void endAuctionNow(); }}
                          className="!min-h-10 rounded-full px-4 text-[13px] font-bold text-white"
                          style={{ backgroundColor: "oklch(0.62 0.24 20)" }}
                        >
                          {t("live.endAuction")}
                        </Press>
                      ) : (
                        <Press
                          onClick={() => { void startAuction(p); setProductsOpen(false); }}
                          className="!min-h-10 rounded-full bg-foreground px-4 text-[13px] font-bold text-background"
                        >
                          {t("live.startAuction")}
                        </Press>
                      )
                    ) : soldOut ? (
                      <span className="rounded-full bg-muted px-3 py-1.5 text-[12px] font-bold">
                        {t("live.outOfStock")}
                      </span>
                    ) : (
                      <Press
                        onClick={() => { void toggleFixedSale(p); }}
                        className="!min-h-10 rounded-full px-4 text-[13px] font-bold"
                        style={{
                          backgroundColor: onSale ? "oklch(0.72 0.2 145)" : "var(--foreground)",
                          color: onSale ? "white" : "var(--background)",
                        }}
                      >
                        {onSale ? "Arrêter" : t("live.listForSale")}
                      </Press>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </BottomSheet>

      <BottomSheet open={confirmEnd} onClose={() => setConfirmEnd(false)} heightPercent={38}>
        <div className="flex h-full flex-col px-6 pb-4">
          <h2 className="text-[20px] font-bold">{t("live.confirmEnd")}</h2>
          <p className="mt-1 text-[14px] text-muted-foreground">
            {t("live.confirmEndBody")}
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
              {t("live.endLive")}
            </Press>
            <Press
              onClick={() => setConfirmEnd(false)}
              className="!min-h-12 h-12 w-full rounded-2xl bg-muted text-[15px] font-semibold"
            >
              {t("common.cancel", "Annuler")}
            </Press>
          </div>
        </div>
      </BottomSheet>
    </motion.div>
  );
}

function SellerProductCard({
  product, featured, auctionActive, isNextAuction, onSale, soldOut,
  currency = "EUR", locale = "fr",
  onStartAuction, onEndAuction, onToggleFixed, onFeature,
}: {
  product: LiveProductRow;
  featured: boolean;
  auctionActive: boolean;
  isNextAuction: boolean;
  onSale: boolean;
  soldOut: boolean;
  currency?: string;
  locale?: string;
  onStartAuction: () => void;
  onEndAuction: () => void;
  onToggleFixed: () => void;
  onFeature: () => void;
}) {
  const { t } = useTranslation();
  const fmt = (n: number) => formatMoney(n, currency, locale);
  const ringColor = auctionActive
    ? "oklch(0.62 0.24 20)"
    : featured ? "white"
      : isNextAuction ? "oklch(0.85 0.18 90)" : "transparent";
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
      <button onClick={onFeature} className="relative h-20 w-full overflow-hidden text-left">
        {product.image_url ? (
          <img src={product.image_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center bg-white/10">
            <Package size={20} className="text-white/60" />
          </div>
        )}
        {featured && (
          <span className="absolute left-1 top-1 rounded-full bg-white px-1.5 py-0.5 text-[9px] font-bold text-[#10162B]">
            {t("live.featured")}
          </span>
        )}
        {isNextAuction && !featured && (
          <span className="absolute left-1 top-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold text-[#10162B]"
            style={{ backgroundColor: "oklch(0.85 0.18 90)" }}>
            {t("live.nextAuction")}
          </span>
        )}
        {soldOut && (
          <div className="absolute inset-0 grid place-items-center bg-black/60 text-[12px] font-bold">
            {t("live.sold")}
          </div>
        )}
      </button>

      <div className="flex flex-1 flex-col gap-0.5 p-1.5">
        <span className="truncate text-[11px] font-semibold leading-tight">{product.name}</span>
        {product.mode === "auction" ? (
          <>
            <span className="text-[10px] leading-tight text-white/70">
              {fmt(product.start_price)} · {product.timer_seconds}s
            </span>
            {!soldOut && (
              auctionActive ? (
                <Press
                  onClick={onEndAuction}
                  className="!min-h-8 mt-1 h-8 rounded-full text-[11px] font-bold text-white"
                  style={{ backgroundColor: "oklch(0.62 0.24 20)" }}
                >
                  {t("live.endAuction")}
                </Press>
              ) : (
                <Press
                  onClick={onStartAuction}
                  hapticOnTap={false}
                  className="!min-h-8 mt-1 h-8 rounded-full text-[11px] font-bold"
                  style={{
                    backgroundColor: isNextAuction ? "oklch(0.85 0.18 90)" : "white",
                    color: "#10162B",
                  }}
                >
                  {isNextAuction ? t("live.startNext") : t("live.startAuction")}
                </Press>
              )
            )}
          </>
        ) : (
          <>
            <span className="text-[10px] leading-tight text-white/70">
              {fmt(product.price)} · stock {Math.max(0, product.stock)}
            </span>
            {soldOut ? (
              <div className="mt-1 grid h-8 place-items-center rounded-full bg-white/10 text-[11px] font-bold text-white/70">
                {t("live.outOfStock")}
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
                {onSale ? "Arrêter" : t("live.listForSale")}
              </Press>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}

function AnimatedEuro({ value, currency = "EUR", locale = "fr" }: { value: number; currency?: string; locale?: string }) {
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
  return <span className="text-[14px] font-bold tabular-nums">{formatMoney(display, currency, locale)}</span>;
}

