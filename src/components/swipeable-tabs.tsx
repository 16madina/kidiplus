import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useMotionValue } from "framer-motion";
import { Press } from "./press";
import { EASE_IOS } from "@/lib/motion";

export type TabDef = {
  key: string;
  label: string;
  content: ReactNode;
};

export function SwipeableTabs({
  tabs,
  index,
  onIndexChange,
  sticky = false,
  headerClassName = "",
}: {
  tabs: TabDef[];
  index: number;
  onIndexChange: (i: number) => void;
  sticky?: boolean;
  headerClassName?: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [tabWidths, setTabWidths] = useState<number[]>([]);
  const [tabOffsets, setTabOffsets] = useState<number[]>([]);
  const progress = useMotionValue(index);
  const [underlineX, setUnderlineX] = useState(0);
  const [underlineW, setUnderlineW] = useState(0);

  // Measure tab labels
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const btns = el.querySelectorAll<HTMLButtonElement>("[data-tab]");
    const widths: number[] = [];
    const offsets: number[] = [];
    btns.forEach((b) => {
      widths.push(b.offsetWidth);
      offsets.push(b.offsetLeft);
    });
    setTabWidths(widths);
    setTabOffsets(offsets);
  }, [tabs.length]);

  // Programmatic index change -> scroll snap to that panel
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const w = el.clientWidth;
    el.scrollTo({ left: index * w, behavior: "smooth" });
  }, [index]);

  // Scroll listener -> update underline in real time
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => {
      const w = el.clientWidth;
      if (!w) return;
      const p = el.scrollLeft / w;
      progress.set(p);
      // interpolate between adjacent tab widths/offsets
      const i0 = Math.floor(p);
      const i1 = Math.min(tabs.length - 1, i0 + 1);
      const t = p - i0;
      const x0 = tabOffsets[i0] ?? 0;
      const x1 = tabOffsets[i1] ?? x0;
      const w0 = tabWidths[i0] ?? 0;
      const w1 = tabWidths[i1] ?? w0;
      setUnderlineX(x0 + (x1 - x0) * t);
      setUnderlineW(w0 + (w1 - w0) * t);

      const nearest = Math.round(p);
      if (nearest !== index) onIndexChange(nearest);
    };
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [tabWidths, tabOffsets, index, onIndexChange, tabs.length, progress]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={headerRef}
        className={`relative flex shrink-0 items-center gap-1 border-b border-border/60 px-4 ${sticky ? "sticky top-0 z-10 bg-background/85 backdrop-blur" : ""} ${headerClassName}`}
        style={
          sticky
            ? {
                backdropFilter: "saturate(180%) blur(18px)",
                WebkitBackdropFilter: "saturate(180%) blur(18px)",
              }
            : undefined
        }
      >
        {tabs.map((t, i) => {
          const active = i === index;
          return (
            <Press
              key={t.key}
              data-tab
              onClick={() => onIndexChange(i)}
              className="!min-h-11 rounded-none px-3 text-[14px] font-semibold"
              style={{
                color: active ? "var(--foreground)" : "var(--muted-foreground)",
                transition: "color 150ms",
              }}
            >
              {t.label}
            </Press>
          );
        })}
        <motion.div
          className="absolute bottom-0 h-[2px] rounded-full"
          style={{
            backgroundColor: "var(--accent)",
            transform: `translateX(${underlineX}px)`,
            width: underlineW || 0,
          }}
        />
      </div>

      <div
        ref={scrollerRef}
        className="flex flex-1 min-h-0 overflow-x-auto overflow-y-hidden"
        style={{
          scrollSnapType: "x mandatory",
          scrollBehavior: "auto",
          WebkitOverflowScrolling: "touch",
          overscrollBehaviorX: "contain",
        }}
      >
        {tabs.map((t) => (
          <div
            key={t.key}
            className="h-full w-full shrink-0 overflow-y-auto"
            style={{
              scrollSnapAlign: "start",
              scrollSnapStop: "always",
              WebkitOverflowScrolling: "touch",
              overscrollBehavior: "contain",
            }}
          >
            {t.content}
          </div>
        ))}
      </div>
    </div>
  );
}

export const _EASE = EASE_IOS;
