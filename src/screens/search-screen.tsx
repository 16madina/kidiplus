import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search, Clock, X, SearchX } from "lucide-react";
import { Press } from "@/components/press";
import { SwipeableTabs, type TabDef } from "@/components/swipeable-tabs";
import { LiveCard } from "@/components/live-card";
import { makeStreams, type LiveStream } from "@/lib/live-mock";
import { useLiveViewer } from "@/lib/live-viewer-context";
import { useSellerProfile } from "@/lib/seller-profile-context";
import {
  formatCompact,
  getSellerInfo,
  type SellerProduct,
} from "@/lib/seller-mock";
import { formatEuro } from "@/lib/live-viewer-mock";
import { EASE_IOS } from "@/lib/motion";

const CATEGORY_COVERS: { key: string; cover: string }[] = [
  { key: "Beauty", cover: "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=600&q=70" },
  { key: "Sneakers", cover: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&q=70" },
  { key: "Fashion", cover: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=600&q=70" },
  { key: "Cards", cover: "https://images.unsplash.com/photo-1614850523459-c2f4c699c52e?w=600&q=70" },
  { key: "Electronics", cover: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&q=70" },
  { key: "Jewelry", cover: "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=600&q=70" },
];

const CATEGORY_LABEL_FR: Record<string, string> = {
  Beauty: "Beauté",
  Sneakers: "Sneakers",
  Fashion: "Mode",
  Cards: "Cartes",
  Electronics: "Électro.",
  Jewelry: "Bijoux",
};

const ALL_STREAMS = makeStreams(0, 24);

export function SearchScreen() {
  const [focused, setFocused] = useState(false);
  const [rawQuery, setRawQuery] = useState("");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState(0);
  const [recent, setRecent] = useState<string[]>([
    "jordan 4", "chanel", "iphone", "pokémon", "ysl",
  ]);
  const inputRef = useRef<HTMLInputElement>(null);
  const { open: openLive } = useLiveViewer();
  const { open: openSeller } = useSellerProfile();

  // Debounce 200ms
  useEffect(() => {
    const t = setTimeout(() => setQuery(rawQuery.trim()), 200);
    return () => clearTimeout(t);
  }, [rawQuery]);

  const searching = query.length > 0;
  const q = query.toLowerCase();

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
    const set = new Set<string>();
    ALL_STREAMS.forEach((s) => {
      if (s.seller.toLowerCase().includes(q)) set.add(s.seller);
    });
    return Array.from(set).map((n) => getSellerInfo(n));
  }, [q, searching]);

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

  const tabs: TabDef[] = [
    {
      key: "lives",
      label: `Lives${liveResults.length ? ` (${liveResults.length})` : ""}`,
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
      label: `Vendeurs${sellerResults.length ? ` (${sellerResults.length})` : ""}`,
      content: (
        <div className="px-4 py-2">
          {sellerResults.length === 0 ? (
            <EmptyResults query={query} />
          ) : (
            <ul className="divide-y divide-border/60">
              {sellerResults.map((info, i) => (
                <SellerRow
                  key={info.name}
                  info={info}
                  index={i}
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
      label: `Produits${productResults.length ? ` (${productResults.length})` : ""}`,
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
                        <span className="text-[13px] font-bold">{formatEuro(p.price)}</span>
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
              placeholder="Rechercher des lives, vendeurs, produits..."
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
                  aria-label="Effacer"
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
                  Annuler
                </Press>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1">
        <AnimatePresence mode="wait">
          {searching ? (
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
              <div className="px-4 pt-3">
                <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Catégories
                </h2>
                <div className="grid grid-cols-2 gap-2">
                  {CATEGORY_COVERS.map((c, i) => (
                    <motion.div
                      key={c.key}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, ease: EASE_IOS, delay: i * 0.03 }}
                    >
                      <Press
                        onClick={() => {
                          setRawQuery(c.key);
                          setQuery(c.key);
                          setFocused(true);
                        }}
                        className="!block relative w-full overflow-hidden rounded-2xl p-0 text-left"
                        style={{ aspectRatio: "16 / 10" }}
                      >
                        <img
                          src={c.cover}
                          alt=""
                          className="absolute inset-0 h-full w-full object-cover"
                          loading="lazy"
                          onLoad={(e) => e.currentTarget.setAttribute("data-loaded", "true")}
                          draggable={false}
                        />
                        <div
                          className="absolute inset-0"
                          style={{
                            backgroundImage:
                              "linear-gradient(to top, rgba(0,0,0,0.7), rgba(0,0,0,0.1))",
                          }}
                        />
                        <span className="absolute bottom-2 left-3 text-[15px] font-bold text-white">
                          {CATEGORY_LABEL_FR[c.key] ?? c.key}
                        </span>
                      </Press>
                    </motion.div>
                  ))}
                </div>
              </div>

              {recent.length > 0 && (
                <div className="px-4 pt-6">
                  <div className="mb-1 flex items-center justify-between">
                    <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Recherches récentes
                    </h2>
                    <Press
                      onClick={() => setRecent([])}
                      className="!min-h-8 text-[12px] font-semibold text-accent"
                    >
                      Effacer
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
                            setFocused(true);
                          }}
                          className="!min-h-11 flex w-full items-center justify-between rounded-lg px-2 text-left"
                        >
                          <span className="flex items-center gap-3 text-[14px]">
                            <Clock size={16} className="text-muted-foreground" strokeWidth={2} />
                            {r}
                          </span>
                          <button
                            aria-label={`Retirer ${r}`}
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
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function SellerRow({
  info,
  index,
  onOpen,
}: {
  info: ReturnType<typeof getSellerInfo>;
  index: number;
  onOpen: () => void;
}) {
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
              {formatCompact(info.followers)} abonnés
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
          {following ? "Abonné" : "Suivre"}
        </Press>
      </div>
    </motion.li>
  );
}

function EmptyResults({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center py-16 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-full bg-muted">
        <SearchX size={22} className="text-muted-foreground" strokeWidth={1.8} />
      </div>
      <p className="mt-3 text-[14px] text-muted-foreground">
        Aucun résultat pour <span className="font-semibold text-foreground">« {query} »</span>
      </p>
    </div>
  );
}
