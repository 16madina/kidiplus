import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { useLiveEffects } from "@/lib/filters/live-effects-context";

/**
 * One-finger drag + two-finger pinch to move / scale the live poster.
 * Overlay sits on the camera preview; viewers receive the same transform.
 */
export function PosterGestureLayer() {
  const { t } = useTranslation();
  const { posterUrl, posterMode, posterTransform, setPosterTransform } = useLiveEffects();
  const drag = useRef<{
    mode: "pan" | "pinch";
    x0: number;
    y0: number;
    cx0: number;
    cy0: number;
    scale0: number;
    dist0: number;
  } | null>(null);

  if (!posterUrl || posterMode === "off") return null;

  const applyPan = (clientX: number, clientY: number, el: HTMLElement) => {
    const d = drag.current;
    if (!d || d.mode !== "pan") return;
    const rect = el.getBoundingClientRect();
    const dx = (clientX - d.x0) / Math.max(1, rect.width);
    const dy = (clientY - d.y0) / Math.max(1, rect.height);
    setPosterTransform({ x: d.cx0 + dx, y: d.cy0 + dy, scale: d.scale0 });
  };

  return (
    <div
      className="absolute inset-0 z-[8] touch-none"
      onPointerDown={(e) => {
        if (e.pointerType === "touch") return;
        drag.current = {
          mode: "pan",
          x0: e.clientX,
          y0: e.clientY,
          cx0: posterTransform.x,
          cy0: posterTransform.y,
          scale0: posterTransform.scale,
          dist0: 0,
        };
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!drag.current || drag.current.mode !== "pan") return;
        applyPan(e.clientX, e.clientY, e.currentTarget);
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onTouchStart={(e) => {
        if (e.touches.length === 2) {
          const a = e.touches[0]!;
          const b = e.touches[1]!;
          drag.current = {
            mode: "pinch",
            x0: (a.clientX + b.clientX) / 2,
            y0: (a.clientY + b.clientY) / 2,
            cx0: posterTransform.x,
            cy0: posterTransform.y,
            scale0: posterTransform.scale,
            dist0: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
          };
          return;
        }
        if (e.touches.length === 1) {
          const a = e.touches[0]!;
          drag.current = {
            mode: "pan",
            x0: a.clientX,
            y0: a.clientY,
            cx0: posterTransform.x,
            cy0: posterTransform.y,
            scale0: posterTransform.scale,
            dist0: 0,
          };
        }
      }}
      onTouchMove={(e) => {
        const d = drag.current;
        if (!d) return;
        e.preventDefault();
        const el = e.currentTarget;
        const rect = el.getBoundingClientRect();
        if (d.mode === "pinch" && e.touches.length === 2) {
          const a = e.touches[0]!;
          const b = e.touches[1]!;
          const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
          const midX = (a.clientX + b.clientX) / 2;
          const midY = (a.clientY + b.clientY) / 2;
          const nx = d.cx0 + (midX - d.x0) / Math.max(1, rect.width);
          const ny = d.cy0 + (midY - d.y0) / Math.max(1, rect.height);
          const nextScale = d.scale0 * (dist / Math.max(1, d.dist0));
          setPosterTransform({ x: nx, y: ny, scale: nextScale });
          return;
        }
        if (d.mode === "pan" && e.touches[0]) {
          applyPan(e.touches[0].clientX, e.touches[0].clientY, el);
        }
      }}
      onTouchEnd={(e) => {
        if (e.touches.length === 0) drag.current = null;
      }}
    >
      <p className="pointer-events-none absolute bottom-[22%] left-0 right-0 text-center text-[11px] font-semibold text-white/80">
        {t("broadcast.effects.posterHint", "Glisse pour déplacer · Pince pour zoomer")}
      </p>
    </div>
  );
}
