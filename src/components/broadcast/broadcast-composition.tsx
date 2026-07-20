// Social restream composition (YouTube / Facebook Web Egress).
//
// CRITICAL: YouTube (and FB) paint their own chrome on top (~18%) and bottom
// (~40%) of the video. Anything we place there is invisible to viewers.
// This layout keeps shopping UI inside a middle "safe band" only:
//   - Featured product + catalog badge (right)
//   - KiDi+ comments (left)
// Host controls (Terminer, Diffuser, mic…) are intentionally NOT shown.

import { useEffect, useMemo, useState } from "react";
import { Eye, Package, Timer } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLiveRoom } from "@/lib/live-room";
import { formatMoney, normalizeCurrency } from "@/lib/money";
import type { LiveProductRow } from "@/lib/lives-db";
import { signalLivekitEgressStartRecording } from "@/lib/broadcast-egress-signal";
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

/** Vertical safe band as % of frame — clear of YouTube header + chat. */
const SAFE_TOP = "18%";
const SAFE_BOTTOM = "42%";

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

  // Last KiDi+ chat lines for the safe band (skip empty / join noise).
  const chatLines = useMemo(() => {
    return room.chat
      .filter((c) => {
        if (c.systemKind === "join") return false;
        if (!c.text?.trim()) return false;
        return true;
      })
      .slice(-7);
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

      {/* ── Safe band (between YouTube header & YouTube chat) ── */}
      <div
        className="pointer-events-none absolute inset-x-0 z-30 flex flex-col justify-between px-3"
        style={{ top: SAFE_TOP, bottom: SAFE_BOTTOM }}
      >
        {/* Row 1: brand + viewers + catalog badge */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 rounded-2xl px-2.5 py-1.5"
            style={{ background: "rgba(0,0,0,0.45)" }}
          >
            <div className="flex items-center gap-1.5">
              <span
                className="rounded px-1 py-0.5 text-[9px] font-black uppercase tracking-wide"
                style={{ background: "oklch(0.62 0.24 25)" }}
              >
                Live
              </span>
              <span className="truncate text-[13px] font-bold">{hostName}</span>
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-white/85">
              <span className="inline-flex items-center gap-1 font-semibold tabular-nums">
                <Eye size={11} /> {displayViewers}
              </span>
              <span>KiDi+</span>
              {title ? <span className="truncate opacity-80">· {title}</span> : null}
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            {/* Catalog chip — same Package badge as host, but in the safe band */}
            <div
              className="relative flex h-10 w-10 items-center justify-center rounded-full"
              style={{ background: "rgba(0,0,0,0.55)" }}
              aria-label={t("live.products", "Produits")}
            >
              <Package size={18} />
              {room.products.length > 0 && (
                <span
                  className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-black text-[#10162B]"
                  style={{ background: "oklch(0.85 0.18 90)" }}
                >
                  {room.products.length > 9 ? "9+" : room.products.length}
                </span>
              )}
            </div>

            {/* Featured product — larger, always in safe band */}
            {featured && (
              <div
                className="w-[9.5rem] rounded-2xl p-2"
                style={{
                  background: "rgba(0,0,0,0.62)",
                  border: "1px solid rgba(255,255,255,0.16)",
                }}
              >
                <div className="relative mb-1.5">
                  <LiveProductImage
                    src={imgFor(featured)}
                    className="h-[4.5rem] w-full rounded-xl object-cover"
                    iconClassName="text-white/60"
                  />
                  <span className="absolute left-1 top-1 rounded-full bg-white px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-[#10162B]">
                    {t("live.featured", "EN VEDETTE")}
                  </span>
                  {auctionOnFeatured && (
                    <span
                      className="absolute bottom-1 right-1 flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-black tabular-nums"
                      style={{
                        background:
                          secondsLeft <= 10
                            ? "oklch(0.82 0.14 85)"
                            : "rgba(0,0,0,0.75)",
                        color: secondsLeft <= 10 ? "#10162B" : "white",
                      }}
                    >
                      <Timer size={10} />
                      {mm}:{ss}
                    </span>
                  )}
                </div>
                <div className="truncate text-[12px] font-bold leading-tight">
                  {featured.name}
                </div>
                {auctionOnFeatured ? (
                  <>
                    <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-white/65">
                      {t("live.currentBid", "Enchère")}
                    </div>
                    <div className="text-[15px] font-black tabular-nums">
                      {fmt(Number(featured.price))}
                    </div>
                    {room.lastBid?.productId === featured.id && (
                      <div className="truncate text-[10px] text-white/75">
                        @{room.lastBid.bidderName}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="mt-0.5 text-[12px] font-bold tabular-nums text-white/95">
                    {featured.mode === "auction"
                      ? `${fmt(Number(featured.start_price))} · ${featured.timer_seconds}s`
                      : `${fmt(Number(featured.price))} · stock ${Math.max(0, featured.stock)}`}
                  </div>
                )}
                <div
                  className="mt-1.5 rounded-lg py-1 text-center text-[10px] font-black uppercase tracking-wide"
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
        </div>

        {/* Row 2: KiDi+ comments — large, high-contrast, left column */}
        <div className="mt-2 max-w-[70%] space-y-1.5 self-start">
          <div
            className="inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white/90"
            style={{ background: "rgba(0,0,0,0.4)" }}
          >
            {t("broadcast.egress.kidiChat", "Chat KiDi+")}
          </div>
          {chatLines.length === 0 ? (
            <div
              className="rounded-xl px-2.5 py-2 text-[12px] font-semibold text-white/85"
              style={{ background: "rgba(0,0,0,0.45)" }}
            >
              {t(
                "broadcast.egress.chatWaiting",
                "Les commentaires KiDi+ apparaîtront ici",
              )}
            </div>
          ) : (
            chatLines.map((c) => (
              <div
                key={c.id}
                className="rounded-xl px-2.5 py-1.5"
                style={{ background: "rgba(0,0,0,0.5)" }}
              >
                {c.system ? (
                  <p className="text-[12px] font-semibold text-white/90">
                    {c.text}
                  </p>
                ) : (
                  <p className="text-[12px] leading-snug">
                    <span
                      className="font-bold"
                      style={{ color: c.color || "oklch(0.85 0.12 85)" }}
                    >
                      {c.isHost
                        ? `${c.user} [HOST]`
                        : c.user}
                    </span>{" "}
                    <span className="text-white/95">{c.text}</span>
                  </p>
                )}
              </div>
            ))
          )}
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
