import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Loader2, RefreshCw, Compass } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Press } from "@/components/press";
import { SwipeableTabs } from "@/components/swipeable-tabs";
import { StoriesRow } from "@/components/vitrine/stories-row";
import { VitrinePostCard } from "@/components/vitrine/vitrine-post-card";
import { VitrineLiveCard, VitrineSoonCard } from "@/components/vitrine/vitrine-live-cards";
import { VitrineVerticalPager } from "@/components/vitrine/vitrine-vertical-pager";
import { haptic } from "@/lib/haptics";
import {
  fetchVitrinePosts,
  fetchVitrineStories,
  type VitrinePost,
  type VitrineStory,
} from "@/lib/vitrine-db";
import {
  fetchActiveLives,
  fetchUpcomingScheduledLives,
  type ScheduledLiveWithSeller,
} from "@/lib/lives-db";
import type { LiveStream } from "@/lib/live-mock";
import { useAppActive } from "@/lib/app-state";

type Cat = "forYou" | "live" | "soon";

export function VitrineScreen() {
  const { t } = useTranslation();
  const appActive = useAppActive();
  const [tab, setTab] = useState(0);
  const [storiesCollapsed, setStoriesCollapsed] = useState(false);

  const [posts, setPosts] = useState<VitrinePost[]>([]);
  const [stories, setStories] = useState<VitrineStory[]>([]);
  const [lives, setLives] = useState<LiveStream[]>([]);
  const [soon, setSoon] = useState<ScheduledLiveWithSeller[]>([]);
  const [loading, setLoading] = useState(true);
  const [postIndex, setPostIndex] = useState(0);
  const [liveIndex, setLiveIndex] = useState(0);
  const [soonIndex, setSoonIndex] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const [p, s, l, u] = await Promise.all([
      fetchVitrinePosts(40),
      fetchVitrineStories(30),
      fetchActiveLives(40),
      fetchUpcomingScheduledLives(30),
    ]);
    setPosts(p);
    setStories(s);
    setLives(l);
    setSoon(u);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!appActive) return;
    void load();
  }, [appActive, load]);

  // Collapse stories once user swipes past first post in Pour toi.
  useEffect(() => {
    if (tab === 0) setStoriesCollapsed(postIndex > 0);
    else setStoriesCollapsed(true);
  }, [tab, postIndex]);

  const goExplore = () => {
    haptic.light();
    window.dispatchEvent(new CustomEvent("kidi:navigate-tab", { detail: "search" }));
  };

  const empty = (
    message: string,
    opts?: { explore?: boolean; refresh?: boolean },
  ) => (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
      <p className="text-[14px] text-muted-foreground">{message}</p>
      <div className="flex gap-2">
        {opts?.refresh !== false && (
          <Press
            onClick={() => { haptic.light(); void load(); }}
            className="!min-h-9 flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-[13px] font-semibold"
          >
            <RefreshCw size={14} />
            {t("vitrine.refresh")}
          </Press>
        )}
        {opts?.explore && (
          <Press
            onClick={goExplore}
            className="!min-h-9 flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-[#10162B]"
            style={{ background: "#E8B93B" }}
          >
            <Compass size={14} />
            {t("vitrine.explore")}
          </Press>
        )}
      </div>
    </div>
  );

  const tabs = useMemo(
    () => [
      {
        key: "forYou" as Cat,
        label: t("vitrine.tabs.forYou"),
        content: loading ? (
          <div className="grid h-full place-items-center bg-background">
            <Loader2 className="animate-spin text-muted-foreground" size={22} />
          </div>
        ) : posts.length === 0 ? (
          empty(t("vitrine.emptyForYou"), { explore: true })
        ) : (
          <div className="h-full min-h-[50dvh] overflow-hidden">
            <VitrineVerticalPager
              count={posts.length}
              index={Math.min(postIndex, posts.length - 1)}
              onIndexChange={setPostIndex}
            >
              {(i) => {
                const post = posts[i];
                if (!post) return null;
                return (
                  <VitrinePostCard
                    post={post}
                    onUpdated={(p) =>
                      setPosts((prev) => prev.map((x) => (x.id === p.id ? p : x)))
                    }
                  />
                );
              }}
            </VitrineVerticalPager>
          </div>
        ),
      },
      {
        key: "live" as Cat,
        label: t("vitrine.tabs.live"),
        content: loading ? (
          <div className="grid h-full place-items-center">
            <Loader2 className="animate-spin text-muted-foreground" size={22} />
          </div>
        ) : lives.length === 0 ? (
          empty(t("vitrine.emptyLive"), { explore: true })
        ) : (
          <div className="h-full min-h-[50dvh] overflow-hidden">
            <VitrineVerticalPager
              count={lives.length}
              index={Math.min(liveIndex, lives.length - 1)}
              onIndexChange={setLiveIndex}
            >
              {(i) => {
                const stream = lives[i];
                if (!stream) return null;
                return <VitrineLiveCard stream={stream} list={lives} index={i} />;
              }}
            </VitrineVerticalPager>
          </div>
        ),
      },
      {
        key: "soon" as Cat,
        label: t("vitrine.tabs.soon"),
        content: loading ? (
          <div className="grid h-full place-items-center">
            <Loader2 className="animate-spin text-muted-foreground" size={22} />
          </div>
        ) : soon.length === 0 ? (
          empty(t("vitrine.emptySoon"), { explore: true })
        ) : (
          <div className="h-full min-h-[50dvh] overflow-hidden">
            <VitrineVerticalPager
              count={soon.length}
              index={Math.min(soonIndex, soon.length - 1)}
              onIndexChange={setSoonIndex}
            >
              {(i) => {
                const row = soon[i];
                if (!row) return null;
                return <VitrineSoonCard live={row} />;
              }}
            </VitrineVerticalPager>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, loading, posts, lives, soon, postIndex, liveIndex, soonIndex],
  );

  return (
    <div className="flex h-full flex-col bg-background">
      <div
        className="relative z-20 shrink-0 pt-safe"
        style={{
          backgroundColor: "color-mix(in oklch, var(--background) 92%, transparent)",
          backdropFilter: "saturate(180%) blur(16px)",
          WebkitBackdropFilter: "saturate(180%) blur(16px)",
        }}
      >
        <div className="flex items-center justify-between px-3 py-1.5">
          <h1 className="text-[20px] font-bold tracking-tight">{t("vitrine.title")}</h1>
          <Press
            aria-label={t("vitrine.explore")}
            onClick={goExplore}
            className="h-11 w-11 rounded-full"
            style={{ color: "var(--foreground)" }}
          >
            <Search size={22} strokeWidth={1.9} />
          </Press>
        </div>
        <StoriesRow stories={stories} collapsed={storiesCollapsed} />
      </div>

      <div className="min-h-0 flex-1">
        <SwipeableTabs
          tabs={tabs}
          index={tab}
          onIndexChange={setTab}
          sticky
        />
      </div>
    </div>
  );
}
