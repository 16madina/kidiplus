// Real seller profile: header pulls avatar/counts/rating from `profiles`,
// tabs read real data (shop, lives, reviews). No mock data.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  animate,
} from "framer-motion";
import { ChevronLeft, Star, BadgeCheck, MoreHorizontal, Flag, Ban, X, Loader2, Package, Radio, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Press } from "@/components/press";
import { EASE_IOS } from "@/lib/motion";
import { useSellerProfile } from "@/lib/seller-profile-context";
import { useLiveViewer } from "@/lib/live-viewer-context";
import { haptic } from "@/lib/haptics";
import { FollowButton } from "@/components/follow-button";
import { formatMoney, normalizeCurrency } from "@/lib/money";
import { useLanguage } from "@/i18n/language-context";
import { formatShortDateTime } from "@/i18n/format";
import { ReportSheet } from "@/components/moderation/report-sheet";
import { blockUser, refreshBlockedIds } from "@/lib/moderation-db";
import { supabase } from "@/integrations/supabase/client";
import { resolveAvatarUrl } from "@/lib/avatar-url";
import { listSellerActiveShopProducts, resolveShopImage, type ShopProduct } from "@/lib/shop-db";
import { ShopProductDetailSheet } from "@/components/shop/shop-product-detail-sheet";
import { fetchSellerLives, fetchLiveById, type SellerLiveEntry } from "@/lib/lives-db";
import { listSellerReviews, type SellerReview } from "@/lib/reviews-db";

type SellerProfile = {
  id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  bio: string | null;
  is_seller: boolean;
  followers_count: number;
  rating_avg: number;
  rating_count: number;
  currency: string;
};

/** Resolve the `activeSeller` ref (uuid | handle | display_name) to a profile row. */
async function resolveSellerRef(ref: string): Promise<SellerProfile | null> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref);
  const cols = "id, display_name, handle, avatar_url, bio, is_seller, followers_count, rating_avg, rating_count, currency";
  if (isUuid) {
    const { data } = await supabase.from("profiles").select(cols).eq("id", ref).maybeSingle();
    if (data) return data as SellerProfile;
  }
  const { data } = await supabase
    .from("profiles")
    .select(cols)
    .or(`handle.eq.${ref},display_name.eq.${ref}`)
    .limit(1)
    .maybeSingle();
  return (data as SellerProfile | null) ?? null;
}

const HEADER_MAX = 260;

type TabKey = "boutique" | "lives" | "avis";
const TAB_KEYS: TabKey[] = ["boutique", "lives", "avis"];

export function SellerProfileScreen() {
  const { activeSeller, close } = useSellerProfile();
  const [profile, setProfile] = useState<SellerProfile | null>(null);
  const [salesCount, setSalesCount] = useState<number>(0);
  const [avatar, setAvatar] = useState<string | null>(null);
  const dragX = useMotionValue(0);

  const refreshProfile = async () => {
    if (!activeSeller) return;
    const p = await resolveSellerRef(activeSeller);
    setProfile((prev) => (p ? { ...(prev ?? {} as SellerProfile), ...p } : prev));
    if (p) {
      const { count } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("seller_id", p.id)
        .eq("status", "paid");
      setSalesCount(count ?? 0);
    }
  };

  useEffect(() => {
    if (!activeSeller) return;
    let alive = true;
    void (async () => {
      const p = await resolveSellerRef(activeSeller);
      if (!alive) return;
      setProfile(p);
      if (p) {
        void resolveAvatarUrl(p.avatar_url).then((url) => alive && setAvatar(url));
        const { count } = await supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("seller_id", p.id)
          .eq("status", "paid");
        if (alive) setSalesCount(count ?? 0);
      }
    })();
    return () => { alive = false; };
  }, [activeSeller]);

  // Realtime: profile row (followers_count, rating_avg via triggers) + paid orders count.
  useEffect(() => {
    const sellerId = profile?.id;
    if (!sellerId) return;
    const ch = supabase
      .channel(`seller-profile-${sellerId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${sellerId}` }, (payload) => {
        const row = payload.new as Partial<SellerProfile>;
        setProfile((prev) => (prev ? { ...prev, ...row } : prev));
        if (row.avatar_url !== undefined) {
          void resolveAvatarUrl(row.avatar_url ?? null).then(setAvatar);
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `seller_id=eq.${sellerId}` }, () => {
        void (async () => {
          const { count } = await supabase
            .from("orders").select("id", { count: "exact", head: true })
            .eq("seller_id", sellerId).eq("status", "paid");
          setSalesCount(count ?? 0);
        })();
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [profile?.id]);


  if (!activeSeller) return null;

  return (
    <motion.div
      className="fixed inset-0 z-[70] flex flex-col overflow-hidden bg-background"
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ duration: 0.3, ease: EASE_IOS }}
      style={{ x: dragX }}
    >
      {!profile ? (
        <div className="flex h-full flex-col items-center justify-center gap-3">
          <Loader2 className="animate-spin text-muted-foreground" />
          <Press onClick={close} className="!min-h-9 h-9 rounded-full border border-border px-4 text-[13px]">
            {"Retour"}
          </Press>
        </div>
      ) : (
        <SellerProfileInner profile={profile} avatar={avatar} salesCount={salesCount} onBack={close} dragX={dragX} />
      )}
    </motion.div>
  );
}

function SellerProfileInner({
  profile,
  avatar,
  salesCount,
  onBack,
  dragX,
}: {
  profile: SellerProfile;
  avatar: string | null;
  salesCount: number;
  onBack: () => void;
  dragX: ReturnType<typeof useMotionValue<number>>;
}) {
  const { t } = useTranslation();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const scrollY = useMotionValue(0);
  const [tab, setTab] = useState<TabKey>("boutique");

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

  const stripRef = useRef<HTMLDivElement>(null);
  const [uX, setUX] = useState(0);
  const [uW, setUW] = useState(0);
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const btns = el.querySelectorAll<HTMLButtonElement>("[data-tab]");
    const idx = TAB_KEYS.indexOf(tab);
    const b = btns[idx];
    if (b) { setUX(b.offsetLeft); setUW(b.offsetWidth); }
  }, [tab]);

  const [actionsOpen, setActionsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [blocking, setBlocking] = useState(false);

  const handleBlock = async () => {
    if (blocking) return;
    setBlocking(true);
    haptic.medium();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user || auth.user.id === profile.id) {
      setBlocking(false); setActionsOpen(false);
      toast.error(t("block.failed"));
      return;
    }
    const r = await blockUser(profile.id);
    setBlocking(false); setActionsOpen(false);
    if (r.ok) {
      await refreshBlockedIds();
      haptic.success();
      toast.success(t("block.blocked"));
      onBack();
    } else {
      toast.error(t("block.failed"));
    }
  };

  return (
    <>
      <motion.div
        className="absolute inset-x-0 top-0 z-30 pt-safe"
        style={{ backdropFilter: "saturate(180%) blur(18px)", WebkitBackdropFilter: "saturate(180%) blur(18px)" }}
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
          <Press aria-label={t("common.back")} onClick={onBack} className="h-10 w-10 rounded-full text-foreground">
            <ChevronLeft size={24} strokeWidth={2.2} />
          </Press>
          <motion.div className="min-w-0 flex-1 text-center" style={{ opacity: navTitleOpacity, y: navTitleY }}>
            <div className="flex items-center justify-center gap-1">
              <span className="truncate text-[15px] font-bold">{profile.display_name}</span>
              {profile.is_seller && (
                <BadgeCheck size={15} className="text-accent" fill="currentColor" strokeWidth={0} />
              )}
            </div>
          </motion.div>
          <Press aria-label={t("common.more")} onClick={() => setActionsOpen(true)} className="h-10 w-10 rounded-full text-foreground">
            <MoreHorizontal size={22} strokeWidth={2.2} />
          </Press>
        </div>
      </motion.div>

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

      <div
        ref={scrollerRef}
        className="h-full overflow-y-auto"
        style={{ WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}
      >
        <div className="relative">
          <div style={{ height: "env(safe-area-inset-top)" }} />
          <div style={{ height: 48 }} />
          <motion.div
            className="px-5 pt-4"
            style={{ opacity: heroOpacity, scale: heroScale, y: heroTranslate, transformOrigin: "50% 0%" }}
          >
            <div className="flex flex-col items-center text-center">
              {avatar ? (
                <img
                  src={avatar} alt=""
                  className="h-20 w-20 rounded-full object-cover ring-2 ring-border"
                  draggable={false}
                />
              ) : (
                <div className="grid h-20 w-20 place-items-center rounded-full bg-muted text-[24px] font-bold text-muted-foreground ring-2 ring-border">
                  {(profile.display_name || "?").slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="mt-2 flex items-center gap-1">
                <h1 className="text-[20px] font-bold tracking-tight">{profile.display_name}</h1>
                {profile.is_seller && (
                  <BadgeCheck size={18} className="text-accent" fill="currentColor" strokeWidth={0} />
                )}
              </div>
              <p className="text-[12px] text-muted-foreground">@{profile.handle}</p>
              {profile.bio && (
                <p className="mt-1 max-w-xs text-[13px] leading-snug text-muted-foreground">{profile.bio}</p>
              )}

              <div className="mt-3 flex items-center gap-6">
                <Stat label={t("seller.stats.followers")} value={formatCompact(profile.followers_count)} />
                <Divider />
                <Stat label={t("seller.stats.sales")} value={formatCompact(salesCount)} />
                <Divider />
                <Stat
                  label={t("seller.stats.rating")}
                  value={
                    profile.rating_count === 0 ? (
                      <span>—</span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5">
                        {Number(profile.rating_avg).toFixed(1)}
                        <Star size={12} className="text-amber-400" fill="currentColor" strokeWidth={0} />
                      </span>
                    )
                  }
                />
              </div>

              <div className="mt-4">
                <FollowButton sellerId={profile.id} size="md" />
              </div>
            </div>
          </motion.div>
        </div>

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
                key={key} data-tab
                onClick={() => setTab(key)}
                className="!min-h-11 rounded-none px-3 text-[14px] font-semibold"
                style={{ color: active ? "var(--foreground)" : "var(--muted-foreground)", transition: "color 150ms" }}
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

        <div className="min-h-[60vh] px-4 pt-4 pb-16">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: EASE_IOS }}
            >
              {tab === "boutique" && <BoutiqueTab sellerId={profile.id} currency={profile.currency} />}
              {tab === "lives" && <LivesTab sellerId={profile.id} onBack={onBack} />}
              {tab === "avis" && <AvisTab sellerId={profile.id} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {actionsOpen && (
          <motion.div
            className="fixed inset-0 z-[85] flex items-end justify-center bg-black/50"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setActionsOpen(false)}
          >
            <motion.div
              className="mx-auto w-full max-w-lg rounded-t-3xl bg-background p-4 pb-safe"
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted" />
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-[17px] font-bold">@{profile.handle}</h2>
                <Press onClick={() => setActionsOpen(false)} className="h-9 w-9 rounded-full"><X size={18} /></Press>
              </div>
              <Press
                onClick={() => { setActionsOpen(false); setReportOpen(true); }}
                className="flex !min-h-14 w-full items-center gap-3 rounded-2xl px-3 text-left text-[15px] font-semibold"
              >
                <Flag size={20} />
                {t("report.action")}
              </Press>
              <Press
                onClick={handleBlock}
                disabled={blocking}
                className="mt-1 flex !min-h-14 w-full items-center gap-3 rounded-2xl px-3 text-left text-[15px] font-semibold text-red-500"
              >
                {blocking ? <Loader2 size={18} className="animate-spin" /> : <Ban size={20} />}
                {t("block.action")}
              </Press>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ReportSheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="user"
        targetId={profile.id}
      />
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
function Divider() { return <span className="h-6 w-px bg-border" aria-hidden />; }
function formatCompact(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(".0", "")}k`;
  return String(n);
}

/* ============ BOUTIQUE ============ */

function BoutiqueTab({ sellerId, currency }: { sellerId: string; currency: string }) {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const [items, setItems] = useState<ShopProduct[] | null>(null);
  const [imgs, setImgs] = useState<Record<string, string | null>>({});

  useEffect(() => {
    let alive = true;
    const reload = async () => {
      const rows = await listSellerActiveShopProducts(sellerId);
      if (!alive) return;
      setItems(rows);
      const entries = await Promise.all(rows.map(async (r) => [r.id, await resolveShopImage(r.image_url)] as const));
      if (alive) setImgs(Object.fromEntries(entries));
    };
    void reload();
    const ch = supabase
      .channel(`shop-public-${sellerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "shop_products", filter: `seller_id=eq.${sellerId}` }, () => { void reload(); })
      .subscribe();
    return () => { alive = false; void supabase.removeChannel(ch); };
  }, [sellerId]);


  if (items === null) {
    return <div className="grid place-items-center py-14"><Loader2 className="animate-spin text-muted-foreground" /></div>;
  }
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-muted"><Package className="text-muted-foreground" /></div>
        <p className="mt-3 text-[13px] text-muted-foreground">{t("sellerProfile.shopEmpty", { defaultValue: "Boutique vide pour le moment." })}</p>
      </div>
    );
  }
  const cur = normalizeCurrency(currency);
  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map((p) => (
        <div key={p.id} className="overflow-hidden rounded-2xl bg-muted">
          <div className="relative aspect-square">
            {imgs[p.id] ? (
              <img src={imgs[p.id]!} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full w-full place-items-center text-muted-foreground"><Package size={26} /></div>
            )}
          </div>
          <div className="p-2">
            <p className="truncate text-[13px] font-medium">{p.name}</p>
            <p className="text-[13px] font-bold">{formatMoney(Number(p.price), cur, lang)}</p>
            <p className="text-[11px] text-muted-foreground">{t("sellerProfile.availableInLives", { defaultValue: "Disponible pendant les lives" })}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ============ LIVES ============ */

function LivesTab({ sellerId, onBack }: { sellerId: string; onBack: () => void }) {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const { open: openLive } = useLiveViewer();
  const [rows, setRows] = useState<SellerLiveEntry[] | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchSellerLives(sellerId).then((r) => { if (alive) setRows(r); });
    return () => { alive = false; };
  }, [sellerId]);

  if (rows === null) return <div className="grid place-items-center py-14"><Loader2 className="animate-spin text-muted-foreground" /></div>;
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-muted"><Radio className="text-muted-foreground" /></div>
        <p className="mt-3 text-[13px] text-muted-foreground">{t("sellerProfile.livesEmpty", { defaultValue: "Aucun live pour le moment." })}</p>
      </div>
    );
  }

  const openThis = async (row: SellerLiveEntry) => {
    if (row.status !== "live") return;
    const stream = await fetchLiveById(row.id);
    if (stream) { onBack(); setTimeout(() => openLive(stream), 250); }
  };

  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const isLive = r.status === "live";
        const isScheduled = r.status === "scheduled";
        const clickable = isLive;
        return (
          <div
            key={r.id}
            onClick={clickable ? () => void openThis(r) : undefined}
            className={`flex items-center gap-3 rounded-2xl p-2.5 ${clickable ? "cursor-pointer" : ""} ${r.status === "ended" ? "opacity-60" : ""}`}
            style={{ backgroundColor: "var(--muted)" }}
          >
            {r.cover_url ? (
              <img src={r.cover_url} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" draggable={false} />
            ) : (
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-background">
                <Radio className="text-muted-foreground" size={20} />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold">{r.title}</p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                {isLive
                  ? t("seller.liveNow")
                  : isScheduled
                    ? (r.scheduled_at ? formatShortDateTime(new Date(r.scheduled_at), lang) : "—")
                    : (r.ended_at ? t("seller.ended") + " · " + formatShortDateTime(new Date(r.ended_at), lang) : t("seller.ended"))}
              </p>
            </div>
            {isLive && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase text-white" style={{ background: "oklch(0.55 0.22 27)" }}>LIVE</span>
            )}
            {isScheduled && <CalendarDays size={16} className="text-muted-foreground" />}
          </div>
        );
      })}
    </div>
  );
}

/* ============ REVIEWS ============ */

function AvisTab({ sellerId }: { sellerId: string }) {
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState<SellerReview[] | null>(null);
  const [avatars, setAvatars] = useState<Record<string, string | null>>({});

  useEffect(() => {
    let alive = true;
    const reload = async () => {
      const r = await listSellerReviews(sellerId);
      if (!alive) return;
      setRows(r);
      const entries = await Promise.all(r.map(async (row) => [row.reviewer_id, await resolveAvatarUrl(row.reviewer?.avatar_url ?? null)] as const));
      if (alive) setAvatars(Object.fromEntries(entries));
    };
    void reload();
    const ch = supabase
      .channel(`reviews-${sellerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "seller_reviews", filter: `seller_id=eq.${sellerId}` }, () => { void reload(); })
      .subscribe();
    return () => { alive = false; void supabase.removeChannel(ch); };
  }, [sellerId]);


  if (rows === null) return <div className="grid place-items-center py-14"><Loader2 className="animate-spin text-muted-foreground" /></div>;
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-muted"><Star className="text-muted-foreground" /></div>
        <p className="mt-3 text-[13px] text-muted-foreground">{t("reviews.empty", { defaultValue: "Aucun avis pour le moment." })}</p>
      </div>
    );
  }

  const fmt = (iso: string) => new Date(iso).toLocaleDateString(i18n.language, { day: "2-digit", month: "short", year: "numeric" });

  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const handle = r.reviewer?.handle ?? "user";
        const avatar = avatars[r.reviewer_id];
        return (
          <div key={r.id} className="flex gap-3">
            {avatar ? (
              <img src={avatar} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" draggable={false} />
            ) : (
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-[12px] font-bold text-muted-foreground">
                {handle.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-[13px] font-semibold">@{handle}</span>
                <span className="text-[11px] text-muted-foreground">· {fmt(r.created_at)}</span>
              </div>
              <div className="mt-0.5 flex gap-0.5">
                {Array.from({ length: 5 }).map((_, k) => (
                  <Star
                    key={k} size={11}
                    className={k < r.rating ? "text-amber-400" : "text-muted-foreground/30"}
                    fill="currentColor" strokeWidth={0}
                  />
                ))}
              </div>
              {r.comment && <p className="mt-1 text-[13px] leading-snug">{r.comment}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
