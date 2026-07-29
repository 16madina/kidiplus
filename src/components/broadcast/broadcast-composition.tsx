// Social restream composition (YouTube / Facebook Web Egress).
//
// Social players crop / cover the frame:
//   - top header ~12–16%
//   - bottom native chat / reactions ~32–38%
//   - Facebook right reaction column ~10%
// Keep KiDi+ overlays inside a roomy safe band — large enough to read.

import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, Timer } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLiveRoom } from "@/lib/live-room";
import { formatMoney, normalizeCurrency } from "@/lib/money";
import { signalLivekitEgressStartRecording } from "@/lib/broadcast-egress-signal";
import { GiftAnimationsLayer } from "@/components/live-viewer/gift-animations";
import { Confetti } from "@/components/live-viewer/confetti";
import { WinnerReveal } from "@/components/live-viewer/winner-reveal";
import { SuddenDeathFlash } from "@/components/live-viewer/sudden-death-flash";
import { AuctionFinalCountdown } from "@/components/live-viewer/auction-final-countdown";
import { BidPulseFlash } from "@/components/live-viewer/bid-pulse-flash";
import { LiveProductImage } from "@/components/live-viewer/live-product-image";
import {
  BroadcastEgressVideo,
  type BroadcastEgressVideoStatus,
} from "./broadcast-egress-video";

/** Wider safe band — previous 22%/46%/18% crushed UI into a tiny middle strip. */
const SAFE_TOP = "12%";
const SAFE_BOTTOM = "34%";
const SAFE_LEFT = "5%";
const SAFE_RIGHT = "11%";

export type BroadcastCompositionProps = {
  liveId: string;
  roomName: string;
  livekitUrl: string;
  livekitToken: string;
  identity: string;
  hostName: string;
  title?: string | null;
  coverUrl?: string | null;
  currency?: string | null;
  /** Large KiDi+ mark burned into the frame (replay / social egress). */
  showWatermark?: boolean;
  /** Service-signed product photos (egress has no Supabase user session). */
  productImages?: Record<string, string>;
};

export function BroadcastComposition({
  liveId,
  livekitUrl,
  livekitToken,
  identity,
  hostName,
  title,
  coverUrl,
  currency,
  showWatermark = true,
  productImages,
}: BroadcastCompositionProps) {
  const { t, i18n } = useTranslation();
  const liveCurrency = normalizeCurrency(currency ?? "EUR");
  const fmt = (n: number) => formatMoney(n, liveCurrency, i18n.language);

  const room = useLiveRoom({
    liveId,
    identity,
    displayName: "YouTube",
    isHost: false,
    silent: true,
  });

  // Backup START_RECORDING if video attach is slow (primary signal is in BroadcastEgressVideo).
  useEffect(() => {
    const timer = window.setTimeout(() => {
      signalLivekitEgressStartRecording();
    }, 5_000);
    return () => window.clearTimeout(timer);
  }, []);

  const [videoStatus, setVideoStatus] =
    useState<BroadcastEgressVideoStatus>("connecting");

  const activeAuctionId = room.auctionStart?.productId ?? null;
  const endedProductId = room.lastAuctionEnd?.productId ?? null;
  const featured = useMemo(() => {
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
    return (
      sorted.find((p) => p.status === "upcoming" && playable(p)) ??
      sorted.find(playable) ??
      null
    );
  }, [room.products, activeAuctionId, endedProductId]);

  const [secondsLeft, setSecondsLeft] = useState(0);
  useEffect(() => {
    if (!room.auctionStart) {
      setSecondsLeft(0);
      return;
    }
    const deadlineMs = room.auctionStart.deadlineMs;
    let last = -1;
    const tick = () => {
      const s = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
      if (s !== last) {
        last = s;
        setSecondsLeft(s);
      }
    };
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [room.auctionStart]);
  const auctionOnFeatured =
    !!room.auctionStart &&
    !!featured &&
    room.auctionStart.productId === featured.id;
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  // Fewer lines, larger type — readable after Facebook/YouTube compression.
  const chatLines = useMemo(() => {
    return room.chat
      .filter((c) => {
        if (c.systemKind === "join") return false;
        if (!c.text?.trim()) return false;
        return true;
      })
      .slice(-5);
  }, [room.chat]);

  const displayViewers = Math.max(1, room.viewerCount);

  const [confettiKey, setConfettiKey] = useState(0);
  const [winnerReveal, setWinnerReveal] = useState<{
    key: string;
    productId: string;
    name: string | null;
    winnerId: string | null;
    variant: "winner" | "unsold";
    productName: string | null;
  } | null>(null);
  const [suddenDeathTick, setSuddenDeathTick] = useState(0);
  const joinedAt = useMemo(() => Date.now(), []);
  const seenEndIdsRef = useRef<Set<string>>(new Set());
  const productsRef = useRef(room.products);
  productsRef.current = room.products;

  // Exactly once per auction end. Do NOT depend on products — updates were
  // re-opening the same reveal on YouTube in a loop.
  useEffect(() => {
    const end = room.lastAuctionEnd;
    if (!end) return;
    const endId =
      end.endId ??
      `fallback-${end.ts ?? 0}-${end.productId}-${end.auctionRound ?? 0}`;
    if (seenEndIdsRef.current.has(endId)) return;
    const ts = end.ts ?? 0;
    if (ts > 0 && ts < joinedAt - 8000) return;
    seenEndIdsRef.current.add(endId);
    if (seenEndIdsRef.current.size > 80) {
      const first = seenEndIdsRef.current.values().next().value;
      if (first) seenEndIdsRef.current.delete(first);
    }
    const product = productsRef.current.find((p) => p.id === end.productId);
    if (!end.winnerId) {
      setWinnerReveal({
        key: endId,
        productId: end.productId,
        name: null,
        winnerId: null,
        variant: "unsold",
        productName: product?.name ?? null,
      });
      return;
    }
    setConfettiKey((k) => k + 1);
    setWinnerReveal({
      key: endId,
      productId: end.productId,
      name: end.winnerName,
      winnerId: end.winnerId,
      variant: "winner",
      productName: product?.name ?? null,
    });
  }, [room.lastAuctionEnd?.endId, joinedAt, room.lastAuctionEnd]);

  // New auction started → cut reveal so social stays with the host.
  useEffect(() => {
    if (!room.auctionStart) return;
    setWinnerReveal(null);
  }, [room.auctionStart?.productId, room.auctionStart?.deadlineMs]);

  useEffect(() => {
    if (!room.lastExtension?.ts) return;
    setSuddenDeathTick((n) => n + 1);
  }, [room.lastExtension?.ts]);

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-black text-white">
      <BroadcastEgressVideo
        url={livekitUrl}
        token={livekitToken}
        posterImage={coverUrl}
        onStatus={setVideoStatus}
        brighten
      />

      {/* Brand mark — centered, slightly larger CSS wordmark */}
      {showWatermark ? (
        <div
          aria-hidden
          className="pointer-events-none absolute z-40"
          style={{
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            padding: "14px 20px 14px 22px",
            borderRadius: 16,
            background: "rgba(16, 22, 43, 0.88)",
            boxShadow: "0 10px 32px rgba(0,0,0,0.55)",
            border: "1px solid rgba(255,255,255,0.2)",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "baseline",
              fontWeight: 900,
              fontSize: 42,
              letterSpacing: "-0.03em",
              lineHeight: 1,
              color: "#fff",
              fontFamily:
                'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
            }}
          >
            KiDi
            <span style={{ color: "#E8B84A", marginLeft: 2 }}>+</span>
          </span>
        </div>
      ) : null}

      {/* ── Inner safe rectangle ── */}
      <div
        className="pointer-events-none absolute z-30 flex flex-col"
        style={{
          top: SAFE_TOP,
          bottom: SAFE_BOTTOM,
          left: SAFE_LEFT,
          right: SAFE_RIGHT,
        }}
      >
        {/* Top: brand + description CTA | featured product */}
        <div className="flex items-start justify-between gap-2.5">
          <div
            className="min-w-0 max-w-[52%] rounded-2xl px-3 py-2"
            style={{ background: "rgba(0,0,0,0.62)" }}
          >
            <div className="flex items-center gap-1.5">
              <span
                className="rounded px-1.5 py-0.5 text-[11px] font-black uppercase tracking-wide"
                style={{ background: "oklch(0.62 0.24 25)" }}
              >
                Live
              </span>
              <span className="truncate text-[14px] font-bold">{hostName}</span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-[11px] font-semibold text-white/90">
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Eye size={12} /> {displayViewers}
              </span>
              <span>KiDi+</span>
            </div>
            <p className="mt-1.5 text-[12px] font-bold leading-snug text-white">
              {auctionOnFeatured
                ? t(
                    "broadcast.egress.linkToBid",
                    "Enchéris sur KiDi+ — lien dans la description",
                  )
                : t(
                    "broadcast.egress.linkToShop",
                    "Achète sur KiDi+ — lien dans la description",
                  )}
            </p>
          </div>

          {featured && (
            <div
              className="w-[9.75rem] shrink-0 rounded-2xl p-2"
              style={{
                background: "rgba(0,0,0,0.72)",
                border: auctionOnFeatured
                  ? "2px solid oklch(0.82 0.14 85)"
                  : "1px solid rgba(255,255,255,0.2)",
              }}
            >
              <div className="relative mb-1.5">
                <LiveProductImage
                  src={
                    productImages?.[featured.id] ?? featured.image_url
                  }
                  className="h-[5.25rem] w-full rounded-xl object-cover"
                  iconClassName="text-white/60"
                />
                <span className="absolute left-1.5 top-1.5 rounded-full bg-white px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#10162B]">
                  {t("live.featured", "EN VEDETTE")}
                </span>
                {auctionOnFeatured && (
                  <span
                    className="absolute bottom-1.5 right-1.5 flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[12px] font-black tabular-nums"
                    style={{
                      background:
                        secondsLeft <= 10
                          ? "oklch(0.82 0.14 85)"
                          : "rgba(0,0,0,0.8)",
                      color: secondsLeft <= 10 ? "#10162B" : "white",
                    }}
                  >
                    <Timer size={12} />
                    {mm}:{ss}
                  </span>
                )}
              </div>
              <div className="truncate text-[14px] font-bold leading-tight">
                {featured.name}
              </div>
              {auctionOnFeatured ? (
                <>
                  <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/70">
                    {t("live.currentBid", "Enchère")}
                  </div>
                  <div
                    className="text-[18px] font-black tabular-nums"
                    style={{
                      color:
                        secondsLeft <= 10 ? "oklch(0.88 0.14 85)" : "white",
                    }}
                  >
                    {fmt(Number(featured.price))}
                  </div>
                  {room.lastBid?.productId === featured.id && (
                    <div className="truncate text-[11px] font-semibold text-white/85">
                      @{room.lastBid.bidderName}
                    </div>
                  )}
                </>
              ) : (
                <div className="mt-0.5 text-[13px] font-bold tabular-nums text-white/95">
                  {featured.mode === "auction"
                    ? `${fmt(Number(featured.start_price))} · ${featured.timer_seconds}s`
                    : `${fmt(Number(featured.price))}`}
                </div>
              )}
              <div
                className="mt-1.5 rounded-lg py-1.5 text-center text-[11px] font-black uppercase leading-tight tracking-wide"
                style={{
                  background: auctionOnFeatured
                    ? "oklch(0.72 0.2 25)"
                    : "oklch(0.82 0.14 85)",
                  color: auctionOnFeatured ? "#fff" : "#10162B",
                }}
              >
                {auctionOnFeatured
                  ? t("broadcast.egress.bidOnKidi", "Enchéris sur KiDi+")
                  : t("broadcast.egress.onKidi", "Sur KiDi+")}
              </div>
            </div>
          )}
        </div>

        {/* Spacer pushes chat toward lower safe band (above FB native chrome) */}
        <div className="min-h-3 flex-1" />

        {/* Chat — high contrast for mobile Facebook viewers */}
        <div className="max-w-[88%] space-y-2 self-start">
          <div
            className="inline-flex rounded-full px-3 py-1 text-[12px] font-black uppercase tracking-wide text-white"
            style={{ background: "rgba(0,0,0,0.72)" }}
          >
            {t("broadcast.egress.kidiChat", "Chat KiDi+")}
          </div>
          {chatLines.length === 0 ? (
            <div
              className="rounded-2xl px-3.5 py-3 text-[17px] font-bold leading-snug text-white"
              style={{
                background: "rgba(0,0,0,0.72)",
                border: "1px solid rgba(255,255,255,0.22)",
              }}
            >
              {t("broadcast.egress.chatWaitingShort", "Chat KiDi+…")}
            </div>
          ) : (
            chatLines.map((c) => (
              <div
                key={c.id}
                className="rounded-2xl px-3.5 py-2.5"
                style={{
                  background: "rgba(0,0,0,0.72)",
                  border: "1px solid rgba(255,255,255,0.2)",
                }}
              >
                {c.system ? (
                  <p className="text-[16px] font-bold leading-snug text-white">
                    {c.text}
                  </p>
                ) : (
                  <p className="text-[17px] font-semibold leading-snug">
                    <span
                      className="font-black"
                      style={{ color: c.color || "oklch(0.88 0.14 85)" }}
                    >
                      {c.isHost ? `${c.user} [HOST]` : c.user}
                    </span>
                    {c.source === "youtube" ? (
                      <span
                        className="ml-1.5 inline-flex rounded px-1.5 py-px text-[11px] font-black text-white"
                        style={{ background: "oklch(0.55 0.22 25)" }}
                      >
                        YT
                      </span>
                    ) : c.source === "facebook" ? (
                      <span
                        className="ml-1.5 inline-flex rounded px-1.5 py-px text-[11px] font-black text-white"
                        style={{ background: "oklch(0.5 0.14 260)" }}
                      >
                        FB
                      </span>
                    ) : null}{" "}
                    <span className="text-white">{c.text}</span>
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* No FloatingHearts — Facebook/YouTube already show native likes. */}
      <GiftAnimationsLayer trigger={room.lastGift} />
      <Confetti trigger={confettiKey} />
      <SuddenDeathFlash tick={suddenDeathTick} />
      <AuctionFinalCountdown
        secondsLeft={secondsLeft}
        active={!!room.auctionStart}
        density="social"
      />
      <BidPulseFlash
        text={
          room.lastBid &&
          featured &&
          room.lastBid.productId === featured.id
            ? `${room.lastBid.bidderName} · ${fmt(room.lastBid.amount)}`
            : null
        }
        pulseKey={room.lastBid?.ts ?? 0}
      />
      <WinnerReveal
        key={winnerReveal?.key ?? "wr"}
        open={!!winnerReveal}
        winnerName={winnerReveal?.name ?? null}
        winnerId={winnerReveal?.winnerId ?? null}
        variant={winnerReveal?.variant ?? "winner"}
        productName={winnerReveal?.productName ?? null}
        revealKey={winnerReveal?.key ?? null}
        surface="social"
        onDone={() => setWinnerReveal(null)}
      />

      {videoStatus !== "live" && (
        <div
          className="pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 rounded-md bg-black/60 px-3 py-1 text-[11px] text-white/80"
          style={{ top: "50%" }}
        >
          {videoStatus}
        </div>
      )}
    </div>
  );
}
