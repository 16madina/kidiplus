import { useRef } from "react";
import { motion } from "framer-motion";
import { User } from "lucide-react";
import { Press } from "./press";
import { EASE_IOS } from "@/lib/motion";
import {
  HOME_CATEGORIES,
  HOME_CATEGORY_META,
  type HomeCategory,
} from "@/lib/home-categories";

const TILE_W = 120;
const TILE_H = 130;

export function CategoryTiles({
  active,
  onChange,
}: {
  active: HomeCategory;
  onChange: (c: HomeCategory) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={scrollerRef}
      className="flex overflow-x-auto px-4"
      style={{
        gap: 10,
        scrollSnapType: "x mandatory",
        WebkitOverflowScrolling: "touch",
        overscrollBehaviorX: "contain",
      }}
    >
      {HOME_CATEGORIES.map((c) => {
        const meta = HOME_CATEGORY_META[c];
        const isActive = c === active;
        return (
          <Press
            key={c}
            onClick={() => onChange(c)}
            className="!min-h-0 relative shrink-0 overflow-hidden rounded-[18px] p-0"
            style={{
              width: TILE_W,
              height: TILE_H,
              scrollSnapAlign: "start",
              background: meta.gradient,
              outline: isActive
                ? "2px solid var(--primary)"
                : "2px solid transparent",
              outlineOffset: -2,
            }}
          >
            <motion.div
              animate={{ scale: isActive ? 1.02 : 1 }}
              transition={{ duration: 0.15, ease: EASE_IOS }}
              className="relative h-full w-full"
            >
              {/* Category name — bold, dark, top-left */}
              <span
                className="absolute left-2.5 top-2.5 text-left text-[13px] font-extrabold leading-tight"
                style={{
                  color: "oklch(0.2 0.02 60)",
                  maxWidth: TILE_W - 20,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  letterSpacing: "-0.01em",
                }}
              >
                {c}
              </span>

              {/* Image or avatar in lower-right */}
              {c === "Pour toi" ? (
                <div
                  className="absolute grid place-items-center rounded-full"
                  style={{
                    right: 10,
                    bottom: 10,
                    height: 56,
                    width: 56,
                    backgroundColor: "rgba(255,255,255,0.7)",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
                  }}
                >
                  <User size={30} strokeWidth={1.8} color="oklch(0.25 0.02 60)" />
                </div>
              ) : meta.image ? (
                <img
                  src={meta.image}
                  alt=""
                  loading="lazy"
                  onLoad={(e) =>
                    e.currentTarget.setAttribute("data-loaded", "true")
                  }
                  style={{
                    position: "absolute",
                    right: -6,
                    bottom: -6,
                    height: 66,
                    width: 66,
                    objectFit: "cover",
                    borderRadius: 14,
                    boxShadow: "0 4px 10px rgba(0,0,0,0.12)",
                  }}
                  draggable={false}
                />
              ) : null}
            </motion.div>
          </Press>
        );
      })}
    </div>
  );
}

export function CategoryTilesSkeleton() {
  return (
    <div className="flex gap-2.5 px-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="skeleton shrink-0"
          style={{ width: TILE_W, height: TILE_H, borderRadius: 18 }}
        />
      ))}
    </div>
  );
}
