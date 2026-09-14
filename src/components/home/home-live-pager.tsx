import { useEffect, useMemo, useRef, useState } from "react";
import { Radio, Users, Volume2, VolumeX, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Press } from "@/components/press";
import { VitrineVerticalPager } from "@/components/vitrine/vitrine-vertical-pager";
import { ViewerLiveVideo } from "@/components/live-viewer/viewer-live-video";
import { haptic } from "@/lib/haptics";
import type { LiveStream } from "@/lib/live-mock";

/**
 * TikTok-style full-screen browsing of the home feed.
 *
 * This is a PREVIEW surface: the viewer watches the stream but does not
 * "enter" it — no chat, no auctions, no gifts, no presence. Tapping
 * "Rejoindre le live" hands over to the real live viewer, where swiping
 * does join each live.
 */
export function HomeLivePager({
  streams,
  startIndex = 0,
  onClose,
  onEnter,
}: {
  streams: LiveStream[];
  startIndex?: number;
  onClose: () => void;
  onEnter: (index: number) => void;
}) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(() =>
    Math.min(Math.max(startIndex, 0), Math.max(streams.length - 1, 0)),
  );
  const [soundOn, setSoundOn] = useState(false);
  // Stable per-session identity so the preview never collides with the
  // real viewer identity used after joining.
  const identity = useRef(
    `preview_${Math.random().toString(36).slice(2, 10)}`,
  ).current;

  useEffect(() => {
    if (index > streams.length - 1) setIndex(Math.max(streams.length - 1, 0));
  }, [streams.length, index]);

  const count = streams.length;
  const current = streams[index];

  const covers = useMemo(
    () => streams.map((s) => bigCover(s.thumbnail)),
    [streams],
  );

  if (!count || !current) return null;

  return (
    <div className="absolute inset-0 z-[45] bg-black">
      <VitrineVerticalPager count={count} index={index} onIndexChange={setIndex}>
        {(i) => {
          const s = streams[i];
          if (!s) return null;
          return (
            <HomeLiveSlide
              stream={s}
              cover={covers[i] ?? s.thumbnail}
              active={i === index}
              identity={identity}
              muted={!soundOn}
              onEnter={() => {
                haptic.medium();
                onEnter(i);
              }}
            />
          );
        }}
      </VitrineVerticalPager>

      {/* Top chrome — close + sound */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-[50] flex items-center justify-between px-3 pt-safe"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 8px)" }}
      >
        <Press
          aria-label={t("home.immersive.exit", "Revenir aux cartes")}
          onClick={() => {
            haptic.light();
            onClose();
          }}
          className="pointer-events-auto grid h-10 w-10 place-items-center rounded-full text-white"
          style={{ backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(12px)" }}
        >
          <X size={20} strokeWidth={2.2} />
        </Press>
        <Press
          aria-label={
            soundOn
              ? t("home.immersive.soundOff", "Couper le son")
              : t("home.immersive.soundOn", "Activer le son")
          }
          onClick={() => {
            haptic.light();
            setSoundOn((v) => !v);
          }}
          className="pointer-events-auto grid h-10 w-10 place-items-center rounded-full text-white"
          style={{ backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(12px)" }}
        >
          {soundOn ? <Volume2 size={19} strokeWidth={2.2} /> : <VolumeX size={19} strokeWidth={2.2} />}
        </Press>
      </div>
    </div>
  );
}

function bigCover(url: string): string {
  if (!url) return url;
  return url.includes("w=600") ? url.replace("w=600", "w=1200") : url;
}

function HomeLiveSlide({
  stream,
  cover,
  active,
  identity,
  muted,
  onEnter,
}: {
  stream: LiveStream;
  cover: string;
  active: boolean;
  identity: string;
  muted: boolean;
  onEnter: () => void;
}) {
  const { t } = useTranslation();
  // Only genuinely running lives get a video preview; scheduled and sample
  // cards keep their cover image.
  const canPreview = !!stream.roomName && !stream.scheduled && !stream.fictitious;

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <img
        src={cover}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
        style={{ pointerEvents: "none" }}
      />
      {canPreview && active ? (
        <div className="absolute inset-0">
          <ViewerLiveVideo
            room={stream.roomName!}
            identity={identity}
            posterImage={cover}
            muted={muted}
          />
        </div>
      ) : null}

      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[10]"
        style={{
          height: "48%",
          backgroundImage: "linear-gradient(to top, rgba(0,0,0,0.85), transparent)",
        }}
      />

      <div
        className="absolute left-3 z-[20] flex items-center gap-2"
        style={{ top: "calc(env(safe-area-inset-top) + 60px)" }}
      >
        {stream.scheduled ? (
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white"
            style={{ background: "oklch(0.55 0.16 260)" }}
          >
            {t("vitrine.badge.scheduled", "Programmé")}
          </span>
        ) : (
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white"
            style={{ background: "oklch(0.55 0.22 25)" }}
          >
            LIVE
          </span>
        )}
        <span className="flex items-center gap-1 rounded-full bg-black/45 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
          <Users size={12} />
          {stream.viewers}
        </span>
      </div>

      <div
        className="absolute inset-x-0 bottom-0 z-[20] px-4"
        style={{ paddingBottom: "calc(6rem + env(safe-area-inset-bottom))" }}
        onPointerDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          {stream.avatar ? (
            <img
              src={stream.avatar}
              alt=""
              className="h-10 w-10 rounded-full object-cover ring-2 ring-white/80"
              draggable={false}
            />
          ) : null}
          <p
            className="truncate text-[16px] font-bold text-white"
            style={{ textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}
          >
            {stream.seller}
          </p>
        </div>
        <p
          className="mt-1 line-clamp-2 text-[14px] text-white/90"
          style={{ textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}
        >
          {stream.title}
        </p>
        <Press
          onClick={onEnter}
          className="!min-h-12 mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-bold text-[#10162B]"
          style={{ background: "#E8B93B" }}
        >
          <Radio size={17} />
          {t("home.immersive.join", "Rejoindre le live")}
        </Press>
      </div>
    </div>
  );
}
