import { useEffect, useMemo, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  animate,
} from "framer-motion";
import { ChevronLeft, Star, BadgeCheck, Bell, Eye } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Press } from "@/components/press";
import { EASE_IOS } from "@/lib/motion";
import { useSellerProfile } from "@/lib/seller-profile-context";
import { useLiveViewer } from "@/lib/live-viewer-context";
import { haptic } from "@/lib/haptics";
import { usePush } from "@/lib/push";
import {
  formatCompact,
  getSellerInfo,
  type SellerInfo,
} from "@/lib/seller-mock";
import { formatEuro } from "@/lib/live-viewer-mock";
import { useLanguage } from "@/i18n/language-context";
import { formatShortDateTime } from "@/i18n/format";


const HEADER_MAX = 260; // large header total height above nav
const HEADER_MIN = 0;

type TabKey = "boutique" | "lives" | "avis";
const TAB_KEYS: TabKey[] = ["boutique", "lives", "avis"];


export function SellerProfileScreen() {
  const { activeSeller, close } = useSellerProfile();
  const info = useMemo(
    () => (activeSeller ? getSellerInfo(activeSeller) : null),
    [activeSeller],
  );

  const dragX = useMotionValue(0);

  if (!info) return null;

  return (
    <motion.div
      key={info.name}
      className="fixed inset-0 z-[70] flex flex-col overflow-hidden bg-background"
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ duration: 0.3, ease: EASE_IOS }}
      style={{ x: dragX }}
    >
      <SellerProfileInner info={info} onBack={close} dragX={dragX} />
    </motion.div>
  );
}

function SellerProfileInner({
  info,
  onBack,
  dragX,
}: {
  info: SellerInfo;
  onBack: () => void;
  dragX: ReturnType<typeof useMotionValue<number>>;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const scrollY = useMotionValue(0);
  const [tab, setTab] = useState<TabKey>("boutique");
  const { open: openLive } = useLiveViewer();
  const { requestWithPrePrompt: requestPush } = usePush();
  const { t } = useTranslation();
  const { lang } = useLanguage();



  // Collapsing header transforms — transform + opacity only
  const heroScale = useTransform(scrollY, [0, HEADER_MAX], [1, 0.85]);
  const heroOpacity = useTransform(scrollY, [0, HEADER_MAX * 0.75, HEADER_MAX], [1, 0.4, 0]);
  const heroTranslate = useTransform(scrollY, [0, HEADER_MAX], [0, -30]);
  const navTitleOpacity = useTransform(scrollY, [HEADER_MAX * 0.55, HEADER_MAX * 0.85], [0, 1]);
  const navTitleY = useTransform(scrollY, [HEADER_MAX * 0.55, HEADER_MAX * 0.85], [8, 0]);
  const navBgOpacity = useTransform(scrollY, [0, HEADER_MAX * 0.5], [0, 1]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => scrollY.set(el.scrollTop);
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollY]);

  // Tab strip underline
  const stripRef = useRef<HTMLDivElement>(null);
  const [uX, setUX] = useState(0);
  const [uW, setUW] = useState(0);
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const btns = el.querySelectorAll<HTMLButtonElement>("[data-tab]");
    const idx = TAB_KEYS.indexOf(tab);
    const b = btns[idx];
    if (b) {
      setUX(b.offsetLeft);
      setUW(b.offsetWidth);
    }
  }, [tab]);

  const [following, setFollowing] = useState(false);

  return (
    <>
      {/* Top nav bar (frosted when scrolled) */}
      <motion.div
        className="absolute inset-x-0 top-0 z-30 pt-safe"
        style={{
          backdropFilter: "saturate(180%) blur(18px)",
          WebkitBackdropFilter: "saturate(180%) blur(18px)",
        }}
      >
        <motion.div
          className="absolute inset-0"
          style={{
            opacity: navBgOpacity,
            backgroundColor: "color-mix(in oklch, var(--background) 82%, transparent)",
            borderBottom: "1px solid var(--border)",
          }}
        />
        <div className="relative flex items-center gap-2 px-2 py-1.5">
          <Press
            aria-label={t("common.back")}
            onClick={onBack}
            className="h-10 w-10 rounded-full text-foreground"
          >
            <ChevronLeft size={24} strokeWidth={2.2} />
          </Press>
          <motion.div
            className="min-w-0 flex-1 text-center"
            style={{ opacity: navTitleOpacity, y: navTitleY }}
          >
            <div className="flex items-center justify-center gap-1">
              <span className="truncate text-[15px] font-bold">{info.name}</span>
              {info.verified && (
                <BadgeCheck size={15} className="text-accent" fill="currentColor" strokeWidth={0} />
              )}
            </div>
          </motion.div>
          <div className="h-10 w-10" />
        </div>
      </motion.div>

      {/* Left-edge swipe-back capture */}
      <motion.div
        className="absolute inset-y-0 left-0 z-40 w-5"
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0, right: 0.6 }}
        onDrag={(_, i) => dragX.set(Math.max(0, i.offset.x))}
        onDragEnd={(_, i) => {
          if (i.offset.x > 100 || i.velocity.x > 500) onBack();
          else animate(dragX, 0, { duration: 0.22, ease: EASE_IOS });
        }}
      />

      {/* Scrollable content */}
      <div
        ref={scrollerRef}
        className="h-full overflow-y-auto"
        style={{
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
        }}
      >
        {/* Hero */}
        <div className="relative">
          <div style={{ height: "env(safe-area-inset-top)" }} />
          <div style={{ height: 48 }} /> {/* space for nav bar */}
          <motion.div
            className="px-5 pt-4"
            style={{ opacity: heroOpacity, scale: heroScale, y: heroTranslate, transformOrigin: "50% 0%" }}
          >
            <div className="flex flex-col items-center text-center">
              <img
                src={info.avatar.replace("s=80", "s=160")}
                alt=""
                className="h-20 w-20 rounded-full object-cover ring-2 ring-border"
                onLoad={(e) => e.currentTarget.setAttribute("data-loaded", "true")}
                draggable={false}
              />
              <div className="mt-2 flex items-center gap-1">
                <h1 className="text-[20px] font-bold tracking-tight">{info.name}</h1>
                {info.verified && (
                  <BadgeCheck size={18} className="text-accent" fill="currentColor" strokeWidth={0} />
                )}
              </div>
              <p className="mt-1 max-w-xs text-[13px] leading-snug text-muted-foreground">
                {info.bio}
              </p>

              <div className="mt-3 flex items-center gap-6">
                <Stat label={t("seller.stats.followers")} value={formatCompact(info.followers)} />
                <Divider />
                <Stat label={t("seller.stats.sales")} value={formatCompact(info.sales)} />
                <Divider />
                <Stat
                  label={t("seller.stats.rating")}
                  value={
                    <span className="inline-flex items-center gap-0.5">
                      {info.rating.toFixed(1)}
                      <Star size={12} className="text-amber-400" fill="currentColor" strokeWidth={0} />
                    </span>
                  }
                />

              </div>

              <Press
                onClick={() => {
                  haptic.medium();
                  setFollowing((v) => {
                    const next = !v;
                    if (next) {
                      void requestPush(
                        t("seller.pushFollow", { name: info.name }),
                      );

                    }
                    return next;
                  });
                }}
                hapticOnTap={false}
                className="mt-4 h-11 w-full rounded-full text-[14px] font-bold"
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
                {following ? t("seller.following") : t("seller.follow")}
              </Press>
            </div>
          </motion.div>

          {/* Live banner */}
          {info.liveStream && (
            <div className="px-5 pt-3">
              <Press
                onClick={() => openLive(info.liveStream!)}
                className="!block w-full overflow-hidden rounded-2xl p-0 text-left"
                style={{
                  background:
                    "linear-gradient(135deg, oklch(0.68 0.26 15), oklch(0.55 0.24 25))",
                }}
              >
                <div className="flex items-center gap-3 p-3">
                  <img
                    src={info.liveStream.thumbnail}
                    alt=""
                    className="h-14 w-14 rounded-xl object-cover"
                    onLoad={(e) => e.currentTarget.setAttribute("data-loaded", "true")}
                    draggable={false}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="flex items-center gap-1 rounded-md bg-white/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                        <motion.span
                          className="h-1.5 w-1.5 rounded-full bg-white"
                          animate={{ opacity: [1, 0.35, 1] }}
                          transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                        />
                        {t("seller.liveNow")}
                      </span>
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-white/90">
                        <Eye size={11} /> {formatCompact(info.liveStream.viewers)}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-[13px] font-semibold text-white">
                      {info.liveStream.title}
                    </p>
                  </div>
                </div>
              </Press>
            </div>
          )}
        </div>

        {/* Sticky tab strip */}
        <div
          ref={stripRef}
          className="sticky top-0 z-20 mt-4 flex items-center gap-1 border-b border-border/60 px-4"
          style={{
            top: "calc(env(safe-area-inset-top) + 48px)",
            backgroundColor: "color-mix(in oklch, var(--background) 88%, transparent)",
            backdropFilter: "saturate(180%) blur(18px)",
            WebkitBackdropFilter: "saturate(180%) blur(18px)",
          }}
        >
          {TAB_KEYS.map((key) => {
            const active = key === tab;
            return (
              <Press
                key={key}
                data-tab
                onClick={() => setTab(key)}
                className="!min-h-11 rounded-none px-3 text-[14px] font-semibold"
                style={{
                  color: active ? "var(--foreground)" : "var(--muted-foreground)",
                  transition: "color 150ms",
                }}
              >
                {t(`seller.tabs.${key}`)}
              </Press>
            );
          })}

          <motion.div
            className="absolute bottom-0 h-[2px] rounded-full"
            initial={false}
            animate={{ x: uX, width: uW }}
            transition={{ duration: 0.25, ease: EASE_IOS }}
            style={{ backgroundColor: "var(--accent)" }}
          />
        </div>

        {/* Tab content */}
        <div className="min-h-[60vh] px-4 pt-4 pb-16">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: EASE_IOS }}
            >
              {tab === "boutique" && <BoutiqueTab info={info} />}
              {tab === "lives" && <LivesTab info={info} />}
              {tab === "avis" && <AvisTab info={info} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[15px] font-bold tabular-nums">{value}</span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}
function Divider() {
  return <span className="h-6 w-px bg-border" aria-hidden />;
}

function BoutiqueTab({ info }: { info: SellerInfo }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {info.products.map((p, i) => (
        <motion.div
          key={p.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: EASE_IOS, delay: Math.min(i, 10) * 0.03 }}
        >
          <Press className="!block h-full w-full overflow-hidden rounded-2xl bg-muted p-0 text-left">
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
              <p className="text-[13px] font-bold">{formatEuro(p.price)}</p>
            </div>
          </Press>
        </motion.div>
      ))}
    </div>
  );
}

function LivesTab({ info }: { info: SellerInfo }) {
  const [reminders, setReminders] = useState<Record<string, boolean>>({});
  const [bounce, setBounce] = useState<Record<string, number>>({});
  const { requestWithPrePrompt: requestPush } = usePush();
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const toggle = (id: string, title: string) => {
    const next = !reminders[id];
    haptic.medium();
    setReminders((r) => ({ ...r, [id]: next }));
    setBounce((b) => ({ ...b, [id]: (b[id] ?? 0) + 1 }));
    toast(next ? t("seller.reminderOn") : t("seller.reminderOff"));
    if (next) {
      void requestPush(t("seller.pushReminder", { title }));
    }
  };


  return (
    <div className="space-y-2">
      {info.scheduled.map((s, i) => {
        const on = reminders[s.id];
        return (
          <motion.div
            key={s.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: EASE_IOS, delay: Math.min(i, 8) * 0.03 }}
            className={`flex items-center gap-3 rounded-2xl p-2.5 ${s.past ? "opacity-55" : ""}`}
            style={{ backgroundColor: "var(--muted)" }}
          >
            <img
              src={s.cover}
              alt=""
              className="h-14 w-14 shrink-0 rounded-xl object-cover"
              onLoad={(e) => e.currentTarget.setAttribute("data-loaded", "true")}
              draggable={false}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold">{s.title}</p>
              <p className="text-[12px] text-muted-foreground">
                {s.past ? "Terminé · " : ""}{formatDate(s.date)}
              </p>
            </div>
            {!s.past && (
              <motion.div
                key={bounce[s.id] ?? 0}
                animate={
                  bounce[s.id]
                    ? { scale: [1, 1.25, 0.92, 1] }
                    : { scale: 1 }
                }
                transition={{ duration: 0.35, ease: EASE_IOS }}
              >
                <Press
                  aria-label={on ? "Rappel activé" : "Me rappeler"}
                  onClick={() => toggle(s.id, s.title)}
                  hapticOnTap={false}
                  className="h-10 rounded-full px-3 text-[12px] font-semibold"
                  style={
                    on
                      ? {
                          backgroundColor: "var(--accent)",
                          color: "var(--accent-foreground)",
                        }
                      : {
                          backgroundColor: "transparent",
                          color: "var(--foreground)",
                          border: "1.5px solid var(--border)",
                        }
                  }
                >
                  <Bell size={14} className="mr-1" fill={on ? "currentColor" : "none"} />
                  {on ? "Activé" : "Me rappeler"}
                </Press>
              </motion.div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

function AvisTab({ info }: { info: SellerInfo }) {
  const [barsVisible, setBarsVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setBarsVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4 rounded-2xl p-4" style={{ backgroundColor: "var(--muted)" }}>
        <div className="flex flex-col items-center">
          <span className="text-[32px] font-black leading-none tabular-nums">
            {info.rating.toFixed(1)}
          </span>
          <div className="mt-1 flex gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                size={12}
                className={i < Math.round(info.rating) ? "text-amber-400" : "text-muted-foreground/40"}
                fill="currentColor"
                strokeWidth={0}
              />
            ))}
          </div>
          <span className="mt-0.5 text-[11px] text-muted-foreground">{info.reviewCount} avis</span>
        </div>
        <div className="flex-1 space-y-1.5">
          {info.ratingBreakdown.map((pct, i) => {
            const stars = 5 - i;
            return (
              <div key={stars} className="flex items-center gap-2">
                <span className="w-3 text-[11px] tabular-nums text-muted-foreground">{stars}</span>
                <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-border/60">
                  <motion.div
                    className="absolute inset-0 rounded-full bg-amber-400"
                    style={{ transformOrigin: "left center", width: `${pct}%` }}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: barsVisible ? 1 : 0 }}
                    transition={{ duration: 0.5, ease: EASE_IOS, delay: i * 0.05 }}
                  />
                </div>
                <span className="w-8 text-right text-[11px] tabular-nums text-muted-foreground">{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        {info.reviews.map((r, i) => (
          <motion.div
            key={r.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: EASE_IOS, delay: Math.min(i, 10) * 0.03 }}
            className="flex gap-3"
          >
            <img
              src={r.avatar}
              alt=""
              className="h-9 w-9 shrink-0 rounded-full object-cover"
              onLoad={(e) => e.currentTarget.setAttribute("data-loaded", "true")}
              draggable={false}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-[13px] font-semibold">@{r.user}</span>
                <span className="text-[11px] text-muted-foreground">
                  · il y a {r.daysAgo}j
                </span>
              </div>
              <div className="mt-0.5 flex gap-0.5">
                {Array.from({ length: 5 }).map((_, k) => (
                  <Star
                    key={k}
                    size={11}
                    className={k < r.stars ? "text-amber-400" : "text-muted-foreground/30"}
                    fill="currentColor"
                    strokeWidth={0}
                  />
                ))}
              </div>
              <p className="mt-1 text-[13px] leading-snug">{r.text}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
