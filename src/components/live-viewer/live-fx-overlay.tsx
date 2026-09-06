import { liveFxHasVisual, posterTransformOf, type LiveFxPayload } from "@/lib/live-fx";

const POSTER_WIDTH = 200;
const POSTER_HEIGHT = 160;

/** Read-only reconstruction of the host's non-video live effects. */
export function LiveFxOverlay({ fx }: { fx: LiveFxPayload }) {
  if (!liveFxHasVisual(fx)) return null;

  const poster = posterTransformOf(fx);
  const showPoster = fx.posterMode === "cover" && !!fx.posterUrl;
  const tint = fx.tint !== "transparent" ? fx.tint : null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[8] overflow-hidden">
      {fx.backgroundMode === "blur" ? (
        <div
          className="absolute inset-0"
          style={{
            backgroundColor: "rgba(12,14,24,0.18)",
            backdropFilter: "blur(18px)",
            WebkitBackdropFilter: "blur(18px)",
          }}
        />
      ) : null}
      {tint ? <div className="absolute inset-0" style={{ backgroundColor: tint }} /> : null}
      {showPoster ? (
        <div
          className="absolute overflow-hidden rounded-xl border-2 bg-black/25"
          style={{
            width: POSTER_WIDTH,
            height: POSTER_HEIGHT,
            left: `${poster.x * 100}%`,
            top: `${poster.y * 100}%`,
            marginLeft: -POSTER_WIDTH / 2,
            marginTop: -POSTER_HEIGHT / 2,
            transform: `scale(${poster.scale})`,
            borderColor: "rgba(232,185,59,0.85)",
          }}
        >
          <img
            src={fx.posterUrl!}
            alt=""
            draggable={false}
            className="h-full w-full object-contain"
          />
        </div>
      ) : null}
    </div>
  );
}
