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
  onComplete?: () => void;
};

export function DefiPlusIntroOverlay({ active, startsAt, onComplete }: Props) {
  const [elapsed, setElapsed] = useState(0);
  const doneRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!active) {
      setElapsed(0);
      doneRef.current = false;
      return;
    }
    const origin = startsAt ?? Date.now();
    doneRef.current = false;
    setElapsed(Math.max(0, Date.now() - origin));
    let raf = 0;
    const tick = () => {
      const next = Math.max(0, Date.now() - origin);
      setElapsed(next);
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

  if (!active || elapsed >= DEFI_PLUS_DURATION_MS) return null;

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
  const tick = t - Math.floor(t);
  const numberPop = remaining > 0 && tick < 0.22 ? 1 + (1 - tick / 0.22) * 0.32 : 1;
  const numberScale = (remaining <= 4 ? 1 + (4 - remaining) * 0.06 : 1) * (1 + beat * 0.12);
  const countOut = 1 - range(t, DEFI_PLUS_HIT_S + 0.35, DEFI_PLUS_HIT_S + 0.7);

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
      <DefiPlusMotionCanvas elapsedMs={elapsed} />

      {countOut > 0.02 && (
        <div className="absolute inset-x-0 bottom-[10%] z-[7] flex flex-col items-center px-6 text-center">
          <p
            className="text-[13px] font-medium leading-tight text-white"
            style={{
              opacity: range(t, 0.28, 0.65) * countOut,
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
              fontSize: `clamp(72px, ${22 * numberScale}vw, 140px)`,
              transform: `scale(${numberPop})`,
              opacity: countOut,
              textShadow: "0 0 24px rgba(80, 230, 255, 0.95), 0 0 52px rgba(80, 230, 255, 0.4)",
            }}
          >
            {remaining}
          </div>
        </div>
      )}

      {t >= DEFI_PLUS_HIT_S + 0.45 && (
        <div className="absolute inset-x-0 top-[56%] z-[8] flex flex-col items-center gap-2 px-4 text-center">
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
          <p
            className="text-[42px] font-black italic leading-none"
            style={{
              opacity:
                easeOutCubic(range(t, DEFI_PLUS_HIT_S + 0.55, DEFI_PLUS_HIT_S + 0.82)) *
                (1 - range(t, DEFI_PLUS_HIT_S + 1.4, DEFI_PLUS_HIT_S + 1.9)),
              transform: `scale(${lerp(0.84, 1, range(t, DEFI_PLUS_HIT_S + 0.55, DEFI_PLUS_HIT_S + 0.82))})`,
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
