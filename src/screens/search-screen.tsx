import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search, Clock, X, SearchX, Radio } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Press } from "@/components/press";
import { SwipeableTabs, type TabDef } from "@/components/swipeable-tabs";
import { LiveCard } from "@/components/live-card";
import type { LiveStream } from "@/lib/live-mock";
import { useLiveViewer } from "@/lib/live-viewer-context";
import { useSellerProfile } from "@/lib/seller-profile-context";
import { formatMoney, normalizeCurrency } from "@/lib/money";
import { EASE_IOS } from "@/lib/motion";
import {
  BROWSE_CATEGORIES,
  type BrowseCategory,
} from "@/lib/browse-mock";
import { formatViewersLabel, formatFollowersLabel } from "@/i18n/format";
import { useLanguage } from "@/i18n/language-context";
import {
  fetchActiveSellers,
  searchSellerProfiles,
  type SellerProfile,
} from "@/lib/sellers-db";
import { searchActiveLives } from "@/lib/lives-db";
import {
  searchActiveShopProducts,
  resolveShopImage,
  type ShopProductWithSeller,
} from "@/lib/shop-db";
import { resolveAvatarUrl } from "@/lib/avatar-url";
import { FollowButton } from "@/components/follow-button";

type CategorySort = "recommended" | "popular" | "alpha";
const CATEGORY_SORTS: CategorySort[] = ["recommended", "popular", "alpha"];

type SellerScope = "all" | "live";

type TrendItem = { id: string; label: string; viewers: number; image: string | null };



export function SearchScreen() {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const [focused, setFocused] = useState(false);
  const [rawQuery, setRawQuery] = useState("");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState(0);
  const [recent, setRecent] = useState<string[]>([
    "jordan 4", "chanel", "iphone", "pokémon", "ysl",
  ]);
  const [browseLoading, setBrowseLoading] = useState(true);
  const [sort, setSort] = useState<CategorySort>("recommended");
  const [sellerScope, setSellerScope] = useState<SellerScope>("all");
  const [dbSellers, setDbSellers] = useState<SellerProfile[]>([]);
  const [sellerAvatars, setSellerAvatars] = useState<Record<string, string | null>>({});
  const [activeSellerIds, setActiveSellerIds] = useState<Set<string>>(new Set());
  const [activeLives, setActiveLives] = useState<LiveStream[]>([]);
  const [sellerLoading, setSellerLoading] = useState(false);

  const [liveResults, setLiveResults] = useState<LiveStream[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);

  const [productResults, setProductResults] = useState<ShopProductWithSeller[]>([]);
  const [productImgs, setProductImgs] = useState<Record<string, string | null>>({});
  const [productLoading, setProductLoading] = useState(false);

  // Trends: derived from currently-live streams grouped by category.
  const [trends, setTrends] = useState<TrendItem[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const { open: openLive } = useLiveViewer();
  const { open: openSeller } = useSellerProfile();

  // Debounce 200ms
  useEffect(() => {
    const handle = setTimeout(() => setQuery(rawQuery.trim()), 200);
    return () => clearTimeout(handle);
  }, [rawQuery]);

  // First-paint skeleton for the browse (Tendances + Catégories) section
  useEffect(() => {
    const t = setTimeout(() => setBrowseLoading(false), 300);
    return () => clearTimeout(t);
  }, []);

  const searching = query.length > 0;

  // Load trends (grouped active lives) on browse view.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { lives } = await fetchActiveSellers();
      if (cancelled) return;
      const byCat = new Map<string, { viewers: number; image: string | null }>();
      for (const l of lives) {
        const key = l.category ?? "Autres";
        const prev = byCat.get(key) ?? { viewers: 0, image: null };
        byCat.set(key, {
          viewers: prev.viewers + (l.viewers || 0),
          image: prev.image ?? l.thumbnail ?? null,
        });
      }
      const list: TrendItem[] = Array.from(byCat.entries())
        .map(([label, v]) => ({ id: label, label, viewers: v.viewers, image: v.image }))
        .sort((a, b) => b.viewers - a.viewers)
        .slice(0, 8);
      setTrends(list);
    })();
    return () => { cancelled = true; };
  }, []);

  // Load real seller profiles + active seller ids whenever the query changes.
  useEffect(() => {
    if (!searching) {
      setDbSellers([]);
      setSellerAvatars({});
      setActiveSellerIds(new Set());
      setActiveLives([]);
      setLiveResults([]);
      setProductResults([]);
      setProductImgs({});
      setSellerLoading(false);
      setLiveLoading(false);
      setProductLoading(false);
      return;
    }
    let cancelled = false;
    setSellerLoading(true);
    setLiveLoading(true);
    setProductLoading(true);

    void Promise.all([
      searchSellerProfiles(query, 30),
      fetchActiveSellers(),
      searchActiveLives(query, 40),
      searchActiveShopProducts(query, 40),
    ])
      .then(async ([profiles, active, lives, products]) => {
        if (cancelled) return;
        setDbSellers(profiles);
        setActiveSellerIds(active.ids);
        setActiveLives(active.lives);
        setLiveResults(lives);
        setProductResults(products);

        // Resolve avatars for sellers in parallel.
        const entries = await Promise.all(
          profiles.map(async (p) => [p.id, await resolveAvatarUrl(p.avatar_url)] as const),
        );
        if (!cancelled) {
          setSellerAvatars(Object.fromEntries(entries));
        }

        // Resolve product cover images in parallel.
        const pEntries = await Promise.all(
          products.map(async (p) => [p.id, await resolveShopImage(p.image_url)] as const),
        );
        if (!cancelled) {
          setProductImgs(Object.fromEntries(pEntries));
        }
      })
      .catch((err) => console.error("[SearchScreen] search failed", err))
      .finally(() => {
        if (cancelled) return;
        setSellerLoading(false);
        setLiveLoading(false);
        setProductLoading(false);
      });

    return () => { cancelled = true; };
  }, [query, searching]);

  const sellerResults = useMemo(() => {
    if (sellerScope === "live") {
      return dbSellers.filter((p) => activeSellerIds.has(p.id));
    }
    return dbSellers;
  }, [dbSellers, activeSellerIds, sellerScope]);

  // For LiveCard rendering in the Lives tab, use real active lives filtered by query
  // (already returned by searchActiveLives). No mock streams.
  const liveResultsToRender = liveResults;
  void activeLives; // reserved for future use


  const commitRecent = (term: string) => {

    const t = term.trim();
    if (!t) return;
    setRecent((r) => [t, ...r.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, 8));
  };

  const cancel = () => {
    setRawQuery("");
    setQuery("");
    setFocused(false);
    inputRef.current?.blur();
  };

  const openCategory = (c: BrowseCategory) => {
    commitRecent(c.name);
    setRawQuery(c.query);
    setQuery(c.query);
    setFocused(true);
    setTab(0);
  };

  const openTrend = (tr: TrendItem) => {
    commitRecent(tr.label);
    setRawQuery(tr.label);
    setQuery(tr.label);
    setFocused(true);
    setTab(0);
  };


  const sortedCategories = useMemo(() => {
    switch (sort) {
      case "recommended":
        return BROWSE_CATEGORIES;
      case "popular":
        return [...BROWSE_CATEGORIES].sort((a, b) => b.viewers - a.viewers);
      case "alpha":
        return [...BROWSE_CATEGORIES].sort((a, b) =>
          t(a.nameKey).localeCompare(t(b.nameKey), lang),
        );
      default:
        return BROWSE_CATEGORIES;
    }
  }, [sort, t, lang]);

  const tabs: TabDef[] = [
    {
      key: "lives",
      label: `${t("search.tabs.lives")}${liveResultsToRender.length ? ` (${liveResultsToRender.length})` : ""}`,
      content: (
        <div className="px-4 py-3">
          {liveLoading ? (
            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton" style={{ aspectRatio: "3 / 4", borderRadius: 18 }} />
              ))}
            </div>
          ) : liveResultsToRender.length === 0 ? (
            <EmptyResults query={query} />
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {liveResultsToRender.map((s, i) => (
                <LiveCard
                  key={s.id}
                  stream={s}
                  index={i}
                  onPress={(st) => {
                    commitRecent(query);
                    openLive(st);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "vendeurs",
      label: `${t("search.tabs.sellers")}${sellerResults.length ? ` (${sellerResults.length})` : ""}`,
      content: (
        <div className="px-4 py-2">
          <SellerScopeFilter value={sellerScope} onChange={setSellerScope} />
          {sellerLoading ? (
            <div className="space-y-2 py-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-2.5">
                  <div className="skeleton h-11 w-11 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="skeleton h-4 w-1/2 rounded" />
                    <div className="skeleton h-3 w-1/3 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : sellerResults.length === 0 ? (
            <EmptyResults query={query} />
          ) : (
            <ul className="divide-y divide-border/60">
              {sellerResults.map((p, i) => (
                <SellerRow
                  key={p.id}
                  profile={p}
                  avatar={sellerAvatars[p.id] ?? null}
                  index={i}
                  isLive={activeSellerIds.has(p.id)}
                  onOpen={() => {
                    commitRecent(query);
                    openSeller(p.handle || p.display_name);
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      ),
    },
    {
      key: "produits",
      label: `${t("search.tabs.products")}${productResults.length ? ` (${productResults.length})` : ""}`,
      content: (
        <div className="px-4 py-3">
          {productLoading ? (
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton" style={{ aspectRatio: "1 / 1", borderRadius: 18 }} />
              ))}
            </div>
          ) : productResults.length === 0 ? (
            <EmptyResults query={query} />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {productResults.map((p, i) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, ease: EASE_IOS, delay: Math.min(i, 12) * 0.03 }}
                >
                  <Press
                    onClick={() => {
                      commitRecent(query);
                      openSeller(p.seller_handle || p.seller_display_name);
                    }}
                    className="!block h-full w-full overflow-hidden rounded-2xl bg-muted p-0 text-left"
                  >
                    <div className="relative w-full" style={{ aspectRatio: "1 / 1" }}>
                      {productImgs[p.id] ? (
                        <img
                          src={productImgs[p.id]!}
                          alt=""
                          loading="lazy"
                          className="absolute inset-0 h-full w-full object-cover"
                          onLoad={(e) => e.currentTarget.setAttribute("data-loaded", "true")}
                          draggable={false}
                        />
                      ) : (
                        <div className="absolute inset-0 grid place-items-center text-muted-foreground">
                          <Search size={22} />
                        </div>
                      )}
                    </div>
                    <div className="p-2">
                      <p className="truncate text-[13px] font-medium">{p.name}</p>
                      <div className="flex items-center justify-between">
                        <span className="truncate text-[11px] text-muted-foreground">
                          {p.seller_display_name}
                        </span>
                        <span className="text-[13px] font-bold">
                          {formatMoney(Number(p.price), normalizeCurrency(p.currency))}
                        </span>
                      </div>
                    </div>
                  </Press>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      ),
    },
  ];


  // The "results" pane covers both a typed query AND the focused-but-empty
  // state (recent searches). Anything else is the default browse view.
  const showResults = searching;
  const showFocusedEmpty = focused && !searching;

  return (
    <div className="flex h-full flex-col">
      {/* Search bar header */}
      <div
        className="shrink-0 pt-safe"
        style={{
          backgroundColor: "color-mix(in oklch, var(--background) 92%, transparent)",
          backdropFilter: "saturate(180%) blur(18px)",
          WebkitBackdropFilter: "saturate(180%) blur(18px)",
        }}
      >
        <div className="flex items-center gap-2 px-4 py-2.5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              commitRecent(rawQuery);
              inputRef.current?.blur();
            }}
            className="relative flex-1"
          >
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              strokeWidth={2.2}
            />
            <input
              ref={inputRef}
              value={rawQuery}
              onChange={(e) => setRawQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              placeholder={t("search.placeholder")}
              className="h-10 w-full rounded-full bg-muted pl-9 pr-9 text-[14px] outline-none placeholder:text-muted-foreground/80"
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <AnimatePresence>
              {rawQuery && (
                <motion.button
                  type="button"
                  aria-label={t("common.clear")}
                  onClick={() => {
                    setRawQuery("");
                    setQuery("");
                    inputRef.current?.focus();
                  }}
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={{ duration: 0.15, ease: EASE_IOS }}
                  className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full bg-foreground/15 text-foreground"
                >
                  <X size={12} strokeWidth={3} />
                </motion.button>
              )}
            </AnimatePresence>
          </form>

          <AnimatePresence>
            {focused && (
              <motion.div
                key="cancel"
                initial={{ opacity: 0, x: 20, width: 0 }}
                animate={{ opacity: 1, x: 0, width: "auto" }}
                exit={{ opacity: 0, x: 20, width: 0 }}
                transition={{ duration: 0.2, ease: EASE_IOS }}
                className="overflow-hidden"
              >
                <Press
                  onClick={cancel}
                  className="!min-h-10 px-1 text-[14px] font-semibold text-accent"
                >
                  {t("common.cancel")}
                </Press>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1">
        <AnimatePresence mode="wait">
          {showResults ? (
            <motion.div
              key="results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: EASE_IOS }}
              className="h-full"
              style={{ paddingBottom: "calc(3.5rem + env(safe-area-inset-bottom))" }}
            >
              <SwipeableTabs tabs={tabs} index={tab} onIndexChange={setTab} />
            </motion.div>
          ) : showFocusedEmpty ? (
            <motion.div
              key="focused"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: EASE_IOS }}
              className="h-full overflow-y-auto"
              style={{
                paddingBottom: "calc(3.5rem + env(safe-area-inset-bottom))",
                WebkitOverflowScrolling: "touch",
                overscrollBehavior: "contain",
              }}
            >
              {recent.length > 0 && (
                <div className="px-4 pt-3">
                  <div className="mb-1 flex items-center justify-between">
                    <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("search.recent")}
                    </h2>
                    <Press
                      onClick={() => setRecent([])}
                      className="!min-h-8 text-[12px] font-semibold text-accent"
                    >
                      {t("common.clear")}
                    </Press>
                  </div>
                  <ul>
                    {recent.map((r, i) => (
                      <motion.li
                        key={r}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.18, ease: EASE_IOS, delay: i * 0.02 }}
                      >
                        <div className="flex w-full items-center justify-between">
                          <Press
                            onClick={() => {
                              setRawQuery(r);
                              setQuery(r);
                            }}
                            className="!min-h-11 flex flex-1 items-center justify-start gap-3 rounded-lg px-2 text-left text-[14px]"
                          >
                            <Clock size={16} className="text-muted-foreground" strokeWidth={2} />
                            {r}
                          </Press>
                          <button
                            type="button"
                            aria-label={`${t("common.remove")} ${r}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setRecent((rs) => rs.filter((x) => x !== r));
                            }}
                            className="ml-1 grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground"
                          >
                            <X size={13} strokeWidth={2.4} />
                          </button>
                        </div>

                      </motion.li>
                    ))}
                  </ul>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="browse"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: EASE_IOS }}
              className="h-full overflow-y-auto"
              style={{
                paddingBottom: "calc(3.5rem + env(safe-area-inset-bottom))",
                WebkitOverflowScrolling: "touch",
                overscrollBehavior: "contain",
              }}
            >
              {/* Tendances du jour — real active-live categories, hidden if none */}
              {(browseLoading || trends.length > 0) && (
                <div className="pt-4">
                  <div className="flex items-end justify-between px-4">
                    <h2
                      className="text-[22px] font-bold"
                      style={{ letterSpacing: "-0.01em" }}
                    >
                      {t("search.trending")}
                    </h2>
                  </div>

                  <div className="pt-3">
                    {browseLoading ? (
                      <TrendsSkeleton />
                    ) : (
                      <TrendsRow trends={trends} onTap={openTrend} />
                    )}
                  </div>
                </div>
              )}


              {/* Catégories */}
              <div className="pt-7">
                <h2
                  className="px-4 text-[26px] font-bold"
                  style={{ letterSpacing: "-0.015em" }}
                >
                  {t("search.categories")}
                </h2>

                <div
                  className="flex gap-2 overflow-x-auto px-4 pt-3"
                  style={{
                    scrollSnapType: "x proximity",
                    WebkitOverflowScrolling: "touch",
                    overscrollBehaviorX: "contain",
                  }}
                >
                  {CATEGORY_SORTS.map((s) => {
                    const isActive = s === sort;
                    return (
                      <Press
                        key={s}
                        onClick={() => setSort(s)}
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
                        {t(`search.sort.${s}`)}
                      </Press>
                    );
                  })}
                </div>

                <div className="grid grid-cols-2 gap-2 px-4 pt-3">
                  {browseLoading
                    ? Array.from({ length: 6 }).map((_, i) => (
                        <div
                          key={`csk-${i}`}
                          className="skeleton"
                          style={{ height: 180, borderRadius: 18 }}
                        />
                      ))
                    : sortedCategories.map((c, i) => (
                        <CategoryCard
                          key={c.id}
                          category={c}
                          index={i}
                          onTap={() => openCategory(c)}
                        />
                      ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* -------------------------------- Trends -------------------------------- */

function TrendsRow({
  trends,
  onTap,
}: {
  trends: TrendItem[];
  onTap: (t: TrendItem) => void;
}) {
  const { lang } = useLanguage();
  return (
    <div
      className="overflow-x-auto px-4 pb-1"
      style={{
        scrollSnapType: "x mandatory",
        WebkitOverflowScrolling: "touch",
        overscrollBehaviorX: "contain",
      }}
    >
      <div
        className="grid grid-flow-col grid-rows-2"
        style={{ gap: 8, gridAutoColumns: "260px" }}
      >
        {trends.map((trend, i) => (
          <motion.div
            key={trend.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: EASE_IOS, delay: Math.min(i, 8) * 0.025 }}
            style={{ scrollSnapAlign: "start" }}
          >
            <Press
              onClick={() => onTap(trend)}
              className="!min-h-0 flex w-full items-center gap-3 rounded-2xl bg-muted p-2 text-left"
              style={{ height: 64 }}
            >
              {trend.image ? (
                <img
                  src={trend.image}
                  alt=""
                  loading="lazy"
                  onLoad={(e) => e.currentTarget.setAttribute("data-loaded", "true")}
                  className="h-12 w-12 shrink-0 rounded-xl object-cover"
                  draggable={false}
                />
              ) : (
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-background/50 text-muted-foreground">
                  <Radio size={16} />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-bold">{trend.label}</p>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <LiveDot />
                  <span className="truncate text-[12px] text-muted-foreground">
                    {formatViewersLabel(trend.viewers, lang)}
                  </span>
                </div>
              </div>
            </Press>
          </motion.div>
        ))}
      </div>
    </div>
  );
}


function TrendsSkeleton() {
  return (
    <div
      className="overflow-hidden px-4"
      style={{ overscrollBehaviorX: "contain" }}
    >
      <div
        className="grid grid-flow-col grid-rows-2"
        style={{ gap: 8, gridAutoColumns: "260px" }}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="skeleton"
            style={{ height: 64, borderRadius: 18 }}
          />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------ Category card ---------------------------- */

function CategoryCard({
  category,
  index,
  onTap,
}: {
  category: BrowseCategory;
  index: number;
  onTap: () => void;
}) {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.2,
        ease: EASE_IOS,
        delay: Math.min(index, 10) * 0.03,
      }}
    >
      <Press
        onClick={onTap}
        className="!block relative w-full overflow-hidden rounded-2xl bg-muted p-0 text-left"
        style={{ height: 180 }}
      >
        <span
          className="absolute left-3 top-3 text-left text-[15px] font-extrabold leading-tight"
          style={{
            color: "var(--foreground)",
            letterSpacing: "-0.01em",
            maxWidth: "78%",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {t(category.nameKey)}
        </span>

        <img
          src={category.image}
          alt=""
          loading="lazy"
          onLoad={(e) => e.currentTarget.setAttribute("data-loaded", "true")}
          draggable={false}
          style={{
            position: "absolute",
            left: "50%",
            top: "52%",
            transform: "translate(-50%, -50%)",
            width: 90,
            height: 90,
            objectFit: "cover",
            borderRadius: 16,
            boxShadow: "0 8px 20px rgba(0,0,0,0.14)",
          }}
        />

        <div className="absolute bottom-2.5 left-3 right-3 flex items-center gap-1.5">
          <LiveDot />
          <span className="truncate text-[12px] font-medium text-muted-foreground">
            {formatViewersLabel(category.viewers, lang)}
          </span>
        </div>
      </Press>
    </motion.div>
  );
}

/* ------------------------------- Live dot -------------------------------- */

function LiveDot() {
  return (
    <motion.span
      className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
      style={{ backgroundColor: "var(--live)" }}
      animate={{ opacity: [1, 0.35, 1], scale: [1, 0.85, 1] }}
      transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

/* -------------------------------- Scope filter -------------------------------- */

function SellerScopeFilter({
  value,
  onChange,
}: {
  value: SellerScope;
  onChange: (v: SellerScope) => void;
}) {
  const { t } = useTranslation();
  const options: { key: SellerScope; label: string }[] = [
    { key: "all", label: t("search.sellerScope.all") },
    { key: "live", label: t("search.sellerScope.live") },
  ];
  return (
    <div className="mb-3 flex gap-1 rounded-full bg-muted p-1">
      {options.map((opt) => {
        const active = opt.key === value;
        return (
          <Press
            key={opt.key}
            onClick={() => onChange(opt.key)}
            className="!min-h-8 flex-1 rounded-full text-[13px] font-semibold"
            style={{
              backgroundColor: active ? "var(--accent)" : "transparent",
              color: active ? "var(--accent-foreground)" : "var(--muted-foreground)",
            }}
          >
            {opt.label}
          </Press>
        );
      })}
    </div>
  );
}

/* -------------------------------- Sellers -------------------------------- */

function SellerRow({
  info,
  index,
  isLive,
  onOpen,
}: {
  info: ReturnType<typeof getSellerInfo>;
  index: number;
  isLive?: boolean;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const [following, setFollowing] = useState(false);
  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: EASE_IOS, delay: Math.min(index, 10) * 0.03 }}
    >
      <div className="flex items-center gap-3 py-2.5">
        <Press
          onClick={onOpen}
          className="!block flex flex-1 items-center gap-3 p-0 text-left"
        >
          <img
            src={info.avatar}
            alt=""
            className="h-11 w-11 shrink-0 rounded-full object-cover"
            onLoad={(e) => e.currentTarget.setAttribute("data-loaded", "true")}
            draggable={false}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold">{info.name}</p>
            <p className="truncate text-[12px] text-muted-foreground">
              {formatFollowersLabel(info.followers, lang)}
              {isLive && (
                <span
                  className="ml-2 inline-flex items-center gap-1 text-[11px] font-bold"
                  style={{ color: "var(--live)" }}
                >
                  <Radio size={10} className="animate-pulse" />
                  {t("live.liveBadge")}
                </span>
              )}

            </p>
          </div>
        </Press>
        <Press
          onClick={() => setFollowing((v) => !v)}
          className="!min-h-9 rounded-full px-3 text-[12px] font-semibold"
          style={
            following
              ? {
                  backgroundColor: "transparent",
                  color: "var(--foreground)",
                  border: "1.5px solid var(--border)",
                }
              : {
                  backgroundColor: "var(--accent)",
                  color: "var(--accent-foreground)",
                }
          }
        >
          {following ? t("live.following") : t("live.follow")}
        </Press>
      </div>
    </motion.li>
  );
}


function EmptyResults({ query }: { query: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center py-16 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-full bg-muted">
        <SearchX size={22} className="text-muted-foreground" strokeWidth={1.8} />
      </div>
      <p className="mt-3 text-[14px] text-muted-foreground">
        {t("search.emptyResults", { query })}
      </p>
    </div>
  );
}

