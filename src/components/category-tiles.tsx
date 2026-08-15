import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { User } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Press } from "./press";
import { EASE_IOS } from "@/lib/motion";
import { useAuth } from "@/lib/auth-context";
import { resolveAvatarUrl } from "@/lib/avatar-url";
import {
  HOME_CATEGORIES,
  HOME_CATEGORY_LABEL_KEY,
  HOME_CATEGORY_META,
  type HomeCategory,
} from "@/lib/home-categories";


const TILE_W = 104;
const TILE_H = 116;

function TileImage({ src }: { src: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <>
      {!loaded && (
        <span
          aria-hidden
          className="absolute inset-0"
          style={{ backgroundColor: "oklch(0.85 0.01 60)" }}
        />
      )}
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        data-loaded={loaded || undefined}
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover"
      />
    </>
  );
}

export function CategoryTiles({
  active,
  onChange,
}: {
  active: HomeCategory;
  onChange: (c: HomeCategory) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [avatar, setAvatar] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const url = await resolveAvatarUrl(profile?.avatar_url);
      if (!cancelled) setAvatar(url);
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.avatar_url]);


  return (
    <div
      ref={scrollerRef}
      className="flex overflow-x-auto pl-5 pr-4"
      style={{
        gap: 10,
        scrollSnapType: "x mandatory",
        scrollPaddingLeft: 20,
        WebkitOverflowScrolling: "touch",
        overscrollBehaviorX: "contain",
      }}
    >
      {HOME_CATEGORIES.map((c) => {
        const meta = HOME_CATEGORY_META[c];
        const isActive = c === active;
        const isPourToi = c === "Pour toi";
        return (
          <Press
            key={c}
            onClick={() => onChange(c)}
            className="!min-h-0 relative shrink-0 overflow-hidden rounded-2xl p-0"
            style={{
              width: TILE_W,
              height: TILE_H,
              scrollSnapAlign: "start",
              backgroundColor: "oklch(0.25 0.07 265)",
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
              {isPourToi ? (
                avatar ? (
                  <TileImage src={avatar} />
                ) : (
                  <>
                    <span
                      aria-hidden
                      className="absolute inset-0"
                      style={{
                        background:
                          "linear-gradient(135deg, oklch(0.25 0.07 265) 0%, oklch(0.15 0.05 265) 100%)",
                      }}
                    />
                    <div
                      className="absolute grid place-items-center overflow-hidden rounded-full"
                      style={{
                        left: "50%",
                        top: "40%",
                        transform: "translate(-50%, -50%)",
                        height: 44,
                        width: 44,
                        backgroundColor: "color-mix(in oklch, var(--primary) 22%, transparent)",
                        border: "1.5px solid var(--primary)",
                      }}
                    >
                      <User size={22} strokeWidth={2} color="var(--primary)" />
                    </div>
                  </>
                )
              ) : meta.image ? (
                <TileImage src={meta.image} />
              ) : null}

              {/* Scrim for label legibility */}
              <span
                aria-hidden
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.10) 45%, rgba(0,0,0,0) 100%)",
                }}
              />

              {/* Label — bottom-left, white bold */}
              <span
                className="absolute left-2.5 bottom-2 text-left text-[12.5px] font-extrabold leading-tight text-white"
                style={{
                  maxWidth: TILE_W - 20,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  letterSpacing: "-0.01em",
                  textShadow: "0 1px 2px rgba(0,0,0,0.35)",
                }}
              >
                {t(HOME_CATEGORY_LABEL_KEY[c])}
              </span>
            </motion.div>
          </Press>
        );
      })}
    </div>
  );
}

export function CategoryTilesSkeleton() {
  return (
    <div className="flex gap-2.5 pl-5 pr-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="skeleton shrink-0"
          style={{ width: TILE_W, height: TILE_H, borderRadius: 16 }}
        />
      ))}
    </div>
  );
}
