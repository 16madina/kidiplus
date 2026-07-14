import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Eye, Clock, CalendarClock } from "lucide-react";
import { Press } from "./press";
import { EASE_IOS } from "@/lib/motion";
import { formatViewers, type LiveStream } from "@/lib/live-mock";

export function LiveCard({
  stream,
  index,
  onPress,
}: {
  stream: LiveStream;
  index: number;
  onPress?: (s: LiveStream) => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setAvatarFailed(false);
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth > 0) setLoaded(true);
  }, [stream.thumbnail, stream.avatar]);

  const sellerInitial = (stream.seller.trim()[0] || "?").toUpperCase();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.2,
        ease: EASE_IOS,
        delay: Math.min(index, 12) * 0.03,
      }}
      className="relative"
    >
      <Press
        onClick={() => onPress?.(stream)}
        className="!block h-full w-full overflow-hidden rounded-2xl bg-muted p-0"
        style={{ aspectRatio: "3 / 4" }}
      >
        {/* skeleton behind image */}
        {!loaded && (
          <span className="skeleton absolute inset-0" aria-hidden />
        )}

        <img
          ref={imgRef}
          src={stream.thumbnail}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          data-loaded={loaded || undefined}
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />

        {/* top badges (single left-anchored row so nothing overlaps viewers) */}
        <div className="absolute left-2 right-2 top-2 z-10 flex items-center gap-1.5">
          {stream.scheduled ? (
            <span
              className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
              style={{ backgroundColor: "oklch(0.55 0.16 260)" }}
            >
              <CalendarClock size={11} strokeWidth={2.6} />
              Programmé
            </span>
          ) : (
            <>
              <span
                className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
                style={{ backgroundColor: "var(--live)" }}
              >
                <motion.span
                  className="h-1.5 w-1.5 rounded-full bg-white"
                  animate={{ opacity: [1, 0.35, 1], scale: [1, 0.85, 1] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                />
                Live
              </span>
              <span
                className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-white"
                style={{
                  backgroundColor: "rgba(0,0,0,0.45)",
                  backdropFilter: "blur(10px)",
                  WebkitBackdropFilter: "blur(10px)",
                }}
              >
                <Eye size={11} strokeWidth={2.4} />
                {formatViewers(stream.viewers)}
              </span>
            </>
          )}
          {((stream.scheduled && stream.startsInMin) || stream.endsInMin) && (
            <span
              className="ml-auto flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-white"
              style={{
                backgroundColor: "rgba(0,0,0,0.5)",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
              }}
            >
              <Clock size={11} strokeWidth={2.4} />
              {stream.scheduled
                ? formatMin(stream.startsInMin!)
                : formatMin(stream.endsInMin!)}
            </span>
          )}
        </div>


        {/* bottom gradient + seller */}
        <div
          className="absolute inset-x-0 bottom-0 z-10 p-2.5 pt-10 text-left"
          style={{
            backgroundImage:
              "linear-gradient(to top, rgba(0,0,0,0.62), rgba(0,0,0,0))",
          }}
        >
          <div className="flex items-center gap-1.5">
            {!avatarFailed ? (
              <img
                src={stream.avatar}
                alt=""
                className="h-6 w-6 shrink-0 rounded-full object-cover ring-1 ring-white/90"
                loading="lazy"
                onLoad={(e) => e.currentTarget.setAttribute("data-loaded", "true")}
                onError={() => setAvatarFailed(true)}
                draggable={false}
              />
            ) : (
              <span
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-black ring-1 ring-white/90"
                style={{ backgroundColor: "var(--accent)", color: "var(--accent-foreground)" }}
              >
                {sellerInitial}
              </span>
            )}
            <span className="min-w-0 truncate text-[13px] font-semibold text-white">
              {stream.seller}
            </span>
          </div>
          <p
            className="mt-1 text-[12px] leading-snug text-white/80"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {stream.title}
          </p>
        </div>
      </Press>
    </motion.div>
  );
}

export function LiveCardSkeleton() {
  return (
    <div
      className="skeleton w-full rounded-2xl"
      style={{ aspectRatio: "3 / 4" }}
    />
  );
}

function formatMin(min: number): string {
  if (min >= 60) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m === 0 ? `${h} h` : `${h} h ${m}`;
  }
  return `${min} min`;
}
