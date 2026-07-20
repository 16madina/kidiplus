// Read-only KiDi+ live composition for LiveKit Web Egress → YouTube / social.
// Layout is tuned for social apps that cover the bottom ~40% with their own
// chat (YouTube): featured product + catalog badge sit top-right like the host
// screen; KiDi+ chat stays mid-left; heavy dark gradients are avoided.

import { useEffect, useMemo, useState } from "react";
import { Eye, Package, Timer } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLiveRoom } from "@/lib/live-room";
import { formatMoney, normalizeCurrency } from "@/lib/money";
import { systemMessage, type ChatMsg } from "@/lib/live-viewer-mock";
import type { LiveProductRow } from "@/lib/lives-db";
import { signalLivekitEgressStartRecording } from "@/lib/broadcast-egress-signal";
import { LiveChat } from "@/components/live-viewer/live-chat";
import { FloatingHearts } from "@/components/live-viewer/floating-hearts";
import { GiftAnimationsLayer } from "@/components/live-viewer/gift-animations";
import { Confetti } from "@/components/live-viewer/confetti";
import { WinnerReveal } from "@/components/live-viewer/winner-reveal";
import { SuddenDeathFlash } from "@/components/live-viewer/sudden-death-flash";
import { LiveProductImage } from "@/components/live-viewer/live-product-image";
import {
  BroadcastEgressVideo,
  type BroadcastEgressVideoStatus,
} from "./broadcast-egress-video";

const FALLBACK_IMG =
  "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&q=70";

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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      signalLivekitEgressStartRecording();
    }, 10_000);
    return () => window.clearTimeout(timer);
  }, []);

  const [videoStatus, setVideoStatus] =
    useState<BroadcastEgressVideoStatus>("connecting");

  const activeAuctionId = room.auctionStart?.productId ?? null;

  // Same forward-only featured pick as the host screen.
  const featured = useMemo(() => {
    if (activeAuctionId) {
      return room.products.find((p) => p.id === activeAuctionId) ?? null;
    }
    const sorted = [...room.products].sort((a, b) => a.position - b.position);
    return (
      sorted.find((p) => p.status === "upcoming" || p.status === "active") ??
      null
    );
  }, [room.products, activeAuctionId]);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!room.auctionStart) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [room.auctionStart]);
  const secondsLeft = room.auctionStart
    ? Math.max(0, Math.ceil((room.auctionStart.deadlineMs - now) / 1000))
    : 0;
  const auctionOnFeatured =
    !!room.auctionStart &&
    !!featured &&
    room.auctionStart.productId === featured.id;
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  const messages: ChatMsg[] = useMemo(() => {
    const intro = systemMessage(
      t("broadcast.egress.chatIntro", {
        name: hostName,
        defaultValue: `Live KiDi+ · {{name}} 👋`,
      }),
    );
    return [
      intro,
      ...room.chat.map((c) => ({
        id: c.id,
        user: c.user,
        color: c.color,
        text: c.text,
        system: c.system,
        systemKind: c.systemKind,
        userId: c.userId,
        isModerator: c.isModerator,
        isHost: c.isHost,
        replyTo: c.replyTo,
      })),
    ];
  }, [room.chat, hostName, t]);

  const displayViewers = Math.max(1, room.viewerCount);
  const imgFor = (p: LiveProductRow) => p.image_url || FALLBACK_IMG;

  const [confettiKey, setConfettiKey] = useState(0);
  const [winnerReveal, setWinnerReveal] = useState<{
    key: string;
    name: string | null;
    winnerId: string | null;
    variant: "winner" | "unsold";
    productName: string | null;
  } | null>(null);
  const [suddenDeathTick, setSuddenDeathTick] = useState(0);
  const joinedAt = useMemo(() => Date.now(), []);

  useEffect(() => {
    const end = room.lastAuctionEnd;
    if (!end?.endId) return;
    const ts = end.ts ?? 0;
    if (ts > 0 && ts < joinedAt - 2500) return;
    const product = room.products.find((p) => p.id === end.productId);
    if (!end.winnerId) {
      setWinnerReveal({
        key: end.endId,
        name: null,
        winnerId: null,
        variant: "unsold",
        productName: product?.name ?? null,
      });
      return;
    }
    setConfettiKey((k) => k + 1);
    setWinnerReveal({
      key: end.endId,
      name: end.winnerName,
      winnerId: end.winnerId,
      variant: "winner",
      productName: product?.name ?? null,
    });
  }, [room.lastAuctionEnd?.endId, joinedAt, room.products, room.lastAuctionEnd]);

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

      {/* Light readability scrim only — avoid the old 48% black wash. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24"
        style={{
          backgroundImage:
            "linear-gradient(to bottom, rgba(0,0,0,0.35), rgba(0,0,0,0))",
        }}
      />

      {/* Top bar — host-like: brand + viewers + catalog badge */}
      <div className="absolute inset-x-0 top-0 z-30 pt-safe">
        <div className="flex items-start justify-between gap-2 px-3 pt-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className="rounded-md px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-white"
                style={{ background: "oklch(0.62 0.24 25)" }}
              >
                Live
              </span>
              <p
                className="truncate text-[15px] font-bold text-white"
                style={{ textShadow: "0 1px 4px rgba(0,0,0,0.75)" }}
              >
                {hostName}
              </p>
            </div>
            {title ? (
              <p
                className="mt-0.5 truncate text-[12px] text-white/85"
                style={{ textShadow: "0 1px 4px rgba(0,0,0,0.75)" }}
              >
                {title}
              </p>
            ) : null}
            <p
              className="mt-1 text-[11px] font-semibold text-white/90"
              style={{ textShadow: "0 1px 4px rgba(0,0,0,0.75)" }}
            >
              KiDi+ · kidiplus.com
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <div
              className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold text-white tabular-nums"
              style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
            >
              <Eye size={13} />
              {displayViewers}
            </div>
            {/* Same catalog chip the host sees (Package + badge). */}
            <div
              className="relative flex h-9 w-9 items-center justify-center rounded-full text-white"
              style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
              aria-label={t("live.products", "Produits")}
            >
              <Package size={16} />
              {room.products.length > 0 && (
                <span
                  className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[9px] font-black text-[#10162B]"
                  style={{ background: "oklch(0.85 0.18 90)" }}
                >
                  {room.products.length > 9 ? "9+" : room.products.length}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Featured product — host position (top-right), clear of YouTube chat. */}
      {featured && (
        <div
          className="absolute right-3 z-30 w-[7.5rem]"
          style={{ top: "calc(env(safe-area-inset-top) + 64px)" }}
        >
          <div
            className="rounded-2xl p-1.5 text-white"
            style={{
              backgroundColor: "rgba(0,0,0,0.55)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              border: "1px solid rgba(255,255,255,0.14)",
            }}
          >
            <div className="relative mb-1">
              <LiveProductImage
                src={imgFor(featured)}
                className="h-16 w-full rounded-lg object-cover"
                iconClassName="text-white/60"
              />
              <span className="absolute left-1 top-1 rounded-full bg-white px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wide text-[#10162B]">
                {t("live.featured", "EN VEDETTE")}
              </span>
              {auctionOnFeatured && (
                <span
                  className="absolute bottom-1 right-1 flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-black tabular-nums"
                  style={{
                    background:
                      secondsLeft <= 10
                        ? "oklch(0.82 0.14 85)"
                        : "rgba(0,0,0,0.7)",
                    color: secondsLeft <= 10 ? "#10162B" : "white",
                  }}
                >
                  <Timer size={9} />
                  {mm}:{ss}
                </span>
              )}
            </div>
            <div className="truncate text-[10.5px] font-semibold leading-tight">
              {featured.name}
            </div>
            {auctionOnFeatured ? (
              <>
                <div className="mt-0.5 text-[8.5px] font-semibold uppercase tracking-wide text-white/60">
                  {t("live.currentBid", "Enchère")}
                </div>
                <div className="text-[13px] font-bold tabular-nums">
                  {fmt(Number(featured.price))}
                </div>
                {room.lastBid?.productId === featured.id && (
                  <div className="truncate text-[9px] text-white/70">
                    @{room.lastBid.bidderName}
                  </div>
                )}
              </>
            ) : (
              <div className="mt-0.5 text-[11px] font-bold tabular-nums">
                {featured.mode === "auction"
                  ? `${fmt(Number(featured.start_price))} · ${featured.timer_seconds}s`
                  : `${fmt(Number(featured.price))} · stock ${Math.max(0, featured.stock)}`}
              </div>
            )}
            <div className="mt-1 rounded-lg bg-white/15 py-1 text-center text-[9px] font-bold uppercase tracking-wide text-white/90">
              {t("broadcast.egress.onKidi", "Sur KiDi+")}
            </div>
          </div>
        </div>
      )}

      {/* KiDi+ chat — mid-left, above YouTube's native chat zone */}
      <div
        className="pointer-events-none absolute left-0 z-20 w-[72%] max-w-[280px] pl-2"
        style={{
          top: "42%",
          bottom: "38%",
          maskImage:
            "linear-gradient(to bottom, transparent, black 12%, black 88%, transparent)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent, black 12%, black 88%, transparent)",
        }}
      >
        <LiveChat messages={messages} />
      </div>

      <FloatingHearts trigger={room.heartTick} />
      <GiftAnimationsLayer trigger={room.lastGift} />
      <Confetti trigger={confettiKey} />
      <SuddenDeathFlash tick={suddenDeathTick} />
      <WinnerReveal
        key={winnerReveal?.key ?? "wr"}
        open={!!winnerReveal}
        winnerName={winnerReveal?.name ?? null}
        winnerId={winnerReveal?.winnerId ?? null}
        variant={winnerReveal?.variant ?? "winner"}
        productName={winnerReveal?.productName ?? null}
        revealKey={winnerReveal?.key ?? null}
        onDone={() => setWinnerReveal(null)}
      />

      {videoStatus !== "live" && (
        <div className="pointer-events-none absolute left-3 top-1/2 z-50 -translate-y-1/2 rounded-md bg-black/50 px-2 py-1 text-[10px] text-white/70">
          {videoStatus}
        </div>
      )}
    </div>
  );
}
