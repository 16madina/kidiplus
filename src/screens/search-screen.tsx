import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search, Clock, X, SearchX, Radio } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Press } from "@/components/press";
import { SwipeableTabs, type TabDef } from "@/components/swipeable-tabs";
import { LiveCard } from "@/components/live-card";
import { makeStreams, type LiveStream } from "@/lib/live-mock";
import { useLiveViewer } from "@/lib/live-viewer-context";
import { useSellerProfile } from "@/lib/seller-profile-context";
import {
  formatCompact,
  getSellerInfo,
  makeSellerInfoFromProfile,
  type SellerProduct,
} from "@/lib/seller-mock";
import { formatMoney } from "@/lib/money";
import { EASE_IOS } from "@/lib/motion";
import {
  BROWSE_CATEGORIES,
  TRENDS,
  type BrowseCategory,
  type Trend,
} from "@/lib/browse-mock";
import { formatCount, formatViewersLabel, formatFollowersLabel } from "@/i18n/format";
import { useLanguage } from "@/i18n/language-context";
import {
  fetchActiveSellerNames,
  searchSellerProfiles,
  type SellerProfile,
} from "@/lib/sellers-db";

const ALL_STREAMS = makeStreams(0, 24);

type CategorySort = "recommended" | "popular" | "alpha";
const CATEGORY_SORTS: CategorySort[] = ["recommended", "popular", "alpha"];

type SellerScope = "all" | "live";


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
  const [activeSellerNames, setActiveSellerNames] = useState<Set<string>>(new Set());
  const [sellerLoading, setSellerLoading] = useState(false);
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
    const t = setTimeout(() => setBrowseLoading(false), 450);
    return () => clearTimeout(t);
  }, []);

  const searching = query.length > 0;
  const q = query.toLowerCase();

  // Load seller profiles + live seller names from the backend whenever the query changes.
  useEffect(() => {
    if (!searching) {
      setDbSellers([]);
      setActiveSellerNames(new Set());
      setSellerLoading(false);
      return;
    }
    let cancelled = false;
    setSellerLoading(true);
    Promise.all([searchSellerProfiles(query, 30), fetchActiveSellerNames()])
      .then(([profiles, liveNames]) => {
        if (cancelled) return;
        setDbSellers(profiles);
        setActiveSellerNames(liveNames);
      })
      .catch((err) => {
        console.error("[SearchScreen] seller search failed", err);
      })
      .finally(() => {
        if (!cancelled) setSellerLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, searching]);

  const liveResults = useMemo<LiveStream[]>(() => {
    if (!searching) return [];
    return ALL_STREAMS.filter(
      (s) =>
        s.seller.toLowerCase().includes(q) ||
        s.title.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q),
    );
  }, [q, searching]);

  const sellerResults = useMemo(() => {
    if (!searching) return [];
    const byName = new Map<string, ReturnType<typeof getSellerInfo>>();

    // 1. Real seller profiles from the database.
    dbSellers.forEach((profile) => {
      const isLive = activeSellerNames.has(profile.display_name);
      if (sellerScope === "live" && !isLive) return;
      byName.set(profile.display_name, makeSellerInfoFromProfile(profile));
    });

    // 2. Mock sellers tied to currently-live streams (keeps fallback content working).
    ALL_STREAMS.forEach((s) => {
      if (sellerScope === "live" && !activeSellerNames.has(s.seller)) return;
      if (!s.seller.toLowerCase().includes(q)) return;
      if (!byName.has(s.seller)) {
        byName.set(s.seller, getSellerInfo(s.seller));
      }
    });

    return Array.from(byName.values());
  }, [q, searching, dbSellers, activeSellerNames, sellerScope]);


  const productResults = useMemo<Array<SellerProduct & { seller: string }>>(() => {
    if (!searching) return [];
    const out: Array<SellerProduct & { seller: string }> = [];
    ALL_STREAMS.forEach((s) => {
      const info = getSellerInfo(s.seller);
      info.products.forEach((p) => {
        if (
          p.name.toLowerCase().includes(q) ||
          s.category.toLowerCase().includes(q) ||
          s.seller.toLowerCase().includes(q)
        ) {
          out.push({ ...p, seller: s.seller });
        }
      });
    });
    return out.slice(0, 40);
  }, [q, searching]);

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

  const openTrend = (t: Trend) => {
    commitRecent(t.name);
    setRawQuery(t.name);
    setQuery(t.name);
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
      label: `${t("search.tabs.lives")}${liveResults.length ? ` (${liveResults.length})` : ""}`,
      content: (
        <div className="px-4 py-3">
          {liveResults.length === 0 ? (
            <EmptyResults query={query} />
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {liveResults.map((s, i) => (
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
              {sellerResults.map((info, i) => (
                <SellerRow
                  key={info.name}
                  info={info}
                  index={i}
                  isLive={activeSellerNames.has(info.name)}
                  onOpen={() => {
                    commitRecent(query);
                    openSeller(info.name);
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
          {productResults.length === 0 ? (
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
                      openSeller(p.seller);
                    }}
                    className="!block h-full w-full overflow-hidden rounded-2xl bg-muted p-0 text-left"
                  >
                    <div className="relative w-full" style={{ aspectRatio: "1 / 1" }}>
                      <img
                        src={p.image}
                        alt=""
                        loading="lazy"
                        className="absolute inset-0 h-full w-full object-cover"
                        onLoad={(e) => e.currentTarget.setAttribute("data-loaded", "true")}
                        draggable={false}
                      />
                    </div>
                    <div className="p-2">
                      <p className="truncate text-[13px] font-medium">{p.name}</p>
                      <div className="flex items-center justify-between">
                        <span className="truncate text-[11px] text-muted-foreground">
                          @{p.seller}
                        </span>
                        <span className="text-[13px] font-bold">{formatMoney(p.price, "EUR")}</span>
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
                        <Press
                          onClick={() => {
                            setRawQuery(r);
                            setQuery(r);
                          }}
                          className="!min-h-11 flex w-full items-center justify-between rounded-lg px-2 text-left"
                        >
                          <span className="flex items-center gap-3 text-[14px]">
                            <Clock size={16} className="text-muted-foreground" strokeWidth={2} />
                            {r}
                          </span>
                          <button
                            aria-label={`${t("common.remove")} ${r}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setRecent((rs) => rs.filter((x) => x !== r));
                            }}
                            className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground"
                          >
                            <X size={13} strokeWidth={2.4} />
                          </button>
                        </Press>
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
              {/* Tendances du jour */}
              <div className="pt-4">
                <div className="flex items-end justify-between px-4">
                  <h2
                    className="text-[22px] font-bold"
                    style={{ letterSpacing: "-0.01em" }}
                  >
                    {t("search.trending")}
                  </h2>
                  <Press
                    className="!min-h-8 text-[13px] font-semibold text-muted-foreground"
                    onClick={() => {}}
                  >
                    {t("common.seeAll")}
                  </Press>
                </div>

                <div className="pt-3">
                  {browseLoading ? (
                    <TrendsSkeleton />
                  ) : (
                    <TrendsRow trends={TRENDS} onTap={openTrend} />
                  )}
                </div>
              </div>

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
  trends: Trend[];
  onTap: (t: Trend) => void;
}) {
  const { t } = useTranslation();
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
        style={{
          gap: 8,
          gridAutoColumns: "260px",
        }}
      >
        {trends.map((trend, i) => (
          <motion.div
            key={trend.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.2,
              ease: EASE_IOS,
              delay: Math.min(i, 8) * 0.025,
            }}
            style={{ scrollSnapAlign: "start" }}
          >
            <Press
              onClick={() => onTap(trend)}
              className="!min-h-0 flex w-full items-center gap-3 rounded-2xl bg-muted p-2 text-left"
              style={{ height: 64 }}
            >
              <img
                src={trend.image}
                alt=""
                loading="lazy"
                onLoad={(e) => e.currentTarget.setAttribute("data-loaded", "true")}
                className="h-12 w-12 shrink-0 rounded-xl object-cover"
                draggable={false}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-bold">{t(trend.nameKey)}</p>
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

