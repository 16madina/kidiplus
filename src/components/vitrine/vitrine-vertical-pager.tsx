import { useContext, useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play } from "lucide-react";
import { motion, animate, useMotionValue } from "framer-motion";
import { EASE_IOS } from "@/lib/motion";
import { haptic } from "@/lib/haptics";
import { isVideoUrl } from "@/lib/vitrine-db";
import { reportBrokenMedia } from "@/lib/vitrine-broken-media";
import { Fit916 } from "@/components/vitrine/media-preview-916";
import type { VitrineMusic } from "@/lib/vitrine-music";
import { unlockVitrineSound, useVitrineSound } from "@/lib/vitrine-sound";
import { useAppActive } from "@/lib/app-state";
import { useTranslation } from "react-i18next";
import {
  isVitrinePlaybackSuspended,
  subscribeVitrinePlayback,
  suspendVitrinePlayback,
  resumeVitrinePlayback,
} from "@/lib/vitrine-playback";
import { TabVisibilityContext } from "@/components/app-shell";

export const VITRINE_TOGGLE_PAUSE_EVENT = "kidi:vitrine-toggle-pause";

export function VitrineVerticalPager({
  count,
  index,
  onIndexChange,
  onPullReveal,
  onSwipeCategory,
  children,
}: {
  count: number;
  index: number;
  onIndexChange: (i: number) => void;
  /** Pull down past threshold while on the first item → reveal stories chrome. */
  onPullReveal?: () => void;
  /** Strong horizontal swipe → change Vitrine category (left = next, right = prev). */
  onSwipeCategory?: (dir: "left" | "right") => void;
  children: (i: number) => React.ReactNode;
}) {
  const dragY = useMotionValue(0);
  const dragX = useMotionValue(0);
  const hasNext = index < count - 1;
  const hasPrev = index > 0;

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <motion.div
        className="absolute inset-0"
        style={{
          touchAction: "none",
          x: dragX,
          y: dragY,
          WebkitUserSelect: "none",
          userSelect: "none",
        }}
        onPointerDown={() => unlockVitrineSound()}
        drag
        dragDirectionLock
        dragElastic={0.35}
        dragConstraints={{ top: 0, bottom: 0, left: 0, right: 0 }}
        dragMomentum={false}
        onTap={(e) => {
          const t = e.target as HTMLElement | null;
          if (t?.closest?.("button, a, textarea, input, [data-no-pause]")) return;
          // TikTok: le tap débloque le son (geste utilisateur) ET met en pause / relance.
          unlockVitrineSound();
          try {
            window.dispatchEvent(new CustomEvent(VITRINE_TOGGLE_PAUSE_EVENT));
          } catch {
            /* ignore */
          }
        }}
        onDrag={(_, info) => {
          const absX = Math.abs(info.offset.x);
          const absY = Math.abs(info.offset.y);
          if (absX > absY) {
            dragX.set(info.offset.x);
            dragY.set(0);
          } else {
            dragY.set(info.offset.y);
            dragX.set(0);
          }
        }}
        onDragEnd={(_, info) => {
          unlockVitrineSound();
          const absY = Math.abs(info.offset.y);
          const absX = Math.abs(info.offset.x);
          const h = typeof window !== "undefined" ? window.innerHeight : 800;
          const w = typeof window !== "undefined" ? window.innerWidth : 390;

          const horizontal =
            absX > absY * 1.05 &&
            (absX > 64 || Math.abs(info.velocity.x) > 400);
          if (horizontal && onSwipeCategory) {
            const dir = info.offset.x < 0 ? "left" : "right";
            haptic.selection();
            void animate(dragX, dir === "left" ? -w * 0.35 : w * 0.35, {
              duration: 0.16,
              ease: EASE_IOS,
            }).then(() => {
              dragX.set(0);
              dragY.set(0);
              onSwipeCategory(dir);
            });
            return;
          }

          const strong = absY > 80 || Math.abs(info.velocity.y) > 450;
          const up = info.offset.y < 0;
          const down = info.offset.y > 0;

          if (down && strong && !hasPrev) {
            dragY.set(0);
            dragX.set(0);
            if (onPullReveal) {
              haptic.light();
              onPullReveal();
            } else {
              animate(dragY, 0, { duration: 0.2, ease: EASE_IOS });
            }
            return;
          }

          if (up && strong && hasNext) {
            haptic.selection();
            void animate(dragY, -h, { duration: 0.22, ease: EASE_IOS }).then(() => {
              dragY.set(0);
              dragX.set(0);
              onIndexChange(index + 1);
            });
            return;
          }
          if (!up && strong && hasPrev) {
            haptic.selection();
            void animate(dragY, h, { duration: 0.22, ease: EASE_IOS }).then(() => {
              dragY.set(0);
              dragX.set(0);
              onIndexChange(index - 1);
            });
            return;
          }
          animate(dragY, 0, { duration: 0.22, ease: EASE_IOS });
          animate(dragX, 0, { duration: 0.22, ease: EASE_IOS });
        }}
      >
        {[-1, 0, 1].map((offset) => {
          const i = index + offset;
          if (i < 0 || i >= count) return null;
          return (
            <div
              key={i}
              className="absolute inset-0"
              style={{
                transform: `translateY(${offset * 100}%)`,
                pointerEvents: offset === 0 ? "auto" : "none",
              }}
              aria-hidden={offset !== 0}
            >
              {children(i)}
            </div>
          );
        })}
      </motion.div>
    </div>
  );
}

function MediaSlide({
  url,
  poster,
  className: _className,
  forceVideo,
  muted,
  playing,
  eager = true,
  volume = 1,
}: {
  url: string;
  /** Vignette légère affichée instantanément (vidéos). */
  poster?: string | null;
  className?: string;
  forceVideo?: boolean;
  muted: boolean;
  /** Volume du son d'origine (0 quand une musique le remplace). */
  volume?: number;
  /** When false, video is paused (left tab / app background / user tap). */
  playing: boolean;
  /** Attach src / start buffering. Off-screen slides stay cheap. */
  eager?: boolean;
}) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const asVideo = forceVideo || isVideoUrl(url);
  const [suspended, setSuspended] = useState(() => isVitrinePlaybackSuspended());
  const [status, setStatus] = useState<
    "loading" | "ready" | "error" | "stalled"
  >("loading");
  const [errorKind, setErrorKind] = useState<"format" | "network">("network");
  const [reloadKey, setReloadKey] = useState(0);
  // Reset status during render when the url changes (an effect would race with
  // an onLoad already fired for a cached image → spinner stuck forever).
  const [statusUrl, setStatusUrl] = useState(url);
  if (statusUrl !== url) {
    setStatusUrl(url);
    setStatus("loading");
  }

  useEffect(() => subscribeVitrinePlayback(() => {
    setSuspended(isVitrinePlaybackSuspended());
  }), []);

  // Only legacy QuickTime/HEVC uploads (.mov filmed on iPhone) can be truly
  // undecodable on Chrome/Android. MP4 files are never rejected up-front.
  useEffect(() => {
    if (!asVideo || typeof document === "undefined") return;
    if (!/\.(mov|qt|3gp|avi|wmv|mkv)(\?|#|$)/i.test(url)) return;
    const probe = document.createElement("video");
    const guesses = ["video/quicktime", 'video/mp4; codecs="hvc1"', "video/mp4"];
    const playable = guesses.some((type) => probe.canPlayType(type) !== "");
    if (!playable) {
      setErrorKind("format");
      setStatus("error");
      reportBrokenMedia(url);
    }
  }, [asVideo, url]);

  // Safety net: never leave a spinner up forever. A slow/stalled decode is NOT
  // a format failure — show the poster with a retry affordance instead.
  useEffect(() => {
    if (status !== "loading" || !eager) return;
    const t = window.setTimeout(
      () => setStatus((s) => (s !== "loading" ? s : asVideo ? "stalled" : "ready")),
      8000,
    );
    return () => window.clearTimeout(t);
  }, [status, eager, url, asVideo]);

  const retryMedia = () => {
    setStatus("loading");
    setReloadKey((k) => k + 1);
    const v = videoRef.current;
    if (v) {
      try {
        v.load();
        void v.play().catch(() => undefined);
      } catch {
        /* ignore */
      }
    }
  };



  const shouldPlay = playing && !suspended && eager;
  const [blocked, setBlocked] = useState(false);

  // Démarrage instantané façon TikTok : on démarre TOUJOURS en muet (seule
  // façon d'obtenir l'autoplay sur Chrome/Firefox/iOS/Android), puis on
  // réactive le son de façon impérative une fois la lecture lancée.
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !asVideo) return;
    if (!shouldPlay) {
      try {
        el.pause();
        el.muted = true;
        el.volume = 0;
      } catch {
        /* ignore */
      }
      return;
    }

    let cancelled = false;
    const wantsSound = !muted && volume > 0.001;

    const applySound = (v: HTMLVideoElement) => {
      if (!wantsSound) return;
      try {
        v.muted = false;
        v.volume = volume;
      } catch {
        /* ignore */
      }
      // Certains navigateurs mettent la vidéo en pause en la démutant.
      if (v.paused) {
        void v.play().catch(() => {
          try {
            v.muted = true;
            v.volume = 0;
            void v.play().catch(() => undefined);
          } catch {
            /* ignore */
          }
        });
      }
    };

    const attempt = async () => {
      if (cancelled) return;
      const v = videoRef.current;
      if (!v) return;
      if (!v.paused) {
        applySound(v);
        return;
      }
      // Toujours tenter muet d'abord : garanti par les politiques d'autoplay.
      v.muted = true;
      v.volume = 0;
      try {
        await v.play();
        if (cancelled) return;
        setBlocked(false);
        applySound(v);
      } catch {
        if (!cancelled) setBlocked(true);
      }
    };

    void attempt();
    const events = ["loadedmetadata", "loadeddata", "canplay", "canplaythrough"];
    const onReady = () => void attempt();
    events.forEach((e) => el.addEventListener(e, onReady));
    const retry = window.setInterval(() => void attempt(), 300);
    const stopRetry = window.setTimeout(() => window.clearInterval(retry), 4000);

    return () => {
      cancelled = true;
      events.forEach((e) => el.removeEventListener(e, onReady));
      window.clearInterval(retry);
      window.clearTimeout(stopRetry);
    };
  }, [url, asVideo, muted, shouldPlay, volume, reloadKey]);



  // Hard-stop on unmount so audio never leaks after leaving Vitrine.
  useEffect(() => {
    const el = videoRef.current;
    return () => {
      if (!el) return;
      try {
        el.pause();
        el.muted = true;
        el.volume = 0;
        el.removeAttribute("src");
        el.load();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const overlay =
    status === "error" ? (
      <div className="absolute inset-0 z-[5]">
        {asVideo && poster ? (
          <img
            src={poster}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover"
            draggable={false}
            decoding="async"
          />
        ) : null}
        <div className="absolute inset-0 grid place-items-center bg-black/60 px-8 text-center">
          <p className="text-[14px] font-medium text-white/75">
            {asVideo
              ? t("vitrine.videoUnsupported", {
                  defaultValue: "Vidéo illisible sur cet appareil (format non supporté)",
                })
              : t("vitrine.mediaUnavailable", { defaultValue: "Média indisponible" })}
          </p>
        </div>
      </div>



    ) : status === "loading" && eager ? (
      <div className="absolute inset-0 z-[5] grid place-items-center bg-black/40">
        <Loader2 className="animate-spin text-white/70" size={28} />
      </div>
    ) : null;

  const mediaClass =
    "absolute inset-0 h-full w-full object-cover";

  if (asVideo) {
    return (
      <div className="relative h-full w-full">
        <Fit916
          backdrop={
            poster ? (
              <img
                src={poster}
                alt=""
                aria-hidden
                className="absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-2xl"
                draggable={false}
                decoding="async"
                loading="lazy"
              />
            ) : null
          }
        >
          {!eager && poster && (
            <img
              src={poster}
              alt=""
              aria-hidden
              className={mediaClass}
              draggable={false}
              decoding="async"
              loading="lazy"
            />
          )}
          {eager && (
            <video
              ref={videoRef}
              data-vitrine-feed
              src={url}
              poster={poster ?? undefined}
              className={mediaClass}
              autoPlay
              muted={muted || !shouldPlay || volume <= 0.001}
              loop
              playsInline
              preload="auto"
              controls={false}
              onLoadedMetadata={() => setStatus("ready")}
              onLoadedData={() => setStatus("ready")}
              onCanPlay={() => setStatus("ready")}
              onPlaying={() => {
                setStatus("ready");
                setBlocked(false);
              }}
              onError={() => {
                setStatus("error");
                reportBrokenMedia(url);
              }}
              style={{ pointerEvents: "none", touchAction: "none" }}
            />
          )}
        </Fit916>
        {overlay}
        {asVideo && blocked && shouldPlay && status !== "error" && (
          <button
            type="button"
            data-no-pause
            aria-label="Play"
            onClick={(e) => {
              e.stopPropagation();
              const v = videoRef.current;
              if (!v) return;
              v.muted = muted || volume <= 0.001;
              v.volume = v.muted ? 0 : volume;
              void v.play().then(() => setBlocked(false)).catch(() => {
                v.muted = true;
                void v.play().then(() => setBlocked(false)).catch(() => undefined);
              });
            }}
            className="absolute inset-0 z-[15] grid place-items-center"
          >
            <span className="grid h-16 w-16 place-items-center rounded-full bg-black/45 text-white">
              <Play size={28} fill="white" />
            </span>
          </button>
        )}
      </div>

    );
  }
  return (
    <div className="relative h-full w-full">
      <Fit916
        backdrop={
          eager ? (
            <img
              src={url}
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-2xl"
              draggable={false}
              decoding="async"
            />
          ) : null
        }
      >
        {eager && (
          <img
            ref={(el) => {
              // Cached images can finish before React binds onLoad.
              if (el?.complete && el.naturalWidth > 0) setStatus("ready");
            }}
            src={url}
            alt=""
            className={mediaClass}
            draggable={false}
            decoding="async"
            loading={eager ? "eager" : "lazy"}
            onLoad={() => setStatus("ready")}
            onError={() => {
              setStatus("error");
              reportBrokenMedia(url);
            }}
            style={{ pointerEvents: "none", touchAction: "none" }}
          />
        )}
      </Fit916>
      {overlay}
    </div>
  );
}


/** Horizontal photo/video carousel — only for multi-media posts; isolated from tab swipes. */
export function MediaCarousel({
  urls,
  poster,
  className,
  forceVideo,
  active = true,
  music,
}: {
  urls: string[];
  poster?: string | null;
  className?: string;
  /** Musique ajoutée à la publication (jouée en boucle). */
  music?: VitrineMusic | null;
  /** When post.media_type is video, treat slides as video even if extension is odd. */
  forceVideo?: boolean;
  /** False for off-screen / prefetched neighbour cards. */
  active?: boolean;
}) {
  const [i, setI] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [showPauseHint, setShowPauseHint] = useState(false);
  const hintTimer = useRef<number | null>(null);
  const tabVisible = useContext(TabVisibilityContext);
  const appActive = useAppActive();
  const [muted] = useVitrineSound();
  const hasVideo = !!forceVideo || urls.some((u) => isVideoUrl(u));
  const playing = active && tabVisible && appActive && !userPaused;
  const originalVolume = music ? music.originalVolume : 1;

  // Reset pause when the slide set changes (new post).
  useEffect(() => {
    setUserPaused(false);
  }, [urls[0], forceVideo]);

  useEffect(() => {
    const onToggle = () => {
      if (!hasVideo) return;
      setUserPaused((p) => {
        const next = !p;
        haptic.light();
        setShowPauseHint(true);
        if (hintTimer.current != null) window.clearTimeout(hintTimer.current);
        hintTimer.current = window.setTimeout(() => setShowPauseHint(false), 700);
        return next;
      });
    };
    window.addEventListener(VITRINE_TOGGLE_PAUSE_EVENT, onToggle);
    return () => {
      window.removeEventListener(VITRINE_TOGGLE_PAUSE_EVENT, onToggle);
      if (hintTimer.current != null) window.clearTimeout(hintTimer.current);
    };
  }, [hasVideo]);

  // Leaving Vitrine / backgrounding: hard-stop audio (does not clear Publish suspend).
  useEffect(() => {
    if (tabVisible && appActive) {
      resumeVitrinePlayback("tab");
      return;
    }
    setUserPaused(false);
    suspendVitrinePlayback("tab");
  }, [tabVisible, appActive]);

  if (urls.length === 0) {
    return <div className={className} style={{ background: "#1C2440" }} />;
  }

  const body =
    urls.length === 1 ? (
      <MediaSlide
        url={urls[0]!}
        poster={poster}
        className={className}
        forceVideo={forceVideo}
        muted={muted}
        playing={playing}
        volume={originalVolume}
        eager
      />
    ) : (
      <div
        className="relative h-full w-full"
        onPointerDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <div
          className="flex h-full w-full snap-x snap-mandatory overflow-x-auto"
          style={{
            WebkitOverflowScrolling: "touch",
            scrollSnapType: "x mandatory",
            touchAction: "pan-x",
          }}
          onScroll={(e) => {
            const el = e.currentTarget;
            const w = el.clientWidth || 1;
            setI(Math.round(el.scrollLeft / w));
          }}
        >
          {urls.map((u, idx) => (
            <div key={u} className="h-full w-full shrink-0 snap-center">
              <MediaSlide
                url={u}
                poster={idx === 0 ? poster : null}
                className="h-full w-full object-cover"
                forceVideo={forceVideo}
                muted={muted}
                volume={originalVolume}
                playing={playing && idx === i}
                eager={active && Math.abs(idx - i) <= 1}
              />
            </div>
          ))}
        </div>
        <div className="pointer-events-none absolute bottom-28 left-0 right-0 z-10 flex justify-center gap-1">
          {urls.map((_, idx) => (
            <span
              key={idx}
              className="h-1 w-1 rounded-full"
              style={{
                background: idx === i ? "#E8B93B" : "rgba(255,255,255,0.45)",
              }}
            />
          ))}
        </div>
      </div>
    );

  return (
    <div className="relative h-full w-full">
      {body}
      {music?.url && (
        <MusicTrack music={music} playing={playing && !muted} />
      )}
      {hasVideo && showPauseHint && (
        <div className="pointer-events-none absolute inset-0 z-[20] grid place-items-center">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-black/45 text-white">
            {userPaused ? <Play size={28} fill="white" /> : <Pause size={28} fill="white" />}
          </span>
        </div>
      )}
      {hasVideo && userPaused && !showPauseHint && (
        <div className="pointer-events-none absolute inset-0 z-[20] grid place-items-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-black/35 text-white">
            <Play size={26} fill="white" />
          </span>
        </div>
      )}
    </div>
  );
}

/** Piste musicale d'une publication — jouée en boucle avec le média. */
export function MusicTrack({
  music,
  playing,
}: {
  music: VitrineMusic;
  playing: boolean;
}) {
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.volume = Math.min(1, Math.max(0, music.volume));
    if (!playing) {
      try {
        el.pause();
      } catch {
        /* ignore */
      }
      return;
    }
    if (el.currentTime < music.startSec - 0.5) {
      try {
        el.currentTime = music.startSec;
      } catch {
        /* ignore */
      }
    }
    void el.play().catch(() => undefined);
  }, [playing, music.volume, music.startSec, music.url]);

  useEffect(() => {
    const el = ref.current;
    return () => {
      try {
        el?.pause();
      } catch {
        /* ignore */
      }
    };
  }, []);

  return <audio ref={ref} src={music.url} loop preload="none" />;
}
