import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Loader2, RefreshCw, Compass, Home, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Press } from "@/components/press";
import { StoriesRow } from "@/components/vitrine/stories-row";
import { VitrinePostCard } from "@/components/vitrine/vitrine-post-card";
import { VitrineLiveCard, VitrineSoonCard } from "@/components/vitrine/vitrine-live-cards";
import { VitrineVerticalPager } from "@/components/vitrine/vitrine-vertical-pager";
import { haptic } from "@/lib/haptics";
import { openPublish } from "@/lib/publish";
import { useAuth } from "@/lib/auth-context";
import { useAuthPrompt } from "@/lib/auth-prompt-context";
import {
  fetchVitrinePostById,
  fetchVitrinePosts,
  fetchVitrineStories,
  type VitrinePost,
  type VitrineStory,
} from "@/lib/vitrine-db";
import {
  fetchActiveLives,
  fetchUpcomingScheduledLives,
  subscribeToLivesFeed,
  type ScheduledLiveWithSeller,
} from "@/lib/lives-db";
import type { LiveStream } from "@/lib/live-mock";
import {
  sampleLivesForCategory,
  sortLivesNewestFirst,
} from "@/lib/home-categories";
import { useAppActive } from "@/lib/app-state";
import { TabVisibilityContext } from "@/components/app-shell";
import { EASE_IOS } from "@/lib/motion";
import { useBlockedIds } from "@/lib/moderation-db";
import {
  isBrokenMedia,
  isPostMediaBroken,
  subscribeBrokenMedia,
} from "@/lib/vitrine-broken-media";

type Cat = "forYou" | "live" | "soon";

const FEED_POLL_MS = 12_000;
/** Nombre de posts chargés par page (scroll infini). */
const PAGE_SIZE = 8;
const GOLD = "#E8B93B";

export function VitrineScreen() {
  const { t } = useTranslation();
  const appActive = useAppActive();
  const tabVisible = useContext(TabVisibilityContext);
  const blockedIds = useBlockedIds();
  const { user, guestMode } = useAuth();
  const { openAuth } = useAuthPrompt();

  const [cat, setCat] = useState<Cat>("forYou");
  const [storiesOpen, setStoriesOpen] = useState(true);

  const [posts, setPosts] = useState<VitrinePost[]>([]);
  // Incrémenté quand un média du feed échoue à charger (404) → on le retire.
  const [brokenTick, setBrokenTick] = useState(0);
  useEffect(
    () => subscribeBrokenMedia(() => setBrokenTick((n) => n + 1)),
    [],
  );
  const [stories, setStories] = useState<VitrineStory[]>([]);
  const [lives, setLives] = useState<LiveStream[]>([]);
  const [soon, setSoon] = useState<ScheduledLiveWithSeller[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [loadingLives, setLoadingLives] = useState(true);
  const [loadingSoon, setLoadingSoon] = useState(true);
  const [postIndex, setPostIndex] = useState(0);
  const [hasMorePosts, setHasMorePosts] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [liveIndex, setLiveIndex] = useState(0);
  const [soonIndex, setSoonIndex] = useState(0);
  /** Deep-link: open comments on this post after landing on it. */
  const [openCommentsPostId, setOpenCommentsPostId] = useState<string | null>(null);
  const [highlightCommentId, setHighlightCommentId] = useState<string | null>(null);
  const [highlightParentCommentId, setHighlightParentCommentId] = useState<string | null>(null);

  const refreshLives = useCallback(async () => {
    const rows = await fetchActiveLives(60);
    setLives(rows);
    setLoadingLives(false);
  }, []);

  const refreshSoon = useCallback(async () => {
    const rows = await fetchUpcomingScheduledLives(30);
    setSoon(rows);
    setLoadingSoon(false);
  }, []);

  const refreshPosts = useCallback(async () => {
    const [p, s] = await Promise.all([
      fetchVitrinePosts(PAGE_SIZE, 0),
      fetchVitrineStories(30),
    ]);
    setPosts(p);
    setStories(s);
    setHasMorePosts(p.length >= PAGE_SIZE);
    setLoadingPosts(false);
  }, []);

  /** Pagination : charge la page suivante quand on approche de la fin. */
  const loadMorePosts = useCallback(async () => {
    if (loadingMore || !hasMorePosts) return;
    setLoadingMore(true);
    try {
      const next = await fetchVitrinePosts(PAGE_SIZE, posts.length);
      if (next.length === 0) {
        setHasMorePosts(false);
        return;
      }
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...next.filter((p) => !seen.has(p.id))];
      });
      setHasMorePosts(next.length >= PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMorePosts, posts.length]);

  // Same live feed source + realtime as Home.
  useEffect(() => {
    if (!appActive || !tabVisible) return;
    void refreshLives();
    void refreshSoon();
    void refreshPosts();
    const unsub = subscribeToLivesFeed(() => {
      void refreshLives();
      void refreshSoon();
    });
    return unsub;
  }, [appActive, tabVisible, refreshLives, refreshSoon, refreshPosts]);

  useEffect(() => {
    const onRefresh = () => {
      void refreshPosts();
      void refreshSoon();
    };
    window.addEventListener("kidi:vitrine-refresh", onRefresh);
    return () => window.removeEventListener("kidi:vitrine-refresh", onRefresh);
  }, [refreshPosts, refreshSoon]);

  useEffect(() => {
    if (!appActive || !tabVisible) return;
    const iv = setInterval(() => {
      void refreshLives();
      void refreshSoon();
    }, FEED_POLL_MS);
    return () => clearInterval(iv);
  }, [appActive, tabVisible, refreshLives, refreshSoon]);

  // Deep-link from like/comment notifications → jump to that post in Pour toi.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{
        post_id?: string;
        comment_id?: string;
        parent_comment_id?: string;
        open_comments?: boolean;
      }>).detail;
      const postId = detail?.post_id;
      if (!postId) return;
      setCat("forYou");
      setStoriesOpen(false);
      setOpenCommentsPostId(detail?.open_comments ? postId : null);
      setHighlightCommentId(detail?.comment_id ?? null);
      setHighlightParentCommentId(detail?.parent_comment_id ?? null);
      void (async () => {
        const rows = await fetchVitrinePosts(PAGE_SIZE * 3, 0);
        let next = rows;
        let idx = rows.findIndex((p) => p.id === postId);
        if (idx < 0) {
          const targeted = await fetchVitrinePostById(postId);
          if (targeted) {
            next = [targeted, ...rows.filter((p) => p.id !== targeted.id)];
            idx = 0;
          }
        }
        setPosts(next);
        setLoadingPosts(false);
        setPostIndex(idx >= 0 ? idx : 0);
      })();
    };
    window.addEventListener("kidi:open-vitrine-post", onOpen as EventListener);
    return () => window.removeEventListener("kidi:open-vitrine-post", onOpen as EventListener);
  }, []);

  // Hide stories once the user advances in the feed; pull-down brings them back.
  useEffect(() => {
    if (cat === "forYou" && postIndex > 0) setStoriesOpen(false);
    if (cat === "live" && liveIndex > 0) setStoriesOpen(false);
    if (cat === "soon" && soonIndex > 0) setStoriesOpen(false);
  }, [cat, postIndex, liveIndex, soonIndex]);

  // Same composition as Home "Pour toi": real DB lives first, then the
  // Guideline 2.1(a) fictitious sample filler so En direct never looks empty
  // when Home is showing demo/review lives.
  const liveVisible = useMemo(() => {
    const realVisible = lives.filter(
      (s) => !s.sellerId || !blockedIds.has(s.sellerId),
    );
    const samples = sampleLivesForCategory("Pour toi", realVisible.length);
    return [...sortLivesNewestFirst(realVisible), ...samples];
  }, [lives, blockedIds]);

  // Hide UGC from blocked authors (posts / stories / bientôt).
  const postsVisible = useMemo(
    () =>
      posts.filter(
        (p) =>
          (!p.user_id || p.user_id.startsWith("demo-") || !blockedIds.has(p.user_id)) &&
          !isPostMediaBroken(p.media_urls),
      ),
    // brokenTick force le recalcul quand un média 404 est détecté.
    [posts, blockedIds, brokenTick],
  );
  const storiesVisible = useMemo(
    () =>
      stories.filter(
        (s) =>
          (!s.user_id || s.user_id.startsWith("demo-") || !blockedIds.has(s.user_id)) &&
          !isBrokenMedia(s.media_url),
      ),
    [stories, blockedIds, brokenTick],
  );
  const soonVisible = useMemo(
    () => soon.filter((s) => !s.seller_id || !blockedIds.has(s.seller_id)),
    [soon, blockedIds],
  );

  const goHome = () => {
    haptic.light();
    window.dispatchEvent(new CustomEvent("kidi:navigate-tab", { detail: "home" }));
  };
  const goExplore = () => {
    haptic.light();
    window.dispatchEvent(new CustomEvent("kidi:navigate-tab", { detail: "search" }));
  };
  const goPublish = () => {
    if (guestMode || !user) {
      openAuth();
      return;
    }
    haptic.medium();
    openPublish();
  };

  const selectCat = (next: Cat) => {
    haptic.selection();
    setCat(next);
    setStoriesOpen(true);
  };

  const CAT_ORDER: Cat[] = ["forYou", "live", "soon"];
  const swipeCategory = (dir: "left" | "right") => {
    const i = CAT_ORDER.indexOf(cat);
    const next = dir === "left" ? i + 1 : i - 1;
    if (next < 0 || next >= CAT_ORDER.length) return;
    selectCat(CAT_ORDER[next]!);
  };

  const empty = (
    message: string,
    onRefresh: () => void,
  ) => (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-black px-8 text-center">
      <p className="text-[14px] text-white/70">{message}</p>
      <div className="flex gap-2">
        <Press
          onClick={() => { haptic.light(); onRefresh(); }}
          className="!min-h-9 flex h-9 items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 text-[13px] font-semibold text-white"
        >
          <RefreshCw size={14} />
          {t("vitrine.refresh")}
        </Press>
        <Press
          onClick={goExplore}
          className="!min-h-9 flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-[#10162B]"
          style={{ background: GOLD }}
        >
          <Compass size={14} />
          {t("vitrine.explore")}
        </Press>
      </div>
    </div>
  );

  const feed = (() => {
    if (cat === "forYou") {
      if (loadingPosts) {
        return (
          <div className="grid h-full place-items-center bg-black">
            <Loader2 className="animate-spin text-white/60" size={22} />
          </div>
        );
      }
      if (postsVisible.length === 0) {
        return empty(t("vitrine.emptyForYou"), () => {
          setLoadingPosts(true);
          void refreshPosts();
        });
      }
      return (
        <VitrineVerticalPager
          count={postsVisible.length}
          index={Math.min(postIndex, postsVisible.length - 1)}
          onIndexChange={(i) => {
            setPostIndex(i);
            if (i > 0) setStoriesOpen(false);
            if (i >= postsVisible.length - 3) void loadMorePosts();
          }}

          onPullReveal={() => setStoriesOpen(true)}
          onSwipeCategory={swipeCategory}
        >
          {(i) => {
            const post = postsVisible[i];
            if (!post) return null;
            return (
              <VitrinePostCard
                key={post.id}
                post={post}
                active={i === Math.min(postIndex, postsVisible.length - 1)}
                autoOpenComments={openCommentsPostId === post.id}
                highlightCommentId={
                  openCommentsPostId === post.id ? highlightCommentId : null
                }
                highlightParentCommentId={
                  openCommentsPostId === post.id ? highlightParentCommentId : null
                }
                onCommentsAutoOpened={() => {
                  setOpenCommentsPostId(null);
                  setHighlightCommentId(null);
                  setHighlightParentCommentId(null);
                }}
                onBlocked={() => {
                  // Advance past this post; blockedIds filter removes the author.
                  setPostIndex((idx) => Math.min(idx, Math.max(0, postsVisible.length - 2)));
                }}
                onDeleted={() => {
                  setPosts((prev) => prev.filter((x) => x.id !== post.id));
                  setPostIndex((idx) => Math.max(0, Math.min(idx, postsVisible.length - 2)));
                }}
                onUpdated={(p) =>
                  setPosts((prev) => prev.map((x) => (x.id === p.id ? p : x)))
                }
              />
            );
          }}
        </VitrineVerticalPager>
      );
    }

    if (cat === "live") {
      if (loadingLives) {
        return (
          <div className="grid h-full place-items-center bg-black">
            <Loader2 className="animate-spin text-white/60" size={22} />
          </div>
        );
      }
      if (liveVisible.length === 0) {
        return empty(t("vitrine.emptyLive"), () => {
          setLoadingLives(true);
          void refreshLives();
        });
      }
      return (
        <VitrineVerticalPager
          count={liveVisible.length}
          index={Math.min(liveIndex, liveVisible.length - 1)}
          onIndexChange={(i) => {
            setLiveIndex(i);
            if (i > 0) setStoriesOpen(false);
          }}
          onPullReveal={() => setStoriesOpen(true)}
          onSwipeCategory={swipeCategory}
        >
          {(i) => {
            const stream = liveVisible[i];
            if (!stream) return null;
            return (
              <VitrineLiveCard stream={stream} list={liveVisible} index={i} />
            );
          }}
        </VitrineVerticalPager>
      );
    }

    if (loadingSoon) {
      return (
        <div className="grid h-full place-items-center bg-black">
          <Loader2 className="animate-spin text-white/60" size={22} />
        </div>
      );
    }
    if (soonVisible.length === 0) {
      return empty(t("vitrine.emptySoon"), () => {
        setLoadingSoon(true);
        void refreshSoon();
      });
    }
    return (
      <VitrineVerticalPager
        count={soonVisible.length}
        index={Math.min(soonIndex, soonVisible.length - 1)}
        onIndexChange={(i) => {
          setSoonIndex(i);
          if (i > 0) setStoriesOpen(false);
        }}
        onPullReveal={() => setStoriesOpen(true)}
        onSwipeCategory={swipeCategory}
      >
        {(i) => {
          const row = soonVisible[i];
          if (!row) return null;
          return <VitrineSoonCard live={row} />;
        }}
      </VitrineVerticalPager>
    );
  })();

  const cats: { key: Cat; label: string }[] = [
    { key: "forYou", label: t("vitrine.tabs.forYou") },
    { key: "live", label: t("vitrine.tabs.live") },
    { key: "soon", label: t("vitrine.tabs.soon") },
  ];

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      {/* Full-bleed feed */}
      <div className="absolute inset-0">{feed}</div>

      {/* Top chrome: home / categories / search — overlaid on feed */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-40 pt-safe"
        style={{
          backgroundImage:
            "linear-gradient(to bottom, rgba(0,0,0,0.55), rgba(0,0,0,0))",
        }}
      >
        <div className="pointer-events-auto flex items-center gap-1 px-2 py-1">
          <Press
            aria-label={t("tabs.home")}
            onClick={goHome}
            className="h-11 w-11 shrink-0 rounded-full text-white"
          >
            <Home size={22} strokeWidth={1.9} />
          </Press>

          <div className="flex min-w-0 flex-1 items-center justify-center gap-1">
            {cats.map((c) => {
              const active = cat === c.key;
              return (
                <Press
                  key={c.key}
                  onClick={() => selectCat(c.key)}
                  className="!min-h-9 rounded-full px-3 text-[14px] font-semibold"
                  style={{
                    color: active ? "#fff" : "rgba(255,255,255,0.55)",
                    textShadow: "0 1px 4px rgba(0,0,0,0.45)",
                    borderBottom: active ? `2px solid ${GOLD}` : "2px solid transparent",
                    borderRadius: 0,
                  }}
                >
                  {c.label}
                </Press>
              );
            })}
          </div>

          <Press
            aria-label={t("publish.cta", { defaultValue: "Publier" })}
            onClick={goPublish}
            className="h-11 w-11 shrink-0 rounded-full text-white"
          >
            <Plus size={26} strokeWidth={2.2} />
          </Press>
        </div>

        {/* Stories: shown initially + after pull-down */}
        <AnimatePresence initial={false}>
          {storiesOpen && (
            <motion.div
              key="stories"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: EASE_IOS }}
              className="pointer-events-auto overflow-hidden"
            >
              <StoriesRow
                stories={storiesVisible}
                tone="dark"
                onStoryDeleted={(id) =>
                  setStories((prev) => prev.filter((s) => s.id !== id))
                }
                onCreate={() => {
                  if (guestMode || !user) {
                    openAuth();
                    return;
                  }
                  openPublish();
                }}
              />
              <div className="flex justify-center pb-1">
                <Press
                  aria-label={t("common.close", { defaultValue: "Fermer" })}
                  onClick={() => {
                    haptic.light();
                    setStoriesOpen(false);
                  }}
                  className="!min-h-7 h-7 rounded-full px-3 text-white/70"
                >
                  <ChevronDown size={18} />
                </Press>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!storiesOpen && (
          <p className="pointer-events-none pb-2 text-center text-[10px] font-medium text-white/45">
            {t("vitrine.pullStories", {
              defaultValue: "Tire vers le bas pour les stories",
            })}
          </p>
        )}
      </div>

    </div>
  );
}
