import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useTransform } from "framer-motion";
import { Bell, Share2, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Press } from "@/components/press";
import { Logo } from "@/components/brand/logo";
import { CategoryTiles, CategoryTilesSkeleton } from "@/components/category-tiles";
import { FilterPills } from "@/components/filter-pills";
import { LiveCard, LiveCardSkeleton } from "@/components/live-card";
import { makeStreams, type LiveStream } from "@/lib/live-mock";
import {
  applyHomeCategory,
  applyHomeFilter,
  type HomeCategory,
  type HomeFilter,
} from "@/lib/home-categories";
import { useLiveViewer } from "@/lib/live-viewer-context";
import { EASE_IOS } from "@/lib/motion";
import { dismissKeyboard, nativeShare } from "@/lib/native";
import { fetchActiveLives, subscribeToLivesFeed } from "@/lib/lives-db";
import { usePersonalizedRanking } from "@/lib/personalization";

import { UpcomingLivesRow } from "@/components/home/upcoming-lives-row";
import { DemoCard, DemoPlayer, useDemoVideo } from "@/components/home/demo-card";


const PAGE = 12;
const PULL_TRIGGER = 72;
const PULL_MAX = 120;

export function HomeScreen() {
  const { t } = useTranslation();
  const [category, setCategory] = useState<HomeCategory>("Pour toi");
  const [filter, setFilter] = useState<HomeFilter>("Recommandés");
  const [items, setItems] = useState<LiveStream[]>([]);
  const [realLives, setRealLives] = useState<LiveStream[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const { ok: demoAvailable, url: demoUrl } = useDemoVideo();
  const { open: openStream, openList } = useLiveViewer();

  const scrollerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const pullY = useMotionValue(0);
  const pullRotate = useTransform(pullY, [0, PULL_MAX], [0, 360]);
  const pullOpacity = useTransform(pullY, [0, 40, PULL_TRIGGER], [0, 0.5, 1]);

  // Initial paint: mock filler while real lives load in parallel.
  useEffect(() => {
    const t = setTimeout(() => {
      setItems(makeStreams(0, PAGE));
      setLoading(false);
    }, 600);
    return () => clearTimeout(t);
  }, []);

  // Real lives feed + realtime subscription.
  const refreshRealLives = useCallback(async () => {
    const rows = await fetchActiveLives(60);
    setRealLives(rows);
  }, []);
  useEffect(() => {
    void refreshRealLives();
    const unsub = subscribeToLivesFeed(() => {
      void refreshRealLives();
    });
    return unsub;
  }, [refreshRealLives]);


  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const room = params.get("live");
    if (!room) return;
    openStream({
      id: `test_${room}`,
      seller: "Seller",
      avatar: "https://i.pravatar.cc/100?u=" + room,
      title: "Live en direct",
      thumbnail:
        "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&q=70",
      viewers: 1,
      category: "Fashion",
      roomName: room,
    });
  }, [openStream]);

  const filtered = useMemo(() => {
    // Real lives always come first; mock streams fill the grid below.
    const merged = [...realLives, ...items];
    return applyHomeFilter(applyHomeCategory(merged, category), filter);
  }, [items, realLives, category, filter]);


  const doRefresh = useCallback(() => {
    setRefreshing(true);
    setLoading(true);
    void refreshRealLives();
    setTimeout(() => {
      setItems(makeStreams(Math.floor(Math.random() * 24), PAGE));
      setLoading(false);
      setRefreshing(false);
    }, 700);
  }, [refreshRealLives]);


  const loadMore = useCallback(() => {
    if (loadingMore || loading) return;
    setLoadingMore(true);
    setTimeout(() => {
      setItems((prev) => [...prev, ...makeStreams(prev.length, PAGE)]);
      setLoadingMore(false);
    }, 550);
  }, [loadingMore, loading]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => {
      setScrolled(el.scrollTop > 10);
      void dismissKeyboard();
    };
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
          borderBottomColor: scrolled ? "var(--border)" : "rgba(0,0,0,0)",
        }}
        transition={{ duration: 0.2, ease: EASE_IOS }}
        style={{
          backdropFilter: scrolled ? "saturate(180%) blur(20px)" : "none",
          WebkitBackdropFilter: scrolled ? "saturate(180%) blur(20px)" : "none",
          borderBottom: "1px solid transparent",
        }}
      >
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="relative flex h-14 items-center justify-center overflow-visible">
            <Logo size={92} />
          </div>
          <div className="flex items-center gap-1">
            <Press
              aria-label="Notifications"
              className="h-11 w-11 rounded-full"
              style={{ color: "var(--foreground)" }}
              onClick={() => {
                try {
                  window.dispatchEvent(new CustomEvent("kidi:navigate-tab", { detail: "activity" }));
                } catch {}
              }}
            >
              <Bell size={22} strokeWidth={1.9} />
            </Press>
            <Press
              aria-label="Share"
              className="h-11 w-11 rounded-full"
              style={{ color: "var(--foreground)" }}
              onClick={async () => {
                const shareUrl =
                  typeof window !== "undefined" ? window.location.origin : "";
                await nativeShare({
                  title: "KIDI+",
                  text: "Découvre KIDI+, le live shopping où chaque offre peut tout changer.",
                  url: shareUrl,
                });
              }}
            >
              <Share2 size={20} strokeWidth={1.9} />
            </Press>

          </div>

        </div>
      </motion.header>

      {/* Pull-to-refresh indicator */}
      <motion.div
        className="pointer-events-none absolute inset-x-0 z-20 flex justify-center"
        style={{
          top: "calc(env(safe-area-inset-top) + 56px)",
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
        {/* spacer for header only */}
        <div
          aria-hidden
          style={{ height: "calc(env(safe-area-inset-top) + 56px)" }}
        />

        {/* ROW 2 — Large category tiles */}
        <div className="pt-2">
          {loading && items.length === 0 ? (
            <CategoryTilesSkeleton />
          ) : (
            <CategoryTiles active={category} onChange={setCategory} />
          )}
        </div>

        {/* ROW 3 — Filter pills */}
        <div className="pt-3">
          <FilterPills active={filter} onChange={setFilter} />
        </div>

        {/* Upcoming scheduled lives */}
        <UpcomingLivesRow />

        {/* Section title */}
        <h2
          className="px-4 pb-2 pt-5 text-left text-[20px] font-semibold"
          style={{ letterSpacing: "-0.01em", color: "var(--foreground)" }}
        >
          {t("home.livesNearYou")}
        </h2>


        <div className="px-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={category + ":" + filter + (loading ? ":loading" : ":ready")}
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
                : [
                    demoAvailable ? (
                      <DemoCard key="__demo__" onOpen={() => setDemoOpen(true)} />
                    ) : null,
                    ...filtered.map((s, i) => (
                      <LiveCard
                        key={s.id}
                        stream={s}
                        index={i}
                        onPress={() => openList(filtered, i)}
                      />
                    )),
                  ]}

            </motion.div>
          </AnimatePresence>


          {!loading && filtered.length === 0 && (
            <div className="py-16 text-center text-sm text-muted-foreground">
              {t("home.empty")}
            </div>
          )}

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
      <DemoPlayer open={demoOpen} onClose={() => setDemoOpen(false)} src={demoUrl} />
    </div>
  );
}

function easeOut(t: number) {
  return 1 - Math.pow(1 - t, 3);
}
