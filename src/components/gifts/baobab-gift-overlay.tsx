import { useEffect, useRef, useState } from "react";
import { BaobabMotionCanvas } from "./baobab-motion-canvas";
import { BAOBAB_DURATION_MS, BAOBAB_GROW_S } from "@/lib/gift-baobab";
import { easeOutCubic, range } from "@/lib/defi-plus";

type Props = {
  active: boolean;
  onComplete?: () => void;
};

export function BaobabGiftOverlay({ active, onComplete }: Props) {
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
    const start = Date.now();
    doneRef.current = false;
    setOrigin(start);
    setElapsed(0);
    let raf = 0;
    const tick = () => {
      const next = Date.now() - start;
      setElapsed(next);
      if (next >= BAOBAB_DURATION_MS) {
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
  }, [active]);

  if (!active || origin == null || elapsed >= BAOBAB_DURATION_MS) return null;

  const t = elapsed / 1000;
  const nameIn = easeOutCubic(range(t, BAOBAB_GROW_S - 0.25, BAOBAB_GROW_S + 0.35));
  const nameOut = 1 - range(t, BAOBAB_GROW_S + 2.4, BAOBAB_GROW_S + 3.1);
  const name = nameIn * nameOut;

  return (
    <div className="pointer-events-none absolute inset-0 z-[85] overflow-hidden">
      <BaobabMotionCanvas clockStart={origin} />
      {name > 0.02 && (
        <p
          className="absolute inset-x-0 top-[18%] z-[8] text-center text-[13px] font-black uppercase tracking-[0.28em] text-white"
          style={{
            opacity: name,
            textShadow: "0 0 16px rgba(255, 200, 70, 0.85), 0 2px 10px rgba(0,0,0,0.8)",
          }}
        >
          Baobab d’or
        </p>
      )}
    </div>
  );
}
