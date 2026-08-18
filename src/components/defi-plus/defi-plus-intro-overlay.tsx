import { useEffect, useRef, useState } from "react";
import { DefiPlusMotionCanvas } from "./defi-plus-motion-canvas";
import {
  DEFI_PLUS_DURATION_MS,
  DEFI_PLUS_HIT_S,
  defiPlusRemaining,
  easeOutCubic,
  heartbeat,
  lerp,
  range,
  PHASE,
} from "@/lib/defi-plus";

type Props = {
  active: boolean;
  /** Epoch ms — same value on every device so the countdown stays locked. */
  startsAt?: number;
  leftName?: string;
  rightName?: string;
  onComplete?: () => void;
};

export function DefiPlusIntroOverlay({ active, startsAt, leftName, rightName, onComplete }: Props) {
  const [elapsed, setElapsed] = useState(0);
  const [origin, setOrigin] = useState<number | null>(null);
  const doneRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!active) {
      setElapsed(0);
      setOrigin(null);
      doneRef.current = false;
      return;
    }
    const start = startsAt ?? Date.now();
    doneRef.current = false;
    setOrigin(start);
    setElapsed(Math.max(0, Date.now() - start));
    let raf = 0;
    let lastUi = 0;
    const tick = () => {
      const next = Math.max(0, Date.now() - start);
      if (next - lastUi >= 50 || next >= DEFI_PLUS_DURATION_MS) {
        lastUi = next;
        setElapsed(next);
      }
      if (next >= DEFI_PLUS_DURATION_MS) {
        if (!doneRef.current) {
          doneRef.current = true;
          onCompleteRef.current?.();
        }
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, startsAt]);

  if (!active || origin == null || elapsed >= DEFI_PLUS_DURATION_MS) return null;

  const t = elapsed / 1000;
  const remaining = defiPlusRemaining(elapsed);
  const struck = t >= DEFI_PLUS_HIT_S;
  const split = range(t, DEFI_PLUS_HIT_S + 0.1, DEFI_PLUS_HIT_S + 1.3);
  const veil = lerp(0.22, 0.02, split);
  const shake =
    struck && t < DEFI_PLUS_HIT_S + 0.32
      ? Math.sin(t * 90) * (1 - range(t, DEFI_PLUS_HIT_S + 0.02, DEFI_PLUS_HIT_S + 0.32)) * 5
      : 0;
  const beat = t >= PHASE.beatStart && t < DEFI_PLUS_HIT_S ? heartbeat(t) : 0;
  const frac = t - Math.floor(t);
  const numberPop = remaining > 0 && frac < 0.18 ? 1 + (1 - frac / 0.18) * 0.18 : 1;
  const countOut = 1 - range(t, DEFI_PLUS_HIT_S + 0.35, DEFI_PLUS_HIT_S + 0.7);
  const versusIn = easeOutCubic(range(t, DEFI_PLUS_HIT_S + 0.18, DEFI_PLUS_HIT_S + 0.55));
  const versusOut = 1 - range(t, DEFI_PLUS_HIT_S + 1.15, DEFI_PLUS_HIT_S + 1.7);
  const versus = versusIn * versusOut;
  const nameSlide = lerp(0, 1, split);
  const hasNames = Boolean(leftName?.trim() && rightName?.trim());

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[84] overflow-hidden"
      style={{ transform: `translate(${shake}px, ${-shake * 0.35}px)` }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at 50% 36%, rgba(0,0,0,${veil * 0.28}) 0%, rgba(0,0,0,${veil}) 72%)`,
        }}
      />
      <DefiPlusMotionCanvas clockStart={origin} />

      {countOut > 0.02 && (
        <div className="absolute inset-x-0 top-[56%] z-[7] flex flex-col items-center px-6 text-center">
          <p
            className="text-[13px] font-medium leading-tight text-white"
            style={{
              opacity: countOut,
              textShadow: "0 2px 12px rgba(0,0,0,0.9)",
            }}
          >
            Votre Défi Plus
            <br />
            commencera dans…
          </p>
          <div
            className="mt-1 font-black tabular-nums leading-none text-white"
            style={{
              fontSize: "clamp(64px, 18vw, 120px)",
              transform: `scale(${numberPop * (1 + beat * 0.08)})`,
              opacity: countOut,
              textShadow: "0 0 24px rgba(80, 230, 255, 0.95), 0 0 52px rgba(80, 230, 255, 0.4)",
            }}
          >
            {remaining}
          </div>
        </div>
      )}

      {hasNames && versus > 0.02 && (
        <div className="absolute inset-x-0 top-[38%] z-[8] flex items-center justify-between px-4">
          <p
            className="w-[42%] truncate text-left text-[22px] font-black uppercase leading-none tracking-wide text-white"
            style={{
              opacity: versus,
              transform: `translateX(${lerp(18, 0, nameSlide)}%)`,
              textShadow: "0 0 18px rgba(80,230,255,0.9), 0 2px 10px rgba(0,0,0,0.85)",
            }}
          >
            {leftName}
          </p>
          <p
            className="shrink-0 px-1 text-[15px] font-black italic tracking-[0.22em] text-[#ffe08a]"
            style={{
              opacity: versus * easeOutCubic(range(t, DEFI_PLUS_HIT_S + 0.38, DEFI_PLUS_HIT_S + 0.62)),
              transform: `scale(${lerp(0.6, 1, range(t, DEFI_PLUS_HIT_S + 0.38, DEFI_PLUS_HIT_S + 0.62))})`,
              textShadow: "0 0 16px rgba(255,200,70,0.85)",
            }}
          >
            VS
          </p>
          <p
            className="w-[42%] truncate text-right text-[22px] font-black uppercase leading-none tracking-wide text-white"
            style={{
              opacity: versus,
              transform: `translateX(${lerp(-18, 0, nameSlide)}%)`,
              textShadow: "0 0 18px rgba(255,200,70,0.9), 0 2px 10px rgba(0,0,0,0.85)",
            }}
          >
            {rightName}
          </p>
        </div>
      )}

      {t >= DEFI_PLUS_HIT_S + (hasNames ? 1.15 : 0.45) && (
        <div className="absolute inset-x-0 top-[56%] z-[8] flex flex-col items-center gap-2 px-4 text-center">
          {!hasNames && (
            <p
              className="text-sm font-semibold tracking-[0.18em] text-white"
              style={{
                opacity:
                  easeOutCubic(range(t, DEFI_PLUS_HIT_S + 0.45, DEFI_PLUS_HIT_S + 0.7)) *
                  (1 - range(t, DEFI_PLUS_HIT_S + 1.4, DEFI_PLUS_HIT_S + 1.9)),
                textShadow: "0 2px 12px rgba(0,0,0,0.85)",
              }}
            >
              QUI VEND PLUS?
            </p>
          )}
          <p
            className="text-[42px] font-black italic leading-none"
            style={{
              opacity:
                easeOutCubic(
                  range(
                    t,
                    DEFI_PLUS_HIT_S + (hasNames ? 1.22 : 0.55),
                    DEFI_PLUS_HIT_S + (hasNames ? 1.48 : 0.82),
                  ),
                ) * (1 - range(t, DEFI_PLUS_HIT_S + 1.7, DEFI_PLUS_HIT_S + 1.95)),
              transform: `scale(${lerp(
                0.84,
                1,
                range(
                  t,
                  DEFI_PLUS_HIT_S + (hasNames ? 1.22 : 0.55),
                  DEFI_PLUS_HIT_S + (hasNames ? 1.48 : 0.82),
                ),
              )})`,
              background: "linear-gradient(180deg, #ffe9a0 0%, #f5c542 45%, #c48912 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              filter: "drop-shadow(0 0 16px rgba(255, 200, 70, 0.65))",
            }}
          >
            C’EST PARTI!
          </p>
        </div>
      )}
    </div>
  );
}
