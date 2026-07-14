// Scratchable canvas overlay for the referral claim card.
// Users drag/scratch to reveal children underneath. When the overlay is
// ~50% erased (or on skip), it fades away permanently.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Cpu, Sparkles } from "lucide-react";
import { haptic } from "@/lib/haptics";

type Props = {
  children: ReactNode;
  /** i18n label centered on the overlay, e.g. "Gratte pour entrer ton code 🪙" */
  scratchLabel: string;
  /** Small text-button below the card (accessibility / reduced-motion fallback). */
  skipLabel: string;
  /** Top-left badge text (e.g. "KiDi+ PARTENAIRE"). */
  brandLabel: string;
  /** Reveal threshold in [0..1]. Default 0.5. */
  threshold?: number;
};

// Gold palette (matches ReferralWalletCard)
const GOLD_DEEP = "#8A6511";
const GOLD_MID = "#C8992E";
const GOLD_LIGHT = "#F5D273";
const GOLD_HIGHLIGHT = "#FFF1B8";
const INK = "#1A130A";

export function ScratchCard({
  children,
  scratchLabel,
  skipLabel,
  brandLabel,
  threshold = 0.5,
}: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  // Paint the gold "scratch" surface onto the canvas.
  const paintSurface = () => {
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!canvas || !overlay) return;
    const rect = overlay.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = rect.width;
    const h = rect.height;

    // Base gold gradient
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, GOLD_LIGHT);
    grad.addColorStop(0.45, GOLD_MID);
    grad.addColorStop(1, GOLD_DEEP);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Highlight glow
    const glow = ctx.createRadialGradient(w * 0.2, h * 0.15, 0, w * 0.2, h * 0.15, w * 0.9);
    glow.addColorStop(0, "rgba(255,241,184,0.75)");
    glow.addColorStop(1, "rgba(255,241,184,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    // Brushed streaks
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 1;
    for (let y = -h; y < h * 2; y += 6) {
      ctx.beginPath();
      ctx.moveTo(-10, y);
      ctx.lineTo(w + 10, y + w * 0.35);
      ctx.stroke();
    }
    ctx.restore();

    // Fine "grattez" speckle for tactile feel
    ctx.save();
    ctx.globalAlpha = 0.18;
    for (let i = 0; i < 220; i++) {
      ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.35)";
      const x = Math.random() * w;
      const y = Math.random() * h;
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.restore();

    // Set to destination-out so future strokes ERASE.
    ctx.globalCompositeOperation = "destination-out";
  };

  useEffect(() => {
    if (revealed) return;
    paintSurface();
    const onResize = () => paintSurface();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed]);

  const localPoint = (e: PointerEvent | React.PointerEvent) => {
    const overlay = overlayRef.current;
    if (!overlay) return { x: 0, y: 0 };
    const rect = overlay.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const strokeTo = (x: number, y: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const last = lastRef.current ?? { x, y };
    ctx.lineWidth = 34;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    lastRef.current = { x, y };
  };

  const checkProgress = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Sample a coarse grid for speed
    const step = 12;
    const w = canvas.width;
    const h = canvas.height;
    let cleared = 0;
    let total = 0;
    try {
      const img = ctx.getImageData(0, 0, w, h).data;
      for (let y = 0; y < h; y += step) {
        for (let x = 0; x < w; x += step) {
          const i = (y * w + x) * 4 + 3; // alpha
          total++;
          if (img[i] < 32) cleared++;
        }
      }
    } catch {
      return;
    }
    if (total > 0 && cleared / total >= threshold) {
      setRevealed(true);
      haptic.success();
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (revealed) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drawingRef.current = true;
    const p = localPoint(e);
    lastRef.current = p;
    strokeTo(p.x, p.y);
    haptic.light();
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawingRef.current || revealed) return;
    const p = localPoint(e);
    strokeTo(p.x, p.y);
  };
  const onPointerUp = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastRef.current = null;
    checkProgress();
  };

  const skip = () => {
    setRevealed(true);
    haptic.light();
  };

  return (
    <div>
      <div
        className="relative overflow-hidden rounded-[22px] p-5 shadow-2xl"
        style={{
          background: `
            radial-gradient(120% 90% at 15% 0%, ${GOLD_HIGHLIGHT} 0%, transparent 45%),
            radial-gradient(140% 100% at 100% 100%, ${GOLD_DEEP} 0%, transparent 55%),
            linear-gradient(135deg, ${GOLD_LIGHT} 0%, ${GOLD_MID} 45%, ${GOLD_DEEP} 100%)
          `,
          color: INK,
          minHeight: 280,
          boxShadow:
            "0 20px 40px -20px rgba(138,101,17,0.55), inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(0,0,0,0.15)",
        }}
      >
        {/* Brushed streaks (card body, behind everything) */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-40 mix-blend-overlay"
          style={{
            background:
              "repeating-linear-gradient(115deg, rgba(255,255,255,0.18) 0px, rgba(255,255,255,0.18) 1px, transparent 1px, transparent 6px)",
          }}
        />

        {/* Top row: chip + brand label (like the wallet card, but at TOP) */}
        <div className="relative flex items-start justify-between">
          <div
            className="grid h-9 w-12 shrink-0 place-items-center rounded-md"
            style={{
              background: `linear-gradient(135deg, #FFE7A8 0%, #C9971F 55%, #7A5A10 100%)`,
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6), inset 0 -1px 0 rgba(0,0,0,0.35)",
            }}
          >
            <Cpu size={16} style={{ color: "rgba(0,0,0,0.55)" }} />
          </div>
          <div className="text-right">
            <div
              className="text-[10px] font-bold uppercase tracking-[0.28em]"
              style={{ color: INK, opacity: 0.85 }}
            >
              {brandLabel}
            </div>
            <div
              className="mt-0.5 text-[18px] font-black leading-none"
              style={{ color: INK, textShadow: "0 1px 0 rgba(255,255,255,0.35)" }}
            >
              KiDi<span style={{ color: "#3a0f0f" }}>+</span>
            </div>
          </div>
        </div>

        {/* Reveal surface: the children live underneath, canvas overlays them */}
        <div
          ref={overlayRef}
          className="relative mt-4 rounded-2xl"
          style={{
            minHeight: 190,
            background: "rgba(255,255,255,0.92)",
            boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.08)",
          }}
        >
          <div className="relative z-0 p-4">{children}</div>

          {!revealed && (
            <>
              <canvas
                ref={canvasRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onPointerLeave={onPointerUp}
                className="absolute inset-0 z-10 h-full w-full rounded-2xl touch-none cursor-grab"
                style={{ touchAction: "none" }}
                aria-label={scratchLabel}
                role="img"
              />
              {/* Center hint (below canvas visually via mix-blend not possible; put ABOVE canvas but pointer-events none) */}
              <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-1 px-4 text-center">
                <div
                  className="inline-flex items-center gap-1.5 rounded-full bg-black/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-white/95 backdrop-blur-sm"
                  style={{ textShadow: "0 1px 2px rgba(0,0,0,0.35)" }}
                >
                  <Sparkles size={12} />
                  {scratchLabel}
                </div>
                {!reducedMotion && (
                  <div
                    aria-hidden
                    className="absolute inset-0 overflow-hidden rounded-2xl"
                  >
                    <div className="scratch-shimmer absolute inset-y-0 -left-1/2 w-1/2" />
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {!revealed && (
        <div className="mt-2 text-center">
          <button
            type="button"
            onClick={skip}
            className="text-[12px] font-semibold text-muted-foreground underline underline-offset-2"
          >
            {skipLabel}
          </button>
        </div>
      )}

      <style>{`
        @keyframes scratchShimmer {
          0% { transform: translateX(0); opacity: 0; }
          15% { opacity: 0.85; }
          85% { opacity: 0.85; }
          100% { transform: translateX(320%); opacity: 0; }
        }
        .scratch-shimmer {
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent);
          animation: scratchShimmer 2.2s ease-in-out infinite;
          mix-blend-mode: overlay;
        }
      `}</style>
    </div>
  );
}
