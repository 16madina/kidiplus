import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useLiveEffects } from "@/lib/filters/live-effects-context";
import {
  LiveEffectsCompositor,
  loadImageFromUrl,
} from "@/lib/filters/live-effects-compositor";

export function LiveEffectsPreview({
  stream,
  mirrored,
}: {
  stream: MediaStream | null;
  mirrored: boolean;
}) {
  const {
    backgroundUrl,
    backgroundMode,
    posterUrl,
    posterMode,
    posterTransform,
    hasEffects,
    markBackgroundUnavailable,
  } = useLiveEffects();
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const compRef = useRef(new LiveEffectsCompositor());
  const transformRef = useRef(posterTransform);
  transformRef.current = posterTransform;

  useEffect(() => {
    if (!hasEffects || !stream) return;
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "true");
    video.srcObject = stream;
    videoRef.current = video;
    void video.play().catch(() => undefined);

    const comp = compRef.current;
    comp.mirror = mirrored;
    comp.onUnavailable = () => {
      toast.error(
        t(
          "broadcast.effects.unavailable",
          "Arrière-plan indisponible sur cet appareil",
        ),
        { id: "bg-unavailable" },
      );
      markBackgroundUnavailable();
    };
    void comp.warmup();

    let raf = 0;
    let alive = true;
    const tick = () => {
      if (!alive) return;
      const canvas = canvasRef.current;
      const tr = transformRef.current;
      comp.posterX = tr.x;
      comp.posterY = tr.y;
      comp.posterScale = tr.scale;
      if (canvas && video.videoWidth) void comp.draw(video, canvas);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      try {
        video.pause();
        video.srcObject = null;
      } catch {
        /* ignore */
      }
      videoRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasEffects, stream, mirrored]);

  useEffect(() => {
    const comp = compRef.current;
    comp.mirror = mirrored;
    let cancelled = false;
    void (async () => {
      try {
        comp.background = backgroundUrl ? await loadImageFromUrl(backgroundUrl) : null;
        comp.backgroundMode = comp.background
          ? backgroundMode
          : backgroundMode === "image"
            ? "blur"
            : backgroundMode;
      } catch {
        if (!cancelled) comp.background = null;
      }
      try {
        comp.poster = posterUrl ? await loadImageFromUrl(posterUrl) : null;
      } catch {
        if (!cancelled) comp.poster = null;
      }
      if (!cancelled) {
        comp.posterMode = posterMode;
        const tr = transformRef.current;
        comp.posterX = tr.x;
        comp.posterY = tr.y;
        comp.posterScale = tr.scale;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [backgroundUrl, backgroundMode, posterUrl, posterMode, mirrored]);

  if (!hasEffects) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full object-cover"
    />
  );
}
