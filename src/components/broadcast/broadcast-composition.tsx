// Read-only KiDi+ live composition for LiveKit Web Egress → YouTube (etc.).
// Shows host video + chat + auction card + gifts/hearts. No bid/buy chrome.

import { useEffect, useMemo, useState } from "react";
import { Eye } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLiveRoom } from "@/lib/live-room";
import { normalizeCurrency } from "@/lib/money";
import { systemMessage, type ChatMsg, type Product } from "@/lib/live-viewer-mock";
import type { LiveProductRow } from "@/lib/lives-db";
import { signalLivekitEgressStartRecording } from "@/lib/broadcast-egress-signal";
import { LiveChat } from "@/components/live-viewer/live-chat";
import { FloatingHearts } from "@/components/live-viewer/floating-hearts";
import { AuctionCard } from "@/components/live-viewer/auction-card";
import { GiftAnimationsLayer } from "@/components/live-viewer/gift-animations";
import { Confetti } from "@/components/live-viewer/confetti";
import { WinnerReveal } from "@/components/live-viewer/winner-reveal";
import { SuddenDeathFlash } from "@/components/live-viewer/sudden-death-flash";
import {
  BroadcastEgressVideo,
  type BroadcastEgressVideoStatus,
} from "./broadcast-egress-video";

const FALLBACK_IMG =
  "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&q=70";

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
  const { t } = useTranslation();
  const liveCurrency = normalizeCurrency(currency ?? "EUR");

  const room = useLiveRoom({
    liveId,
    identity,
    displayName: "YouTube",
    isHost: false,
    silent: true,
  });

  // Page-level safety net: if video signal never fires, still unlock egress.
  useEffect(() => {
    const t = window.setTimeout(() => {
      signalLivekitEgressStartRecording();
    }, 10_000);
    return () => window.clearTimeout(t);
  }, []);

  const [videoStatus, setVideoStatus] =
    useState<BroadcastEgressVideoStatus>("connecting");

  const activeAuctionId = room.auctionStart?.productId ?? null;
  const currentProduct = useMemo(() => {
    if (activeAuctionId)
      return room.products.find((p) => p.id === activeAuctionId) ?? null;
    const sorted = [...room.products].sort((a, b) => a.position - b.position);
    return sorted.find((p) => p.status === "upcoming") ?? null;
  }, [room.products, activeAuctionId]);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!room.auctionStart) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [room.auctionStart]);
  const secondsLeft = room.auctionStart
    ? Math.max(0, Math.ceil((room.auctionStart.deadlineMs - now) / 1000))
    : 0;

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

  const currentAsProduct = currentProduct
    ? toProduct(currentProduct, activeAuctionId)
    : null;
  const liveEnded = room.liveStatus === "ended";
  const displayViewers = Math.max(1, room.viewerCount);

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

  const onKidiLabel = t(
    "broadcast.egress.onKidi",
    "Sur KiDi+",
  );

  return (
    <div
      className="relative h-[100dvh] w-full overflow-hidden bg-black text-white"
      style={{ maxWidth: 720, margin: "0 auto" }}
    >
      <BroadcastEgressVideo
        url={livekitUrl}
        token={livekitToken}
        posterImage={coverUrl}
        onStatus={setVideoStatus}
      />

      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-32"
        style={{
          backgroundImage:
            "linear-gradient(to bottom, rgba(0,0,0,0.5), rgba(0,0,0,0))",
        }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10"
        style={{
          height: "48%",
          backgroundImage:
            "linear-gradient(to top, rgba(0,0,0,0.8), rgba(0,0,0,0))",
        }}
      />

      {/* Top bar */}
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
                style={{ textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}
              >
                {hostName}
              </p>
            </div>
            {title ? (
              <p
                className="mt-0.5 truncate text-[12px] text-white/80"
                style={{ textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}
              >
                {title}
              </p>
            ) : null}
          </div>
          <div
            className="flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold text-white tabular-nums"
            style={{
              backgroundColor: "rgba(0,0,0,0.45)",
              backdropFilter: "blur(10px)",
            }}
          >
            <Eye size={13} />
            {displayViewers}
          </div>
        </div>
      </div>

      {/* Chat */}
      <div
        className="absolute inset-x-0 z-20 pointer-events-none"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 132px)" }}
      >
        <LiveChat messages={messages} />
      </div>

      {/* Featured product / auction (read-only) */}
      {currentAsProduct ? (
        <div
          className="absolute inset-x-0 z-30 px-3 pointer-events-none"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 52px)" }}
        >
          {!liveEnded &&
            !room.auctionStart &&
            currentProduct?.status === "upcoming" && (
              <div
                className="mb-2 rounded-2xl px-3 py-2 text-center text-[12px] font-semibold text-white"
                style={{
                  background: "rgba(15, 15, 20, 0.72)",
                  border: "1px solid rgba(255,255,255,0.12)",
                }}
              >
                ⏳{" "}
                {t("live.nextItemSoon", {
                  name: currentAsProduct.name,
                  defaultValue: "Prochain article bientôt… {{name}}",
                })}
              </div>
            )}
          <div className="pointer-events-auto">
            <AuctionCard
              product={currentAsProduct}
              secondsLeft={secondsLeft}
              currency={liveCurrency}
              auctionActive={
                !liveEnded &&
                !!room.auctionStart &&
                room.auctionStart.productId === currentAsProduct.id
              }
              disabled={liveEnded}
              deliveryBlockedLabel={onKidiLabel}
              lastBidder={
                room.lastBid &&
                room.lastBid.productId === currentAsProduct.id &&
                room.lastBid.auctionRound ===
                  (currentProduct?.auction_round ?? 1)
                  ? room.lastBid.bidderName
                  : undefined
              }
              onBid={() => {}}
              onOpenProducts={() => {}}
              onBuy={() => {}}
            />
          </div>
        </div>
      ) : null}

      {/* KiDi+ watermark / CTA strip */}
      <div
        className="absolute inset-x-0 bottom-0 z-30 px-3 pb-safe"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 10px)" }}
      >
        <div
          className="flex items-center justify-between gap-2 rounded-full px-4 py-2.5"
          style={{
            background:
              "linear-gradient(135deg, oklch(0.55 0.22 25), oklch(0.45 0.2 35))",
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
          }}
        >
          <div className="min-w-0">
            <p className="truncate text-[13px] font-bold text-white">
              {t("broadcast.egress.watermarkTitle", "KiDi+ Live Shopping")}
            </p>
            <p className="truncate text-[11px] text-white/85">
              {t(
                "broadcast.egress.watermarkHint",
                "Enchéris et commente dans l’app KiDi+",
              )}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-bold text-white">
            kidiplus.com
          </span>
        </div>
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

      {/* Debug status for egress operators (tiny, bottom-left) */}
      {videoStatus !== "live" && (
        <div className="pointer-events-none absolute bottom-20 left-3 z-50 rounded-md bg-black/50 px-2 py-1 text-[10px] text-white/70">
          {videoStatus}
        </div>
      )}
    </div>
  );
}
