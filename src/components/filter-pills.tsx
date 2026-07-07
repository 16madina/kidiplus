import { useRef } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Press } from "./press";
import {
  HOME_FILTERS,
  HOME_FILTER_LABEL_KEY,
  type HomeFilter,
} from "@/lib/home-categories";

export function FilterPills({
  active,
  onChange,
  onOpenFilters,
}: {
  active: HomeFilter;
  onChange: (f: HomeFilter) => void;
  onOpenFilters?: () => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();

  return (
    <div
      ref={scrollerRef}
      className="flex overflow-x-auto px-4"
      style={{
        gap: 8,
        scrollSnapType: "x proximity",
        WebkitOverflowScrolling: "touch",
        overscrollBehaviorX: "contain",
      }}
    >
      <Press
        onClick={() => onOpenFilters?.()}
        className="!min-h-8 h-8 shrink-0 gap-1.5 rounded-full px-3 text-[12.5px] font-semibold"
        style={{
          scrollSnapAlign: "start",
          backgroundColor: "var(--muted)",
          color: "var(--foreground)",
        }}
      >
        <SlidersHorizontal size={14} strokeWidth={2.2} />
        {t("home.filters.filter")}
      </Press>

      {HOME_FILTERS.map((f) => {
        const isActive = f === active;
        return (
          <Press
            key={f}
            onClick={() => onChange(f)}
            className="!min-h-8 h-8 shrink-0 rounded-full px-3.5 text-[12.5px] font-semibold"
            style={{
              scrollSnapAlign: "start",
              backgroundColor: isActive
                ? "oklch(0.22 0.06 265)"
                : "var(--muted)",
              color: isActive ? "#fff" : "var(--foreground)",
              transition: "background-color 150ms, color 150ms",
            }}
          >
            {t(HOME_FILTER_LABEL_KEY[f])}
          </Press>
        );
      })}
    </div>
  );
}
