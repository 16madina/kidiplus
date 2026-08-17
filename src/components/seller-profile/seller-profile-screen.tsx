// Real seller profile: header pulls avatar/counts/rating from `profiles`,
// tabs read real data (shop, lives, reviews). No mock data.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  animate,
} from "framer-motion";
import { ChevronLeft, Star, BadgeCheck, MoreHorizontal, Flag, Ban, X, Loader2, Package, Radio, CalendarDays, ShoppingBag, Users as UsersIcon, Video, Play, Trash2, Clapperboard } from "lucide-react";
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
import { blockUserAndNotify } from "@/lib/moderation-db";
import { supabase } from "@/integrations/supabase/client";
import { resolveAvatarUrl } from "@/lib/avatar-url";
import { listSellerActiveShopProducts, resolveShopImage, type ShopProduct } from "@/lib/shop-db";
import { ShopProductDetailSheet } from "@/components/shop/shop-product-detail-sheet";
import { fetchSellerLives, fetchLiveById, type SellerLiveEntry } from "@/lib/lives-db";
import { listSellerReviews, type SellerReview } from "@/lib/reviews-db";
import { VerifiedBadge } from "@/components/verified-badge";
import { ReferredBadge } from "@/components/referred-badge";
import { MessageCircle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useAuthPrompt } from "@/lib/auth-prompt-context";
import { DmChatScreen } from "@/components/dm/dm-chat-screen";
import { LiveReplayPlayer } from "@/components/live-viewer/live-replay-player";
import {
  isReplayPlayable,
  replayDaysLeft,
  resolvePlayableReplayUrl,
  deleteLiveReplay,
  type LiveReplayMeta,
} from "@/lib/live-replay-client";
import {
  countVitrinePostsByUser,
  deleteVitrinePost,
  fetchVitrinePostsByUser,
  isVideoUrl,
  type VitrinePost,
} from "@/lib/vitrine-db";

type SellerProfile = {
  id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string | null;
  is_seller: boolean;
  is_verified: boolean;
  is_referred: boolean;
  followers_count: number;
  rating_avg: number;
  rating_count: number;
  currency: string;
};

/** Resolve the `activeSeller` ref (uuid | handle | display_name) to a profile row. */
async function resolveSellerRef(ref: string): Promise<SellerProfile | null> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref);
  const cols = "id, display_name, handle, avatar_url, banner_url, bio, is_seller, is_verified, is_referred, followers_count, rating_avg, rating_count, currency";
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

type TabKey = "boutique" | "vitrine" | "lives" | "avis";
const TAB_KEYS: TabKey[] = ["boutique", "vitrine", "lives", "avis"];

export function SellerProfileScreen() {
  const { activeSeller, close } = useSellerProfile();
  const [profile, setProfile] = useState<SellerProfile | null>(null);
  const [salesCount, setSalesCount] = useState<number>(0);
  const [productsCount, setProductsCount] = useState<number>(0);
  const [activeProductsCount, setActiveProductsCount] = useState<number>(0);
  const [livesCount, setLivesCount] = useState<number>(0);
  const [vitrineCount, setVitrineCount] = useState<number>(0);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const dragX = useMotionValue(0);

  const loadCounts = async (sellerId: string) => {
    const [sales, products, activeProducts, lives, vitrine] = await Promise.all([
      supabase.from("orders").select("id", { count: "exact", head: true }).eq("seller_id", sellerId).eq("status", "paid"),
      supabase.from("shop_products").select("id", { count: "exact", head: true }).eq("seller_id", sellerId),
      supabase.from("shop_products").select("id", { count: "exact", head: true }).eq("seller_id", sellerId).eq("active", true),
      supabase.from("lives").select("id", { count: "exact", head: true }).eq("seller_id", sellerId),
      countVitrinePostsByUser(sellerId),
    ]);
    setSalesCount(sales.count ?? 0);
    setProductsCount(products.count ?? 0);
    setActiveProductsCount(activeProducts.count ?? 0);
    setLivesCount(lives.count ?? 0);
    setVitrineCount(vitrine);
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
        void resolveAvatarUrl(p.banner_url).then((url) => alive && setBanner(url));
        void loadCounts(p.id);
      }
    })();
    return () => { alive = false; };
  }, [activeSeller]);

  // Realtime: profile row + counts.
  useEffect(() => {
    const sellerId = profile?.id;
    if (!sellerId) return;
    const ch = supabase
      .channel(`seller-profile-${sellerId}:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${sellerId}` }, (payload) => {
        const row = payload.new as Partial<SellerProfile>;
        setProfile((prev) => (prev ? { ...prev, ...row } : prev));
        if (row.avatar_url !== undefined) void resolveAvatarUrl(row.avatar_url ?? null).then(setAvatar);
        if (row.banner_url !== undefined) void resolveAvatarUrl(row.banner_url ?? null).then(setBanner);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `seller_id=eq.${sellerId}` }, () => { void loadCounts(sellerId); })
      .on("postgres_changes", { event: "*", schema: "public", table: "shop_products", filter: `seller_id=eq.${sellerId}` }, () => { void loadCounts(sellerId); })
      .on("postgres_changes", { event: "*", schema: "public", table: "lives", filter: `seller_id=eq.${sellerId}` }, () => { void loadCounts(sellerId); })
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
        <SellerProfileInner
          profile={profile}
          avatar={avatar}
          banner={banner}
          salesCount={salesCount}
          productsCount={productsCount}
          activeProductsCount={activeProductsCount}
          livesCount={livesCount}
          vitrineCount={vitrineCount}
          onBack={close}
          dragX={dragX}
        />
      )}
    </motion.div>
  );
}

function SellerProfileInner({
  profile,
  avatar,
  banner,
  salesCount,
  productsCount,
  activeProductsCount: _activeProductsCount,
  livesCount,
  vitrineCount,
  onBack,
  dragX,
}: {
  profile: SellerProfile;
  avatar: string | null;
  banner: string | null;
  salesCount: number;
  productsCount: number;
  activeProductsCount: number;
  livesCount: number;
  vitrineCount: number;
  onBack: () => void;
  dragX: ReturnType<typeof useMotionValue<number>>;
}) {
  const { t } = useTranslation();
  const { consumeInitialTab } = useSellerProfile();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const scrollY = useMotionValue(0);
  const [tab, setTab] = useState<TabKey>(() => consumeInitialTab() ?? "boutique");

  useEffect(() => {
    const next = consumeInitialTab();
    if (next) setTab(next);
  }, [profile.id, consumeInitialTab]);

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
  const [dmOpen, setDmOpen] = useState(false);
  const { user } = useAuth();
  const { openAuth } = useAuthPrompt();
  const isOwner = !!user?.id && user.id === profile.id;

  useEffect(() => {
    if (!isOwner && tab === "lives") setTab("boutique");
  }, [isOwner, tab]);

  const openDm = () => {
    haptic.light();
    if (!user) { openAuth(); return; }
    setDmOpen(true);
  };

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
    const r = await blockUserAndNotify(profile.id, {
      handle: profile.handle ?? undefined,
      displayName: profile.display_name ?? profile.handle ?? undefined,
      avatarUrl: profile.avatar_url,
    });
    setBlocking(false); setActionsOpen(false);
    if (r.ok) {
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
              <VerifiedBadge verified={profile.is_verified} size={14} />
              <ReferredBadge referred={profile.is_referred} size={12} />
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
            className="relative"
            style={{ opacity: heroOpacity, scale: heroScale, y: heroTranslate, transformOrigin: "50% 0%" }}
          >
            {/* Hero: banner as background, avatar centered overlapping */}
            <div
              className="relative overflow-hidden"
              style={{
                background: banner ? undefined : "linear-gradient(140deg, #F6ECD9 0%, #EEDDBF 45%, #E4CCA6 100%)",
                paddingBottom: 28,
              }}
            >
              {banner && (
                <img
                  src={banner}
                  alt=""
                  className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                  onLoad={(e) => e.currentTarget.setAttribute("data-loaded", "true")}
                  draggable={false}
                />
              )}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  background: banner
                    ? "linear-gradient(180deg, rgba(16,22,43,0.05) 0%, rgba(246,236,217,0.55) 78%, rgba(228,204,166,0.85) 100%)"
                    : "radial-gradient(120% 60% at 20% 10%, rgba(255,255,255,0.55), transparent 60%), radial-gradient(80% 50% at 90% 30%, rgba(200,162,75,0.25), transparent 70%)",
                  mixBlendMode: banner ? "normal" : "screen",
                }}
              />

              {/* Avatar disc */}
              <div className="relative flex flex-col items-center pt-8">
                <div
                  className="relative grid place-items-center rounded-full"
                  style={{
                    height: 132,
                    width: 132,
                    background: "rgba(255,255,255,0.92)",
                    boxShadow: "0 12px 34px rgba(60,40,10,0.18)",
                    border: "1.5px solid rgba(200,162,75,0.55)",
                  }}
                >
                  {avatar ? (
                    <img
                      src={avatar}
                      alt=""
                      className="h-[118px] w-[118px] rounded-full object-cover"
                      onLoad={(e) => e.currentTarget.setAttribute("data-loaded", "true")}
                      draggable={false}
                    />
                  ) : (
                    <div
                      className="grid h-[118px] w-[118px] place-items-center rounded-full font-serif text-[26px] font-bold"
                      style={{ color: "#10162B", letterSpacing: "0.06em" }}
                    >
                      {(profile.display_name || "?").slice(0, 1).toUpperCase()}
                    </div>
                  )}
                </div>

                <h1
                  className="mt-5 flex items-center gap-1.5 font-serif text-[28px] font-bold leading-tight"
                  style={{ color: "#10162B", letterSpacing: "-0.01em" }}
                >
                  <span className="truncate">{profile.display_name} Boutique</span>
                  <VerifiedBadge verified={profile.is_verified} size={18} />
                  <ReferredBadge referred={profile.is_referred} size={15} />
                </h1>
                <p className="mt-0.5 text-[12px]" style={{ color: "#6B6046" }}>@{profile.handle}</p>
                {profile.bio ? (
                  <p className="mt-1.5 max-w-[26ch] px-6 text-center text-[13.5px]" style={{ color: "#4A4132" }}>
                    {profile.bio} <span aria-hidden>🤎</span>
                  </p>
                ) : null}
              </div>
            </div>

            {/* Stats card overlapping */}
            <div className="relative -mt-4 px-4">
              <div
                className="grid grid-cols-4 items-center rounded-2xl bg-card px-2 py-3"
                style={{ boxShadow: "0 12px 30px rgba(20,15,5,0.08)", border: "1px solid rgba(200,162,75,0.18)" }}
              >
                <StatCol icon={<ShoppingBag size={16} style={{ color: "#C8A24B" }} />} label={t("seller.stats.products", { defaultValue: "Produits" })} value={String(productsCount)} onClick={() => setTab("boutique")} />
                <StatCol icon={<UsersIcon size={16} style={{ color: "#C8A24B" }} />} label={t("seller.stats.followers")} value={formatCompact(profile.followers_count)} />
                <StatCol icon={<Video size={16} style={{ color: "#C8A24B" }} />} label={t("seller.stats.lives", { defaultValue: "Lives" })} value={String(livesCount)} onClick={() => { if (isOwner) setTab("lives"); }} />
                <StatCol icon={<Clapperboard size={16} style={{ color: "#C8A24B" }} />} label={t("seller.stats.vitrine", { defaultValue: "Vitrine" })} value={String(vitrineCount)} onClick={() => setTab("vitrine")} />
              </div>
            </div>

            {/* Secondary row: sales + rating + follow */}
            <div className="mt-4 flex flex-col items-center px-5">
              <div className="flex items-center gap-6">
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
              <div className="mt-4 flex items-center gap-2">
                <FollowButton sellerId={profile.id} size="md" />
                {user?.id !== profile.id && (
                  <Press
                    onClick={openDm}
                    className="rounded-full font-bold"
                    style={{
                      height: 40,
                      paddingLeft: 16,
                      paddingRight: 16,
                      fontSize: 13,
                      border: "1.5px solid var(--border)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      minHeight: 0,
                    }}
                  >
                    <MessageCircle size={14} />
                    <span>{t("dm.messageButton", { defaultValue: "Message" })}</span>
                  </Press>
                )}
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
            const livesLocked = key === "lives" && !isOwner;
            return (
              <Press
                key={key} data-tab
                onClick={() => {
                  if (livesLocked) {
                    haptic.light();
                    toast.message(
                      t(
                        "sellerProfile.livesOwnerOnly",
                        "Les replays sont privés — seuls toi peux les ouvrir depuis ta boutique.",
                      ),
                    );
                    return;
                  }
                  setTab(key);
                }}
                className="!min-h-11 rounded-none px-3 text-[14px] font-semibold"
                style={{
                  color: livesLocked
                    ? "color-mix(in oklch, var(--muted-foreground) 55%, transparent)"
                    : active
                      ? "var(--foreground)"
                      : "var(--muted-foreground)",
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

        <div className="min-h-[60vh] px-4 pt-4 pb-16">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: EASE_IOS }}
            >
              {tab === "boutique" && <BoutiqueTab sellerId={profile.id} currency={profile.currency} />}
              {tab === "vitrine" && (
                <VitrineTab sellerId={profile.id} isOwner={isOwner} onBack={onBack} />
              )}
              {tab === "lives" && isOwner && (
                <LivesTab sellerId={profile.id} onBack={onBack} />
              )}
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

      <DmChatScreen
        open={dmOpen}
        onClose={() => setDmOpen(false)}
        target={{
          otherId: profile.id,
          otherName: profile.display_name,
          otherAvatarUrl: profile.avatar_url,
          otherIsVerified: profile.is_verified,
        }}
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
function StatCol({
  icon,
  label,
  value,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <span className="text-[15px] font-extrabold tabular-nums">{value}</span>
    </>
  );
  if (onClick) {
    return (
      <Press onClick={onClick} className="flex flex-col items-center gap-0.5 !bg-transparent p-0">
        {body}
      </Press>
    );
  }
  return <div className="flex flex-col items-center gap-0.5">{body}</div>;
}
function formatCompact(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(".0", "")}k`;
  return String(n);
}

/* ============ VITRINE ============ */

function VitrineTab({
  sellerId,
  isOwner,
  onBack,
}: {
  sellerId: string;
  isOwner: boolean;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const [posts, setPosts] = useState<VitrinePost[] | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const reload = async () => {
    const rows = await fetchVitrinePostsByUser(sellerId);
    setPosts(rows);
  };

  useEffect(() => {
    let alive = true;
    void fetchVitrinePostsByUser(sellerId).then((rows) => {
      if (alive) setPosts(rows);
    });
    return () => {
      alive = false;
    };
  }, [sellerId]);

  const openInFeed = (postId: string) => {
    haptic.light();
    onBack();
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("kidi:navigate-tab", { detail: "vitrine" }));
      window.dispatchEvent(
        new CustomEvent("kidi:open-vitrine-post", { detail: { post_id: postId } }),
      );
    }, 80);
  };

  const onDelete = async (postId: string) => {
    if (deletingId) return;
    if (confirmId !== postId) {
      setConfirmId(postId);
      haptic.warning();
      return;
    }
    setDeletingId(postId);
    haptic.medium();
    const ok = await deleteVitrinePost(postId);
    setDeletingId(null);
    setConfirmId(null);
    if (ok) {
      haptic.success();
      toast.success(t("vitrine.deleted"));
      setPosts((prev) => (prev ?? []).filter((p) => p.id !== postId));
    } else {
      toast.error(t("vitrine.deleteFail"));
    }
  };

  if (posts === null) {
    return (
      <div className="grid place-items-center py-14">
        <Loader2 className="animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (posts.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-muted">
          <Clapperboard className="text-muted-foreground" />
        </div>
        <p className="mt-3 text-[13px] text-muted-foreground">
          {t(isOwner ? "sellerProfile.vitrineEmpty" : "sellerProfile.vitrineEmptyPublic")}
        </p>
      </div>
    );
  }

  return (
    <div>
      {isOwner && (
        <p className="mb-3 text-[12px] text-muted-foreground">
          {t("sellerProfile.vitrineHint")}
        </p>
      )}
      <div className="grid grid-cols-3 gap-1.5">
        {posts.map((post) => {
          const url = post.media_urls[0] ?? "";
          const video = post.media_type === "video" || isVideoUrl(url);
          const busy = deletingId === post.id;
          const confirm = confirmId === post.id;
          return (
            <div key={post.id} className="relative aspect-[3/4] overflow-hidden rounded-xl bg-muted">
              <Press
                onClick={() => openInFeed(post.id)}
                hapticOnTap={false}
                className="!absolute inset-0 !block p-0"
              >
                {video ? (
                  <video
                    src={url}
                    className="h-full w-full object-cover"
                    muted
                    playsInline
                    preload="metadata"
                  />
                ) : url ? (
                  <img src={url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full w-full place-items-center text-muted-foreground">
                    <Clapperboard size={22} />
                  </div>
                )}
                {video && (
                  <span className="pointer-events-none absolute bottom-1.5 left-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/50 text-white">
                    <Play size={12} fill="white" />
                  </span>
                )}
              </Press>
              {isOwner && (
                <Press
                  aria-label={confirm ? t("vitrine.deleteConfirm") : t("vitrine.delete")}
                  onClick={(e) => {
                    e.stopPropagation();
                    void onDelete(post.id);
                  }}
                  className="absolute right-1.5 top-1.5 z-10 grid h-8 w-8 place-items-center rounded-full text-white"
                  style={{ background: confirm ? "#DC2626" : "rgba(0,0,0,0.55)" }}
                >
                  {busy ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Trash2 size={14} />
                  )}
                </Press>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============ BOUTIQUE ============ */

function BoutiqueTab({ sellerId, currency }: { sellerId: string; currency: string }) {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const [items, setItems] = useState<ShopProduct[] | null>(null);
  const [imgs, setImgs] = useState<Record<string, string | null>>({});
  const [detail, setDetail] = useState<ShopProduct | null>(null);

  useEffect(() => {
    let alive = true;
    const reload = async () => {
      const rows = await listSellerActiveShopProducts(sellerId);
      if (!alive) return;
      setItems(rows);
      const entries = await Promise.all(rows.map(async (r) => [r.id, await resolveShopImage(r.image_url)] as const));
      if (alive) setImgs((prev) => {
        const next = { ...prev };
        for (const [id, url] of entries) if (url) next[id] = url;
        return next;
      });
    };
    void reload();
    const ch = supabase
      .channel(`shop-public-${sellerId}:${Math.random().toString(36).slice(2)}`)
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
    <>
      <div className="grid grid-cols-2 gap-3">
        {items.map((p) => (
          <Press
            key={p.id}
            onClick={() => { haptic.selection(); setDetail(p); }}
            hapticOnTap={false}
            className="!block overflow-hidden rounded-2xl bg-muted p-0 text-left"
          >
            <div className="relative aspect-square">
              {imgs[p.id] ? (
                <img
                  src={imgs[p.id]!}
                  alt=""
                  className="h-full w-full object-cover"
                  onLoad={(e) => e.currentTarget.setAttribute("data-loaded", "true")}
                  onError={() => setImgs((prev) => { const n = { ...prev }; delete n[p.id]; return n; })}
                />
              ) : (
                <div className="grid h-full w-full place-items-center text-muted-foreground"><Package size={26} /></div>
              )}
            </div>
            <div className="p-2">
              <p className="truncate text-[13px] font-medium">{p.name}</p>
              {(p.brand || (p.colors?.length ?? 0) > 0 || (p.sizes?.length ?? 0) > 0 || p.condition) ? (
                <p className="truncate text-[11px] text-muted-foreground">
                  {[p.brand, p.colors?.[0], p.sizes?.[0]].filter(Boolean).join(" · ")}
                </p>
              ) : null}
              <p className="text-[13px] font-bold">{formatMoney(Number(p.price), cur, lang)}</p>
              <p className="text-[11px] text-muted-foreground">{t("sellerProfile.availableInLives", { defaultValue: "Disponible pendant les lives" })}</p>
            </div>
          </Press>
        ))}
      </div>
      <ShopProductDetailSheet open={!!detail} onClose={() => setDetail(null)} product={detail} />
    </>
  );
}

/* ============ LIVES ============ */

function ReplaySwipeRow({
  onDelete,
  deleting,
  children,
}: {
  onDelete: () => void;
  deleting: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const x = useMotionValue(0);

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <div className="absolute inset-y-0 right-0 flex w-24 items-stretch justify-end">
        <button
          type="button"
          className="flex w-24 flex-col items-center justify-center gap-1 bg-red-500 text-[11px] font-bold text-white disabled:opacity-70"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          disabled={deleting}
        >
          {deleting ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Trash2 size={18} />
          )}
          {t("broadcast.replay.delete", "Supprimer")}
        </button>
      </div>
      <motion.div
        drag="x"
        style={{ x, touchAction: "pan-y" }}
        dragConstraints={{ left: -96, right: 0 }}
        dragElastic={0.06}
        onDragEnd={(_, info) => {
          const open = info.offset.x < -48 || info.velocity.x < -500;
          void animate(x, open ? -96 : 0, {
            type: "spring",
            stiffness: 420,
            damping: 36,
          });
        }}
        className="relative z-[1]"
      >
        {children}
      </motion.div>
    </div>
  );
}

function LivesTab({ sellerId, onBack }: { sellerId: string; onBack: () => void }) {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const { open: openLive } = useLiveViewer();
  const [rows, setRows] = useState<SellerLiveEntry[] | null>(null);
  const [replay, setReplay] = useState<{
    url: string;
    title: string;
    liveId: string;
  } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const reload = async () => {
    const r = await fetchSellerLives(sellerId);
    setRows(r);
  };

  useEffect(() => {
    let alive = true;
    void fetchSellerLives(sellerId).then((r) => {
      if (alive) setRows(r);
    });
    return () => {
      alive = false;
    };
  }, [sellerId]);

  if (rows === null)
    return (
      <div className="grid place-items-center py-14">
        <Loader2 className="animate-spin text-muted-foreground" />
      </div>
    );
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-muted">
          <Radio className="text-muted-foreground" />
        </div>
        <p className="mt-3 text-[13px] text-muted-foreground">
          {t("sellerProfile.livesEmpty", {
            defaultValue: "Aucun live pour le moment.",
          })}
        </p>
      </div>
    );
  }

  const openThis = async (row: SellerLiveEntry) => {
    if (row.status === "live") {
      const stream = await fetchLiveById(row.id);
      if (stream) {
        onBack();
        setTimeout(() => openLive(stream), 250);
      }
      return;
    }
    const meta: LiveReplayMeta = {
      replay_status: (row.replay_status as LiveReplayMeta["replay_status"]) ?? null,
      replay_url: row.replay_url,
      replay_expires_at: row.replay_expires_at,
    };
    if (!isReplayPlayable(meta) && row.replay_status !== "ready") return;
    haptic.light();
    let url = row.replay_url;
    if (!url || /r2\.cloudflarestorage\.com|amazonaws\.com/i.test(url)) {
      url = await resolvePlayableReplayUrl(row.id);
    }
    if (url) setReplay({ url, title: row.title, liveId: row.id });
  };

  const removeReplay = async (liveId: string) => {
    if (deletingId) return;
    const ok = window.confirm(
      t(
        "broadcast.replay.deleteConfirm",
        "Supprimer ce replay définitivement ? Tu ne pourras plus le revoir.",
      ),
    );
    if (!ok) return;
    setDeletingId(liveId);
    haptic.medium();
    const res = await deleteLiveReplay(liveId);
    setDeletingId(null);
    if (!res.ok) {
      toast.error(
        t("broadcast.replay.deleteFailed", "Impossible de supprimer — réessaie"),
      );
      return;
    }
    haptic.success();
    toast.success(t("broadcast.replay.deleted", "Replay supprimé"));
    if (replay?.liveId === liveId) setReplay(null);
    setRows((prev) =>
      (prev ?? []).map((r) =>
        r.id === liveId
          ? {
              ...r,
              replay_url: null,
              replay_status: "expired",
              replay_expires_at: null,
            }
          : r,
      ),
    );
  };

  return (
    <>
      <p className="mb-3 text-[12px] text-muted-foreground">
        {t(
          "sellerProfile.swipeToDeleteReplay",
          "Glisse un replay vers la gauche pour le supprimer.",
        )}
      </p>
      <div className="space-y-2">
        {rows.map((r) => {
          const isLive = r.status === "live";
          const isScheduled = r.status === "scheduled";
          const replayMeta: LiveReplayMeta = {
            replay_status: (r.replay_status as LiveReplayMeta["replay_status"]) ?? null,
            replay_url: r.replay_url,
            replay_expires_at: r.replay_expires_at,
          };
          const hasReplay = !isLive && !isScheduled && isReplayPlayable(replayMeta);
          const daysLeft = hasReplay ? replayDaysLeft(r.replay_expires_at) : null;
          const clickable = isLive || hasReplay;
          const replayPending =
            !isLive &&
            !isScheduled &&
            (replayMeta.replay_status === "recording" ||
              replayMeta.replay_status === "processing");
          const replayFailed =
            !isLive && !isScheduled && replayMeta.replay_status === "failed";

          const rowInner = (
            <div
              className={`flex items-center gap-3 rounded-2xl p-2.5 ${clickable ? "cursor-pointer" : ""} ${r.status === "ended" && !hasReplay ? "opacity-60" : ""}`}
              style={{ backgroundColor: "var(--muted)" }}
              onClick={clickable ? () => void openThis(r) : undefined}
            >
              {r.cover_url ? (
                <img
                  src={r.cover_url}
                  alt=""
                  className="h-14 w-14 shrink-0 rounded-xl object-cover"
                  draggable={false}
                />
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
                      ? r.scheduled_at
                        ? formatShortDateTime(new Date(r.scheduled_at), lang)
                        : "—"
                      : hasReplay
                        ? t("broadcast.replay.badgeDays", {
                            defaultValue: "Replay · expire dans {{days}}j",
                            days: daysLeft ?? 1,
                          })
                        : replayPending
                          ? t("broadcast.replay.preparing", {
                              defaultValue: "Replay en préparation…",
                            })
                          : replayFailed
                            ? t("broadcast.replay.unavailable", {
                                defaultValue: "Replay indisponible",
                              })
                            : r.ended_at
                              ? t("seller.ended") +
                                " · " +
                                formatShortDateTime(new Date(r.ended_at), lang)
                              : t("seller.ended")}
                </p>
              </div>
              {isLive && (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase text-white"
                  style={{ background: "oklch(0.55 0.22 27)" }}
                >
                  LIVE
                </span>
              )}
              {isScheduled && (
                <CalendarDays size={16} className="text-muted-foreground" />
              )}
              {hasReplay && (
                <span className="grid h-8 w-8 place-items-center rounded-full bg-foreground text-background">
                  <Play size={14} className="fill-current" />
                </span>
              )}
            </div>
          );

          if (!hasReplay) {
            return <div key={r.id}>{rowInner}</div>;
          }

          return (
            <ReplaySwipeRow
              key={r.id}
              deleting={deletingId === r.id}
              onDelete={() => void removeReplay(r.id)}
            >
              {rowInner}
            </ReplaySwipeRow>
          );
        })}
      </div>
      {replay && (
        <LiveReplayPlayer
          url={replay.url}
          title={replay.title}
          liveId={replay.liveId}
          onClose={() => setReplay(null)}
          onDeleted={() => {
            setRows((prev) =>
              (prev ?? []).map((r) =>
                r.id === replay.liveId
                  ? {
                      ...r,
                      replay_url: null,
                      replay_status: "expired",
                      replay_expires_at: null,
                    }
                  : r,
              ),
            );
            void reload();
          }}
        />
      )}
    </>
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
      .channel(`reviews-${sellerId}:${Math.random().toString(36).slice(2)}`)
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
