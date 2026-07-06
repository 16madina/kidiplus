import { useRef } from "react";
import { motion } from "framer-motion";
import { Press } from "./press";
import { CATEGORIES, type Category } from "@/lib/live-mock";
import { EASE_IOS } from "@/lib/motion";

export function CategoryPills({
  active,
  onChange,
}: {
  active: Category;
  onChange: (c: Category) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={scrollerRef}
      className="flex gap-2 overflow-x-auto px-4 py-2"
      style={{
        scrollSnapType: "x proximity",
        WebkitOverflowScrolling: "touch",
        overscrollBehaviorX: "contain",
      }}
    >
      {CATEGORIES.map((c) => {
        const isActive = c === active;
        return (
          <Press
            key={c}
            onClick={() => onChange(c)}
            className="!min-h-9 shrink-0 rounded-full px-4 text-[13px] font-semibold"
            style={{
              scrollSnapAlign: "start",
              backgroundColor: isActive ? "var(--accent)" : "transparent",
              color: isActive
                ? "var(--accent-foreground)"
                : "var(--foreground)",
              border: `1px solid ${
                isActive ? "var(--accent)" : "var(--border)"
              }`,
              transition: "background-color 150ms, color 150ms, border-color 150ms",
            }}
          >
            {isActive && (
              <motion.span
                layoutId="pill-bg"
                className="absolute inset-0 -z-10 rounded-full"
                transition={{ duration: 0.2, ease: EASE_IOS }}
              />
            )}
            {c}
          </Press>
        );
      })}
    </div>
  );
}
