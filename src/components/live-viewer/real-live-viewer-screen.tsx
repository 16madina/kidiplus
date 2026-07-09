// Real live viewer screen — used when the tapped stream has a DB id.
// Chat / hearts / auction / buy are wired through Supabase Realtime + DB.
import { AnimatePresence, motion, useMotionValue, animate } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Send, Heart, Plus, Share2, X, Eye, MoreVertical, Flag, UserX } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Press } from "@/components/press";
import { useLiveViewer } from "@/lib/live-viewer-context";
import { useSellerProfile } from "@/lib/seller-profile-context";
import { useAuth } from "@/lib/auth-context";
import { EASE_IOS } from "@/lib/motion";
import { haptic } from "@/lib/haptics";
import { pushStatusBarLight } from "@/lib/native";
import { usePush } from "@/lib/push";
import { useLiveRoom } from "@/lib/live-room";
import { placeBidInDb, purchaseFixedPriceRpc, type LiveProductRow } from "@/lib/lives-db";
import { createPendingOrder, fetchOrderById, type OrderRow } from "@/lib/orders-db";
import { resolveDeliveryForCheckout } from "@/lib/delivery-checkout";
import { systemMessage, type ChatMsg, type Product } from "@/lib/live-viewer-mock";
import { useWallet } from "@/lib/wallet-context";
import { formatMoney, nextBidAmount, normalizeCurrency } from "@/lib/money";
import { LiveChat } from "./live-chat";
import { FloatingHearts } from "./floating-hearts";
import { AuctionCard } from "./auction-card";
import { CustomBidStepper } from "./custom-bid-stepper";
import { ProductsSheet } from "./products-sheet";
import { PaymentSheet } from "@/components/payments/payment-sheet";
import { WalletPill } from "@/components/wallet/wallet-pill";
import { TopUpSheet } from "@/components/wallet/topup-sheet";
import { Confetti } from "./confetti";
import { WinnerReveal } from "./winner-reveal";
import { SuddenDeathFlash } from "./sudden-death-flash";
import { ViewerLiveVideo, type ViewerStatus } from "./viewer-live-video";
import { ReportSheet } from "@/components/moderation/report-sheet";
import { blockUser, refreshBlockedIds, useBlockedIds } from "@/lib/moderation-db";
import { resolveAvatarUrl } from "@/lib/avatar-url";
import { supabase } from "@/integrations/supabase/client";


const FALLBACK_IMG = "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&q=70";

function toProduct(row: LiveProductRow, activeId: string | null): Product {
  const status: Product["status"] =
    row.status === "sold" || row.status === "out"
      ? "sold"
      : row.id === activeId
        ? "current"
        : "upcoming";
  return {
    id: row.id,
    name: row.name,
    image: row.image_url || FALLBACK_IMG,
    mode: row.mode,
    startBid: Number(row.start_price),
    price: Number(row.price),
    status,
    winner: row.sold_to_identity ?? undefined,
  };
}

export function RealLiveViewerScreen() {
  const { t, i18n } = useTranslation();
  const { active, close, next: nextLive, prev: prevLive, hasNext, hasPrev } = useLiveViewer();
  const { open: openSeller } = useSellerProfile();
  const { user, profile } = useAuth();
  const { requestWithPrePrompt } = usePush();
  const { currency: walletCurrency } = useWallet();
  const liveCurrency = normalizeCurrency(active?.currency ?? "EUR");
  const formatLive = (n: number) => formatMoney(n, liveCurrency, i18n.language);

  useEffect(() => {
    let restore: (() => void) | null = null;
    void pushStatusBarLight().then((fn) => { restore = fn; });
    return () => { restore?.(); };
  }, []);

  const identity = user?.id ?? `anon-${useMemo(() => Math.random().toString(36).slice(2, 10), [])}`;
  const displayName = profile?.display_name || profile?.handle || "invité";

  const room = useLiveRoom({
    liveId: active?.liveId ?? null,
    identity,
    displayName,
    isHost: false,
  });
  const [viewerVideoStatus, setViewerVideoStatus] = useState<ViewerStatus>("connecting");
  const [hostDisconnectEnded, setHostDisconnectEnded] = useState(false);
  const liveEnded = room.liveStatus === "ended" || hostDisconnectEnded;

  useEffect(() => {
    if (room.liveStatus === "ended") {
      setHostDisconnectEnded(false);
      return;
    }
    if (viewerVideoStatus !== "ended") {
      setHostDisconnectEnded(false);
      return;
    }
    // Video track has been absent for the debounce window. Before we commit
    // to the "Live terminé" overlay, wait a bit longer AND re-fetch the
    // authoritative lives.status from the DB. Ending an auction (or any
    // realtime hiccup while the sheet is open, Stripe iframe grabbing focus,
    // etc.) must NEVER trigger the ended overlay unless the DB row is
    // actually ended.
    const t = setTimeout(async () => {
      if (!active?.liveId) return;
      const { data } = await supabase
        .from("lives")
        .select("status")
        .eq("id", active.liveId)
        .maybeSingle();
      if (data?.status === "ended") {
        setHostDisconnectEnded(true);
      }
    }, 20_000);
    return () => clearTimeout(t);
  }, [viewerVideoStatus, room.liveStatus, active?.liveId]);

  useEffect(() => {
    if (!liveEnded) return;
    const t = setTimeout(() => close(), 10_000);
    return () => clearTimeout(t);
  }, [liveEnded, close]);

  // Featured product: server auction pick, else first non-sold.
  const activeAuctionId = room.auctionStart?.productId ?? null;
  const currentProduct = useMemo(() => {
    if (activeAuctionId) return room.products.find((p) => p.id === activeAuctionId) ?? null;
    return room.products.find((p) => p.status !== "sold" && p.status !== "out") ?? null;
  }, [room.products, activeAuctionId]);

  // Auction countdown from broadcast deadline.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!room.auctionStart) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [room.auctionStart]);
  const secondsLeft = room.auctionStart
    ? Math.max(0, Math.ceil((room.auctionStart.deadlineMs - now) / 1000))
    : 0;

  // Local chat (welcome msg) + real room chat merged.
  const [localMessages, setLocalMessages] = useState<ChatMsg[]>([]);
  useEffect(() => {
    if (!active) return;
    setLocalMessages([
      systemMessage(t("live.chatIntro", `Bienvenue dans le live de ${active.seller} 👋`)),
    ]);
  }, [active, t]);
  const messages: ChatMsg[] = useMemo(
    () => [...localMessages, ...room.chat.map((c) => ({
      id: c.id, user: c.user, color: c.color, text: c.text, system: c.system,
    }))],
    [localMessages, room.chat],
  );

  // ---------- Payment sheet state ----------
  // A single sheet handles both fixed-price purchases and auction wins.
  const [pendingOrder, setPendingOrder] = useState<OrderRow | null>(null);
  const [topupOpen, setTopupOpen] = useState(false);


  // Sold celebration from server auction:end.
  // If the current user is the winner, open the payment sheet to pay for the item.
  const [confettiKey, setConfettiKey] = useState(0);
  const [winnerReveal, setWinnerReveal] = useState<{
    key: number;
    name: string | null;
    avatar: string | null;
    isMe: boolean;
  } | null>(null);
  const seenEndRef = useRef<string | null>(null);
  useEffect(() => {
    const evt = room.lastAuctionEnd;
    if (!evt) return;
    const key = `${evt.productId}-${evt.finalPrice}`;
    if (seenEndRef.current === key) return;
    seenEndRef.current = key;
    setConfettiKey((k) => k + 1);
    haptic.success();
    const winner = evt.winnerName ?? "—";
    setLocalMessages((prev) => [
      ...prev,
      systemMessage(`${t("live.soldTo", { name: winner })} · ${formatLive(evt.finalPrice)}`),
    ]);

    // Winner reveal — animate for everyone if there is a real winner.
    if (evt.winnerName) {
      const isMe = !!user && evt.winnerId === user.id;
      // Trust host-provided avatar first; fall back to a profile lookup so the
      // reveal still shows a face when the payload lacks the URL.
      setWinnerReveal({
        key: Date.now(),
        name: evt.winnerName,
        avatar: evt.winnerAvatarUrl ?? null,
        isMe,
      });
      if (!evt.winnerAvatarUrl && evt.winnerId) {
        void (async () => {
          const { data } = await supabase
            .from("profiles")
            .select("avatar_url")
            .eq("id", evt.winnerId!)
            .maybeSingle();
          const url = data?.avatar_url ? await resolveAvatarUrl(data.avatar_url) : null;
          if (url) {
            setWinnerReveal((prev) =>
              prev && prev.name === evt.winnerName ? { ...prev, avatar: url } : prev,
            );
          }
        })();
      }
    }

    // If I won and this is a real live with a known seller, either celebrate
    // an auto-paid wallet purchase or open the payment sheet.
    if (
      user &&
      evt.winnerId === user.id &&
      active?.liveId &&
      active?.sellerId
    ) {
      if (evt.autoPaid) {
        toast.success(t("pay.autoPaid", { defaultValue: "Payé automatiquement avec ton solde ✅" }));
      } else if (evt.orderId) {
        void (async () => {
          const order = await fetchOrderById(evt.orderId!);
          if (order) setPendingOrder(order);
        })();
      } else {
        const prod = room.products.find((p) => p.id === evt.productId);
        if (prod) {
          void (async () => {
            const dr = await resolveDeliveryForCheckout({
              sellerId: active.sellerId!,
              buyerId: user.id,
            });
            if (!dr.ok) {
              // Auction can't auto-resolve — surface a toast; buyer must
              // set a default address / a matching zone before paying.
              const msg =
                dr.reason === "no_address"
                  ? t("delivery.noAddressBlock")
                  : t("delivery.zoneMismatch");
              toast.error(msg);
              return;
            }
            const res = await createPendingOrder({
              buyerId: user.id,
              sellerId: active.sellerId!,
              liveId: active.liveId!,
              productId: prod.id,
              kind: "auction",
              itemName: prod.name,
              itemImage: prod.image_url,
              amount: evt.finalPrice,
              currency: liveCurrency,
              deliveryFee: dr.delivery.deliveryFee,
              deliveryMode: dr.delivery.deliveryMode,
              deliveryZone: dr.delivery.deliveryZone,
              addressId: dr.delivery.addressId,
              addressSnapshot: dr.delivery.addressSnapshot,
            });
            if (res.ok) setPendingOrder(res.order);
            else toast.error(res.error);
          })();
        }
      }
    }
  }, [room.lastAuctionEnd, t, user, active, room.products, liveCurrency, formatLive]);

  // Sudden-death flash + haptic when the deadline is extended by a late bid.
  const [suddenDeathTick, setSuddenDeathTick] = useState(0);
  const seenExtRef = useRef<number | null>(null);
  useEffect(() => {
    const ext = room.lastExtension;
    if (!ext || seenExtRef.current === ext.ts) return;
    seenExtRef.current = ext.ts;
    setSuddenDeathTick((n) => n + 1);
    haptic.warning();
  }, [room.lastExtension]);

  // Warning haptic near auction end.
  useEffect(() => {
    if (room.auctionStart && secondsLeft === 10) haptic.warning();
  }, [secondsLeft, room.auctionStart]);


  // Hearts / video tap
  const lastTap = useRef(0);
  const onVideoTap = () => {
    if (liveEnded) return;
    const nowT = Date.now();
    if (nowT - lastTap.current < 300) {
      room.sendHeart();
      setTimeout(() => room.sendHeart(), 80);
      setTimeout(() => room.sendHeart(), 160);
      haptic.medium();
    }
    lastTap.current = nowT;
  };
  const fireHeart = () => {
    if (liveEnded) return;
    haptic.medium();
    room.sendHeart();
  };

  // Follow (local)
  const [following, setFollowing] = useState(false);

  // Viewer count animation
  const viewerMotion = useMotionValue(room.viewerCount);
  const [displayViewers, setDisplayViewers] = useState(room.viewerCount);
  useEffect(() => {
    const c = animate(viewerMotion, room.viewerCount, {
      duration: 0.5,
      ease: EASE_IOS,
      onUpdate: (v) => setDisplayViewers(Math.round(v)),
    });
    return () => c.stop();
  }, [room.viewerCount, viewerMotion]);

  // Bidding
  const [customOpen, setCustomOpen] = useState(false);
  const [customMinOverride, setCustomMinOverride] = useState<number | null>(null);

  // Close custom panel when the active auction changes or ends.
  useEffect(() => {
    setCustomOpen(false);
    setCustomMinOverride(null);
  }, [currentProduct?.id, room.auctionStart?.deadlineMs, liveEnded]);

  // Track the freshest known price for the currently-featured auction so
  // quick-bid taps always compute against realtime state, never a stale
  // render prop.
  const latestPriceRef = useRef<{ id: string | null; price: number }>({ id: null, price: 0 });
  useEffect(() => {
    if (!currentProduct) { latestPriceRef.current = { id: null, price: 0 }; return; }
    latestPriceRef.current = { id: currentProduct.id, price: Number(currentProduct.price) };
  }, [currentProduct?.id, currentProduct?.price]);

  const doBid = async (customAmount?: number) => {
    if (liveEnded) return;
    if (!currentProduct || currentProduct.mode !== "auction" || !room.auctionStart) return;
    if (!user) { toast.error("Connecte-toi pour enchérir"); return; }
    if (secondsLeft <= 0) return;
    if (room.lastBid?.productId === currentProduct.id && room.lastBid.bidderId === user.id) {
      toast(t("live.highestBidder"));
      return;
    }
    haptic.medium();

    // Compute quick-bid amount from the freshest price (realtime ref beats
    // render prop). Custom amounts pass through as-is.
    const freshest =
      latestPriceRef.current.id === currentProduct.id
        ? latestPriceRef.current.price
        : Number(currentProduct.price);
    const quickAmount = nextBidAmount(freshest, liveCurrency);
    const sendAmount = customAmount ?? quickAmount;

    const attempt = async (amount: number) =>
      placeBidInDb({
        liveId: active!.liveId!,
        productId: currentProduct.id,
        bidderId: user.id,
        bidderName: displayName,
        amount,
      });

    let res = await attempt(sendAmount);

    // Auto-retry ONCE on price_changed using the server's suggested min_next.
    if (!res.ok && res.error === "price_changed" && res.minNext !== undefined && customAmount === undefined) {
      latestPriceRef.current = { id: currentProduct.id, price: res.minNext - (res.minNext - freshest > 0 ? (res.minNext - freshest) : 0) };
      res = await attempt(res.minNext);
    }

    if (!res.ok) {
      if (res.error === "price_changed" && res.minNext !== undefined) {
        setCustomMinOverride(res.minNext);
        toast(t("bid.custom.priceChanged", {
          defaultValue: "Le prix a changé — nouvelle enchère min : {{amount}}",
          amount: formatLive(res.minNext),
        }));
        return;
      }
      if (res.error === "above_cap" && res.maxAmount !== undefined) {
        toast.error(t("bid.custom.aboveCap", {
          defaultValue: "Max {{amount}}",
          amount: formatLive(res.maxAmount),
        }));
        return;
      }
      toast.error(res.error === "already_highest" ? t("live.highestBidder") : (res.error ?? t("live.bidFailed")));
      return;
    }
    // Optimistically bump the ref so a rapid second tap uses the freshest price.
    if (res.amount !== undefined) {
      latestPriceRef.current = { id: currentProduct.id, price: res.amount };
    }
    if (customAmount !== undefined) {
      setCustomOpen(false);
      setCustomMinOverride(null);
    }
  };

  // Sheets
  const [showProducts, setShowProducts] = useState(false);

  // Fixed-price flow: reserve stock atomically, then open the payment sheet.
  // Note (phase 1): if the buyer abandons payment, stock is not automatically
  // returned. A future phase should refund stock on payment_intent.canceled.
  const startFixedPurchase = async (p: LiveProductRow) => {
    if (liveEnded) return;
    if (!user) { toast.error(t("pay.errors.notSignedIn")); return; }
    if (!active?.liveId || !active?.sellerId) return;
    // Resolve delivery BEFORE reserving stock so we don't hold stock the
    // buyer can't actually pay for.
    const dr = await resolveDeliveryForCheckout({
      sellerId: active.sellerId,
      buyerId: user.id,
    });
    if (!dr.ok) {
      const msg =
        dr.reason === "no_address"
          ? t("delivery.noAddressBlock")
          : dr.reason === "no_country_coverage"
            ? t("delivery.noCountryCoverage")
            : t("delivery.zoneMismatch");
      toast.error(msg);
      return;
    }
    const res = await purchaseFixedPriceRpc(p.id, user.id);
    if (!res.ok) { toast.error(res.error ?? "Achat impossible"); return; }
    const order = await createPendingOrder({
      buyerId: user.id,
      sellerId: active.sellerId,
      liveId: active.liveId,
      productId: p.id,
      kind: "fixed",
      itemName: p.name,
      itemImage: p.image_url,
      amount: Number(p.price),
      currency: liveCurrency,
      deliveryFee: dr.delivery.deliveryFee,
      deliveryMode: dr.delivery.deliveryMode,
      deliveryZone: dr.delivery.deliveryZone,
      addressId: dr.delivery.addressId,
      addressSnapshot: dr.delivery.addressSnapshot,
    });
    if (order.ok) setPendingOrder(order.order);
    else toast.error(order.error);
  };

  // Composer
  const [draft, setDraft] = useState("");
  const send = () => {
    if (liveEnded) return;
    const txt = draft.trim();
    if (!txt) return;
    room.sendChat(txt);
    setDraft("");
  };

  const dragY = useMotionValue(0);
  const handleVideoStatus = useCallback((s: ViewerStatus) => setViewerVideoStatus(s), []);

  // Moderation
  const [reportOpen, setReportOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const blockedIds = useBlockedIds();
  const doBlockSeller = async () => {
    if (!active?.sellerId) return;
    const r = await blockUser(active.sellerId);
    if (r.ok) { await refreshBlockedIds(); toast.success(t("block.blocked")); close(); }
    else toast.error(t("block.failed"));
    setMoreOpen(false);
  };

  if (!active) return null;
  // If viewer already blocked this seller, close automatically.
  if (active.sellerId && blockedIds.has(active.sellerId)) { close(); return null; }
  const productsForSheet = room.products.map((r) => toProduct(r, activeAuctionId));
  const currentAsProduct = currentProduct ? toProduct(currentProduct, activeAuctionId) : null;

  return (
    <motion.div
      key={active.id}
      initial={{ y: "100%", opacity: 0.6 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: "100%", opacity: 0.4 }}
      transition={{ duration: 0.3, ease: EASE_IOS }}
      className="fixed inset-y-0 left-1/2 z-[60] w-full max-w-xl -translate-x-1/2 overflow-hidden bg-black"
      style={{ y: dragY }}
    >
      {active.roomName ? (
        <ViewerLiveVideo
          room={active.roomName}
          identity={`viewer_${identity.slice(0, 8)}`}
          name={displayName}
          posterImage={active.thumbnail.replace("w=600", "w=1200")}
            onStatus={handleVideoStatus}
        />
      ) : (
        <img src={active.thumbnail} alt="" className="absolute inset-0 h-full w-full object-cover" />
      )}

      {/* Video interaction layer: tap for hearts + vertical swipe to cycle
          between currently-live streams (TikTok / Whatnot style). Chat,
          composer, product sheets and moderation menus sit on higher z
          layers and receive their own events before this one. */}
      <motion.div
        className="absolute inset-0 z-10"
        aria-hidden
        drag="y"
        dragElastic={{ top: hasNext ? 0.55 : 0.12, bottom: hasPrev ? 0.55 : 0.15 }}
        dragConstraints={{ top: 0, bottom: 0 }}
        onDrag={(_, info) => dragY.set(info.offset.y)}
        onTap={onVideoTap}
        onDragEnd={(_, info) => {
          const strong = Math.abs(info.offset.y) > 80 || Math.abs(info.velocity.y) > 600;
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
          // Down-drag past close threshold with no previous live → dismiss.
          if (!up && info.offset.y > 160) {
            close();
            return;
          }
          animate(dragY, 0, { duration: 0.25, ease: EASE_IOS });
        }}
      />


      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-32"
        style={{ backgroundImage: "linear-gradient(to bottom, rgba(0,0,0,0.45), rgba(0,0,0,0))" }} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10"
        style={{ height: "45%", backgroundImage: "linear-gradient(to top, rgba(0,0,0,0.75), rgba(0,0,0,0))" }} />

      <motion.div
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.5 }}
        onDrag={(_, info) => dragY.set(Math.max(0, info.offset.y))}
        onDragEnd={(_, info) => {
          if (info.offset.y > 120 || info.velocity.y > 600) close();
          else animate(dragY, 0, { duration: 0.25, ease: EASE_IOS });
        }}
        className="absolute inset-x-0 top-0 z-30 pt-safe"
      >
        <div className="flex items-start justify-between gap-2 px-3 pt-2">
          <div className="flex min-w-0 items-center gap-2">
            <Press
              onClick={() => openSeller(active.seller)}
              aria-label={`Voir le profil de ${active.seller}`}
              className="!block flex min-w-0 items-center gap-2 p-0 text-left"
            >
              <img src={active.avatar} alt="" className="h-10 w-10 rounded-full object-cover ring-2 ring-white/90" />
              <div className="min-w-0">
                <p className="truncate text-[14px] font-bold text-white"
                  style={{ textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}>
                  {active.seller}
                </p>
                <p className="text-[11px] text-white/80" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}>
                  {displayViewers} {t("live.viewers", { count: displayViewers })}
                </p>
              </div>
            </Press>
            <Press
              onClick={() => {
                haptic.medium();
                setFollowing((v) => {
                  const next = !v;
                  if (next) void requestWithPrePrompt(
                    `Active les notifications pour ne rater aucun live de ${active.seller} 🔔`,
                  );
                  return next;
                });
              }}
              hapticOnTap={false}
              className="!min-h-8 ml-1 rounded-full px-3 text-[12px] font-bold"
              style={following
                ? { backgroundColor: "transparent", color: "white", border: "1.5px solid rgba(255,255,255,0.8)" }
                : { backgroundColor: "var(--accent)", color: "var(--accent-foreground)" }}
            >
              {following ? t("live.following") : t("live.follow")}
            </Press>
          </div>

          <div className="flex items-center gap-1.5">
            <WalletPill onTap={() => setTopupOpen(true)} />
            <div className="flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-semibold text-white tabular-nums"
              style={{ backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}>
              <Eye size={13} />{displayViewers}
            </div>

            <Press aria-label={t("live.share")}
              className="h-9 w-9 rounded-full text-white"
              style={{ backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}>
              <Share2 size={16} />
            </Press>
            <Press aria-label="More" onClick={() => setMoreOpen(true)}
              className="h-9 w-9 rounded-full text-white"
              style={{ backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}>
              <MoreVertical size={16} />
            </Press>
            <Press aria-label={t("live.leave")} onClick={close}
              className="h-9 w-9 rounded-full text-white"
              style={{ backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}>
              <X size={18} />
            </Press>
          </div>
        </div>
      </motion.div>

      <div className="absolute inset-x-0 z-20" style={{ bottom: "calc(env(safe-area-inset-bottom) + 148px)" }}>
        <LiveChat messages={messages} />
      </div>

      {currentAsProduct && (
        <div className="absolute inset-x-0 z-30 px-3" style={{ bottom: "calc(env(safe-area-inset-bottom) + 68px)" }}>
          <AuctionCard
            product={currentAsProduct}
            secondsLeft={secondsLeft}
            currency={liveCurrency}
            viewerCurrency={walletCurrency}
            auctionActive={
              !liveEnded && !!room.auctionStart && room.auctionStart.productId === currentAsProduct.id
            }
            isHighestBidder={
              !!user && room.lastBid?.productId === currentAsProduct.id && room.lastBid.bidderId === user.id
            }
            disabled={liveEnded}
            lastBidder={
              room.lastBid && room.lastBid.productId === currentAsProduct.id
                ? room.lastBid.bidderName : undefined
            }
            onBid={() => { void doBid(); }}
            onOpenProducts={() => setShowProducts(true)}
            onBuy={() => {
              if (!currentProduct) return;
              void startFixedPurchase(currentProduct);
            }}
            onToggleCustom={() => { haptic.light(); setCustomOpen((v) => !v); setCustomMinOverride(null); }}
            customOpen={customOpen}
            customPanel={
              currentProduct && currentProduct.mode === "auction" ? (
                <CustomBidStepper
                  open={customOpen}
                  onClose={() => setCustomOpen(false)}
                  currentPrice={Number(currentProduct.price)}
                  startPrice={Number(currentProduct.start_price)}
                  currency={liveCurrency}
                  minOverride={customMinOverride}
                  onConfirm={(amount) => doBid(amount)}
                />
              ) : null
            }
          />
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 z-30 flex items-center gap-2 px-3 pb-safe"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 10px)" }}>
        <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex-1">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("live.chatPlaceholder")}
            disabled={liveEnded}
            className="w-full rounded-full px-4 py-2.5 text-[14px] text-white outline-none placeholder:text-white/60"
            style={{
              backgroundColor: "rgba(0,0,0,0.5)",
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
              border: "1px solid rgba(255,255,255,0.15)",
            }}
          />
        </form>
        <Press onClick={liveEnded ? undefined : send} disabled={liveEnded} aria-label={t("live.sendMessage")}
          className="h-11 w-11 rounded-full text-white"
          style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", border: "1px solid rgba(255,255,255,0.15)" }}>
          <Send size={17} />
        </Press>
        <Press onClick={liveEnded ? undefined : fireHeart} disabled={liveEnded} aria-label="Cœur"
          className="h-11 w-11 rounded-full text-white"
          style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", border: "1px solid rgba(255,255,255,0.15)" }}>
          <Heart size={17} fill="currentColor" />
        </Press>
        <Press aria-label="Plus"
          className="h-11 w-11 rounded-full text-white"
          style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", border: "1px solid rgba(255,255,255,0.15)" }}>
          <Plus size={18} />
        </Press>
      </div>

      <FloatingHearts trigger={room.heartTick} />
      <Confetti trigger={confettiKey} />
      <WinnerReveal
        key={winnerReveal?.key ?? "wr"}
        open={!!winnerReveal}
        winnerName={winnerReveal?.name ?? null}
        winnerAvatarUrl={winnerReveal?.avatar ?? null}
        isMe={!!winnerReveal?.isMe}
        onDone={() => setWinnerReveal(null)}
      />
      <SuddenDeathFlash tick={suddenDeathTick} />

      <ProductsSheet
        open={showProducts}
        onClose={() => setShowProducts(false)}
        products={productsForSheet}
        currency={liveCurrency}
        onBuyFixed={(p) => {
          if (liveEnded) return;
          setShowProducts(false);
          const row = room.products.find((r) => r.id === p.id);
          if (row) void startFixedPurchase(row);
        }}
        disabled={liveEnded}
      />
      <PaymentSheet
        order={pendingOrder}
        onClose={() => setPendingOrder(null)}
      />
      <TopUpSheet open={topupOpen} onClose={() => setTopupOpen(false)} />

      {moreOpen && (
        <div className="fixed inset-0 z-[70] flex items-end bg-black/50" onClick={() => setMoreOpen(false)}>
          <div className="mx-auto w-full max-w-lg rounded-t-3xl bg-background p-4 pb-safe" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted" />
            <Press onClick={() => { setMoreOpen(false); setReportOpen(true); }}
              className="!min-h-12 flex h-12 w-full items-center gap-3 rounded-2xl px-3 text-left text-[15px]">
              <Flag size={18} /> {t("report.action")}
            </Press>
            <Press onClick={() => { if (confirm(t("block.confirm"))) void doBlockSeller(); }}
              className="!min-h-12 flex h-12 w-full items-center gap-3 rounded-2xl px-3 text-left text-[15px] text-destructive">
              <UserX size={18} /> {t("block.action")}
            </Press>
          </div>
        </div>
      )}
      {active?.liveId && (
        <ReportSheet open={reportOpen} onClose={() => setReportOpen(false)} targetType="live" targetId={active.liveId} />
      )}
      <AnimatePresence>
        {liveEnded && (
          <motion.div
            key="live-ended"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[80] grid place-items-center bg-black/85 px-6 text-center text-white"
          >
            <div className="flex max-w-xs flex-col items-center">
              <img src={active.avatar} alt="" className="h-16 w-16 rounded-full object-cover ring-2 ring-white/80" />
              <h2 className="mt-4 text-[24px] font-black leading-tight">{t("live.endedTitle")}</h2>
              <p className="mt-2 text-[14px] text-white/75">{active.seller}</p>
              <Press
                onClick={close}
                className="!min-h-12 mt-6 h-12 rounded-full bg-white px-6 text-[15px] font-bold text-black"
              >
                {t("live.backHome")}
              </Press>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
