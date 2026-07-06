import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useTransform } from "framer-motion";
import { Bell, Share2, Loader2 } from "lucide-react";
import { Press } from "@/components/press";
import { CategoryPills } from "@/components/category-pills";
import { LiveCard, LiveCardSkeleton } from "@/components/live-card";
import { makeStreams, type Category, type LiveStream } from "@/lib/live-mock";
import { useLiveViewer } from "@/lib/live-viewer-context";
import { EASE_IOS } from "@/lib/motion";

const PAGE = 12;
const PULL_TRIGGER = 72;
const PULL_MAX = 120;

export function HomeScreen() {
  const [category, setCategory] = useState<Category>("For You");
  const [items, setItems] = useState<LiveStream[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const pullY = useMotionValue(0);
  const pullRotate = useTransform(pullY, [0, PULL_MAX], [0, 360]);
  const pullOpacity = useTransform(pullY, [0, 40, PULL_TRIGGER], [0, 0.5, 1]);

  // Initial load (simulated).
  useEffect(() => {
    const t = setTimeout(() => {
      setItems(makeStreams(0, PAGE));
      setLoading(false);
    }, 600);
    return () => clearTimeout(t);
  }, []);

  const filtered = useMemo(() => {
    if (category === "For You") return items;
    return items.filter((s) => s.category === category);
  }, [items, category]);

  const doRefresh = useCallback(() => {
    setRefreshing(true);
    setLoading(true);
    setTimeout(() => {
      setItems(makeStreams(Math.floor(Math.random() * 24), PAGE));
      setLoading(false);
      setRefreshing(false);
    }, 700);
  }, []);

  const loadMore = useCallback(() => {
    if (loadingMore || loading) return;
    setLoadingMore(true);
    setTimeout(() => {
      setItems((prev) => [...prev, ...makeStreams(prev.length, PAGE)]);
      setLoadingMore(false);
    }, 550);
  }, [loadingMore, loading]);

  // Scroll listener: header solidify + infinite scroll sentinel
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => setScrolled(el.scrollTop > 10);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const el = sentinelRef.current;
    const scroller = scrollerRef.current;
    if (!el || !scroller) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { root: scroller, rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  // Pull-to-refresh gesture (only when scrolled to top).
  const dragStartY = useRef<number | null>(null);
  const pulling = useRef(false);

  const onTouchStart = (e: React.TouchEvent) => {
    if ((scrollerRef.current?.scrollTop ?? 0) <= 0) {
      dragStartY.current = e.touches[0]?.clientY ?? null;
      pulling.current = true;
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!pulling.current || dragStartY.current == null) return;
    const dy = (e.touches[0]?.clientY ?? 0) - dragStartY.current;
    if (dy <= 0) {
      pullY.set(0);
      return;
    }
    // rubber-band
    const eased = Math.min(PULL_MAX, dy * 0.55);
    pullY.set(eased);
  };
  const onTouchEnd = () => {
    if (!pulling.current) return;
    pulling.current = false;
    const y = pullY.get();
    if (y >= PULL_TRIGGER && !refreshing) {
      doRefresh();
    }
    // spring back
    const start = performance.now();
    const from = pullY.get();
    const anim = (t: number) => {
      const p = Math.min(1, (t - start) / 220);
      pullY.set(from * (1 - easeOut(p)));
      if (p < 1) requestAnimationFrame(anim);
    };
    requestAnimationFrame(anim);
    dragStartY.current = null;
  };

  return (
    <div className="relative h-full">
      {/* Header (fixed within tab pane) */}
      <motion.header
        className="absolute inset-x-0 top-0 z-30 pt-safe"
        animate={{
          backgroundColor: scrolled
            ? "color-mix(in oklch, var(--background) 80%, transparent)"
            : "rgba(255,255,255,0)",
          borderBottomColor: scrolled
            ? "var(--border)"
            : "rgba(0,0,0,0)",
        }}
        transition={{ duration: 0.2, ease: EASE_IOS }}
        style={{
          backdropFilter: scrolled ? "saturate(180%) blur(20px)" : "none",
          WebkitBackdropFilter: scrolled ? "saturate(180%) blur(20px)" : "none",
          borderBottom: "1px solid transparent",
        }}
      >
        <div className="flex items-center justify-between px-4 py-2.5">
          <span
            className="text-[22px] font-black tracking-tight"
            style={{
              background:
                "linear-gradient(135deg, oklch(0.7 0.26 15), oklch(0.55 0.24 25))",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            shoplive
          </span>
          <div className="flex items-center gap-1">
            <Press
              aria-label="Notifications"
              className="h-11 w-11 rounded-full"
              style={{ color: "var(--foreground)" }}
            >
              <Bell size={22} strokeWidth={1.9} />
            </Press>
            <Press
              aria-label="Share"
              className="h-11 w-11 rounded-full"
              style={{ color: "var(--foreground)" }}
            >
              <Share2 size={20} strokeWidth={1.9} />
            </Press>
          </div>
        </div>
        <CategoryPills active={category} onChange={setCategory} />
      </motion.header>

      {/* Pull-to-refresh indicator */}
      <motion.div
        className="pointer-events-none absolute inset-x-0 z-20 flex justify-center"
        style={{
          top: "calc(env(safe-area-inset-top) + 96px)",
          y: pullY,
          opacity: pullOpacity,
        }}
      >
        <div
          className="grid h-9 w-9 place-items-center rounded-full shadow-md"
          style={{ backgroundColor: "var(--card)" }}
        >
          {refreshing ? (
            <Loader2
              className="animate-spin"
              size={18}
              color="var(--accent)"
              strokeWidth={2.4}
            />
          ) : (
            <motion.div style={{ rotate: pullRotate }}>
              <Loader2 size={18} color="var(--accent)" strokeWidth={2.4} />
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* Scrollable feed */}
      <div
        ref={scrollerRef}
        className="h-full overflow-y-auto"
        style={{
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
          paddingBottom: "calc(3.5rem + env(safe-area-inset-bottom))",
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        {/* spacer for header (title bar + pills) */}
        <div
          aria-hidden
          style={{ height: "calc(env(safe-area-inset-top) + 100px)" }}
        />

        <div className="px-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={category + (loading ? ":loading" : ":ready")}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: EASE_IOS }}
              className="grid grid-cols-2 gap-2"
            >
              {loading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <LiveCardSkeleton key={`sk-${i}`} />
                  ))
                : filtered.map((s, i) => (
                    <LiveCard key={s.id} stream={s} index={i} />
                  ))}
            </motion.div>
          </AnimatePresence>

          {!loading && filtered.length === 0 && (
            <div className="py-16 text-center text-sm text-muted-foreground">
              Aucun live dans cette catégorie pour le moment.
            </div>
          )}

          {/* infinite scroll skeletons */}
          {!loading && loadingMore && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <LiveCardSkeleton key={`more-sk-${i}`} />
              ))}
            </div>
          )}

          <div ref={sentinelRef} className="h-4 w-full" />
        </div>
      </div>
    </div>
  );
}

function easeOut(t: number) {
  return 1 - Math.pow(1 - t, 3);
}
