import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, animate } from "framer-motion";
import {
  Eye, Package, AlertTriangle, X, Shield, Trash2,
} from "lucide-react";
import { HostToolRail } from "./host-tool-rail";
import { useModerators, addModerator, removeModerator } from "@/lib/moderators-db";
import { useAuth } from "@/lib/auth-context";
import type { BroadcastVideoHandle } from "./broadcast-video";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Press } from "@/components/press";
import { BroadcastVideo } from "./broadcast-video";
import { AddProductSheet } from "./add-product-sheet";
import { LiveChat } from "@/components/live-viewer/live-chat";
import { FloatingHearts } from "@/components/live-viewer/floating-hearts";
import { Confetti } from "@/components/live-viewer/confetti";
import { BottomSheet } from "@/components/live-viewer/bottom-sheet";
import { LiveProductImage } from "@/components/live-viewer/live-product-image";
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
  startAuctionInDb, finalizeAuctionInDb, activateFixedInDb, stopFixedInDb,
  createLiveProductInDb, relaunchUnsoldProductInDb,
  type LiveProductRow,
} from "@/lib/lives-db";
import { supabase } from "@/integrations/supabase/client";
import { resolveAvatarUrl } from "@/lib/avatar-url";
import { AUCTION_EXTENSION_WINDOW_SECONDS, AUCTION_EXTENSION_RESET_SECONDS } from "@/lib/fees";
import { WinnerReveal } from "@/components/live-viewer/winner-reveal";
import { SuddenDeathFlash } from "@/components/live-viewer/sudden-death-flash";
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
  const [lastBidFlash, setLastBidFlash] = useState<string | null>(null);
  const [videoStatus, setVideoStatus] = useState<import("./broadcast-video").BroadcastStatus>("idle");
  const [retryKey, setRetryKey] = useState(0);
  const [productsOpen, setProductsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addingProduct, setAddingProduct] = useState(false);
  const [canFlip, setCanFlip] = useState(false);
  const [moderatorsSheetOpen, setModeratorsSheetOpen] = useState(false);
  const videoHandleRef = useRef<BroadcastVideoHandle>(null);
  const { user } = useAuth();
  const { moderators } = useModerators(b.liveId);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hide the app's bottom tab bar while the host is on-air.
  useImmersiveScope(true);

  // Local image fallback: if signing the storage path fails on the host, we
  // still have the original File (or absolute URL) in the broadcast context.
  // This guarantees the seller ALWAYS sees their own product images even if
  // the storage signing request transiently 401s / times out.
  const localImageMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const bp of b.products) {
      if (!bp.dbId) continue;
      if (bp.imageFile) map.set(bp.dbId, URL.createObjectURL(bp.imageFile));
      else if (bp.image && !isBlobUrl(bp.image)) map.set(bp.dbId, bp.image);
    }
    return map;
  }, [b.products]);
  useEffect(() => {
    return () => {
      for (const url of localImageMap.values()) {
        if (url.startsWith("blob:")) URL.revokeObjectURL(url);
      }
    };
  }, [localImageMap]);
  const imgFor = useCallback(
    (p: LiveProductRow) => p.image_url || localImageMap.get(p.id) || null,
    [localImageMap],
  );

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

  // Featured auto-advances FORWARD only. When the current featured is
  // finished (sold / unsold / out) or removed, we pick the next product by
  // ascending position whose status is 'upcoming' — never loop back to an
  // earlier item. When none remain, `featuredId` is cleared and the "all
  // done" state renders.
  useEffect(() => {
    if (room.products.length === 0) {
      if (featuredId) setFeaturedId("");
      return;
    }
    const cur = room.products.find((p) => p.id === featuredId);
    const done = cur && (cur.status === "sold" || cur.status === "out" || cur.status === "unsold");
    if (!cur || done) {
      const curPos = cur?.position ?? -1;
      const sorted = [...room.products].sort((a, b) => a.position - b.position);
      const next = sorted.find(
        (p) => p.position > curPos && p.status === "upcoming",
      );
      setFeaturedId(next?.id ?? "");
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

  // Helper — resolve the winner's avatar URL so all viewers can render it in
  // the reveal animation. Best-effort: falls back to null on any failure.
  const resolveWinnerAvatar = useCallback(async (winnerId: string | null): Promise<string | null> => {
    if (!winnerId) return null;
    try {
      const { data } = await supabase
        .from("profiles")
        .select("avatar_url")
        .eq("id", winnerId)
        .maybeSingle();
      if (!data?.avatar_url) return null;
      return (await resolveAvatarUrl(data.avatar_url)) ?? null;
    } catch {
      return null;
    }
  }, []);

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
    const productId = activeAuction.productId;
    void (async () => {
      const [res, winnerAvatarUrl] = await Promise.all([
        finalizeAuctionInDb({
          liveId: b.liveId!, productId, winnerId, winnerName, finalPrice,
        }),
        resolveWinnerAvatar(winnerId),
      ]);
      room.broadcastAuctionEnd({
        productId, winnerId, winnerName, winnerAvatarUrl, finalPrice,
        orderId: res.orderId ?? null, autoPaid: !!res.autoPaid,
      });
    })();
  }, [timeLeft, activeAuction, activeProduct, room, b.liveId, resolveWinnerAvatar]);

  // ---- Sudden-death / anti-snipe extension ----
  // Whenever a new realtime bid lands on the active auction with less than
  // AUCTION_EXTENSION_WINDOW seconds remaining, extend the deadline to
  // AUCTION_EXTENSION_RESET seconds from now — for everyone, in sync.
  // Extensions chain indefinitely while bids keep coming.
  const seenExtendBidRef = useRef<number | null>(null);
  useEffect(() => {
    const bid = room.lastBid;
    if (!bid) return;
    if (seenExtendBidRef.current === bid.ts) return;
    seenExtendBidRef.current = bid.ts;
    if (!activeAuction || bid.productId !== activeAuction.productId) return;
    const msLeft = activeAuction.deadlineMs - Date.now();
    if (msLeft <= 0) return;
    if (msLeft > AUCTION_EXTENSION_WINDOW_SECONDS * 1000) return;
    const newDeadline = Date.now() + AUCTION_EXTENSION_RESET_SECONDS * 1000;
    // Only extend if the new deadline is actually later.
    if (newDeadline <= activeAuction.deadlineMs) return;
    room.broadcastAuctionExtend({ productId: activeAuction.productId, deadlineMs: newDeadline });
  }, [room.lastBid, activeAuction, room]);

  // Sudden-death flash for everyone (host sees it too).
  const [suddenDeathTick, setSuddenDeathTick] = useState(0);
  const seenExtRef = useRef<number | null>(null);
  useEffect(() => {
    const ext = room.lastExtension;
    if (!ext || seenExtRef.current === ext.ts) return;
    seenExtRef.current = ext.ts;
    setSuddenDeathTick((n) => n + 1);
    haptic.warning();
  }, [room.lastExtension]);

  // React to auction:end (from ourselves too) — flash + confetti + system msg + reveal.
  const [winnerReveal, setWinnerReveal] = useState<{
    key: number;
    name: string | null;
    avatar: string | null;
  } | null>(null);
  const seenEndRef = useRef<string | null>(null);
  useEffect(() => {
    const evt = room.lastAuctionEnd;
    if (!evt) return;
    const key = `${evt.productId}-${evt.finalPrice}-${evt.winnerId ?? "none"}`;
    if (seenEndRef.current === key) return;
    seenEndRef.current = key;
    const prod = room.products.find((p) => p.id === evt.productId);
    // No winner → UNSOLD: no confetti, no winner reveal, no sale flash.
    if (!evt.winnerName || !evt.winnerId) {
      const label = t("live.unsoldFlash", { name: prod?.name ?? "produit" });
      setLastSaleFlash(label);
      room.systemMessage(label);
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
      flashTimeoutRef.current = setTimeout(() => setLastSaleFlash(null), 1800);
      return;
    }
    const label = t("live.soldTo", { name: evt.winnerName }) + " · " + fmt(evt.finalPrice);
    setLastSaleFlash(label);
    setConfettiTrigger((n) => n + 1);
    haptic.success();
    room.systemMessage(label + (prod ? ` — ${prod.name}` : ""));
    setWinnerReveal({
      key: Date.now(),
      name: evt.winnerName,
      avatar: evt.winnerAvatarUrl ?? null,
    });
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    flashTimeoutRef.current = setTimeout(() => setLastSaleFlash(null), 1800);
  }, [room.lastAuctionEnd, room.products, t, room, fmt]);

  // Host-visible bid flash for every new realtime bid.
  const seenBidRef = useRef<number | null>(null);
  useEffect(() => {
    const bid = room.lastBid;
    if (!bid || seenBidRef.current === bid.ts) return;
    seenBidRef.current = bid.ts;
    const prod = room.products.find((p) => p.id === bid.productId);
    setLastBidFlash(`${bid.bidderName} · ${fmt(bid.amount)}${prod ? ` — ${prod.name}` : ""}`);
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    flashTimeoutRef.current = setTimeout(() => setLastBidFlash(null), 1600);
  }, [room.lastBid, room.products]);


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
    // Ask the server to flip the row to active AND persist the deadline. We
    // then broadcast the SAME absolute epoch ms to every viewer, and the
    // host's own countdown reads from broadcastAuctionStart(...) — a single
    // deadline source keeps host, viewers, and late joiners in sync (±1s
    // clock drift). Fall back to a local computation if the RPC fails so
    // the auction still runs.
    const res = await startAuctionInDb(p.id);
    const deadlineMs = res.ok && res.deadlineMs ? res.deadlineMs : Date.now() + p.timer_seconds * 1000;
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
    const productId = activeAuction.productId;
    const [res, winnerAvatarUrl] = await Promise.all([
      finalizeAuctionInDb({
        liveId: b.liveId!, productId, winnerId, winnerName, finalPrice,
      }),
      resolveWinnerAvatar(winnerId),
    ]);
    room.broadcastAuctionEnd({
      productId, winnerId, winnerName, winnerAvatarUrl, finalPrice,
      orderId: res.orderId ?? null, autoPaid: !!res.autoPaid,
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

  const endLive = async () => {
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
      const { endLiveInDb } = await import("@/lib/lives-db");
      await endLiveInDb(b.liveId).catch(() => {});
    }
    onEnd();
  };

  const onAddProductMidLive = async (p: Omit<BProduct, "id">) => {
    if (!b.liveId || !b.hostIdentity || addingProduct) return;
    setAddingProduct(true);
    const res = await createLiveProductInDb({
      liveId: b.liveId,
      userId: b.hostIdentity,
      name: p.name,
      imageFile: p.imageFile ?? null,
      imageUrl: p.image,
      mode: p.mode,
      startPrice: p.startPrice,
      price: p.price,
      stock: p.stock,
      timerSeconds: p.timerSec,
    });
    setAddingProduct(false);
    if (!res.ok) {
      toast.error(res.error ?? t("common.error", "Une erreur est survenue"));
      return;
    }
    // Register in local context so the image-fallback map picks up this dbId.
    b.addProduct({ ...p, dbId: res.id });
    haptic.success();
    toast.success(t("live.productAdded", "Produit ajouté"));
  };
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
        ref={videoHandleRef}
        facing={facing}
        enabled={cameraOn}
        micEnabled={micOn}
        fallbackImage={b.cover}
        retryKey={retryKey}
        onStatus={setVideoStatus}
        onCanFlipChange={setCanFlip}
        livekit={
          b.roomName && b.hostIdentity
            ? { room: b.roomName, identity: b.hostIdentity, name: b.hostName }
            : undefined
        }
      />

      {/* Compact top bar — fits at 320pt width. Grid layout: leading pills |
          spacer | trailing controls. Every pill has min-w-0 so text can
          truncate without pushing the end button off-screen. */}
      <div
        className="absolute inset-x-0 top-0 z-30 grid grid-cols-[auto_auto_1fr_auto_auto] items-center gap-1.5 px-2"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 8px)" }}
      >
        {/* Live pill: pulsing red dot + timer merged (no "EN DIRECT" text). */}
        <div
          className="flex items-center gap-1.5 rounded-full px-2 py-1 text-white"
          style={{
            backgroundColor: "rgba(220, 30, 40, 0.95)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
          }}
        >
          <motion.span
            animate={{ opacity: [1, 0.35, 1] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
            className="h-1.5 w-1.5 rounded-full bg-white"
          />
          <span className="text-[11px] font-bold tabular-nums">{fmtDuration(duration)}</span>
        </div>
        {/* Viewer count */}
        <div
          className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold text-white tabular-nums"
          style={{
            backgroundColor: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
          }}
        >
          <Eye size={12} />
          {room.viewerCount}
        </div>
        {/* Spacer */}
        <div className="min-w-0" />
        {/* Products icon-only pill with count badge */}
        <Press
          onClick={() => { haptic.selection(); setProductsOpen(true); }}
          aria-label={t("live.openProducts")}
          className="!min-h-9 !min-w-9 relative h-9 w-9 rounded-full text-white"
          style={{
            backgroundColor: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
          }}
        >
          <Package size={16} />
          {room.products.length > 0 && (
            <span
              className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[9px] font-bold text-[#10162B]"
              style={{ backgroundColor: "oklch(0.85 0.18 90)" }}
            >
              {room.products.length}
            </span>
          )}
        </Press>
        {/* End-live pill: compact icon+word, red. */}
        <Press
          onClick={() => setConfirmEnd(true)}
          aria-label={t("live.endLive")}
          className="!min-h-9 h-9 min-w-0 shrink-0 rounded-full pl-2 pr-3 text-[12px] font-bold text-white inline-flex items-center gap-1"
          style={{ backgroundColor: "rgba(220, 30, 40, 0.95)" }}
        >
          <X size={14} />
          <span className="truncate">{t("live.endLive")}</span>
        </Press>
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
      <WinnerReveal
        key={winnerReveal?.key ?? "wr"}
        open={!!winnerReveal}
        winnerName={winnerReveal?.name ?? null}
        winnerAvatarUrl={winnerReveal?.avatar ?? null}
        isMe={false}
        onDone={() => setWinnerReveal(null)}
      />
      <SuddenDeathFlash tick={suddenDeathTick} />
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

      {/* New bid flash */}
      <AnimatePresence>
        {lastBidFlash && !lastSaleFlash && (
          <motion.div
            key={lastBidFlash}
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.22, ease: EASE_IOS }}
            className="absolute left-1/2 top-24 z-40 -translate-x-1/2 rounded-full px-4 py-2 text-[13px] font-bold text-white"
            style={{
              background: "linear-gradient(135deg, oklch(0.7 0.2 55), oklch(0.62 0.2 35))",
              boxShadow: "0 8px 24px rgba(255,130,30,0.28)",
            }}
          >
            {lastBidFlash}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Featured / auction overlay — tap to open the products dock. */}
      {/* Compact featured card (top-right). Always shown while a product is
          queued; swaps in the next upcoming one automatically after a sale. */}
      <AnimatePresence mode="wait">
        {featured ? (
          <motion.button
            key={featured.id}
            type="button"
            onClick={() => { haptic.selection(); setProductsOpen(true); }}
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: 0.25, ease: EASE_IOS }}
            className="absolute right-3 z-30 text-left"
            style={{ top: "calc(env(safe-area-inset-top) + 110px)" }}
          >
            <div
              className="w-28 rounded-2xl p-1.5 text-white"
              style={{
                backgroundColor: "rgba(0,0,0,0.55)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
              }}
            >
              <div className="relative mb-1">
                <LiveProductImage
                  src={imgFor(featured)}
                  className="h-14 w-full rounded-lg object-cover"
                  iconClassName="text-white/60"
                />
                <span className="absolute left-1 top-1 rounded-full bg-white px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wide text-[#10162B]">
                  {t("live.featured")}
                </span>
              </div>
              <div className="truncate text-[10.5px] font-semibold leading-tight">
                {featured.name}
              </div>
              {activeAuction && activeAuction.productId === featured.id ? (
                <>
                  <div className="mt-0.5 text-[8.5px] font-semibold uppercase tracking-wide text-white/60">
                    {t("live.currentBid")}
                  </div>
                  <div className="flex items-baseline justify-between gap-1">
                    <motion.span
                      key={featured.price}
                      initial={{ scale: 1.15 }}
                      animate={{ scale: 1 }}
                      transition={{ duration: 0.2, ease: EASE_IOS }}
                      className="text-[13px] font-bold tabular-nums"
                    >
                      {fmt(featured.price)}
                    </motion.span>
                    <span
                      className="text-[10px] font-bold tabular-nums"
                      style={{ color: timeLeft <= 10 ? "oklch(0.75 0.2 25)" : "white" }}
                    >
                      {String(timeLeft).padStart(2, "0")}s
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="truncate text-[10px] leading-tight text-white/70">
                    {featured.mode === "auction"
                      ? `${fmt(featured.start_price)} · ${featured.timer_seconds}s`
                      : `${fmt(featured.price)} · stock ${Math.max(0, featured.stock)}`}
                  </div>
                  <Press
                    onClick={(e) => {
                      e.stopPropagation();
                      if (featured.mode === "auction") void startAuction(featured);
                      else void toggleFixedSale(featured);
                    }}
                    hapticOnTap={false}
                    className="!min-h-7 mt-1 h-7 w-full rounded-full bg-white px-2 text-[10.5px] font-bold text-[#10162B]"
                  >
                    {featured.mode === "auction"
                      ? `${t("live.startAuction")} ▸`
                      : t("live.listForSale")}
                  </Press>
                </>
              )}
            </div>
          </motion.button>
        ) : room.products.length > 0 ? (
          <motion.div
            key="all-done"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE_IOS }}
            className="absolute right-3 z-30"
            style={{ top: "calc(env(safe-area-inset-top) + 110px)" }}
          >
            <div
              className="w-28 rounded-2xl p-2 text-center text-white"
              style={{
                backgroundColor: "rgba(0,0,0,0.55)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
              }}
            >
              <div className="text-[11px] font-semibold leading-snug">
                {t("live.allDone", "Tous les articles sont passés ✨")}
              </div>
              <Press
                onClick={() => { haptic.selection(); setAddOpen(true); }}
                className="!min-h-7 mt-1.5 h-7 w-full rounded-full bg-white px-2 text-[10.5px] font-bold text-[#10162B]"
              >
                {t("live.addProduct", "Ajouter")}
              </Press>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Bottom area is chat + featured card only. Mic / cam / flip /
          moderators / add live on the right tool rail. Filters removed. */}
      <HostToolRail
        micOn={micOn}
        camOn={cameraOn}
        canFlip={canFlip}
        moderatorsOpen={moderatorsSheetOpen}
        onToggleMic={() => setMicOn((m) => !m)}
        onToggleCam={() => setCameraOn((c) => !c)}
        onFlip={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
        onOpenModerators={() => setModeratorsSheetOpen(true)}
        onAddProduct={() => setAddOpen(true)}
      />

      {/* Moderators quick-access bottom sheet (opened from the rail). Same
          management surface as the one embedded in the Products dock — this
          is just a shortcut so the host doesn't have to open Products first. */}
      <BottomSheet open={moderatorsSheetOpen} onClose={() => setModeratorsSheetOpen(false)} heightPercent={70}>
        <div className="flex h-full min-h-0 flex-col px-4">
          <div className="flex items-center gap-2 pb-3 pt-1">
            <Shield size={18} />
            <h2 className="text-[18px] font-bold">{t("moderator.title", "Modérateurs")}</h2>
          </div>
          <div
            className="min-h-0 flex-1 overflow-y-auto"
            style={{
              paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)",
              WebkitOverflowScrolling: "touch",
            }}
          >
            {moderators.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                {t("moderator.empty", "Aucun modérateur. Promeus un spectateur pour t'aider à gérer les produits.")}
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {moderators.map((m) => (
                  <li
                    key={m.userId}
                    className="flex items-center gap-2.5 rounded-xl border p-2"
                    style={{ borderColor: "var(--border)" }}
                  >
                    {m.avatarUrl ? (
                      <img src={m.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
                    ) : (
                      <div className="grid h-9 w-9 place-items-center rounded-full bg-muted text-[12px] font-bold">
                        {(m.displayName ?? m.handle ?? "?").slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold">{m.displayName ?? m.handle ?? m.userId.slice(0, 8)}</p>
                      {m.handle && <p className="truncate text-[11px] text-muted-foreground">@{m.handle}</p>}
                    </div>
                    <Press
                      onClick={async () => {
                        if (!b.liveId) return;
                        const res = await removeModerator(b.liveId, m.userId);
                        if (!res.ok) toast.error(res.error ?? t("moderator.removeFailed", "Impossible de retirer"));
                        else toast.success(t("moderator.removed", "Modérateur retiré"));
                      }}
                      aria-label={t("moderator.demote", "Retirer")}
                      className="!min-h-9 !min-w-9 h-9 w-9 rounded-full text-destructive"
                    >
                      <Trash2 size={14} />
                    </Press>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4">
              <p className="pb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                {t("moderator.addSection", "Ajouter un modérateur")}
              </p>
              {b.liveId && user && (
                <ModeratorPromoteForm
                  liveId={b.liveId}
                  addedBy={user.id}
                  existingIds={new Set(moderators.map((m) => m.userId))}
                />
              )}
            </div>
          </div>
        </div>
      </BottomSheet>


      {/* Full-height Products dock for the host (opened via top-bar button or featured card). */}
      <BottomSheet open={productsOpen} onClose={() => setProductsOpen(false)} heightPercent={85}>
        <div className="flex h-full min-h-0 flex-col px-4">
          <div className="flex items-center justify-between pb-2 pt-1">
            <h2 className="text-[18px] font-bold">{t("live.openProducts")}</h2>
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-muted-foreground">{room.products.length}</span>
              <Press
                onClick={() => { haptic.selection(); setProductsOpen(false); setAddOpen(true); }}
                className="!min-h-9 inline-flex items-center gap-1.5 rounded-full bg-foreground px-3 text-[12px] font-bold text-background"
              >
                <span className="text-[16px] leading-none">+</span> {t("live.addProduct", "Ajouter")}
              </Press>
            </div>
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
                const imgUrl = imgFor(p);
                return (
                  <li key={p.id} className="flex items-center gap-3 rounded-2xl border p-2.5" style={{ borderColor: "var(--border)" }}>
                    <LiveProductImage
                      src={imgUrl}
                      className="h-14 w-14 rounded-xl object-cover"
                      placeholderClassName="bg-muted"
                      iconClassName="text-muted-foreground"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold">{p.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {p.mode === "auction"
                          ? `${fmt(p.start_price)} · ${p.timer_seconds}s`
                          : `${fmt(p.price)} · stock ${Math.max(0, p.stock)}`}
                      </p>
                    </div>
                    {p.mode === "auction" ? (
                      p.status === "unsold" ? (
                        <div className="flex items-center gap-2">
                          <span
                            className="rounded-full px-2.5 py-1 text-[11px] font-bold text-white"
                            style={{ backgroundColor: "oklch(0.55 0.05 250)" }}
                          >
                            {t("live.unsold")}
                          </span>
                          <Press
                            onClick={async () => {
                              const res = await relaunchUnsoldProductInDb(p.id);
                              if (!res.ok) toast.error(res.error ?? t("common.error", "Une erreur est survenue"));
                              else { haptic.success(); toast.success(t("live.relaunched")); }
                            }}
                            className="!min-h-10 rounded-full bg-foreground px-4 text-[13px] font-bold text-background"
                          >
                            {t("live.relaunch")}
                          </Press>
                        </div>
                      ) : soldOut ? (
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

            {/* Moderators — host manages who can help with product actions. */}
            <div className="mt-5">
              <div className="flex items-center gap-2 pb-2">
                <Shield size={14} className="text-muted-foreground" />
                <h3 className="text-[13px] font-bold uppercase tracking-wide text-muted-foreground">
                  {t("moderator.title", "Modérateurs")}
                </h3>
              </div>
              {moderators.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">
                  {t("moderator.empty", "Aucun modérateur. Promeus un spectateur pour t'aider à gérer les produits.")}
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {moderators.map((m) => (
                    <li
                      key={m.userId}
                      className="flex items-center gap-2.5 rounded-xl border p-2"
                      style={{ borderColor: "var(--border)" }}
                    >
                      {m.avatarUrl ? (
                        <img src={m.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
                      ) : (
                        <div className="grid h-8 w-8 place-items-center rounded-full bg-muted text-[11px] font-bold">
                          {(m.displayName ?? m.handle ?? "?").slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold">{m.displayName ?? m.handle ?? m.userId.slice(0, 8)}</p>
                        {m.handle && <p className="truncate text-[11px] text-muted-foreground">@{m.handle}</p>}
                      </div>
                      <Press
                        onClick={async () => {
                          if (!b.liveId) return;
                          const res = await removeModerator(b.liveId, m.userId);
                          if (!res.ok) toast.error(res.error ?? t("moderator.removeFailed", "Impossible de retirer"));
                          else toast.success(t("moderator.removed", "Modérateur retiré"));
                        }}
                        aria-label={t("moderator.demote", "Retirer")}
                        className="!min-h-9 !min-w-9 h-9 w-9 rounded-full text-destructive"
                      >
                        <Trash2 size={14} />
                      </Press>
                    </li>
                  ))}
                </ul>
              )}
              {b.liveId && user && (
                <ModeratorPromoteForm
                  liveId={b.liveId}
                  addedBy={user.id}
                  existingIds={new Set(moderators.map((m) => m.userId))}
                />
              )}
            </div>
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
              onClick={() => { void endLive(); }}
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

      <AddProductSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={(p) => { void onAddProductMidLive(p); }}
      />
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

/** Compact "promote by handle" form. The host types a @handle (or user id),
 *  we look up the profile and insert into live_moderators. RLS restricts
 *  insertion to the live's seller. */
function ModeratorPromoteForm({
  liveId,
  addedBy,
  existingIds,
}: {
  liveId: string;
  addedBy: string;
  existingIds: Set<string>;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const raw = value.trim().replace(/^@/, "");
    if (!raw) return;
    setBusy(true);
    try {
      // Try handle first, then user id.
      let userId: string | null = null;
      const byHandle = await supabase
        .from("profiles")
        .select("id")
        .eq("handle", raw)
        .maybeSingle();
      if (byHandle.data?.id) userId = byHandle.data.id;
      else {
        const byId = await supabase
          .from("profiles")
          .select("id")
          .eq("id", raw)
          .maybeSingle();
        if (byId.data?.id) userId = byId.data.id;
      }
      if (!userId) { toast.error(t("moderator.notFound", "Profil introuvable")); return; }
      if (existingIds.has(userId)) { toast(t("moderator.alreadyMod", "Déjà modérateur")); return; }
      const res = await addModerator(liveId, userId, addedBy);
      if (!res.ok) toast.error(res.error ?? t("moderator.addFailed", "Ajout impossible"));
      else { toast.success(t("moderator.added", "Modérateur ajouté 🛡️")); setValue(""); }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); void submit(); }}
      className="mt-3 flex items-center gap-2"
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t("moderator.promotePlaceholder", "@handle du spectateur")}
        className="min-w-0 flex-1 rounded-full border px-3 py-2 text-[13px] outline-none"
        style={{ borderColor: "var(--border)" }}
      />
      <Press
        onClick={busy ? undefined : submit}
        disabled={busy || !value.trim()}
        className="!min-h-9 h-9 rounded-full bg-foreground px-3 text-[12px] font-bold text-background disabled:opacity-50"
      >
        {t("moderator.promote", "Promouvoir 🛡️")}
      </Press>
    </form>
  );
}

