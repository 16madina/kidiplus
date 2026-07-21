// Real live viewer screen — used when the tapped stream has a DB id.
// Chat / hearts / auction / buy are wired through Supabase Realtime + DB.
import { AnimatePresence, motion, useMotionValue, animate } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Send, Heart, Gift, Share2, X, Eye, MoreVertical, Flag, UserX } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Press } from "@/components/press";
import { useLiveViewer } from "@/lib/live-viewer-context";
import { useSellerProfile } from "@/lib/seller-profile-context";
import { useAuth } from "@/lib/auth-context";
import { useAuthPrompt } from "@/lib/auth-prompt-context";

import { EASE_IOS } from "@/lib/motion";
import { haptic } from "@/lib/haptics";
import { pushStatusBarLight } from "@/lib/native";
import { liveShareUrl } from "@/lib/deep-links";
import { usePush } from "@/lib/push";
import { useLiveRoom } from "@/lib/live-room";
import { placeBidInDb, purchaseFixedPriceRpc, type LiveProductRow } from "@/lib/lives-db";
import { createPendingOrder, fetchOrderById, type OrderRow } from "@/lib/orders-db";
import { resolveDeliveryForCheckout } from "@/lib/delivery-checkout";
import { fetchDeliverySettings } from "@/lib/delivery-db";
import { fetchDefaultAddress } from "@/lib/addresses-db";
import { canDeliver } from "@/lib/delivery-eligibility";
import type { SellerDeliverySettings } from "@/lib/delivery";
import { systemMessage, type ChatMsg, type Product } from "@/lib/live-viewer-mock";
import { useWallet } from "@/lib/wallet-context";
import { formatMoney, nextBidAmount, normalizeCurrency } from "@/lib/money";
import { LiveChat } from "./live-chat";
import { LiveViewersSheet } from "./live-viewers-sheet";
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
import { AuctionFinalCountdown } from "./auction-final-countdown";
import { BidPulseFlash } from "./bid-pulse-flash";
import { ViewerLiveVideo, type ViewerStatus } from "./viewer-live-video";
import { LivePeekSlide, prefetchLivePeek } from "./live-peek-slide";
import { LivePipShell, useLivePip } from "./live-pip-shell";
import { ReportSheet } from "@/components/moderation/report-sheet";
import { ErrorBoundary } from "@/components/error-boundary";
import { blockUserAndNotify, useBlockedIds } from "@/lib/moderation-db";
import { resolveAvatarUrl } from "@/lib/avatar-url";
import { supabase } from "@/integrations/supabase/client";
import {
  muteLiveChatUser,
  useIsModerator,
  useLiveChatMutes,
} from "@/lib/moderators-db";
import { ModeratorDock } from "./moderator-dock";
import { FollowButton } from "@/components/follow-button";
import { GiftTraySheet, useGiftError } from "./gift-tray-sheet";
import { GiftAnimationsLayer } from "./gift-animations";
import { GiftComboFeed } from "./gift-combo-feed";
import { sendGiftRpc } from "@/lib/live-gifts-db";
import type { GiftKey } from "@/lib/gifts";
import { VerifiedBadge } from "@/components/verified-badge";
import { logLiveInteraction } from "@/lib/interactions-db";



const FALLBACK_IMG = "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&q=70";

function SellerAvatar({ src, name, size }: { src: string; name: string; size: "md" | "lg" }) {
  const [failed, setFailed] = useState(false);
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials =
    parts.length >= 2
      ? ((parts[0][0] || "") + (parts[1][0] || "")).toUpperCase()
      : (parts[0]?.[0] || "?").toUpperCase();
  const box = size === "lg" ? "h-16 w-16 text-[24px]" : "h-10 w-10 text-[16px]";
  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        onError={() => setFailed(true)}
        className={`${box} shrink-0 rounded-full object-cover ${size === "lg" ? "ring-2 ring-white/80" : "ring-2 ring-white/90"}`}
        draggable={false}
      />
    );
  }
  return (
    <span
      className={`${box} grid shrink-0 place-items-center rounded-full font-black ${size === "lg" ? "ring-2 ring-white/80" : "ring-2 ring-white/90"}`}
      style={{ backgroundColor: "var(--accent)", color: "var(--accent-foreground)" }}
    >
      {initials || "?"}
    </span>
  );
}

function toProduct(row: LiveProductRow, activeId: string | null): Product {
  const status: Product["status"] =
    row.status === "sold" || row.status === "out" || row.status === "unsold"
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
  const {
    active,
    close,
    minimize,
    expand,
    next: nextLive,
    prev: prevLive,
    hasNext,
    hasPrev,
    peekNext,
    peekPrev,
  } = useLiveViewer();
  const { chromeHidden } = useLivePip();
  const { open: openSeller } = useSellerProfile();
  const { user, profile } = useAuth();
  const { requireAuth, openAuth } = useAuthPrompt();
  const { requestWithPrePrompt } = usePush();

  const { currency: walletCurrency } = useWallet();
  const liveCurrency = normalizeCurrency(active?.currency ?? "EUR");
  const formatLive = (n: number) => formatMoney(n, liveCurrency, i18n.language);

  useEffect(() => {
    if (chromeHidden) return;
    let restore: (() => void) | null = null;
    void pushStatusBarLight().then((fn) => { restore = fn; });
    return () => { restore?.(); };
  }, [chromeHidden]);

  // For guests, use a `guest_xxxxxxxx` identity that the LiveKit token
  // endpoint's anonymous branch accepts as-is (view-only token). Signed-in
  // users keep their Supabase user id.
  const anonSuffix = useMemo(() => Math.random().toString(36).slice(2, 10), []);
  const identity = user?.id ?? `guest_${anonSuffix}`;
  const isGuest = !user;
  const displayName = profile?.display_name || profile?.handle || (isGuest ? "invité" : "invité");

  const isModerator = useIsModerator(active?.liveId ?? null, user?.id ?? null);
  const chatMutes = useLiveChatMutes(active?.liveId ?? null);

  const room = useLiveRoom({
    liveId: active?.liveId ?? null,
    identity,
    displayName,
    isHost: false,
    isModerator,
  });
  const [viewerVideoStatus, setViewerVideoStatus] = useState<ViewerStatus>("connecting");
  const [hostDisconnectEnded, setHostDisconnectEnded] = useState(false);
  const liveEnded = room.liveStatus === "ended" || hostDisconnectEnded;
  const wasModeratorRef = useRef(false);
  const [modHydrated, setModHydrated] = useState(false);

  // Wait for useIsModerator's initial fetch so we don't toast existing mods on open.
  useEffect(() => {
    setModHydrated(false);
    wasModeratorRef.current = false;
    const timer = window.setTimeout(() => setModHydrated(true), 900);
    return () => window.clearTimeout(timer);
  }, [active?.liveId, user?.id]);

  useEffect(() => {
    if (!modHydrated) {
      wasModeratorRef.current = isModerator;
      return;
    }
    if (isModerator && !wasModeratorRef.current) {
      toast.success(t("moderator.youAreModerator", "Tu es maintenant modérateur 🛡️"));
      haptic.success();
    }
    wasModeratorRef.current = isModerator;
  }, [isModerator, modHydrated, t]);

  // Delivery eligibility (bid/buy gate — never blocks chat/hearts/gifts).
  const [sellerSettings, setSellerSettings] = useState<SellerDeliverySettings | null>(null);
  const [sellerCountry, setSellerCountry] = useState<string | null>(null);
  const [sellerVerified, setSellerVerified] = useState(false);
  const [buyerCountry, setBuyerCountry] = useState<string | null>(null);
  useEffect(() => {
    if (!active?.sellerId) return;
    let cancelled = false;
    void (async () => {
      const [settings, sellerProfile] = await Promise.all([
        fetchDeliverySettings(active.sellerId!),
        supabase.from("profiles").select("country, is_verified").eq("id", active.sellerId!).maybeSingle(),
      ]);
      if (cancelled) return;
      setSellerSettings(settings);
      const p = sellerProfile.data as { country?: string | null; is_verified?: boolean } | null;
      setSellerCountry(p?.country ?? null);
      setSellerVerified(!!p?.is_verified);
    })();
    return () => { cancelled = true; };
  }, [active?.sellerId]);
  useEffect(() => {
    if (!user?.id) { setBuyerCountry(null); return; }
    let cancelled = false;
    void (async () => {
      const addr = await fetchDefaultAddress(user.id);
      if (!cancelled) setBuyerCountry(addr?.country ?? null);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);
  const eligibility = useMemo(
    () => canDeliver({ settings: sellerSettings, sellerCountry, buyerCountry }),
    [sellerSettings, sellerCountry, buyerCountry],
  );
  const deliveryBlockedLabel = eligibility.eligible
    ? undefined
    : t("delivery.notInYourCountry", "Livraison indisponible dans ton pays 🌍");


  

  useEffect(() => {
    if (room.liveStatus === "live") {
      setHostDisconnectEnded(false);
      return;
    }
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
      console.warn("[live-end diag] video 'ended' debounce elapsed — DB status re-check", {
        liveId: active.liveId,
        dbStatus: data?.status,
        videoStatus: viewerVideoStatus,
      });
      if (data?.status === "ended") {
        setHostDisconnectEnded(true);
      }
    }, 20_000);
    return () => clearTimeout(t);
  }, [viewerVideoStatus, room.liveStatus, active?.liveId]);

  // Host ended: close mini / system PiP immediately. Full-screen keeps the
  // "Live terminé" overlay briefly, then closes.
  useEffect(() => {
    if (!liveEnded) return;
    if (chromeHidden) {
      close();
      return;
    }
    const t = setTimeout(() => close(), 10_000);
    return () => clearTimeout(t);
  }, [liveEnded, chromeHidden, close]);

  // Featured product: server auction pick, else the next 'upcoming' product
  // by position. Never loops back to earlier items — matches host behavior.
  const activeAuctionId = room.auctionStart?.productId ?? null;
  const currentProduct = useMemo(() => {
    if (activeAuctionId) return room.products.find((p) => p.id === activeAuctionId) ?? null;
    const sorted = [...room.products].sort((a, b) => a.position - b.position);
    return sorted.find((p) => p.status === "upcoming") ?? null;
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
  // Personal blocks — used to filter chat messages in real time and to
  // auto-close the live if the viewer opens a stream by an already-blocked
  // host (see the guard further down). Hoisted before `messages` memo.
  const blockedIdsForChat = useBlockedIds();
  const messages: ChatMsg[] = useMemo(
    () => [
      ...localMessages,
      ...room.chat
        // Live-scoped mutes (moderator action) AND personal blocks (viewer
        // tapped "Bloquer") both remove messages immediately. Blocked user
        // messages disappear from the viewer's chat as soon as the block
        // succeeds — no refresh required (Apple guideline 1.2).
        .filter((c) => !c.userId || (!chatMutes.has(c.userId) && !blockedIdsForChat.has(c.userId)))
        .map((c) => ({
          id: c.id,
          user: c.user,
          color: c.color,
          text: c.text,
          source: c.source,
          externalId: c.externalId,
          system: c.system,
          systemKind: c.systemKind,
          userId: c.userId,
          isModerator: !!c.isModerator,
          isHost: !!c.isHost || (!!c.userId && c.userId === active?.sellerId),
          replyTo: c.replyTo,
        })),
    ],
    [localMessages, room.chat, chatMutes, blockedIdsForChat, active?.sellerId],
  );

  // ---------- Payment sheet state ----------
  // A single sheet handles both fixed-price purchases and auction wins.
  const [pendingOrder, setPendingOrder] = useState<OrderRow | null>(null);
  const [topupOpen, setTopupOpen] = useState(false);
  const [giftTrayOpen, setGiftTrayOpen] = useState(false);
  const [sendingGift, setSendingGift] = useState(false);
  const showGiftError = useGiftError();

  const doSendGift = async (key: GiftKey) => {
    if (!user) { openAuth(); return; }
    if (!active?.liveId) { toast.error(t("pay.errors.notSignedIn")); return; }

    if (liveEnded) return;
    // Close the tray first so combo + full-screen anim aren't hidden behind it.
    setGiftTrayOpen(false);
    setSendingGift(true);
    haptic.medium();
    const res = await sendGiftRpc(active.liveId, key);
    setSendingGift(false);
    if (!res.ok) {
      if (res.error === "insufficient_funds") setTopupOpen(true);
      else setGiftTrayOpen(true);
      showGiftError(res.error);
      return;
    }
    haptic.success();
    // Use DB gift id so broadcast + postgres backup dedupe to one animation + chat.
    room.broadcastGift({
      id: res.giftId,
      giftKey: key,
      senderId: user.id,
      senderName: displayName,
    });
  };


  // Sold celebration from server auction:end.
  // If the current user is the winner, open the payment sheet to pay for the item.
  const [confettiKey, setConfettiKey] = useState(0);
  const [winnerReveal, setWinnerReveal] = useState<{
    key: string;
    name: string | null;
    winnerId: string | null;
    avatar: string | null;
    isMe: boolean;
    variant: "winner" | "unsold";
    productName: string | null;
  } | null>(null);
  const seenEndIdsRef = useRef<Set<string>>(new Set());
  // Only celebrate ends that arrive after we joined this live session.
  // Prevents replaying a leftover lastAuctionEnd (or a stale broadcast) when
  // opening / rejoining a live after someone already won.
  const joinedAtRef = useRef(Date.now());
  const productsRef = useRef(room.products);
  productsRef.current = room.products;

  useEffect(() => {
    joinedAtRef.current = Date.now();
    seenEndIdsRef.current = new Set();
    setWinnerReveal(null);
    setConfettiKey(0);
  }, [active?.liveId]);

  useEffect(() => {
    const evt = room.lastAuctionEnd;
    if (!evt) return;
    // Only dedupe by unique endId — same buyer may win the same item many times.
    const endId = evt.endId ?? `fallback-${evt.ts}-${evt.productId}-${evt.auctionRound}-${evt.orderId}`;
    if (seenEndIdsRef.current.has(endId)) return;
    // Stale end from before this viewer session (rejoin / swipe leak).
    const ts = evt.ts ?? 0;
    if (ts > 0 && ts < joinedAtRef.current - 2500) return;
    seenEndIdsRef.current.add(endId);
    if (seenEndIdsRef.current.size > 200) {
      const first = seenEndIdsRef.current.values().next().value;
      if (first) seenEndIdsRef.current.delete(first);
    }
    const prod = productsRef.current.find((p) => p.id === evt.productId);

    if (!evt.winnerName || !evt.winnerId) {
      // Unsold — central reveal, no confetti, no sale line.
      setLocalMessages((prev) => [
        ...prev,
        systemMessage(t("live.unsoldFlash", { name: prod?.name ?? "produit" })),
      ]);
      setWinnerReveal({
        key: endId,
        name: null,
        winnerId: null,
        avatar: null,
        isMe: false,
        variant: "unsold",
        productName: prod?.name ?? null,
      });
      return;
    }

    setConfettiKey((k) => k + 1);
    haptic.success();
    setLocalMessages((prev) => [
      ...prev,
      systemMessage(`${t("live.soldTo", { name: evt.winnerName })} · ${formatLive(evt.finalPrice)}`),
    ]);
    const isMe = !!user && evt.winnerId === user.id;
    setWinnerReveal({
      key: endId,
      name: evt.winnerName,
      winnerId: evt.winnerId,
      avatar: evt.winnerAvatarUrl ?? null,
      isMe,
      variant: "winner",
      productName: prod?.name ?? null,
    });
    // Always refresh avatar from profiles — broadcast signed URLs can 403.
    void (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("avatar_url")
        .eq("id", evt.winnerId!)
        .maybeSingle();
      const url = data?.avatar_url ? await resolveAvatarUrl(data.avatar_url) : null;
      if (url) {
        setWinnerReveal((prev) =>
          prev && prev.key === endId ? { ...prev, avatar: url } : prev,
        );
      }
    })();

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
        const prodRow = productsRef.current.find((p) => p.id === evt.productId);
        if (prodRow) {
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
              productId: prodRow.id,
              kind: "auction",
              itemName: prodRow.name,
              itemImage: prodRow.image_url,
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
  }, [room.lastAuctionEnd, t, user, active?.liveId, active?.sellerId, liveCurrency, formatLive]);

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
      // Guests can't send hearts (canPublishData=false server-side) — a
      // double-tap prompts sign-up instead of dead-tapping.
      if (isGuest) { openAuth(); lastTap.current = 0; return; }
      room.sendHeart();
      setTimeout(() => room.sendHeart(), 80);
      setTimeout(() => room.sendHeart(), 160);
      haptic.medium();
      if (active) void logLiveInteraction(active, "like", 2);
    }
    lastTap.current = nowT;
  };
  const fireHeart = () => {
    if (liveEnded) return;
    if (isGuest) { openAuth(); return; }
    haptic.medium();
    room.sendHeart();
    if (active) void logLiveInteraction(active, "like");
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
    if (!user) { openAuth(); return; }
    if (secondsLeft <= 0) return;
    if (!eligibility.eligible) { toast.error(deliveryBlockedLabel!); return; }
    if (
      room.lastBid?.productId === currentProduct.id &&
      room.lastBid.auctionRound === (currentProduct.auction_round ?? 1) &&
      room.lastBid.bidderId === user.id
    ) {
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
    if (!user) { openAuth(); return; }
    if (!active?.liveId || !active?.sellerId) return;
    if (!eligibility.eligible) { toast.error(deliveryBlockedLabel!); return; }
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
  const [replyTo, setReplyTo] = useState<ChatMsg | null>(null);
  const send = () => {
    if (liveEnded) return;
    if (isGuest) { openAuth(); return; }
    if (user?.id && chatMutes.has(user.id)) {
      toast.error(t("moderator.youAreMuted", "Tu ne peux plus commenter dans ce live"));
      return;
    }
    const txt = draft.trim();
    if (!txt) return;
    room.sendChat(
      txt,
      replyTo
        ? {
            user: replyTo.user,
            text: replyTo.text,
            ...(replyTo.userId ? { userId: replyTo.userId } : {}),
          }
        : undefined,
    );
    setDraft("");
    setReplyTo(null);
  };


  const dragY = useMotionValue(0);
  const handleVideoStatus = useCallback((s: ViewerStatus) => setViewerVideoStatus(s), []);

  // Mini / system PiP: clear vertical pager offset so expand isn't clipped.
  useEffect(() => {
    if (chromeHidden) dragY.set(0);
  }, [chromeHidden, dragY]);

  // Prefetch neighbour posters so swipe commit never flashes black.
  useEffect(() => {
    prefetchLivePeek([peekNext, peekPrev]);
  }, [peekNext, peekPrev]);

  // Reset connection chrome when the playlist cursor moves.
  useEffect(() => {
    setViewerVideoStatus("connecting");
    setHostDisconnectEnded(false);
  }, [active?.id]);

  // Moderation
  const [reportOpen, setReportOpen] = useState(false);
  // Per-chat-message report state (Apple 1.2 — any user can flag any UGC).
  const [reportMessageId, setReportMessageId] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [viewersSheetOpen, setViewersSheetOpen] = useState(false);
  const blockedIds = blockedIdsForChat;

  // Drop open sheets when shrinking to mini / system PiP — they would block the tabs / bubble.
  useEffect(() => {
    if (!chromeHidden) return;
    setShowProducts(false);
    setMoreOpen(false);
    setGiftTrayOpen(false);
    setTopupOpen(false);
    setReportOpen(false);
    setCustomOpen(false);
    setPendingOrder(null);
    setViewersSheetOpen(false);
  }, [chromeHidden]);

  const doBlockSeller = async () => {
    if (!active?.sellerId) return;
    const r = await blockUserAndNotify(active.sellerId, {
      handle: active.seller,
      displayName: active.seller,
      avatarUrl: active.avatar,
      liveId: active.liveId ?? active.id,
    });
    if (r.ok) { toast.success(t("block.blocked")); close(); }
    else toast.error(t("block.failed"));
    setMoreOpen(false);
  };

  if (!active) return null;
  // If viewer already blocked this seller, close automatically with an explanation.
  if (active.sellerId && blockedIds.has(active.sellerId)) {
    toast.info(t("block.autoClosedLive", "Ce live est masqué car tu as bloqué l'hôte."));
    close();
    return null;
  }
  const productsForSheet = room.products.map((r) => toProduct(r, activeAuctionId));
  const currentAsProduct = currentProduct ? toProduct(currentProduct, activeAuctionId) : null;

  return (
    <LivePipShell>
      {/* Current live — slides with the finger; remounts on active.id only. */}
      <motion.div
        key={active.id}
        className="absolute inset-0"
        style={{ y: chromeHidden ? 0 : dragY }}
      >
      {active.roomName ? (
        <ViewerLiveVideo
          room={active.roomName}
          identity={isGuest ? identity : `viewer_${identity.slice(0, 8)}`}
          name={displayName}
          posterImage={active.thumbnail.replace("w=600", "w=1200")}
            onStatus={handleVideoStatus}
        />
      ) : (
        <img src={active.thumbnail} alt="" className="absolute inset-0 h-full w-full object-cover" />
      )}

      {!chromeHidden && (
      <>
      {/* Overlays + chrome stay on the current slide so they slide with the finger. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-32"
        style={{ backgroundImage: "linear-gradient(to bottom, rgba(0,0,0,0.45), rgba(0,0,0,0))" }} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10"
        style={{ height: "45%", backgroundImage: "linear-gradient(to top, rgba(0,0,0,0.75), rgba(0,0,0,0))" }} />

      <div className="absolute inset-x-0 top-0 z-30 pt-safe">
        <div className="flex items-start justify-between gap-2 px-3 pt-2">
          <div className="flex min-w-0 items-center gap-2">
            <Press
              onClick={() => openSeller(active.sellerId ?? active.seller)}
              aria-label={`Voir le profil de ${active.seller}`}
              className="!block shrink-0 p-0"
            >
              <SellerAvatar src={active.avatar} name={active.seller} size="md" />
            </Press>
            <div className="min-w-0">
              <Press
                onClick={() => openSeller(active.sellerId ?? active.seller)}
                className="!block !min-h-0 max-w-full p-0 text-left"
              >
                <p className="flex items-center gap-1 truncate text-[14px] font-bold text-white"
                  style={{ textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}>
                  <span className="truncate">{active.seller}</span>
                  <VerifiedBadge verified={sellerVerified} size={13} />
                </p>
              </Press>
              <Press
                onClick={() => {
                  haptic.selection();
                  setViewersSheetOpen(true);
                }}
                aria-label={t("live.viewersSheetTitle", "Spectateurs")}
                className="!block !min-h-0 p-0 text-left"
              >
                <p className="text-[11px] text-white/80" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}>
                  {displayViewers} {t("live.viewers", { count: displayViewers })}
                </p>
              </Press>
            </div>
            <FollowButton sellerId={active.sellerId ?? null} size="sm" variant="solid" />
          </div>

          <div className="flex items-center gap-1.5">
            <WalletPill onTap={() => requireAuth(() => setTopupOpen(true))} />
            <Press
              onClick={() => {
                haptic.selection();
                setViewersSheetOpen(true);
              }}
              aria-label={t("live.viewersSheetTitle", "Spectateurs")}
              className="!min-h-0 flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-semibold text-white tabular-nums"
              style={{ backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}
            >
              <Eye size={13} />{displayViewers}
            </Press>

            <Press
              aria-label={t("live.share")}
              onClick={async () => {
                haptic.light();
                const shareUrl = active?.liveId
                  ? liveShareUrl(active.liveId)
                  : "https://kidiplus.com";
                const title = `${active.seller} — Kidi+`;
                const text = t("live.shareText", { defaultValue: "Rejoins le live de {{name}} sur Kidi+ 🔴", name: active.seller });
                try {
                  const nav = typeof navigator !== "undefined" ? (navigator as Navigator & { share?: (d: ShareData) => Promise<void> }) : null;
                  if (nav && typeof nav.share === "function") {
                    await nav.share({ title, text, url: shareUrl });
                  } else if (nav && nav.clipboard) {
                    await nav.clipboard.writeText(shareUrl);
                    toast.success(t("live.shareCopied", "Lien copié"));
                  }
                } catch { /* user cancelled */ }
              }}
              className="h-9 w-9 rounded-full text-white"
              style={{ backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}>
              <Share2 size={16} />
            </Press>
            <Press aria-label="More" onClick={() => setMoreOpen(true)}
              className="h-9 w-9 rounded-full text-white"
              style={{ backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}>
              <MoreVertical size={16} />
            </Press>
            <Press
              aria-label={t("live.leave")}
              onClick={() => { haptic.light(); close(); }}
              className="h-9 w-9 rounded-full text-white"
              style={{ backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}>
              <X size={18} />
            </Press>
          </div>
        </div>
      </div>


      <div className="absolute inset-x-0 z-20" style={{ bottom: "calc(env(safe-area-inset-bottom) + 148px)" }}>
        <LiveChat
          messages={messages}
          moderation={{
            canModerate: isModerator,
            // Even regular viewers can now open the message menu — Apple 1.2
            // requires flagging + blocking to be available on every UGC
            // surface (live streams, chat messages, profiles).
            canReport: !!user,
            selfUserId: user?.id ?? null,
            hostUserId: active.sellerId ?? null,
            mutedIds: chatMutes,
            onReply: (msg) => {
              if (isGuest) { openAuth(); return; }
              haptic.light();
              setReplyTo(msg);
            },
            onReportMessage: (messageId) => {
              requireAuth(() => setReportMessageId(messageId));
            },
            onMuteUser: async (userId, displayName) => {
              if (!active.liveId || !user) return;
              const res = await muteLiveChatUser(active.liveId, userId, user.id);
              if (!res.ok) {
                toast.error(res.error ?? t("moderator.muteFailed"));
                return;
              }
              haptic.selection();
              toast.success(t("moderator.muted", { name: displayName }));
            },
            onBlockUser: async (userId, displayName) => {
              requireAuth(async () => {
                if (!user) return;
                if (isModerator && active.liveId) {
                  await muteLiveChatUser(active.liveId, userId, user.id);
                }
                const r = await blockUserAndNotify(userId, {
                  handle: displayName,
                  displayName,
                });
                if (r.ok) {
                  haptic.selection();
                  toast.success(t("moderator.blocked", { name: displayName }));
                } else {
                  toast.error(r.error ?? t("moderator.blockFailed"));
                }
              });
            },
          }}
        />
      </div>

      {currentAsProduct ? (
        <div className="absolute inset-x-0 z-30 px-3" style={{ bottom: "calc(env(safe-area-inset-bottom) + 68px)" }}>
          {/* When the featured product is upcoming (no auction active),
              show an explicit "next item soon" hint above the disabled card
              so viewers don't stare at empty space between rounds. */}
          {!liveEnded && !room.auctionStart && currentProduct?.status === "upcoming" && (
            <div
              className="mb-2 rounded-2xl px-3 py-2 text-center text-[12px] font-semibold text-white"
              style={{
                background: "rgba(15, 15, 20, 0.72)",
                backdropFilter: "blur(24px) saturate(180%)",
                WebkitBackdropFilter: "blur(24px) saturate(180%)",
                border: "1px solid rgba(255,255,255,0.12)",
              }}
            >
              ⏳ {t("live.nextItemSoon", { name: currentAsProduct.name, defaultValue: "Prochain article bientôt… {{name}}" })}
            </div>
          )}
          <AuctionCard
            product={currentAsProduct}
            secondsLeft={secondsLeft}
            currency={liveCurrency}
            viewerCurrency={walletCurrency}
            auctionActive={
              !liveEnded && !!room.auctionStart && room.auctionStart.productId === currentAsProduct.id
            }
            isHighestBidder={
              !!user &&
              room.lastBid?.productId === currentAsProduct.id &&
              room.lastBid.auctionRound === (currentProduct?.auction_round ?? 1) &&
              room.lastBid.bidderId === user.id
            }
            disabled={liveEnded}
            deliveryBlockedLabel={deliveryBlockedLabel}
            lastBidder={
              room.lastBid &&
              room.lastBid.productId === currentAsProduct.id &&
              room.lastBid.auctionRound === (currentProduct?.auction_round ?? 1)
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
      ) : (
        // No active auction AND no upcoming product left — everything has
        // been auctioned. Show a friendly closing state so the viewer
        // understands why the featured area is empty.
        !liveEnded && room.products.length > 0 && (
          <div className="absolute inset-x-0 z-30 px-3" style={{ bottom: "calc(env(safe-area-inset-bottom) + 68px)" }}>
            <div
              className="rounded-2xl px-3 py-3 text-center text-[13px] font-semibold text-white"
              style={{
                background: "rgba(15, 15, 20, 0.72)",
                backdropFilter: "blur(24px) saturate(180%)",
                WebkitBackdropFilter: "blur(24px) saturate(180%)",
                border: "1px solid rgba(255,255,255,0.12)",
              }}
            >
              ✨ {t("live.allSold", "Tous les articles sont passés")}
            </div>
          </div>
        )
      )}

      <div className="absolute inset-x-0 bottom-0 z-30 flex flex-col gap-1.5 px-3 pb-safe"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 10px)" }}>
        {replyTo && !isGuest && (
          <div
            className="flex items-center gap-2 rounded-2xl px-3 py-1.5 text-[12px] text-white"
            style={{
              backgroundColor: "rgba(0,0,0,0.45)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            <div className="min-w-0 flex-1 truncate">
              <span className="font-semibold">{t("live.replyingTo", { name: replyTo.user, defaultValue: "Réponse à {{name}}" })}</span>
              <span className="text-white/65"> · {replyTo.text}</span>
            </div>
            <Press
              onClick={() => setReplyTo(null)}
              aria-label={t("common.cancel", "Annuler")}
              className="!min-h-7 h-7 w-7 shrink-0 rounded-full text-white/80"
            >
              <X size={14} />
            </Press>
          </div>
        )}
        <div className="flex items-center gap-2">
        {isGuest ? (
          // Guest composer: read-only chat + prompt-to-sign-in bar. Guests
          // physically cannot send chat data (canPublishData=false on the
          // LiveKit token, and RLS blocks all live-writes), so we replace
          // the input with a tap-to-sign-in surface rather than a disabled
          // control that would silently swallow taps.
          <Press
            onClick={() => openAuth()}
            aria-label={t("auth.prompt.chatCta", { defaultValue: "Connecte-toi pour participer au chat" })}
            className="!min-h-11 h-11 flex-1 rounded-full px-4 text-left text-[14px] font-semibold text-white"
            style={{
              backgroundColor: "rgba(0,0,0,0.5)",
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
              border: "1px solid rgba(255,255,255,0.15)",
            }}
          >
            {t("auth.prompt.chatCta", { defaultValue: "Connecte-toi pour participer au chat" })}
          </Press>
        ) : (
          <>
            <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex-1">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={
                  replyTo
                    ? t("live.replyPlaceholder", { name: replyTo.user, defaultValue: "Répondre à {{name}}…" })
                    : t("live.chatPlaceholder")
                }
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
          </>
        )}
        <Press onClick={liveEnded ? undefined : fireHeart} disabled={liveEnded} aria-label="Cœur"
          className="h-11 w-11 rounded-full text-white"
          style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", border: "1px solid rgba(255,255,255,0.15)" }}>
          <Heart size={17} fill="currentColor" />
        </Press>
        <Press
          onClick={liveEnded ? undefined : () => {
            if (isGuest) { openAuth(); return; }
            haptic.light();
            setGiftTrayOpen(true);
          }}
          disabled={liveEnded}
          aria-label={t("gifts.open", "Cadeaux")}
          className="h-11 w-11 rounded-full text-white"
          style={{
            backgroundColor: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            border: "1px solid oklch(0.75 0.14 85 / 0.5)",
          }}>
          <Gift size={17} />
        </Press>
        </div>
      </div>


      {isModerator && user && active?.liveId && active.sellerId && !liveEnded && (
        <ErrorBoundary boundary="moderator_dock">
          <ModeratorDock
            liveId={active.liveId}
            userId={user.id}
            sellerId={active.sellerId}
            products={room.products}
            activeAuction={room.auctionStart}
            currency={liveCurrency}
            locale={i18n.language}
            broadcastAuctionStart={room.broadcastAuctionStart}
          />
        </ErrorBoundary>
      )}

      <FloatingHearts trigger={room.heartTick} />
      
      <Confetti trigger={confettiKey} />
      <WinnerReveal
        key={winnerReveal?.key ?? "wr"}
        open={!!winnerReveal}
        winnerName={winnerReveal?.name ?? null}
        winnerId={winnerReveal?.winnerId ?? null}
        winnerAvatarUrl={winnerReveal?.avatar ?? null}
        isMe={!!winnerReveal?.isMe}
        variant={winnerReveal?.variant ?? "winner"}
        productName={winnerReveal?.productName ?? null}
        revealKey={winnerReveal?.key ?? null}
        onDone={() => setWinnerReveal(null)}
      />
      <SuddenDeathFlash tick={suddenDeathTick} />
      <AuctionFinalCountdown
        secondsLeft={secondsLeft}
        active={!!room.auctionStart}
      />
      <BidPulseFlash
        text={
          room.lastBid
            ? `${room.lastBid.bidderName} · ${formatLive(room.lastBid.amount)}`
            : null
        }
        pulseKey={room.lastBid?.ts ?? 0}
      />

      <LiveViewersSheet
        open={viewersSheetOpen}
        onClose={() => setViewersSheetOpen(false)}
        presentViewers={room.presentViewers}
        viewerCount={room.viewerCount}
        onOpenProfile={(userId) => openSeller(userId)}
      />

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
        deliveryBlockedLabel={deliveryBlockedLabel}
      />
      <PaymentSheet
        order={pendingOrder}
        onClose={() => setPendingOrder(null)}
      />
      <TopUpSheet open={topupOpen} onClose={() => setTopupOpen(false)} />
      <GiftTraySheet
        open={giftTrayOpen}
        onClose={() => setGiftTrayOpen(false)}
        liveCurrency={liveCurrency}
        locale={i18n.language}
        sending={sendingGift}
        onSend={(k) => doSendGift(k)}
        onTopUp={() => { setGiftTrayOpen(false); setTopupOpen(true); }}
      />
      <GiftComboFeed trigger={room.lastGift} />
      <GiftAnimationsLayer trigger={room.lastGift} />

      {moreOpen && (
        <div className="fixed inset-0 z-[70] flex items-end bg-black/50" onClick={() => setMoreOpen(false)}>
          <div className="mx-auto w-full max-w-lg rounded-t-3xl bg-background p-4 pb-safe" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted" />
            <Press onClick={() => { setMoreOpen(false); requireAuth(() => { if (confirm(t("report.confirm", { defaultValue: "Signaler ce live ? Notre équipe examinera ton signalement." }))) setReportOpen(true); }); }}
              className="!min-h-12 flex h-12 w-full items-center gap-3 rounded-2xl px-3 text-left text-[15px]">
              <Flag size={18} /> {t("report.action")}
            </Press>
            <Press onClick={() => { requireAuth(() => { if (confirm(t("block.confirm"))) void doBlockSeller(); }); }}
              className="!min-h-12 flex h-12 w-full items-center gap-3 rounded-2xl px-3 text-left text-[15px] text-destructive">
              <UserX size={18} /> {t("block.action")}
            </Press>

          </div>
        </div>
      )}
      {active?.liveId && (
        <ReportSheet
          open={reportOpen}
          onClose={() => setReportOpen(false)}
          targetType="live"
          targetId={active.liveId}
          defaultReason="inappropriate"
        />
      )}
      {/* Per-chat-message report (Apple 1.2). Any signed-in viewer can flag. */}
      <ReportSheet
        open={!!reportMessageId}
        onClose={() => setReportMessageId(null)}
        targetType="message"
        targetId={reportMessageId ?? ""}
        defaultReason="inappropriate"
      />
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
              <SellerAvatar src={active.avatar} name={active.seller} size="lg" />
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
      </>
      )}
      </motion.div>

      {!chromeHidden && peekNext && (
        <LivePeekSlide stream={peekNext} position="next" dragY={dragY} />
      )}
      {!chromeHidden && peekPrev && (
        <LivePeekSlide stream={peekPrev} position="prev" dragY={dragY} />
      )}

      {/* PAGER DRAG LAYER — TikTok-style vertical pan.
          touch-action MUST be "none" on iOS or the browser steals the gesture. */}
      {!chromeHidden && (
      <motion.div
        className="absolute inset-0 z-[25]"
        aria-hidden
        style={{
          touchAction: "none",
          WebkitUserSelect: "none",
          userSelect: "none",
        }}
        drag="y"
        dragElastic={{ top: hasNext ? 0.55 : 0.15, bottom: hasPrev ? 0.55 : 0.2 }}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragMomentum={false}
        onDrag={(_, info) => dragY.set(info.offset.y)}
        onTap={onVideoTap}
        onDragEnd={(_, info) => {
          const strong = Math.abs(info.offset.y) > 90 || Math.abs(info.velocity.y) > 500;
          const up = info.offset.y < 0;
          const h = typeof window !== "undefined" ? window.innerHeight : 800;
          if (up && strong && hasNext) {
            try { localStorage.setItem("hint.liveSwipe.v1", "1"); } catch { /* ignore */ }
            void animate(dragY, -h, { duration: 0.22, ease: EASE_IOS }).then(() => {
              dragY.set(0);
              nextLive();
            });
            return;
          }
          if (!up && strong && hasPrev) {
            try { localStorage.setItem("hint.liveSwipe.v1", "1"); } catch { /* ignore */ }
            void animate(dragY, h, { duration: 0.22, ease: EASE_IOS }).then(() => {
              dragY.set(0);
              prevLive();
            });
            return;
          }
          // Swipe down → shrink to floating mini player (keep audio/video alive).
          if (!up && info.offset.y > 160) {
            dragY.set(0);
            haptic.light();
            minimize();
            return;
          }
          animate(dragY, 0, { duration: 0.22, ease: EASE_IOS });
        }}
      />
      )}
      {!chromeHidden && (
      <>
      <div className="pointer-events-none absolute right-2 top-1/2 z-[26] hidden -translate-y-1/2 flex-col gap-2 md:flex">
        {hasNext && (
          <Press
            aria-label="Next live"
            onClick={() => nextLive()}
            className="pointer-events-auto h-10 w-10 rounded-full text-white"
            style={{ backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(10px)" }}
          >
            ↑
          </Press>
        )}
        {hasPrev && (
          <Press
            aria-label="Previous live"
            onClick={() => prevLive()}
            className="pointer-events-auto h-10 w-10 rounded-full text-white"
            style={{ backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(10px)" }}
          >
            ↓
          </Press>
        )}
      </div>

      <SwipeHint hasNext={hasNext} />
      </>
      )}
    </LivePipShell>
  );
}

function SwipeHint({ hasNext }: { hasNext: boolean }) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!hasNext) return;
    try {
      if (localStorage.getItem("hint.liveSwipe.v1")) return;
    } catch { /* ignore */ }
    setVisible(true);
    const timer = setTimeout(() => {
      setVisible(false);
      try { localStorage.setItem("hint.liveSwipe.v1", "1"); } catch { /* ignore */ }
    }, 3200);
    return () => clearTimeout(timer);
  }, [hasNext]);
  if (!visible) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="pointer-events-none absolute inset-x-0 z-[27] flex justify-center"
      style={{ top: "35%" }}
    >
      <span
        className="rounded-full px-4 py-2 text-[13px] font-semibold text-white"
        style={{ backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(12px)" }}
      >
        {t("verify.swipeHint", "Glisse vers le haut pour le live suivant ↑")}
      </span>
    </motion.div>
  );
}

