// Social restream composition (YouTube / Facebook Web Egress).
//
// Social players crop / cover the frame:
//   - top header ~12–16%
//   - bottom native chat / reactions ~32–38%
//   - Facebook right reaction column ~10%
// Keep KiDi+ overlays inside a roomy safe band — large enough to read.

import { useEffect, useMemo, useState } from "react";
import { Eye, Timer } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLiveRoom } from "@/lib/live-room";
import { formatMoney, normalizeCurrency } from "@/lib/money";
import type { LiveProductRow } from "@/lib/lives-db";
import { signalLivekitEgressStartRecording } from "@/lib/broadcast-egress-signal";
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

  // Fewer lines, larger type — readable after Facebook/YouTube compression.
  const chatLines = useMemo(() => {
    return room.chat
      .filter((c) => {
        if (c.systemKind === "join") return false;
        if (!c.text?.trim()) return false;
        return true;
      })
      .slice(-4);
  }, [room.chat]);

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
        {/* Top: brand + large featured product */}
        <div className="flex items-start justify-between gap-3">
          <div
            className="min-w-0 max-w-[48%] rounded-2xl px-3 py-2"
            style={{ background: "rgba(0,0,0,0.55)" }}
          >
            <div className="flex items-center gap-2">
              <span
                className="rounded px-1.5 py-0.5 text-[11px] font-black uppercase tracking-wide"
                style={{ background: "oklch(0.62 0.24 25)" }}
              >
                Live
              </span>
              <span className="truncate text-[15px] font-bold">{hostName}</span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-[12px] font-semibold text-white/90">
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Eye size={13} /> {displayViewers}
              </span>
              <span>KiDi+</span>
              {title ? (
                <span className="truncate text-white/70">{title}</span>
              ) : null}
            </div>
          </div>

          {featured && (
            <div
              className="w-[9.5rem] shrink-0 rounded-2xl p-2"
              style={{
                background: "rgba(0,0,0,0.68)",
                border: "1px solid rgba(255,255,255,0.2)",
              }}
            >
              <div className="relative mb-1.5">
                <LiveProductImage
                  src={imgFor(featured)}
                  className="h-[5.25rem] w-full rounded-xl object-cover"
                  iconClassName="text-white/60"
                />
                <span className="absolute left-1.5 top-1.5 rounded-full bg-white px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#10162B]">
                  {t("live.featured", "EN VEDETTE")}
                </span>
                {auctionOnFeatured && (
                  <span
                    className="absolute bottom-1.5 right-1.5 flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-black tabular-nums"
                    style={{
                      background:
                        secondsLeft <= 10
                          ? "oklch(0.82 0.14 85)"
                          : "rgba(0,0,0,0.8)",
                      color: secondsLeft <= 10 ? "#10162B" : "white",
                    }}
                  >
                    <Timer size={11} />
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
                  <div className="text-[17px] font-black tabular-nums">
                    {fmt(Number(featured.price))}
                  </div>
                  {room.lastBid?.productId === featured.id && (
                    <div className="truncate text-[11px] text-white/80">
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
                className="mt-1.5 rounded-lg py-1 text-center text-[11px] font-black uppercase tracking-wide"
                style={{
                  background: "oklch(0.82 0.14 85)",
                  color: "#10162B",
                }}
              >
                {t("broadcast.egress.onKidi", "Sur KiDi+")}
              </div>
            </div>
          )}
        </div>

        {/* Spacer pushes chat toward lower safe band (above FB native chrome) */}
        <div className="min-h-3 flex-1" />

        {/* Chat — wide + large type for mobile Facebook viewers */}
        <div className="max-w-[78%] space-y-2 self-start">
          <div
            className="inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white/95"
            style={{ background: "rgba(0,0,0,0.5)" }}
          >
            {t("broadcast.egress.kidiChat", "Chat KiDi+")}
          </div>
          {chatLines.length === 0 ? (
            <div
              className="rounded-2xl px-3 py-2.5 text-[15px] font-semibold text-white/90"
              style={{ background: "rgba(0,0,0,0.55)" }}
            >
              {t("broadcast.egress.chatWaitingShort", "Chat KiDi+…")}
            </div>
          ) : (
            chatLines.map((c) => (
              <div
                key={c.id}
                className="rounded-2xl px-3 py-2"
                style={{ background: "rgba(0,0,0,0.58)" }}
              >
                {c.system ? (
                  <p className="text-[15px] font-semibold leading-snug text-white/95">
                    {c.text}
                  </p>
                ) : (
                  <p className="text-[15px] leading-snug">
                    <span
                      className="font-bold"
                      style={{ color: c.color || "oklch(0.85 0.12 85)" }}
                    >
                      {c.isHost ? `${c.user} [HOST]` : c.user}
                    </span>
                    {c.source === "youtube" ? (
                      <span
                        className="ml-1.5 inline-flex rounded px-1 py-px text-[10px] font-black text-white"
                        style={{ background: "oklch(0.55 0.22 25)" }}
                      >
                        YT
                      </span>
                    ) : c.source === "facebook" ? (
                      <span
                        className="ml-1.5 inline-flex rounded px-1 py-px text-[10px] font-black text-white"
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
