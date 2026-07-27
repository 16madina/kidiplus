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
import { placeBidInDb, type LiveProductRow } from "@/lib/lives-db";
import { createLiveOrder, fetchOrderById, type OrderRow } from "@/lib/orders-db";
import { fetchDeliverySettings } from "@/lib/delivery-db";
import { fetchDefaultAddress } from "@/lib/addresses-db";
import { canDeliver } from "@/lib/delivery-eligibility";
import type { SellerDeliverySettings } from "@/lib/delivery";
import { systemMessage, type ChatMsg, type Product } from "@/lib/live-viewer-mock";
import { useWallet } from "@/lib/wallet-context";
import { payOrderWithWallet } from "@/lib/wallet-db";
import { formatMoney, nextBidAmount, normalizeCurrency, convertMoney } from "@/lib/money";
import {
  conditionLabel,
  formatProductMetaLine,
  variantSelectionState,
} from "@/lib/live-product-options";
import { LiveChat } from "./live-chat";
import { LiveViewersSheet } from "./live-viewers-sheet";
import { FloatingHearts } from "./floating-hearts";
import { AuctionCard } from "./auction-card";
import { CustomBidStepper } from "./custom-bid-stepper";
import { ProductsSheet } from "./products-sheet";
import { VariantPickerSheet } from "./variant-picker-sheet";
import { PaymentSheet } from "@/components/payments/payment-sheet";
import { AddressFormSheet } from "@/components/buyer/address-form-sheet";
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

function SellerAvatar({ src, name, size }: { src: string; name: string; size: "sm" | "md" | "lg" }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials =
    parts.length >= 2
      ? ((parts[0][0] || "") + (parts[1][0] || "")).toUpperCase()
      : (parts[0]?.[0] || "?").toUpperCase();
  const box =
    size === "lg"
      ? "h-16 w-16 text-[24px]"
      : size === "sm"
        ? "h-9 w-9 text-[12px]"
        : "h-10 w-10 text-[16px]";
  const showImg = !!src.trim() && failedSrc !== src;
  // Initials circle is ALWAYS painted; the photo overlays it once it actually
  // loads. Rendering a bare <img> meant a slow / expired / blocked avatar URL
  // painted nothing at all — the "host avatar disappeared" bug.
  return (
    <span
      className={`${box} relative grid shrink-0 place-items-center overflow-hidden rounded-full font-black ring-2 ring-white/90`}
      style={{ backgroundColor: "oklch(0.72 0.16 70)", color: "#10162B" }}
    >
      {initials || "?"}
      {showImg && (
        <img
          src={src}
          alt=""
          onError={() => setFailedSrc(src)}
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />
      )}
    </span>
  );
}

function toProduct(
  row: LiveProductRow,
  activeId: string | null,
  t: (key: string, fallback: string) => string,
): Product {
  const status: Product["status"] =
    row.status === "sold" || row.status === "out" || row.status === "unsold"
      ? "sold"
      : row.id === activeId
        ? "current"
        : "upcoming";
  const colors = row.colors ?? [];
  const sizes = row.sizes ?? [];
  const cond = conditionLabel(row.condition ?? null, t);
  return {
    id: row.id,
    name: row.name,
    image: row.image_url || FALLBACK_IMG,
    mode: row.mode,
    startBid: Number(row.start_price),
    price: Number(row.price),
    status,
    winner: row.sold_to_identity ?? undefined,
    metaLine: formatProductMetaLine({
      brand: row.brand,
      colors,
      sizes,
      conditionText: cond,
    }),
    description: row.description,
    colors,
    sizes,
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

  const { currency: walletCurrency, refresh: refreshWallet, balance: walletBalance } = useWallet();
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
  const [sellerAvatarUrl, setSellerAvatarUrl] = useState<string | null>(null);
  const [buyerCountry, setBuyerCountry] = useState<string | null>(null);
  const [addressFormOpen, setAddressFormOpen] = useState(false);
  const refreshBuyerCountry = useCallback(async () => {
    if (!user?.id) { setBuyerCountry(null); return; }
    const addr = await fetchDefaultAddress(user.id);
    setBuyerCountry(addr?.country ?? null);
  }, [user?.id]);
  useEffect(() => {
    if (!active?.sellerId) return;
    let cancelled = false;
    void (async () => {
      const [settings, sellerProfile] = await Promise.all([
        fetchDeliverySettings(active.sellerId!),
        supabase
          .from("profiles")
          .select("country, is_verified, avatar_url")
          .eq("id", active.sellerId!)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      setSellerSettings(settings);
      const p = sellerProfile.data as {
        country?: string | null;
        is_verified?: boolean;
        avatar_url?: string | null;
      } | null;
      setSellerCountry(p?.country ?? null);
      setSellerVerified(!!p?.is_verified);
      const resolved = p?.avatar_url ? await resolveAvatarUrl(p.avatar_url) : null;
      if (!cancelled) setSellerAvatarUrl(resolved || active.avatar || null);
    })();
    return () => { cancelled = true; };
  }, [active?.sellerId, active?.avatar]);
  useEffect(() => {
    if (!user?.id) { setBuyerCountry(null); return; }
    let cancelled = false;
    void (async () => {
      const addr = await fetchDefaultAddress(user.id);
      if (!cancelled) setBuyerCountry(addr?.country ?? null);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);
  // Address edited outside the live (settings screen, other tab) — re-read it
  // when the app/tab comes back so the delivery gate reflects reality.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshBuyerCountry();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refreshBuyerCountry]);
  const eligibility = useMemo(
    () => canDeliver({ settings: sellerSettings, sellerCountry, buyerCountry }),
    [sellerSettings, sellerCountry, buyerCountry],
  );
  const deliveryBlockedLabel = eligibility.eligible || eligibility.reason === "no_address"
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

  // Featured product: active auction wins; otherwise the next playable item
  // after any just-ended product (never stay on the finished article).
  // Prefer a DB-active auction even if the auction:start broadcast was missed
  // (Assi-style "En attente du vendeur" while friends can still bid).
  const dbActiveAuction = useMemo(
    () =>
      room.products.find(
        (p) =>
          p.mode === "auction" &&
          p.status === "active" &&
          !!p.auction_deadline_at,
      ) ?? null,
    [room.products],
  );
  const activeAuctionId = room.auctionStart?.productId ?? dbActiveAuction?.id ?? null;
  const endedProductId = room.lastAuctionEnd?.productId ?? null;
  const currentProduct = useMemo(() => {
    if (activeAuctionId) {
      return room.products.find((p) => p.id === activeAuctionId) ?? null;
    }
    const sorted = [...room.products].sort((a, b) => a.position - b.position);
    const playable = (p: (typeof sorted)[number]) =>
      p.id !== endedProductId &&
      p.status !== "sold" &&
      p.status !== "out" &&
      p.status !== "unsold";
    if (endedProductId) {
      const idx = sorted.findIndex((p) => p.id === endedProductId);
      const next = sorted.slice(idx + 1).find(playable);
      if (next) return next;
    }
    return sorted.find((p) => p.status === "upcoming" && playable(p))
      ?? sorted.find(playable)
      ?? null;
  }, [room.products, activeAuctionId, endedProductId]);

  // Auction countdown from broadcast deadline (fallback: DB deadline on product).
  // Poll often, but only re-render when the displayed second changes (~1×/s).
  const [secondsLeft, setSecondsLeft] = useState(0);
  const deadlineMs =
    room.auctionStart?.deadlineMs ??
    (currentProduct?.mode === "auction" &&
    currentProduct.status === "active" &&
    currentProduct.auction_deadline_at
      ? new Date(currentProduct.auction_deadline_at).getTime()
      : null);
  useEffect(() => {
    if (!deadlineMs) {
      setSecondsLeft(0);
      return;
    }
    let last = -1;
    const tick = () => {
      const s = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
      if (s !== last) {
        last = s;
        setSecondsLeft(s);
      }
    };
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [deadlineMs]);
  const auctionIsLive =
    !liveEnded &&
    !!currentProduct &&
    currentProduct.mode === "auction" &&
    (
      (!!room.auctionStart && room.auctionStart.productId === currentProduct.id) ||
      (currentProduct.status === "active" && !!currentProduct.auction_deadline_at)
    );

  // Local chat tip — shown once on join, then fades so it never sticks forever.
  const [localMessages, setLocalMessages] = useState<ChatMsg[]>([]);
  useEffect(() => {
    if (!active?.liveId) return;
    const intro = systemMessage(t("live.chatIntro", "Sois respectueux dans le chat 💛"));
    setLocalMessages([intro]);
    const timer = window.setTimeout(() => {
      setLocalMessages((prev) => prev.filter((m) => m.id !== intro.id));
    }, 5500);
    return () => window.clearTimeout(timer);
  }, [active?.liveId, t]);
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
  const settledEndIdsRef = useRef<Set<string>>(new Set());
  // Only celebrate ends that arrive after we joined this live session.
  // Prevents replaying a leftover lastAuctionEnd (or a stale broadcast) when
  // opening / rejoining a live after someone already won.
  const joinedAtRef = useRef(Date.now());
  const productsRef = useRef(room.products);
  productsRef.current = room.products;

  useEffect(() => {
    joinedAtRef.current = Date.now();
    seenEndIdsRef.current = new Set();
    settledEndIdsRef.current = new Set();
    setWinnerReveal(null);
    setConfettiKey(0);
  }, [active?.liveId]);

  useEffect(() => {
    const evt = room.lastAuctionEnd;
    if (!evt) return;
    // Only dedupe by unique endId — same buyer may win the same item many times.
    const endId = evt.endId ?? `fallback-${evt.ts}-${evt.productId}-${evt.auctionRound}-${evt.orderId}`;
    // Stale end from before this viewer session (rejoin / swipe leak).
    const ts = evt.ts ?? 0;
    if (ts > 0 && ts < joinedAtRef.current - 2500) return;

    const settleWinnerPayment = () => {
      if (!user || evt.winnerId !== user.id || !active?.liveId || !active?.sellerId) return;
      if (settledEndIdsRef.current.has(endId)) return;
      if (!evt.autoPaid && !evt.orderId) return;
      settledEndIdsRef.current.add(endId);
      if (evt.autoPaid) {
        toast.success(t("pay.autoPaid", { defaultValue: "Payé automatiquement avec ton solde ✅" }));
        void refreshWallet();
        return;
      }
      void (async () => {
        // Fallback auto-pay if finalize skipped (e.g. older server / FX).
        const paid = await payOrderWithWallet(evt.orderId!);
        if (paid.ok) {
          toast.success(t("pay.autoPaid", { defaultValue: "Payé automatiquement avec ton solde ✅" }));
          void refreshWallet();
          return;
        }
        const order = await fetchOrderById(evt.orderId!);
        if (order) setPendingOrder(order);
        void refreshWallet();
      })();
    };

    // Host sends a second frame with the same endId after finalize (order /
    // auto-pay). Skip confetti replay; only settle payment.
    if (seenEndIdsRef.current.has(endId)) {
      settleWinnerPayment();
      return;
    }
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

    // Prefer host finalize settlement (auto-pay / order id). Only fall back to
    // client-created pending order if that second frame never arrives.
    if (
      user &&
      evt.winnerId === user.id &&
      active?.liveId &&
      active?.sellerId
    ) {
      if (evt.autoPaid || evt.orderId) {
        settleWinnerPayment();
      } else {
        window.setTimeout(() => {
          if (settledEndIdsRef.current.has(endId)) return;
          const prodRow = productsRef.current.find((p) => p.id === evt.productId);
          if (!prodRow || !active?.sellerId || !active?.liveId) return;
          void (async () => {
            if (settledEndIdsRef.current.has(endId)) return;
            settledEndIdsRef.current.add(endId);
            const colors = prodRow.colors ?? [];
            const sizes = prodRow.sizes ?? [];
            const sel = variantSelectionState(colors, sizes);
            const variant =
              sel.needsPick ? undefined : { color: sel.color, size: sel.size };
            // Server derives price/fees/delivery — client cannot forge amounts.
            const res = await createLiveOrder({
              productId: prodRow.id,
              kind: "auction",
              color: variant?.color ?? null,
              size: variant?.size ?? null,
            });
            if (res.ok) setPendingOrder(res.order);
            else if (res.error === "no_address") {
              toast.error(t("delivery.noAddressBlock"));
              setAddressFormOpen(true);
            } else {
              toast.error(res.error);
            }
          })();
        }, 3500);
      }
    }
  }, [room.lastAuctionEnd, t, user, active?.liveId, active?.sellerId, liveCurrency, formatLive, refreshWallet]);

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
    if (!currentProduct || currentProduct.mode !== "auction" || !auctionIsLive) return;
    if (!user) { openAuth(); return; }
    // Local clock may already read 0 while DB status is still active — still allow.
    if (!eligibility.eligible) {
      if (eligibility.reason === "no_address") {
        toast.error(t("delivery.noAddressBlock"));
        setAddressFormOpen(true);
        return;
      }
      toast.error(deliveryBlockedLabel!);
      return;
    }
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

    // Bids are a purchase commitment — require enough wallet balance (in the
    // buyer's wallet currency) before placing. Open top-up instead of bidding.
    const needInWallet = convertMoney(sendAmount, liveCurrency, walletCurrency);
    if (!(walletBalance >= needInWallet)) {
      toast.error(
        t(
          "live.bidInsufficientFunds",
          "Solde insuffisant — recharge ton portefeuille pour enchérir",
        ),
      );
      setTopupOpen(true);
      return;
    }

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
      if (res.error === "auction_ended" || res.error === "auction_not_active") {
        toast.error(t("live.auctionEndedBid", "L'enchère est terminée."));
        return;
      }
      if (res.error === "no_address") {
        toast.error(t("delivery.noAddressBlock"));
        setAddressFormOpen(true);
        return;
      }
      if (
        res.error === "no_country_coverage" ||
        res.error === "courier_country_mismatch" ||
        res.error === "delivery_blocked"
      ) {
        toast.error(t("delivery.noCountryCoverage"));
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

  // Fixed-price flow: optional variant pick → server creates order (stock +
  // fees + delivery). Abandoned payments restore stock via expire_overdue_orders.
  const [variantPick, setVariantPick] = useState<{
    product: LiveProductRow;
    colors: string[];
    sizes: string[];
  } | null>(null);

  const completeFixedPurchase = async (
    p: LiveProductRow,
    variant?: { color?: string; size?: string },
  ) => {
    if (liveEnded) return;
    if (!user) { openAuth(); return; }
    if (!active?.liveId || !active?.sellerId) return;
    if (!eligibility.eligible) {
      if (eligibility.reason === "no_address") {
        toast.error(t("delivery.noAddressBlock"));
        setAddressFormOpen(true);
        return;
      }
      toast.error(deliveryBlockedLabel!);
      return;
    }
    const order = await createLiveOrder({
      productId: p.id,
      kind: "fixed",
      color: variant?.color ?? null,
      size: variant?.size ?? null,
    });
    if (order.ok) {
      setPendingOrder(order.order);
      return;
    }
    if (order.error === "no_address") {
      toast.error(t("delivery.noAddressBlock"));
      setAddressFormOpen(true);
      return;
    }
    if (order.error === "no_country_coverage" || order.error === "courier_country_mismatch") {
      toast.error(t("delivery.noCountryCoverage"));
      return;
    }
    toast.error(order.error === "out_of_stock" ? t("live.outOfStock", "Rupture de stock") : (order.error ?? "Achat impossible"));
  };

  const startFixedPurchase = async (p: LiveProductRow) => {
    const colors = p.colors ?? [];
    const sizes = p.sizes ?? [];
    const sel = variantSelectionState(colors, sizes);
    if (sel.needsPick) {
      setVariantPick({ product: p, colors, sizes });
      return;
    }
    await completeFixedPurchase(p, { color: sel.color, size: sel.size });
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
  const productsForSheet = room.products.map((r) => toProduct(r, activeAuctionId, t));
  const currentAsProduct = currentProduct ? toProduct(currentProduct, activeAuctionId, t) : null;

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

      <div className="absolute inset-x-0 top-0 z-30 pt-safe kp-live-safe-x">
        <div className="flex items-start gap-1.5 px-2 pt-2">
          {/* Left: one fixed-width column (avatar, name, follow stacked).
              A flexible side-by-side layout let the follow button overflow
              under the wallet pill on narrow phones (iPhone 15) while wider
              ones (Pro Max) looked fine — stacking keeps every screen equal. */}
          <div className="flex min-w-0 flex-1 items-start">
            <div className="flex w-[4.75rem] shrink-0 flex-col items-center gap-1">
              <Press
                onClick={() => openSeller(active.sellerId ?? active.seller)}
                aria-label={`Voir la boutique de ${active.seller}`}
                className="!inline-flex !min-h-0 !min-w-0 flex-col items-center gap-0.5 p-0"
              >
                <span className="relative">
                  <SellerAvatar
                    src={sellerAvatarUrl || active.avatar || ""}
                    name={active.seller || "?"}
                    size="sm"
                  />
                  <VerifiedBadge
                    verified={sellerVerified}
                    size={12}
                    className="absolute -bottom-0.5 -right-0.5"
                  />
                </span>
                <span
                  className="line-clamp-1 max-w-[4.75rem] text-center text-[10px] font-bold leading-tight text-white"
                  style={{ textShadow: "0 1px 3px rgba(0,0,0,0.7)" }}
                >
                  {active.seller}
                </span>
              </Press>
              <FollowButton
                sellerId={active.sellerId ?? null}
                size="sm"
                variant="solid"
                tone="live"
              />
            </div>
          </div>

          {/* Right: keep compact — share lives in the ⋯ menu to free room for the avatar. */}
          <div className="flex shrink-0 items-center gap-1">
            <WalletPill compact onTap={() => requireAuth(() => setTopupOpen(true))} />
            <Press
              onClick={() => {
                haptic.selection();
                setViewersSheetOpen(true);
              }}
              aria-label={t("live.viewersSheetTitle", "Spectateurs")}
              className="!min-h-0 flex h-8 items-center gap-1 rounded-full px-2 text-[11px] font-semibold text-white tabular-nums"
              style={{ backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}
            >
              <Eye size={12} />
              {displayViewers}
            </Press>
            <Press aria-label="More" onClick={() => setMoreOpen(true)}
              className="!min-h-0 h-8 w-8 rounded-full text-white"
              style={{ backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}>
              <MoreVertical size={15} />
            </Press>
            <Press
              aria-label={t("live.leave")}
              onClick={() => { haptic.light(); close(); }}
              className="!min-h-0 h-8 w-8 rounded-full text-white"
              style={{ backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}>
              <X size={16} />
            </Press>
          </div>
        </div>
      </div>


      {/* z-[28] sits above the pager drag layer (z-25) so chat scroll / report /
          reply stay tappable; composer chrome below remains z-30. */}
      <div className="absolute inset-x-0 z-[28]" style={{ bottom: "calc(env(safe-area-inset-bottom) + 138px)" }}>
        <LiveChat
          messages={messages}
          bottomOffset={0}
          height="38dvh"
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

      <div className="absolute inset-x-0 bottom-0 z-30 flex flex-col gap-1.5 px-3 pb-safe"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 8px)" }}>
        {replyTo && !isGuest && (
          <div
            className="flex items-center gap-2 rounded-2xl px-3 py-1.5 text-[12px] text-white"
            style={{
              backgroundColor: "rgba(0,0,0,0.4)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
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
            className="!min-h-10 h-10 flex-1 rounded-full px-4 text-left text-[13px] font-semibold text-white"
            style={{
              backgroundColor: "rgba(0,0,0,0.4)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              border: "1px solid rgba(255,255,255,0.14)",
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
                className="w-full rounded-full px-3.5 py-2 text-[13px] text-white outline-none placeholder:text-white/55"
                style={{
                  backgroundColor: "rgba(0,0,0,0.4)",
                  backdropFilter: "blur(10px)",
                  WebkitBackdropFilter: "blur(10px)",
                  border: "1px solid rgba(255,255,255,0.14)",
                }}
              />
            </form>
            <Press onClick={liveEnded ? undefined : send} disabled={liveEnded} aria-label={t("live.sendMessage")}
              className="h-10 w-10 rounded-full text-white"
              style={{ backgroundColor: "rgba(0,0,0,0.4)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.14)" }}>
              <Send size={16} />
            </Press>
          </>
        )}
        <Press onClick={liveEnded ? undefined : fireHeart} disabled={liveEnded} aria-label="Cœur"
          className="h-10 w-10 rounded-full text-white"
          style={{ backgroundColor: "rgba(0,0,0,0.4)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.14)" }}>
          <Heart size={16} fill="currentColor" />
        </Press>
        <Press
          onClick={liveEnded ? undefined : () => {
            if (isGuest) { openAuth(); return; }
            haptic.light();
            setGiftTrayOpen(true);
          }}
          disabled={liveEnded}
          aria-label={t("gifts.open", "Cadeaux")}
          className="h-10 w-10 rounded-full text-white"
          style={{
            backgroundColor: "rgba(0,0,0,0.4)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            border: "1px solid oklch(0.75 0.14 85 / 0.45)",
          }}>
          <Gift size={16} />
        </Press>
        </div>

        {currentAsProduct ? (
          <AuctionCard
            product={currentAsProduct}
            secondsLeft={secondsLeft}
            currency={liveCurrency}
            viewerCurrency={walletCurrency}
            auctionActive={auctionIsLive && currentAsProduct.id === currentProduct?.id}
            isHighestBidder={
              !!user &&
              room.lastBid?.productId === currentAsProduct.id &&
              room.lastBid.auctionRound === (currentProduct?.auction_round ?? 1) &&
              room.lastBid.bidderId === user.id
            }
            disabled={liveEnded}
            deliveryBlockedLabel={deliveryBlockedLabel}
            waitingLabel={
              !liveEnded &&
              !auctionIsLive &&
              currentProduct?.status === "upcoming"
                ? `⏳ ${t("live.nextItemSoon", { name: currentAsProduct.name, defaultValue: "Prochain article bientôt… {{name}}" })}`
                : undefined
            }
            lastBidder={
              room.lastBid &&
              room.lastBid.productId === currentAsProduct.id &&
              room.lastBid.auctionRound === (currentProduct?.auction_round ?? 1)
                ? room.lastBid.bidderName
                : undefined
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
        ) : (
          !liveEnded && room.products.length > 0 ? (
            <div
              className="rounded-full px-3 py-2.5 text-center text-[13px] font-semibold text-white/90"
              style={{
                backgroundColor: "rgba(0,0,0,0.32)",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
                border: "1px solid rgba(255,255,255,0.14)",
              }}
            >
              {t("live.waitingForSeller")}
            </div>
          ) : null
        )}
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

      <FloatingHearts useBus />
      
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
        active={auctionIsLive}
        density="app"
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
      <VariantPickerSheet
        open={!!variantPick}
        onClose={() => setVariantPick(null)}
        productName={variantPick?.product.name ?? ""}
        colors={variantPick?.colors ?? []}
        sizes={variantPick?.sizes ?? []}
        onConfirm={(v) => {
          const p = variantPick?.product;
          setVariantPick(null);
          if (p) void completeFixedPurchase(p, v);
        }}
      />
      <PaymentSheet
        order={pendingOrder}
        onClose={() => setPendingOrder(null)}
        productColors={
          pendingOrder?.product_id
            ? (room.products.find((p) => p.id === pendingOrder.product_id)?.colors ?? [])
            : []
        }
        productSizes={
          pendingOrder?.product_id
            ? (room.products.find((p) => p.id === pendingOrder.product_id)?.sizes ?? [])
            : []
        }
        onOrderPatched={(o) => setPendingOrder(o)}
      />
      <AddressFormSheet
        open={addressFormOpen}
        onClose={() => setAddressFormOpen(false)}
        userId={user?.id ?? ""}
        currency={profile?.currency ?? liveCurrency}
        defaultCountry={profile?.country ?? null}
        onSaved={() => {
          setAddressFormOpen(false);
          void refreshBuyerCountry();
        }}
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
            <Press
              onClick={async () => {
                setMoreOpen(false);
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
              className="!min-h-12 flex h-12 w-full items-center gap-3 rounded-2xl px-3 text-left text-[15px]"
            >
              <Share2 size={18} /> {t("live.share")}
            </Press>
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
              <SellerAvatar src={sellerAvatarUrl || active.avatar || ""} name={active.seller} size="lg" />
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

