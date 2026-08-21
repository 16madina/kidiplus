import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, animate } from "framer-motion";
import {
  Eye, Package, AlertTriangle, X, Shield, Trash2, Send, Radio,
} from "lucide-react";
import { HostToolRail } from "./host-tool-rail";
import { FiltersCarousel } from "./filters-carousel";
import { RtmpCredentialsSheet } from "./rtmp-credentials-sheet";
import { TiktokRtmpSheet } from "./tiktok-rtmp-sheet";
import {
  fetchYoutubeStatus,
  startYoutubeRestream,
  stopYoutubeRestream,
  ensureYoutubeBroadcastLive,
} from "@/lib/youtube-restream";
import {
  fetchFacebookStatus,
  startFacebookRestream,
  stopFacebookRestream,
} from "@/lib/facebook-restream";
import {
  startTiktokRestream,
  stopTiktokRestream,
} from "@/lib/tiktok-restream";
import { useFilter } from "@/lib/filters/filter-context";
import { useLiveEffects } from "@/lib/filters/live-effects-context";
import { useBattle } from "@/lib/battle-context";
import { isBattleGuestIdentity, useOpponentBattleProducts } from "@/lib/battles-db";
import { Track } from "livekit-client";
import { useBattleGuestPublish } from "@/lib/battle-guest-publish";
import { BattleInviteSheet } from "@/components/battle/battle-invite-sheet";
import { BattleIncomingInviteSheet } from "@/components/battle/battle-incoming-invite-sheet";
import { BattleSplitStage } from "@/components/battle/battle-split-stage";
import { BattleScoreHud } from "@/components/battle/battle-score-hud";
import { BattleHostBar } from "@/components/battle/battle-host-bar";
import {
  BattleFeaturedRow,
  BattlePeerProductSheet,
  pickBattleFeatured,
} from "@/components/battle/battle-featured-row";
import { battleLayoutSides } from "@/lib/battle-layout";
import { BattleResultOverlay } from "@/components/battle/battle-result-overlay";
import { BattleCountdownOverlay } from "@/components/battle/battle-countdown-overlay";
import { BattleSuddenDeathOverlay } from "@/components/battle/battle-sudden-death-overlay";
import { ModeratorPromoteForm } from "./moderator-promote-form";
import {
  muteLiveChatUser,
  removeModerator,
  useLiveChatMutes,
  useModerators,
} from "@/lib/moderators-db";
import { blockUser, refreshBlockedIds } from "@/lib/moderation-db";
import { useAuth } from "@/lib/auth-context";
import type { BroadcastVideoHandle } from "./broadcast-video";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Press } from "@/components/press";
import { BroadcastVideo } from "./broadcast-video";
import { AddProductSheet } from "./add-product-sheet";
import { ShopPickerSheet } from "@/components/shop/shop-picker-sheet";
import { LiveChat } from "@/components/live-viewer/live-chat";
import { LiveViewersSheet } from "@/components/live-viewer/live-viewers-sheet";
import { FloatingHearts } from "@/components/live-viewer/floating-hearts";
import { Confetti } from "@/components/live-viewer/confetti";
import { BottomSheet } from "@/components/live-viewer/bottom-sheet";
import { GiftAnimationsLayer } from "@/components/live-viewer/gift-animations";
import { GiftComboFeed } from "@/components/live-viewer/gift-combo-feed";
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
import { fetchOrdersForLive, subscribeOrders } from "@/lib/orders-db";
import {
  startAuctionInDb, finalizeAuctionInDb, activateFixedInDb, stopFixedInDb,
  createLiveProductInDb, relaunchUnsoldProductInDb, markLiveActiveInDb, touchLiveHostInDb,
  type LiveProductRow,
} from "@/lib/lives-db";
import { supabase } from "@/integrations/supabase/client";
import { resolveAvatarUrl } from "@/lib/avatar-url";
import { AUCTION_EXTENSION_WINDOW_SECONDS, AUCTION_EXTENSION_RESET_SECONDS } from "@/lib/fees";
import { WinnerReveal } from "@/components/live-viewer/winner-reveal";
import { SuddenDeathFlash } from "@/components/live-viewer/sudden-death-flash";
import { AuctionFinalCountdown } from "@/components/live-viewer/auction-final-countdown";
import type { ChatMsg } from "@/lib/live-viewer-mock";
import {
  replyOnSocialPlatforms,
  useSocialChatBridge,
} from "@/lib/social-chat-bridge";
import { usePrelaunchLiveSim } from "@/lib/use-prelaunch-live-sim";
import { isSimBidderId, simAvatarUrl } from "@/lib/prelaunch-live-sim";

export function BroadcastLive({ onEnd }: { onEnd: () => void }) {
  const { t, i18n } = useTranslation();
  const b = useBroadcast();
  const appActive = useAppActive();
  const cur = b.currency;
  const fmt = (n: number) => formatMoney(n, cur, i18n.language);

  const facing = b.cameraFacing;
  const setFacing = b.setCameraFacing;
  const isRtmp = b.streamSource === "rtmp";
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(!isRtmp);
  const [rtmpSheetOpen, setRtmpSheetOpen] = useState(isRtmp && !!b.rtmpCreds);
  const [ytConnected, setYtConnected] = useState(false);
  const [ytRestreaming, setYtRestreaming] = useState(false);
  const [ytBusy, setYtBusy] = useState(false);
  const [ytWatchUrl, setYtWatchUrl] = useState<string | null>(null);
  const ytPromoteAbortRef = useRef<AbortController | null>(null);
  const [fbReady, setFbReady] = useState(false);
  const [fbRestreaming, setFbRestreaming] = useState(false);
  const [fbBusy, setFbBusy] = useState(false);
  const [fbWatchUrl, setFbWatchUrl] = useState<string | null>(null);
  const [ttRestreaming, setTtRestreaming] = useState(false);
  const [ttBusy, setTtBusy] = useState(false);
  const [ttSheetOpen, setTtSheetOpen] = useState(false);
  const [duration, setDuration] = useState(0);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [confettiTrigger, setConfettiTrigger] = useState(0);
  const [featuredId, setFeaturedId] = useState<string>("");
  /** Products whose auction already ended this session — star card must never
   *  stick on them even if a stale realtime frame revives status=active. */
  const [retiredFeaturedIds, setRetiredFeaturedIds] = useState<string[]>([]);
  const [lastSaleFlash, setLastSaleFlash] = useState<string | null>(null);
  const [lastBidFlash, setLastBidFlash] = useState<string | null>(null);
  const [videoStatus, setVideoStatus] = useState<import("./broadcast-video").BroadcastStatus>("idle");
  const [retryKey, setRetryKey] = useState(0);
  const [productsOpen, setProductsOpen] = useState(false);
  const [peerProductOpen, setPeerProductOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [shopPickerOpen, setShopPickerOpen] = useState(false);
  const [addingProduct, setAddingProduct] = useState(false);
  const [canFlip, setCanFlip] = useState(false);
  const [flipBusy, setFlipBusy] = useState(false);
  const [moderatorsSheetOpen, setModeratorsSheetOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { activeLens } = useFilter();
  const liveEffects = useLiveEffects();
  const battle = useBattle();
  const [viewersSheetOpen, setViewersSheetOpen] = useState(false);
  const videoHandleRef = useRef<BroadcastVideoHandle>(null);
  const { user, profile } = useAuth();
  const getBattleSourceTrack = useCallback(
    () => videoHandleRef.current?.getCameraTrack() ?? null,
    [],
  );
  const getBattleSourceAudioTrack = useCallback(
    () => videoHandleRef.current?.getMicrophoneTrack() ?? null,
    [],
  );
  const opponentFighter = useMemo(() => {
    if (!battle.session || !user?.id) return null;
    return battle.session.sideA.sellerId === user.id
      ? battle.session.sideB
      : battle.session.sideA;
  }, [battle.session, user?.id]);
  const opponentProducts = useOpponentBattleProducts(
    opponentFighter?.liveId ?? null,
    battle.isRunning,
  );
  const opponentRoomName = useMemo(() => {
    if (!battle.session || !user?.id) return null;
    const mine =
      battle.session.sideA.sellerId === user.id
        ? battle.session.sideA
        : battle.session.sideB;
    const other =
      mine.sellerId === battle.session.sideA.sellerId
        ? battle.session.sideB
        : battle.session.sideA;
    return other.roomName;
  }, [battle.session, user?.id]);
  const [remoteBattleTracks, setRemoteBattleTracks] = useState<
    { identity: string; track: import("livekit-client").RemoteTrack }[]
  >([]);
  const guestTrack =
    remoteBattleTracks.find(
      (x) => isBattleGuestIdentity(x.identity) && x.track.kind === Track.Kind.Video,
    )?.track ?? null;
  const guestAudio =
    remoteBattleTracks.find(
      (x) => isBattleGuestIdentity(x.identity) && x.track.kind === Track.Kind.Audio,
    )?.track ?? null;
  const remoteBattleStatus = useBattleGuestPublish({
    enabled: !!battle.isRunning && !isRtmp,
    userId: user?.id ?? null,
    displayName: profile?.display_name || b.hostName || "Host",
    remoteRoomName: opponentRoomName,
    getSourceTrack: getBattleSourceTrack,
    getSourceAudioTrack: getBattleSourceAudioTrack,
  });
  const { moderators } = useModerators(b.liveId);
  const chatMutes = useLiveChatMutes(b.liveId);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hide the app's bottom tab bar while the host is on-air.
  useImmersiveScope(true);

  // YouTube / Facebook connect status (camera live only).
  useEffect(() => {
    if (isRtmp) return;
    let cancelled = false;
    void fetchYoutubeStatus()
      .then((s) => {
        if (!cancelled) setYtConnected(!!s.connected);
      })
      .catch(() => {
        if (!cancelled) setYtConnected(false);
      });
    void fetchFacebookStatus()
      .then((s) => {
        if (!cancelled) {
          setFbReady(!!s.connected && !s.needsPageSelection && !!s.pageId);
        }
      })
      .catch(() => {
        if (!cancelled) setFbReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isRtmp]);

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

  // Au démarrage d'un Défi Plus, on conserve le filtre Snap actif (le vendeur
  // garde son look) mais on coupe les effets lourds (fond vert / poster
  // MediaPipe), qui doublent la charge CPU/GPU pendant le split-screen.
  useEffect(() => {
    if (!battle.isRunning) return;
    liveEffects.clearAll();
    setFiltersOpen(false);
  }, [battle.isRunning, liveEffects.clearAll]);


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
  usePrelaunchLiveSim({ room, currency: cur, appActive });

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

  // Chat etiquette tip is shown locally per viewer (and fades) — do not
  // broadcast a permanent "Sois respectueux…" line into every client's chat.

  // Track a running peak viewer count.
  const [peak, setPeak] = useState(1);
  useEffect(() => {
    setPeak((p) => Math.max(p, room.viewerCount));
  }, [room.viewerCount]);

  // Featured auto-advances FORWARD only when a next article exists.
  // If the current one finishes and there is no next, keep it on the star
  // card so the host can relaunch without re-adding from the shop.
  const endedProductId = room.lastAuctionEnd?.productId ?? null;
  const isFeaturedDone = (p: LiveProductRow) => {
    if (retiredFeaturedIds.includes(p.id)) return true;
    if (p.status === "sold" || p.status === "out" || p.status === "unsold") return true;
    if (endedProductId && p.id === endedProductId && room.auctionStart?.productId !== p.id) {
      return true;
    }
    if (
      p.status === "active" &&
      p.mode === "auction" &&
      p.auction_deadline_at &&
      Date.parse(p.auction_deadline_at) <= Date.now() &&
      room.auctionStart?.productId !== p.id
    ) {
      return true;
    }
    return false;
  };

  useEffect(() => {
    if (room.products.length === 0) {
      if (featuredId) setFeaturedId("");
      return;
    }
    const cur = room.products.find((p) => p.id === featuredId);
    const done = !cur || isFeaturedDone(cur);
    if (!done) return;
    const sorted = [...room.products].sort((a, b) => a.position - b.position);
    const curIdx = cur ? sorted.findIndex((p) => p.id === cur.id) : -1;
    const next = sorted.slice(Math.max(curIdx, -1) + 1).find((p) => !isFeaturedDone(p));
    const fallback = sorted.find((p) => !isFeaturedDone(p));
    if (next || fallback) {
      if (cur) {
        setRetiredFeaturedIds((prev) =>
          prev.includes(cur.id) ? prev : [...prev, cur.id],
        );
      }
      setFeaturedId(next?.id ?? fallback!.id);
      return;
    }
    // No next article — keep the finished one featured for relaunch.
    if (cur) return;
    setFeaturedId(sorted[sorted.length - 1]?.id ?? "");
  }, [room.products, featuredId, retiredFeaturedIds, endedProductId, room.auctionStart?.productId]);

  // ---- Auction countdown, derived from server-broadcast deadline ----
  // Poll often for accuracy, re-render only when the second flips.
  const [timeLeft, setTimeLeft] = useState(0);
  useEffect(() => {
    if (!appActive || !room.auctionStart) {
      setTimeLeft(0);
      return;
    }
    const deadlineMs = room.auctionStart.deadlineMs;
    let last = -1;
    const tick = () => {
      const s = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
      if (s !== last) {
        last = s;
        setTimeLeft(s);
      }
    };
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [appActive, room.auctionStart]);

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
  // Guard against instant finalize on start (race / clock skew), but still
  // end reliably once the auction has actually been running.
  const endingRef = useRef<string | null>(null);
  const startingAuctionRef = useRef(false);
  const sawCountdownRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeAuction) {
      sawCountdownRef.current = null;
      return;
    }
    const armKey = `${activeAuction.productId}:${activeAuction.deadlineMs}`;
    if (timeLeft > 0) {
      sawCountdownRef.current = armKey;
      return;
    }
    // Fallback arm: if the auction started >2s ago (from timerSec), treat as
    // real even if we somehow missed a positive timeLeft frame.
    const timerSec = Math.max(1, activeAuction.timerSec ?? 30);
    const startedAt = activeAuction.deadlineMs - timerSec * 1000;
    if (Date.now() - startedAt >= 2000) sawCountdownRef.current = armKey;
  }, [activeAuction, timeLeft]);

  useEffect(() => {
    if (!activeAuction) return;
    if (timeLeft > 0) return;
    // Prefer row from products list; fall back to auction productId alone so a
    // missing/desynced product row cannot freeze the host at 00s forever.
    const productId = activeAuction.productId;
    const product =
      activeProduct ??
      room.products.find((p) => p.id === productId) ??
      null;
    const armKey = `${productId}:${activeAuction.deadlineMs}`;
    if (sawCountdownRef.current !== armKey) return;
    const round = product?.auction_round ?? 1;
    const endKey = `${productId}:${round}:${activeAuction.deadlineMs}`;
    if (endingRef.current === endKey) return;
    endingRef.current = endKey;
    const lastBidMatches =
      !!room.lastBid &&
      room.lastBid.productId === productId &&
      room.lastBid.auctionRound === round;
    const displayWinnerName = lastBidMatches ? room.lastBid!.bidderName : null;
    const displayWinnerId = lastBidMatches ? room.lastBid!.bidderId : null;
    const simWin = isSimBidderId(displayWinnerId);
    const winnerName = simWin ? null : displayWinnerName;
    const winnerId = simWin ? null : displayWinnerId;
    const finalPrice = product?.price ?? 0;
    const simAvatar =
      simWin && displayWinnerName ? simAvatarUrl(displayWinnerName) : null;
    // Stable endId across optimistic UI end + post-finalize settlement frame.
    const endId = `end-${productId}-${round}-${activeAuction.deadlineMs}`;
    // End UI immediately at 00s — never wait on RPC/avatar (that was the
    // multi-second "stuck at zero" gap before the winner popup).
    room.broadcastAuctionEnd({
      productId,
      winnerId: displayWinnerId,
      winnerName: displayWinnerName,
      winnerAvatarUrl: simAvatar,
      finalPrice: Number(finalPrice ?? 0),
      orderId: null,
      autoPaid: false,
      auctionRound: round,
      endId,
      ts: Date.now(),
    });
    void (async () => {
      let lastError = "";
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const res = await finalizeAuctionInDb({
            liveId: b.liveId!, productId, winnerId, winnerName, finalPrice,
          });
          if (res.ok) {
            const resolvedWinnerId = simWin ? displayWinnerId : (res.winnerId ?? winnerId);
            const resolvedWinnerName = simWin ? displayWinnerName : (res.winnerName ?? winnerName);
            const resolvedPrice = res.finalPrice ?? finalPrice;
            const winnerAvatarUrl = simWin
              ? simAvatar
              : await resolveWinnerAvatar(resolvedWinnerId);
            // Same endId → viewers skip a second confetti, but apply wallet/order.
            room.broadcastAuctionEnd({
              productId,
              winnerId: resolvedWinnerId,
              winnerName: resolvedWinnerName,
              winnerAvatarUrl,
              finalPrice: Number(resolvedPrice ?? 0),
              orderId: simWin ? null : (res.orderId ?? null),
              autoPaid: simWin ? false : !!res.autoPaid,
              auctionRound: round,
              endId,
              ts: Date.now(),
            });
            return;
          }
          console.warn("[auction] finalize failed", res.error, `attempt=${attempt}`);
          lastError = res.error || "finalize_failed";
        } catch (e) {
          console.warn("[auction] finalize threw", e, `attempt=${attempt}`);
          lastError = e instanceof Error ? e.message : String(e);
        }
        if (attempt < 3) await new Promise((r) => setTimeout(r, 1200));
      }
      toast.error(
        t("live.finalizeFailed", "Impossible de clôturer l'enchère. Réessaie.") +
          (lastError ? ` (${lastError})` : ""),
      );
      // Force server settle + keep local end (do NOT clear endingRef in a way
      // that revives the 00:01 zombie — product must leave `active`).
      try {
        await (supabase as unknown as { rpc: (n: string, a: object) => Promise<unknown> })
          .rpc("settle_expired_auctions", { _live_id: b.liveId });
      } catch { /* ignore */ }
      // Re-fetch product; if still active, optimistic local close already ran
      // via broadcastAuctionEnd — leave auctionStart cleared.
      endingRef.current = endKey;
    })();
  }, [timeLeft, activeAuction, activeProduct, room, b.liveId, resolveWinnerAvatar, t]);
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
    if (isSimBidderId(bid.bidderId)) return;
    const activeRound = activeProduct?.auction_round ?? 1;
    if (bid.auctionRound !== activeRound) return;
    const msLeft = activeAuction.deadlineMs - Date.now();
    if (msLeft <= 0) return;
    if (msLeft > AUCTION_EXTENSION_WINDOW_SECONDS * 1000) return;
    const newDeadline = Date.now() + AUCTION_EXTENSION_RESET_SECONDS * 1000;
    // Only extend if the new deadline is actually later.
    if (newDeadline <= activeAuction.deadlineMs) return;
    room.broadcastAuctionExtend({ productId: activeAuction.productId, deadlineMs: newDeadline });
    // Persist the extended deadline — the 1.5s rescue poll and late joiners
    // read auction_deadline_at from the DB, and without this write they kept
    // reverting to the pre-extension deadline (viewers saw the countdown end
    // while others were still bidding).
    void supabase
      .from("live_products")
      .update({ auction_deadline_at: new Date(newDeadline).toISOString() })
      .eq("id", activeAuction.productId)
      .then(({ error }) => {
        if (error) console.warn("[auction] persist extension failed", error.message);
      });
  }, [room.lastBid, activeAuction, activeProduct, room]);

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
    key: string;
    name: string | null;
    winnerId: string | null;
    avatar: string | null;
    variant: "winner" | "unsold";
    productName: string | null;
  } | null>(null);
  const seenEndIdsRef = useRef<Set<string>>(new Set());
  const joinedAtRef = useRef(Date.now());
  const productsRef = useRef(room.products);
  productsRef.current = room.products;
  const systemMessageRef = useRef(room.systemMessage);
  systemMessageRef.current = room.systemMessage;

  useEffect(() => {
    joinedAtRef.current = Date.now();
    seenEndIdsRef.current = new Set();
    setWinnerReveal(null);
    setRetiredFeaturedIds([]);
  }, [b.liveId]);

  useEffect(() => {
    const evt = room.lastAuctionEnd;
    if (!evt) return;
    // Only dedupe by unique endId — never by product/winner/price/order.
    // Same buyer can win the same item N times in one live.
    const endId = evt.endId ?? `fallback-${evt.ts}-${evt.productId}-${evt.auctionRound}-${evt.orderId}`;
    const chatKey = `chat:${evt.productId}:${evt.auctionRound ?? 1}:${evt.winnerId ? "sold" : "unsold"}`;
    if (seenEndIdsRef.current.has(endId)) return;
    const ts = evt.ts ?? 0;
    if (ts > 0 && ts < joinedAtRef.current - 2500) return;
    seenEndIdsRef.current.add(endId);
    const skipChat = seenEndIdsRef.current.has(chatKey);
    if (!skipChat) seenEndIdsRef.current.add(chatKey);
    // Bound memory across a long live.
    if (seenEndIdsRef.current.size > 200) {
      const first = seenEndIdsRef.current.values().next().value;
      if (first) seenEndIdsRef.current.delete(first);
    }
    const prod = productsRef.current.find((p) => p.id === evt.productId);
    // If a next article exists, retire this one and advance. Otherwise keep
    // it on the star card so the host can relaunch immediately.
    {
      const sorted = [...productsRef.current].sort((a, b) => a.position - b.position);
      const idx = sorted.findIndex((p) => p.id === evt.productId);
      const retired = new Set(retiredFeaturedIds);
      retired.add(evt.productId);
      const isPlayable = (p: (typeof sorted)[number]) =>
        !retired.has(p.id) &&
        p.status !== "sold" &&
        p.status !== "out" &&
        p.status !== "unsold";
      const next = sorted.slice(idx + 1).find(isPlayable);
      const fallback = sorted.find(isPlayable);
      if (next || fallback) {
        setRetiredFeaturedIds((prev) =>
          prev.includes(evt.productId) ? prev : [...prev, evt.productId],
        );
        setFeaturedId(next?.id ?? fallback!.id);
      } else {
        setFeaturedId(evt.productId);
      }
    }
    // No winner → UNSOLD: no confetti, but show the central unsold reveal.
    if (!evt.winnerName || !evt.winnerId) {
      const label = t("live.unsoldFlash", { name: prod?.name ?? "produit" });
      if (!skipChat) systemMessageRef.current(label);
      setWinnerReveal({
        key: endId,
        name: null,
        winnerId: null,
        avatar: null,
        variant: "unsold",
        productName: prod?.name ?? null,
      });
      return;
    }
    const label = t("live.soldTo", { name: evt.winnerName }) + " · " + fmt(evt.finalPrice);
    setLastSaleFlash(label);
    setConfettiTrigger((n) => n + 1);
    haptic.success();
    if (!skipChat) systemMessageRef.current(label + (prod ? ` — ${prod.name}` : ""));
    setWinnerReveal({
      key: endId,
      name: evt.winnerName,
      winnerId: evt.winnerId,
      avatar: evt.winnerAvatarUrl ?? null,
      variant: "winner",
      productName: prod?.name ?? null,
    });
    // Always try to refresh avatar from profiles (broadcast URL can be stale/broken).
    void resolveWinnerAvatar(evt.winnerId).then((url) => {
      if (!url) return;
      setWinnerReveal((prev) =>
        prev && prev.key === endId ? { ...prev, avatar: url } : prev,
      );
    });
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    flashTimeoutRef.current = setTimeout(() => setLastSaleFlash(null), 1800);
  }, [room.lastAuctionEnd, t, fmt, resolveWinnerAvatar, retiredFeaturedIds]);

  const seenBattleSaleRef = useRef<string | null>(null);
  useEffect(() => {
    const text = battle.lastSaleText;
    const at = battle.session?.lastSaleAt;
    if (!text || !at || !battle.isRunning) return;
    const key = `${text}:${at}`;
    if (seenBattleSaleRef.current === key) return;
    if (at < joinedAtRef.current - 1000) return;
    seenBattleSaleRef.current = key;
    setLastSaleFlash(text);
    setConfettiTrigger((n) => n + 1);
    haptic.success();
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    flashTimeoutRef.current = setTimeout(() => setLastSaleFlash(null), 2800);
  }, [battle.lastSaleText, battle.session?.lastSaleAt, battle.isRunning]);

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

  const hostEndingRef = useRef(false);

  useEffect(() => {
    if (!b.liveId) return;
    hostEndingRef.current = false;
    void markLiveActiveInDb(b.liveId).catch(() => {});
    // Keep host_last_seen_at fresh so abandoned lives expire after ~5 min offline.
    void touchLiveHostInDb(b.liveId).catch(() => {});
    const iv = setInterval(() => {
      if (hostEndingRef.current) return;
      void touchLiveHostInDb(b.liveId!).catch(() => {});
    }, 30_000);
    return () => clearInterval(iv);
  }, [b.liveId]);

  // Auto-record every live for 7-day in-app replay (LiveKit RoomComposite → S3).
  useEffect(() => {
    if (!b.liveId) return;
    let cancelled = false;
    void import("@/lib/live-replay-client").then(({ startLiveReplay }) => {
      if (cancelled) return;
      void startLiveReplay(b.liveId!).then((r) => {
        if (!r.ok) {
          console.warn("[live-replay] start failed", r.error);
        }
      });
    });
    return () => {
      cancelled = true;
    };
  }, [b.liveId]);


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

  const retryConnection = () => {
    setRetryKey((k) => k + 1);
    haptic.medium();
  };

  // Live sales counter — paid orders for this live (realtime). The previous
  // product-stock approximation always returned 0 for fixed-price sales
  // (`* 0 + 0`), so the "Ventes" pill never moved while viewers kept buying.
  const [liveSales, setLiveSales] = useState<{ revenue: number; count: number }>({
    revenue: 0,
    count: 0,
  });
  useEffect(() => {
    if (!b.liveId || !user?.id) {
      setLiveSales({ revenue: 0, count: 0 });
      return;
    }
    let alive = true;
    const load = async () => {
      const rows = await fetchOrdersForLive(b.liveId!);
      if (!alive) return;
      const paid = rows.filter((r) => r.status === "paid");
      setLiveSales({
        revenue: paid.reduce((s, o) => s + Number(o.amount), 0),
        count: paid.length,
      });
    };
    void load();
    const unsub = subscribeOrders({ sellerId: user.id }, () => void load());
    return () => {
      alive = false;
      unsub();
    };
  }, [b.liveId, user?.id]);

  const totalRevenue = liveSales.revenue;
  const soldCount = liveSales.count;

  // Aggregate gifts received in-session (from realtime broadcast frames).
  const [giftStats, setGiftStats] = useState<{ count: number; sellerNet: number }>({ count: 0, sellerNet: 0 });
  const seenGiftIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const g = room.lastGift;
    if (!g) return;
    if (seenGiftIdsRef.current.has(g.id)) return;
    seenGiftIdsRef.current.add(g.id);
    // Chat line is added by useLiveRoom for everyone; here we only update host stats.
    void import("@/lib/gifts").then(({ giftByKey }) => {
      const def = giftByKey(g.giftKey);
      const price = def?.prices[cur] ?? 0;
      const net = price * 0.7;
      setGiftStats((s) => ({ count: s.count + 1, sellerNet: s.sellerNet + net }));
    });
  }, [room.lastGift, cur]);

  const featured = useMemo(() => {
    if (activeAuction?.productId) {
      return room.products.find((p) => p.id === activeAuction.productId) ?? null;
    }
    const playable = (p: LiveProductRow) => !isFeaturedDone(p);
    const sorted = [...room.products].sort((a, b) => a.position - b.position);
    if (endedProductId) {
      const idx = sorted.findIndex((p) => p.id === endedProductId);
      const after = sorted.slice(idx + 1).find(playable);
      if (after) return after;
    }
    const byId = featuredId
      ? room.products.find((p) => p.id === featuredId)
      : undefined;
    if (byId && playable(byId)) return byId;
    const nextPlayable =
      sorted.find((p) => p.status === "upcoming" && playable(p)) ??
      sorted.find(playable) ??
      null;
    if (nextPlayable) return nextPlayable;
    if (byId) return byId;
    return pickBattleFeatured(room.products, endedProductId) ?? sorted[sorted.length - 1] ?? null;
  }, [room.products, featuredId, retiredFeaturedIds, endedProductId, activeAuction?.productId]);

  const opponentFeatured = useMemo(
    () => pickBattleFeatured(opponentProducts, null),
    [opponentProducts],
  );

  const startAuction = async (p: LiveProductRow) => {
    if (p.mode !== "auction") return;
    if (p.live_id && b.liveId && p.live_id !== b.liveId) {
      toast.error(t("battle.card.forbidden"));
      return;
    }
    if (startingAuctionRef.current) return;
    if (activeAuction && activeAuction.productId !== p.id) {
      toast.error(t("live.auctionAlreadyRunning", "Une enchère est déjà en cours. Termine-la d'abord."));
      return;
    }
    haptic.medium();
    startingAuctionRef.current = true;
    endingRef.current = null;
    // Ask the server to flip the row to active AND persist the deadline. We
    // then broadcast the SAME absolute epoch ms to every viewer, and the
    // host's own countdown reads from broadcastAuctionStart(...) — a single
    // deadline source keeps host, viewers, and late joiners in sync (±1s
    // clock drift). NEVER run a broadcast-only auction the DB doesn't know
    // about: the row would stay "upcoming", so late joiners, the rescue poll
    // and postgres_changes could not recover anyone who missed the single
    // broadcast frame — exactly the "some viewers see the auction, others
    // stay on waiting-for-seller" desync. Retry once, then surface the error.
    try {
    let res = await startAuctionInDb(p.id);
    if (!res.ok && res.error === "auction_already_running" && b.liveId) {
      await supabase.rpc("settle_expired_auctions", { _live_id: b.liveId });
      res = await startAuctionInDb(p.id);
    }
    if (!res.ok || !res.deadlineMs) res = await startAuctionInDb(p.id);
    if (!res.ok || !res.deadlineMs) {
      const err = res.error ?? "";
      toast.error(
        err === "auction_already_running"
          ? t("live.auctionAlreadyRunning", "Une enchère est déjà en cours. Termine-la d'abord.")
          : err === "forbidden"
            ? t("battle.card.forbidden")
          : (res.error ?? t("moderator.startAuctionFailed", "Impossible de démarrer l'enchère")),
      );
      return;
    }
    setFeaturedId(p.id);
    setRetiredFeaturedIds((prev) => prev.filter((id) => id !== p.id));
    room.broadcastAuctionStart({
      productId: p.id,
      deadlineMs: res.deadlineMs,
      timerSec: res.timerSec ?? p.timer_seconds,
      ...(res.auctionRound != null ? { auctionRound: res.auctionRound } : {}),
    });
    room.systemMessage(`${t("live.startAuction")} — ${p.name} · ${fmt(p.start_price)}`);
    } finally {
      startingAuctionRef.current = false;
    }
  };


  const endAuctionNow = async () => {
    if (!activeAuction) return;
    const productId = activeAuction.productId;
    const product =
      activeProduct ??
      room.products.find((p) => p.id === productId) ??
      null;
    const round = product?.auction_round ?? 1;
    const lastBidMatches =
      !!room.lastBid &&
      room.lastBid.productId === productId &&
      room.lastBid.auctionRound === round;
    const displayWinnerName = lastBidMatches ? room.lastBid!.bidderName : null;
    const displayWinnerId = lastBidMatches ? room.lastBid!.bidderId : null;
    const simWin = isSimBidderId(displayWinnerId);
    const winnerName = simWin ? null : displayWinnerName;
    const winnerId = simWin ? null : displayWinnerId;
    const finalPrice = product?.price ?? 0;
    const simAvatar =
      simWin && displayWinnerName ? simAvatarUrl(displayWinnerName) : null;
    endingRef.current = `${productId}:${round}:${activeAuction.deadlineMs}`;
    const endId = `end-${productId}-${round}-${activeAuction.deadlineMs}`;
    // Clear countdown / show reveal immediately; persist in the background.
    room.broadcastAuctionEnd({
      productId,
      winnerId: displayWinnerId,
      winnerName: displayWinnerName,
      winnerAvatarUrl: simAvatar,
      finalPrice: Number(finalPrice ?? 0),
      orderId: null,
      autoPaid: false,
      auctionRound: round,
      endId,
      ts: Date.now(),
    });
    let res = await finalizeAuctionInDb({
      liveId: b.liveId!, productId, winnerId, winnerName, finalPrice,
    });
    if (!res.ok) res = await finalizeAuctionInDb({
      liveId: b.liveId!, productId, winnerId, winnerName, finalPrice,
    });
    if (!res.ok) res = await finalizeAuctionInDb({
      liveId: b.liveId!, productId, winnerId, winnerName, finalPrice,
    });
    if (res.ok) {
      const resolvedWinnerId = simWin ? displayWinnerId : (res.winnerId ?? winnerId);
      const resolvedWinnerName = simWin ? displayWinnerName : (res.winnerName ?? winnerName);
      const resolvedPrice = res.finalPrice ?? finalPrice;
      const winnerAvatarUrl = simWin
        ? simAvatar
        : await resolveWinnerAvatar(resolvedWinnerId);
      room.broadcastAuctionEnd({
        productId,
        winnerId: resolvedWinnerId,
        winnerName: resolvedWinnerName,
        winnerAvatarUrl,
        finalPrice: Number(resolvedPrice ?? 0),
        orderId: simWin ? null : (res.orderId ?? null),
        autoPaid: simWin ? false : !!res.autoPaid,
        auctionRound: round,
        endId,
        ts: Date.now(),
      });
    } else {
      toast.error(
        res.error ??
          t("live.finalizeFailed", "Impossible de clôturer l'enchère. Réessaie."),
      );
      try {
        await (supabase as unknown as { rpc: (n: string, a: object) => Promise<unknown> })
          .rpc("settle_expired_auctions", { _live_id: b.liveId });
      } catch { /* ignore */ }
      endingRef.current = `${productId}:${round}:${activeAuction.deadlineMs}`;
      void resolveWinnerAvatar(winnerId);
    }
  };

  const toggleFixedSale = async (p: LiveProductRow) => {
    if (p.mode !== "fixed") return;
    if (p.live_id && b.liveId && p.live_id !== b.liveId) {
      toast.error(t("battle.card.forbidden"));
      return;
    }
    haptic.medium();
    setFeaturedId(p.id);
    if (p.status === "active") {
      const res = await stopFixedInDb(p.id);
      if (!res.ok) {
        toast.error(res.error ?? t("common.error", "Une erreur est survenue"));
        return;
      }
      room.systemMessage(`Vente arrêtée — ${p.name}`);
    } else {
      const res = await activateFixedInDb(p.id);
      if (!res.ok) {
        toast.error(res.error ?? t("common.error", "Une erreur est survenue"));
        return;
      }
      room.systemMessage(`${t("live.listForSale")} — ${p.name} · ${fmt(p.price)}`);
    }
  };

  const toggleYoutubeRestream = async () => {
    if (!b.liveId || isRtmp || ytBusy) return;
    if (!ytConnected) {
      toast.error(
        t(
          "broadcast.youtube.needConnect",
          "Connecte YouTube dans le setup avant de diffuser",
        ),
      );
      return;
    }
    setYtBusy(true);
    haptic.selection();
    try {
      if (ytRestreaming) {
        ytPromoteAbortRef.current?.abort();
        ytPromoteAbortRef.current = null;
        await stopYoutubeRestream(b.liveId);
        setYtRestreaming(false);
        setYtWatchUrl(null);
        toast.success(
          t("broadcast.youtube.stopped", "Diffusion YouTube arrêtée"),
        );
      } else {
        const started = await startYoutubeRestream(b.liveId);
        setYtRestreaming(true);
        setYtWatchUrl(started.watchUrl);
        toast.success(
          t("broadcast.youtube.started", "YouTube : diffusion démarrée"),
        );
        // Promote "À venir" → live (serverless often kills the background promote).
        ytPromoteAbortRef.current?.abort();
        const ac = new AbortController();
        ytPromoteAbortRef.current = ac;
        void ensureYoutubeBroadcastLive(b.liveId, { signal: ac.signal }).then(
          (r) => {
            if (ac.signal.aborted) return;
            if (r.ok) {
              toast.success(
                t("broadcast.youtube.isLive", "YouTube est maintenant en direct"),
              );
            } else {
              toast.error(
                t(
                  "broadcast.youtube.stuckUpcoming",
                  "YouTube reste sur « À venir ». Vérifie le quota LiveKit Egress, ton compte YouTube (live autorisé), puis relance. Le live KiDi+ continue.",
                ),
              );
            }
          },
        );
      }
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : t("broadcast.youtube.startFailed", "Impossible de diffuser sur YouTube"),
      );
    } finally {
      setYtBusy(false);
    }
  };

  const toggleFacebookRestream = async () => {
    if (!b.liveId || isRtmp || fbBusy) return;
    if (!fbReady) {
      toast.error(
        t(
          "broadcast.facebook.needConnect",
          "Connecte une Page Facebook dans le setup avant de diffuser",
        ),
      );
      return;
    }
    setFbBusy(true);
    haptic.selection();
    try {
      if (fbRestreaming) {
        await stopFacebookRestream(b.liveId);
        setFbRestreaming(false);
        setFbWatchUrl(null);
        toast.success(
          t("broadcast.facebook.stopped", "Diffusion Facebook arrêtée"),
        );
      } else {
        const started = await startFacebookRestream(b.liveId);
        setFbRestreaming(true);
        setFbWatchUrl(started.watchUrl);
      }
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : t("broadcast.facebook.startFailed", "Impossible de diffuser sur Facebook"),
      );
    } finally {
      setFbBusy(false);
    }
  };

  const toggleTiktokRestream = async () => {
    if (!b.liveId || isRtmp || ttBusy) return;
    haptic.selection();
    if (ttRestreaming) {
      setTtBusy(true);
      try {
        await stopTiktokRestream(b.liveId);
        setTtRestreaming(false);
        toast.success(
          t("broadcast.tiktok.stopped", "Diffusion TikTok arrêtée"),
        );
      } catch (e) {
        toast.error(
          e instanceof Error
            ? e.message
            : t("broadcast.tiktok.stopFailed", "Impossible d’arrêter TikTok"),
        );
      } finally {
        setTtBusy(false);
      }
      return;
    }
    setTtSheetOpen(true);
  };

  const startTiktokFromSheet = async (creds: {
    serverUrl: string;
    streamKey: string;
  }) => {
    if (!b.liveId || ttBusy) return;
    setTtBusy(true);
    try {
      await startTiktokRestream({
        liveId: b.liveId,
        serverUrl: creds.serverUrl,
        streamKey: creds.streamKey,
      });
      setTtRestreaming(true);
      setTtSheetOpen(false);
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : t("broadcast.tiktok.startFailed", "Impossible de diffuser sur TikTok"),
      );
    } finally {
      setTtBusy(false);
    }
  };

  const endLive = async () => {
    if (!b.liveId) {
      haptic.success();
      onEnd();
      return;
    }
    haptic.medium();
    // Stop heartbeats immediately so we never re-touch / re-open after Finish.
    hostEndingRef.current = true;
    const liveId = b.liveId;
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

    // Persist "ended" first — banners key off status=live. Cleanup can wait.
    const { endLiveInDb } = await import("@/lib/lives-db");
    const ended = await endLiveInDb(liveId);
    if (!ended.ok) {
      hostEndingRef.current = false;
      haptic.error();
      toast.error(t("live.endFailed", "Impossible de terminer le live — réessaie"));
      return;
    }
    const { notifyHostLiveEnded } = await import(
      "@/components/home/host-open-live-banner"
    );
    notifyHostLiveEnded(liveId);

    if (ytRestreaming || ytWatchUrl) {
      await stopYoutubeRestream(liveId).catch(() => {});
    }
    if (fbRestreaming || fbWatchUrl) {
      await stopFacebookRestream(liveId).catch(() => {});
    }
    if (ttRestreaming) {
      await stopTiktokRestream(liveId).catch(() => {});
    }
    if (isRtmp || b.rtmpCreds) {
      const { deleteLiveIngress } = await import("@/lib/livekit-ingress");
      await deleteLiveIngress(liveId).catch(() => {});
    }
    {
      const { stopLiveReplay } = await import("@/lib/live-replay-client");
      await stopLiveReplay(liveId).catch(() => {});
    }
    haptic.success();
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
      shopProductId: p.shopProductId ?? null,
      description: p.description ?? null,
      brand: p.brand ?? null,
      condition: p.condition ?? null,
      colors: p.colors ?? [],
      sizes: p.sizes ?? [],
      extraImages: p.extraImages,
      extraImageFiles: p.extraImageFiles,
      bidIncrement: p.bidIncrement ?? null,
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
  useSocialChatBridge({
    liveId: b.liveId,
    enabledYoutube: ytRestreaming,
    enabledFacebook: fbRestreaming,
    room,
    auctionActive: !!activeAuction,
    productName: activeProduct?.name ?? null,
  });

  const chatMessages: ChatMsg[] = room.chat
    .filter((c) => !c.userId || !chatMutes.has(c.userId))
    .map((c) => ({
      id: c.id,
      user: c.user,
      color: c.color,
      text: c.text,
      system: c.system,
      systemKind: c.systemKind,
      userId: c.userId,
      replyTo: c.replyTo,
      source: c.source,
      externalId: c.externalId,
      isModerator:
        !!c.isModerator ||
        (!!c.userId && moderators.some((m) => m.userId === c.userId)),
      isHost: !!c.isHost || (!!c.userId && c.userId === user?.id),
    }));

  const [hostDraft, setHostDraft] = useState("");
  const [hostReplyTo, setHostReplyTo] = useState<ChatMsg | null>(null);
  const sendHostChat = () => {
    const txt = hostDraft.trim();
    if (!txt) return;
    const replyTarget = hostReplyTo;
    room.sendChat(
      txt,
      replyTarget
        ? {
            user: replyTarget.user,
            text: replyTarget.text,
            ...(replyTarget.userId ? { userId: replyTarget.userId } : {}),
          }
        : undefined,
    );
    // Mirror host replies onto active social restreams so YT/FB viewers see them.
    if (b.liveId && (ytRestreaming || fbRestreaming)) {
      const src = replyTarget?.source;
      void replyOnSocialPlatforms({
        liveId: b.liveId,
        text: txt,
        source:
          src === "youtube" || src === "facebook"
            ? src
            : "all",
        parentExternalId:
          src === "facebook" ? replyTarget?.externalId : undefined,
      }).catch((e) => {
        console.warn("[social-chat] mirror reply failed", e);
      });
    }
    setHostDraft("");
    setHostReplyTo(null);
    haptic.light();
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
      <BattleSplitStage
        active={!!battle.isRunning}
        session={battle.session}
        selfSide={battle.mySide ?? "a"}
        guestTrack={guestTrack}
        guestAudio={guestAudio}
        guestStatus={remoteBattleStatus}
        hostVideo={
          <BroadcastVideo
            ref={videoHandleRef}
            facing={facing}
            enabled={isRtmp ? true : cameraOn}
            micEnabled={isRtmp ? false : micOn}
            videoSource={isRtmp ? "rtmp" : "camera"}
            ingressIdentity={b.rtmpCreds?.participantIdentity}
            fallbackImage={b.cover}
            retryKey={retryKey}
            onStatus={setVideoStatus}
            onCanFlipChange={setCanFlip}
            onFlipBusyChange={setFlipBusy}
            onFacingApplied={(applied) => setFacing(applied)}
            onFlipRevert={(prev) => setFacing(prev)}
            onMicSync={(enabled) => setMicOn(enabled)}
            onRemoteVideosChange={setRemoteBattleTracks}
            livekit={
              b.roomName && b.hostIdentity
                ? { room: b.roomName, identity: b.hostIdentity, name: b.hostName }
                : undefined
            }
          />
        }
      />

      {/* Compact top bar — LIVE + viewers left, products + Terminer pinned right. */}
      <div
        className="absolute inset-x-0 top-0 z-30 kp-live-safe-x"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)" }}
      >
        <div className="relative flex items-center gap-1.5 px-2 pr-[6.75rem]">
          {/* Live pill: pulsing red dot + timer */}
          <div
            className="flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-white"
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
          <Press
            onClick={() => {
              haptic.selection();
              setViewersSheetOpen(true);
            }}
            aria-label={t("live.viewersSheetTitle", "Spectateurs")}
            className="!min-h-0 flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold text-white tabular-nums"
            style={{
              backgroundColor: "rgba(0,0,0,0.5)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
            }}
          >
            <Eye size={12} />
            {room.viewerCount}
          </Press>
        </div>
        {/* Always-visible trailing controls */}
        <div
          className="absolute top-[calc(env(safe-area-inset-top,0px)+8px)] flex items-center gap-1"
          style={{ right: "max(0.5rem, env(safe-area-inset-right, 0px))" }}
        >
          <Press
            onClick={() => { haptic.selection(); setProductsOpen(true); }}
            aria-label={t("live.openProducts")}
            className="!min-h-9 !min-w-9 relative h-9 w-9 shrink-0 rounded-full text-white"
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
          <Press
            onClick={() => setConfirmEnd(true)}
            aria-label={t("live.endLive")}
            className="!min-h-9 h-9 shrink-0 rounded-full pl-2 pr-2.5 text-[12px] font-bold text-white inline-flex items-center gap-1"
            style={{ backgroundColor: "rgba(220, 30, 40, 0.95)" }}
          >
            <X size={14} />
            <span>{t("live.endLiveShort", "Terminer")}</span>
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

      {/* Session stats strip (metrics only). Keep clear of the featured card. */}
      {battle.isRunning && battle.session ? (
        <div
          className="absolute z-[34] inset-x-0"
          style={{ top: "calc(env(safe-area-inset-top) + 48px)" }}
        >
          <BattleScoreHud
            session={battle.session}
            remainingMs={battle.remainingMs}
            left={battleLayoutSides(battle.session, { sellerId: user?.id }).left}
            right={battleLayoutSides(battle.session, { sellerId: user?.id }).right}
          />
        </div>
      ) : (
      <div
        className="absolute z-30"
        style={{
          top: "calc(env(safe-area-inset-top) + 52px)",
          left: "max(12px, env(safe-area-inset-left, 0px))",
          // Featured card is w-28 (~7rem) + right inset — never let stats/social
          // run under it (iPhone 15 was overlapping Cadeaux / FB / TT).
          right: "calc(7.75rem + max(0.5rem, env(safe-area-inset-right, 0px)))",
          maxWidth: "none",
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
            <AnimatedEuro value={totalRevenue} currency={cur} locale={i18n.language} />
          </div>
          <div className="h-6 w-px bg-white/20" />
          <div className="flex flex-col leading-tight">
            <span className="text-[9px] uppercase tracking-wide text-white/60">Articles</span>
            <span className="text-[14px] font-bold tabular-nums">{soldCount}</span>
          </div>
          <div className="h-6 w-px bg-white/20" />
          <div className="flex flex-col leading-tight">
            <span className="text-[9px] uppercase tracking-wide text-white/60">
              {t("gifts.short", "Cadeaux 🎁")}
            </span>
            <span
              className="text-[14px] font-bold tabular-nums"
              style={{ color: giftStats.count > 0 ? "oklch(0.85 0.18 85)" : undefined }}
            >
              {formatMoney(giftStats.sellerNet, cur, i18n.language)}
            </span>
          </div>
        </div>

        {/* Social restream — separate row BELOW the stats strip (not inside). */}
        {!isRtmp && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <Press
              disabled={ytBusy}
              onClick={() => void toggleYoutubeRestream()}
              aria-label={t("broadcast.youtube.goLive", "Diffuser sur YouTube")}
              className="!min-h-0 flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black tracking-wide"
              style={{
                background: ytRestreaming
                  ? "linear-gradient(135deg, #ff0033, #cc0000)"
                  : "linear-gradient(135deg, oklch(0.82 0.14 85), oklch(0.72 0.16 70))",
                color: ytRestreaming ? "#fff" : "#0a0a12",
                opacity: ytBusy ? 0.7 : 1,
              }}
            >
              <Radio size={11} />
              {ytBusy ? "…" : ytRestreaming ? "YT ON" : "YT"}
            </Press>
            <Press
              disabled={fbBusy}
              onClick={() => void toggleFacebookRestream()}
              aria-label={t("broadcast.facebook.goLive", "Diffuser sur Facebook")}
              className="!min-h-0 flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black tracking-wide"
              style={{
                background: fbRestreaming
                  ? "linear-gradient(135deg, #1877f2, #0d5bbd)"
                  : "linear-gradient(135deg, oklch(0.82 0.14 85), oklch(0.72 0.16 70))",
                color: fbRestreaming ? "#fff" : "#0a0a12",
                opacity: fbBusy ? 0.7 : 1,
              }}
            >
              <Radio size={11} />
              {fbBusy ? "…" : fbRestreaming ? "FB ON" : "FB"}
            </Press>
            <Press
              disabled={ttBusy}
              onClick={() => void toggleTiktokRestream()}
              aria-label={t("broadcast.tiktok.goLive", "Diffuser sur TikTok")}
              className="!min-h-0 flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black tracking-wide"
              style={{
                background: ttRestreaming
                  ? "linear-gradient(135deg, #FE2C55, #c41e3a)"
                  : "linear-gradient(135deg, oklch(0.82 0.14 85), oklch(0.72 0.16 70))",
                color: ttRestreaming ? "#fff" : "#0a0a12",
                opacity: ttBusy ? 0.7 : 1,
              }}
            >
              <Radio size={11} />
              {ttBusy ? "…" : ttRestreaming ? "TT ON" : "TT"}
            </Press>
          </div>
        )}
      </div>
      )}

      <FloatingHearts useBus />
      <Confetti trigger={confettiTrigger} />
      <GiftComboFeed trigger={room.lastGift} />
      <GiftAnimationsLayer trigger={room.lastGift} />
      <WinnerReveal
        key={winnerReveal?.key ?? "wr"}
        open={!!winnerReveal}
        winnerName={winnerReveal?.name ?? null}
        winnerId={winnerReveal?.winnerId ?? null}
        winnerAvatarUrl={winnerReveal?.avatar ?? null}
        isMe={false}
        variant={winnerReveal?.variant ?? "winner"}
        productName={winnerReveal?.productName ?? null}
        revealKey={winnerReveal?.key ?? null}
        onDone={() => setWinnerReveal(null)}
      />
      <SuddenDeathFlash tick={suddenDeathTick} />
      <AuctionFinalCountdown
        secondsLeft={timeLeft}
        active={!!activeAuction}
        density="app"
      />
      <LiveChat
        messages={chatMessages}
        bottomOffset="calc(env(safe-area-inset-bottom) + 64px)"
        height={battle.isRunning ? "28dvh" : "34dvh"}
        moderation={{
          canModerate: true,
          canReport: true,
          selfUserId: user?.id ?? null,
          hostUserId: user?.id ?? null,
          mutedIds: chatMutes,
          onReply: (msg) => {
            haptic.light();
            setHostReplyTo(msg);
          },
          onMuteUser: async (userId, displayName) => {
            if (!b.liveId || !user) return;
            const res = await muteLiveChatUser(b.liveId, userId, user.id);
            if (!res.ok) {
              toast.error(res.error ?? t("moderator.muteFailed", "Impossible de couper les commentaires"));
              return;
            }
            haptic.selection();
            toast.success(
              t("moderator.muted", {
                name: displayName,
                defaultValue: "{{name}} ne peut plus commenter",
              }),
            );
          },
          onBlockUser: async (userId, displayName) => {
            if (!b.liveId || !user) return;
            // Mute for this live + personal block.
            await muteLiveChatUser(b.liveId, userId, user.id);
            const r = await blockUser(userId);
            if (r.ok) {
              await refreshBlockedIds();
              haptic.selection();
              toast.success(
                t("moderator.blocked", {
                  name: displayName,
                  defaultValue: "{{name}} a été bloqué",
                }),
              );
            } else {
              toast.error(r.error ?? t("moderator.blockFailed", "Impossible de bloquer"));
            }
          },
        }}
      />

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
        {featured && !battle.isRunning ? (
          <motion.div
            key={featured.id}
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: 0.25, ease: EASE_IOS }}
            className="absolute z-30 text-left"
            style={{
              top: "calc(env(safe-area-inset-top, 0px) + 96px)",
              right: "max(0.5rem, env(safe-area-inset-right, 0px))",
            }}
          >
            <div
              className="relative isolate w-[6.75rem] overflow-hidden rounded-2xl p-1.5 text-white"
              style={{
                backgroundColor: "rgba(0,0,0,0.55)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
              }}
            >
              <button
                type="button"
                onClick={() => { haptic.selection(); setProductsOpen(true); }}
                className="block w-full text-left"
              >
                <div className="relative mb-1 overflow-hidden rounded-lg">
                  <LiveProductImage
                    src={imgFor(featured)}
                    className="h-14 w-full object-cover"
                    iconClassName="text-white/60"
                  />
                  <span className="absolute left-1 top-1 rounded-full bg-white px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wide text-[#10162B]">
                    {t("live.featured")}
                  </span>
                </div>
                <div className="truncate text-[10.5px] font-semibold leading-tight">
                  {featured.name}
                </div>
              </button>
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
                      className="text-[12px] font-bold tabular-nums"
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
                    onClick={() => {
                      if (featured.mode === "auction") void startAuction(featured);
                      else void toggleFixedSale(featured);
                    }}
                    hapticOnTap={false}
                    className="relative z-20 !min-h-7 mt-1 h-7 w-full rounded-full bg-white px-2 text-[10px] font-bold text-[#10162B]"
                  >
                    {featured.mode === "auction"
                      ? (featured.status === "sold" || featured.status === "unsold"
                          ? `${t("live.startAuctionAgain", "Rejouer")} ▸`
                          : `${t("live.startAuction")} ▸`)
                      : t("live.listForSale")}
                  </Press>
                </>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {battle.isRunning && (
        <BattleFeaturedRow
          own={featured}
          peer={opponentFeatured}
          currency={cur}
          ownImage={featured ? imgFor(featured) : null}
          peerImage={opponentFeatured?.image_url}
          ownSecondsLeft={
            featured && activeAuction?.productId === featured.id ? timeLeft : 0
          }
          onManageOwn={() => {
            haptic.selection();
            setProductsOpen(true);
          }}
          onStartOwn={
            featured
              ? () => {
                  if (featured.mode === "auction") void startAuction(featured);
                  else void toggleFixedSale(featured);
                }
              : undefined
          }
          onOpenPeer={() => {
            haptic.selection();
            setPeerProductOpen(true);
          }}
        />
      )}
      <BattlePeerProductSheet
        open={peerProductOpen && !!opponentFeatured}
        onClose={() => setPeerProductOpen(false)}
        product={opponentFeatured}
        image={opponentFeatured?.image_url}
        currency={cur}
      />

      {/* Host chat composer — same comments as viewers (reply supported). */}
      <div
        className="absolute inset-x-0 z-30 flex flex-col gap-1.5 kp-live-safe-x"
        style={{
          bottom: "calc(env(safe-area-inset-bottom) + 10px)",
          paddingRight: battle.isRunning
            ? "max(64px, calc(env(safe-area-inset-right, 0px) + 56px))"
            : "max(72px, calc(env(safe-area-inset-right, 0px) + 64px))",
          maxWidth: "min(100%, 42rem)",
        }}
      >
        {hostReplyTo && (
          <div
            className="flex items-center gap-2 rounded-[14px] px-3 py-2 text-[12px] text-white"
            style={{
              backgroundColor: "rgba(0,0,0,0.55)",
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
              border: "1px solid rgba(255,255,255,0.14)",
              boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
            }}
          >
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-white/55">
                {t("live.replyingLabel", "Réponse")}
              </p>
              <p className="truncate leading-snug">
                <span className="font-semibold">{hostReplyTo.user}</span>
                <span className="text-white/65"> · {hostReplyTo.text}</span>
              </p>
            </div>
            <Press
              onClick={() => setHostReplyTo(null)}
              aria-label={t("common.cancel", "Annuler")}
              className="!min-h-8 h-8 w-8 shrink-0 rounded-full text-white/80"
              style={{ backgroundColor: "rgba(255,255,255,0.1)" }}
            >
              <X size={14} />
            </Press>
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendHostChat();
          }}
          className="flex items-center gap-2"
        >
          <input
            value={hostDraft}
            onChange={(e) => setHostDraft(e.target.value)}
            placeholder={
              hostReplyTo
                ? t("live.replyPlaceholder", {
                    name: hostReplyTo.user,
                    defaultValue: "Répondre à {{name}}…",
                  })
                : t("live.chatPlaceholder", "Écris un message…")
            }
            className="min-w-0 flex-1 rounded-full px-4 py-2.5 text-[14px] text-white outline-none placeholder:text-white/60"
            style={{
              backgroundColor: "rgba(0,0,0,0.5)",
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
              border: "1px solid rgba(255,255,255,0.15)",
            }}
          />
          <Press
            onClick={sendHostChat}
            aria-label={t("live.sendMessage", "Envoyer")}
            className="h-11 w-11 shrink-0 rounded-full text-white"
            style={{
              backgroundColor: "rgba(0,0,0,0.5)",
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
              border: "1px solid rgba(255,255,255,0.15)",
            }}
          >
            <Send size={17} />
          </Press>
        </form>
      </div>

      {battle.isRunning ? (
        <BattleHostBar
          hideAV={isRtmp}
          micOn={micOn}
          camOn={cameraOn}
          canFlip={!isRtmp && canFlip && cameraOn}
          flipBusy={flipBusy}
          filtersActive={!isRtmp && (activeLens.lensId !== "none" || liveEffects.hasEffects)}
          onToggleMic={isRtmp ? undefined : () => setMicOn((m) => !m)}
          onToggleCam={isRtmp ? undefined : () => setCameraOn((c) => !c)}
          onFlip={
            isRtmp
              ? undefined
              : () => {
                  if (flipBusy || !cameraOn) return;
                  void videoHandleRef.current
                    ?.switchCamera()
                    .then((applied) => setFacing(applied))
                    .catch(() => {
                      /* toast + revert handled inside BroadcastVideo */
                    });
                }
          }
          onLeave={() => {
            if (user?.id) void battle.endBattle("forfeit", user.id);
          }}
          onOpenModerators={() => setModeratorsSheetOpen(true)}
          onOpenProducts={() => setProductsOpen(true)}
          onOpenFilters={isRtmp ? undefined : () => setFiltersOpen((o) => !o)}
        />
      ) : (
        <HostToolRail
          hideAV={isRtmp}
          micOn={micOn}
          camOn={cameraOn}
          canFlip={!isRtmp && canFlip && cameraOn}
          flipBusy={flipBusy}
          moderatorsOpen={moderatorsSheetOpen}
          filtersActive={!isRtmp && (activeLens.lensId !== "none" || liveEffects.hasEffects)}
          onOpenFilters={isRtmp ? undefined : () => setFiltersOpen((o) => !o)}
          battleActive={false}
          onOpenBattle={() => {
            battle.openInvite();
          }}
          onToggleMic={isRtmp ? undefined : () => setMicOn((m) => !m)}
          onToggleCam={isRtmp ? undefined : () => setCameraOn((c) => !c)}
          onFlip={
            isRtmp
              ? undefined
              : () => {
                  if (flipBusy || !cameraOn) return;
                  void videoHandleRef.current
                    ?.switchCamera()
                    .then((applied) => setFacing(applied))
                    .catch(() => {
                      /* toast + revert handled inside BroadcastVideo */
                    });
                }
          }
          onOpenModerators={() => setModeratorsSheetOpen(true)}
          onAddProduct={() => setAddOpen(true)}
        />
      )}

      {!isRtmp && (
        <FiltersCarousel open={filtersOpen} onClose={() => setFiltersOpen(false)} />
      )}

      {isRtmp && b.rtmpCreds && (
        <>
          <Press
            onClick={() => setRtmpSheetOpen(true)}
            className="!min-h-9 absolute left-3 z-30 inline-flex items-center gap-1.5 rounded-full px-3 text-[12px] font-bold text-black"
            style={{
              top: "calc(env(safe-area-inset-top) + 52px)",
              background:
                "linear-gradient(135deg, oklch(0.82 0.14 85), oklch(0.72 0.16 70))",
            }}
          >
            <Radio size={14} />
            {t("broadcast.rtmp.openCreds", "Clés RTMP")}
          </Press>
          <RtmpCredentialsSheet
            open={rtmpSheetOpen}
            onClose={() => setRtmpSheetOpen(false)}
            creds={b.rtmpCreds}
          />
        </>
      )}

      <TiktokRtmpSheet
        open={ttSheetOpen}
        onClose={() => !ttBusy && setTtSheetOpen(false)}
        busy={ttBusy}
        onStart={startTiktokFromSheet}
      />

      <LiveViewersSheet
        open={viewersSheetOpen}
        onClose={() => setViewersSheetOpen(false)}
        presentViewers={room.presentViewers}
        viewerCount={room.viewerCount}
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
                  hostId={user.id}
                  addedBy={user.id}
                  existingIds={new Set(moderators.map((m) => m.userId))}
                  presentIds={room.presentViewers.map((p) => ({
                    id: p.identity,
                    name: p.name,
                  }))}
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
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl">
                    <LiveProductImage
                      src={imgUrl}
                      className="h-full w-full object-cover"
                      placeholderClassName="bg-muted"
                      iconClassName="text-muted-foreground"
                    />
                    </div>
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
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-muted px-3 py-1.5 text-[12px] font-bold">
                            {t("live.sold")}
                          </span>
                          <Press
                            onClick={() => {
                              void startAuction(p);
                              setProductsOpen(false);
                            }}
                            className="!min-h-10 rounded-full bg-foreground px-4 text-[13px] font-bold text-background"
                          >
                            {t("live.startAuctionAgain", "Rejouer")}
                          </Press>
                        </div>
                      ) : auctionActive ? (
                        <Press
                          onClick={() => { void endAuctionNow(); }}
                          className="!min-h-10 rounded-full px-4 text-[13px] font-bold text-white"
                          style={{ backgroundColor: "oklch(0.62 0.24 20)" }}
                        >
                          {t("live.endAuction")}
                        </Press>
                      ) : activeAuction ? (
                        <span className="rounded-full bg-muted px-3 py-1.5 text-[12px] font-bold text-muted-foreground">
                          {t("live.waitOtherAuction", "Enchère en cours")}
                        </span>
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

            {!battle.isRunning && (
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
                  hostId={user.id}
                  addedBy={user.id}
                  existingIds={new Set(moderators.map((m) => m.userId))}
                  presentIds={room.presentViewers.map((p) => ({
                    id: p.identity,
                    name: p.name,
                  }))}
                />
              )}
            </div>
            )}
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
        onPickFromShop={() => { setAddOpen(false); setShopPickerOpen(true); }}
      />
      <ShopPickerSheet
        open={shopPickerOpen}
        onClose={() => setShopPickerOpen(false)}
        onConfirm={(items) => {
          for (const it of items) void onAddProductMidLive(it);
        }}
      />
      <BattleInviteSheet
        open={battle.inviteOpen}
        onClose={battle.closeInvite}
        excludeSellerId={user?.id ?? null}
        onInvite={(draft, durationSec) => {
          void battle.sendInvite(draft, durationSec).then((res) => {
            if (!res.ok) {
              toast.error(
                res.error === "not_live"
                  ? t("battle.invite.notLiveHint")
                  : res.error === "restream_active"
                    ? t("battle.blocked.restreamActive")
                    : res.error === "target_busy" || res.error === "already_in_battle"
                      ? t("battle.blocked.alreadyRunning")
                      : t("battle.invite.failed"),
              );
            } else {
              toast.success(t("battle.invite.sent"));
            }
          });
        }}
      />
      <BattleIncomingInviteSheet
        invite={battle.incoming}
        onDecline={() => { void battle.declineIncoming(); }}
        onAccept={() => {
          void battle.acceptIncoming().then((res) => {
            if (!res.ok) {
              toast.error(
                res.error === "expired"
                  ? t("battle.incoming.expired")
                  : t("battle.invite.failed"),
              );
            }
          });
        }}
      />
      {battle.isRunning && (
        <BattleCountdownOverlay
          startsAt={battle.session?.startedAt}
          leftName={battle.session ? battleLayoutSides(battle.session, { sellerId: user?.id }).left.displayName : undefined}
          rightName={battle.session ? battleLayoutSides(battle.session, { sellerId: user?.id }).right.displayName : undefined}
        />
      )}
      <BattleSuddenDeathOverlay
        active={!!battle.session?.suddenDeath && battle.isRunning}
      />
      <BattleResultOverlay
        open={battle.resultOpen}
        session={battle.session}
        selfSellerId={user?.id ?? null}
        onDone={battle.dismissResult}
        onRematch={() => {
          void battle.requestRematch().then((res) => {
            if (!res.ok) {
              toast.error(
                res.error === "not_live"
                  ? t("battle.invite.notLiveHint")
                  : t("battle.invite.failed"),
              );
            } else {
              toast.success(t("battle.invite.sent"));
            }
          });
        }}
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

