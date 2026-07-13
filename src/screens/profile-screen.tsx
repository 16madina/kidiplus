import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ChevronRight,
  MapPin,
  Bell,
  Settings as SettingsIcon,
  HelpCircle,
  Moon,
  LogOut,
  BadgeCheck,
  Loader2,
  Languages,
  Wallet as WalletIcon,
  ShieldCheck,
  FileText,
  ShieldAlert,
  UserX,
  Trash2,
  Truck,
  Coins,
  Plus,
  TrendingUp,
  ShoppingBag,
  UserPen,
  Store,
  Camera,
  Fingerprint,
  ScanFace,
  Play,
  HeartHandshake,
} from "lucide-react";

import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { Press } from "@/components/press";
import { GuestProfileScreen } from "@/components/guest-profile-screen";

import { PushScreen } from "@/components/push-screen";
import { usePush } from "@/lib/push";
import { IOSSwitch } from "@/components/ios-switch";
import { EASE_IOS } from "@/lib/motion";
import { useSettings } from "@/lib/settings-context";
import { useAuth } from "@/lib/auth-context";
import { useWallet } from "@/lib/wallet-context";
import { resolveAvatarUrl, bustAvatarCache } from "@/lib/avatar-url";
import { EditProfileScreen } from "@/components/auth/edit-profile-screen";
import { SellerEarningsScreen } from "@/components/seller/earnings-screen";
import { SellerDeliverySettingsScreen } from "@/components/seller/delivery-settings-screen";
import { AdminPayoutsScreen } from "@/components/admin/admin-dashboard-screen";
import { WalletScreen } from "@/components/wallet/wallet-screen";
import { LegalScreen } from "@/components/legal/legal-screen";
import { BlockedUsersScreen } from "@/components/moderation/blocked-users-screen";
import { DeleteAccountScreen } from "@/components/account/delete-account-screen";
import { AddressBookScreen } from "@/components/buyer/address-book-screen";
import { HelpSupportScreen } from "@/components/help-support-screen";
import { MyShopScreen } from "@/screens/my-shop-screen";
import { CertificationSheet } from "@/components/verify/certification-sheet";
import { VerifiedBadge } from "@/components/verified-badge";
import { ReferredBadge } from "@/components/referred-badge";
import { DiscoverScreen } from "@/components/discover/discover-screen";
import { getAdminStatus } from "@/lib/admin.functions";
import { ReferralScreen } from "@/components/referral/referral-screen";
import { fetchMyPromoCodes } from "@/lib/referrals-db";

import { formatMoneyShort, normalizeCurrency } from "@/lib/money";
import { supabase } from "@/integrations/supabase/client";

import { haptic } from "@/lib/haptics";
import { useLanguage } from "@/i18n/language-context";
import type { Lang } from "@/i18n";
import {
  disableBiometric,
  enableBiometric,
  getBiometricInfo,
  isBiometricEnabled,
  type BiometricInfo,
} from "@/lib/biometric";

/* ============================================================
   Design tokens for this screen
   Navy gradient card + gold accent — works in light & dark
   ============================================================ */
const NAVY_TOP = "#10162B";
const NAVY_BOTTOM = "#1C2440";
const NAVY_INSET = "#182140";
const GOLD = "#E8B93B";

export function ProfileScreen() {
  const { guestMode } = useAuth();
  if (guestMode) return <GuestProfileScreen />;
  return <ProfileScreenAuthed />;
}

function ProfileScreenAuthed() {
  const { t } = useTranslation();
  const { profile, signOut, becomeSeller } = useAuth();


  const { balance, currency } = useWallet();
  const { lang } = useLanguage();
  const { dark, setDark } = useSettings();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [salesOpen, setSalesOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [addressesOpen, setAddressesOpen] = useState(false);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [blockedOpen, setBlockedOpen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [certOpen, setCertOpen] = useState(false);
  const [legalOpen, setLegalOpen] = useState<null | "privacy" | "terms" | "community">(null);
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [referralOpen, setReferralOpen] = useState(false);
  const [isInfluencer, setIsInfluencer] = useState(false);

  useEffect(() => {
    if (!profile?.id) { setIsInfluencer(false); return; }
    let alive = true;
    void fetchMyPromoCodes().then((rows) => { if (alive) setIsInfluencer(rows.length > 0); });
    return () => { alive = false; };
  }, [profile?.id]);

  useEffect(() => {
    const openShop = () => setShopOpen(true);
    window.addEventListener("kidi:open-my-shop", openShop);
    return () => window.removeEventListener("kidi:open-my-shop", openShop);
  }, []);




  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [serverAdmin, setServerAdmin] = useState<boolean | null>(null);
  const fetchAdminStatus = useServerFn(getAdminStatus);

  useEffect(() => {
    if (!profile) {
      setServerAdmin(null);
      return;
    }
    let alive = true;
    fetchAdminStatus()
      .then((res) => { if (alive) setServerAdmin(res.isAdmin); })
      .catch(() => { if (alive) setServerAdmin(false); });
    return () => { alive = false; };
  }, [profile, fetchAdminStatus]);

  useEffect(() => {
    let alive = true;
    if (!profile?.avatar_url) {
      setAvatarUrl(null);
      return () => { alive = false; };
    }
    void resolveAvatarUrl(profile.avatar_url).then((url) => {
      if (alive) setAvatarUrl(bustAvatarCache(url, profile.avatar_url));
    });
    return () => { alive = false; };
  }, [profile?.avatar_url]);

  // Live-updating sales count (paid orders where the current user is seller).
  const [salesCount, setSalesCount] = useState<number | null>(null);
  useEffect(() => {
    const userId = profile?.id;
    if (!userId) { setSalesCount(null); return; }
    let alive = true;
    const load = async () => {
      const { count } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("seller_id", userId)
        .eq("status", "paid");
      if (alive) setSalesCount(count ?? 0);
    };
    void load();
    const channel = supabase
      .channel(`profile-sales-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `seller_id=eq.${userId}` },
        () => { void load(); },
      )
      .subscribe();
    return () => { alive = false; supabase.removeChannel(channel); };
  }, [profile?.id]);

  // Live-updating followers / following counts (denormalized on profiles, kept
  // fresh via realtime on follows).
  const [followers, setFollowers] = useState<number>(0);
  const [following, setFollowing] = useState<number>(0);
  useEffect(() => {
    const userId = profile?.id;
    if (!userId) { setFollowers(0); setFollowing(0); return; }
    setFollowers(profile?.followers_count ?? 0);
    setFollowing(profile?.following_count ?? 0);
    let alive = true;
    const refresh = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("followers_count, following_count")
        .eq("id", userId)
        .maybeSingle();
      if (!alive) return;
      const p = data as { followers_count?: number; following_count?: number } | null;
      setFollowers(p?.followers_count ?? 0);
      setFollowing(p?.following_count ?? 0);
    };
    const channel = supabase
      .channel(`profile-follows-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "follows", filter: `followed_id=eq.${userId}` },
        () => { void refresh(); },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "follows", filter: `follower_id=eq.${userId}` },
        () => { void refresh(); },
      )
      .subscribe();
    return () => { alive = false; supabase.removeChannel(channel); };
  }, [profile?.id, profile?.followers_count, profile?.following_count]);

  const handleSignOut = async () => {
    setSigningOut(true);
    try { await signOut(); haptic.success(); }
    finally { setSigningOut(false); }
  };

  const initial = (profile?.display_name || "?").slice(0, 1).toUpperCase();
  const soon = t("common.loading");

  const walletCaption = formatMoneyShort(balance, normalizeCurrency(currency), lang);

  const goActivity = () => {
    haptic.light();
    window.dispatchEvent(new CustomEvent("kidi:navigate-tab", { detail: "activity" }));
  };

  const handleBecomeSeller = async () => {
    haptic.light();
    try {
      await becomeSeller();
      toast.success(lang === "fr" ? "Mode vendeur activé" : "Seller mode enabled");
    } catch (err) {
      toast.error(String(err));
    }
  };

  const currencyLabel =
    profile?.currency === "XOF" ? "🇨🇮 FCFA (XOF)"
    : profile?.currency === "CAD" ? "🇨🇦 CAD"
    : "🇪🇺 EUR";

  return (
    <div className="flex h-full flex-col bg-background">
      <div
        className="min-h-0 flex-1 overflow-y-auto pt-safe"
        style={{
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
          paddingBottom: "calc(5.5rem + env(safe-area-inset-bottom))",
        }}
      >
        {/* ============ HERO CARD ============ */}
        <div className="relative mx-4 mt-14">
          {/* Avatar overlapping the card top edge — tap to edit */}
          <div className="absolute left-1/2 -top-11 z-10 -translate-x-1/2">
            <Press
              type="button"
              onClick={() => { haptic.light(); setEditOpen(true); }}
              aria-label={t("profile.editAvatar", { defaultValue: lang === "fr" ? "Changer la photo" : "Change photo" })}
              className="relative grid h-[88px] w-[88px] place-items-center rounded-full"
              style={{
                background: GOLD,
                padding: 3,
                boxShadow: "0 8px 24px rgba(16,22,43,0.35)",
              }}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt=""
                  className="h-full w-full rounded-full object-cover"
                  style={{ background: NAVY_TOP }}
                  draggable={false}
                  onLoad={(e) => e.currentTarget.setAttribute("data-loaded", "true")}
                />
              ) : (
                <div
                  className="grid h-full w-full place-items-center rounded-full text-[30px] font-bold text-white"
                  style={{ background: NAVY_TOP }}
                >
                  {initial}
                </div>
              )}
              <span
                aria-hidden
                className="absolute bottom-0 right-0 grid h-7 w-7 place-items-center rounded-full text-white"
                style={{
                  background: NAVY_TOP,
                  border: `2px solid ${GOLD}`,
                  boxShadow: "0 2px 6px rgba(0,0,0,0.35)",
                }}
              >
                <Camera size={13} />
              </span>
            </Press>
          </div>


          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: EASE_IOS }}
            className="rounded-3xl px-5 pb-4 pt-16 text-white"
            style={{
              background: `linear-gradient(155deg, ${NAVY_TOP} 0%, ${NAVY_BOTTOM} 100%)`,
              boxShadow:
                "0 12px 30px -12px rgba(16,22,43,0.45), inset 0 1px 0 rgba(255,255,255,0.04)",
            }}
          >
            {/* Identity */}
            <div className="text-center">
              <h1 className="flex items-center justify-center gap-1.5 text-[19px] font-bold tracking-tight text-white">
                {profile?.display_name ?? "…"}
                <VerifiedBadge verified={profile?.is_verified} size={16} />
                <ReferredBadge referred={profile?.is_referred} size={13} />
                {profile?.is_seller && (
                  <span
                    aria-hidden
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: GOLD, boxShadow: `0 0 0 3px rgba(232,185,59,0.18)` }}
                  />
                )}
              </h1>
              <p className="mt-0.5 text-[13px] text-white/70">
                @{profile?.handle ?? "…"}
              </p>
              {profile?.email && (
                <p className="text-[12px] text-white/50">{profile.email}</p>
              )}
            </div>

            {/* Inset panel: stats + quick actions */}
            <div
              className="mt-4 rounded-2xl px-3 py-3"
              style={{
                background: NAVY_INSET,
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              {/* Stats */}
              <div className="grid grid-cols-3">
                <HeroStat label={t("profile.stats.followers")} value={String(followers)} />
                <HeroStatDivider />
                <HeroStat label={t("profile.stats.sales")} value={salesCount === null ? "—" : String(salesCount)} />
                <HeroStatDivider />
                <HeroStat label={t("profile.stats.following")} value={String(following)} />
              </div>

              <div className="my-3 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />

              {/* Quick actions */}
              <div className="grid grid-cols-4 gap-1">
                {profile?.is_seller ? (
                  <QuickAction
                    icon={<Store size={18} />}
                    label={t("profile.quick.myShop")}
                    onClick={() => { haptic.light(); setShopOpen(true); }}
                  />
                ) : (
                  <QuickAction
                    icon={<Plus size={18} />}
                    label={t("profile.quick.recharge")}
                    onClick={() => { haptic.light(); setWalletOpen(true); }}
                  />
                )}
                <QuickAction
                  icon={<WalletIcon size={18} />}
                  label={t("profile.quick.wallet")}
                  caption={walletCaption}
                  onClick={() => { haptic.light(); setWalletOpen(true); }}
                />
                {profile?.is_seller ? (
                  <QuickAction
                    icon={<TrendingUp size={18} />}
                    label={t("profile.quick.earnings")}
                    onClick={() => { haptic.light(); setSalesOpen(true); }}
                  />
                ) : (
                  <QuickAction
                    icon={<Store size={18} />}
                    label={t("profile.quick.becomeSeller")}
                    onClick={handleBecomeSeller}
                  />
                )}
                <QuickAction
                  icon={<ShoppingBag size={18} />}
                  label={t("profile.quick.orders")}
                  onClick={goActivity}
                />
              </div>
            </div>
          </motion.div>
        </div>

        {/* ============ DÉCOUVRIR KIDI+ ============ */}
        <SectionHeader label={t("profile.sections.discover", { defaultValue: "Découvrir" })} />
        <MenuGroup
          index={0}
          items={[
            {
              icon: <Play size={16} />,
              label: t("profile.discover.button", { defaultValue: "Tutoriels & astuces" }),
              tint: "oklch(0.65 0.18 75)",
              onClick: () => { haptic.light(); setDiscoverOpen(true); },
            },
          ]}
        />

        {/* ============ PARRAINAGE (all logged-in users) ============ */}
        <SectionHeader label={t("referral.title", "Parrainage 🤝")} />
        <MenuGroup
          index={0}
          items={[
            {
              icon: <HeartHandshake size={16} />,
              label: isInfluencer
                ? t("referral.menu", "Mes codes & gains de parrainage")
                : t("referral.claim.entry", "Réclamer mon code influenceur 🤝"),
              tint: "oklch(0.65 0.18 40)",
              onClick: () => { haptic.light(); setReferralOpen(true); },
            },
          ]}
        />



        {/* ============ GÉNÉRAL ============ */}

        <SectionHeader label={t("profile.sections.general")} />
        <MenuGroup
          index={1}
          items={[
            { icon: <UserPen size={16} />, label: t("profile.editProfile"), tint: "oklch(0.6 0.2 250)", onClick: () => setEditOpen(true) },
            ...(profile?.is_seller
              ? [{ icon: <Store size={16} />, label: t("profile.myShop", { defaultValue: "Ma boutique" }), tint: "oklch(0.6 0.2 30)", onClick: () => setShopOpen(true) }]
              : []),
            { icon: <MapPin size={16} />, label: t("address.title"), tint: "oklch(0.6 0.17 155)", onClick: () => setAddressesOpen(true) },
            ...(profile?.is_seller
              ? [{ icon: <Truck size={16} />, label: t("delivery.title"), tint: "oklch(0.55 0.13 200)", onClick: () => setDeliveryOpen(true) }]
              : []),
            { icon: <Languages size={16} />, label: t("settings.language"), tint: "oklch(0.55 0.16 210)", trailing: lang === "fr" ? t("settings.french") : t("settings.english"), onClick: () => setLanguageOpen(true) },
            { icon: <Coins size={16} />, label: t("settings.currency"), tint: "oklch(0.68 0.14 75)", trailing: currencyLabel, onClick: () => setCurrencyOpen(true) },
            { icon: <Moon size={16} />, label: t("profile.menu.darkMode"), tint: "oklch(0.35 0.02 285)", toggle: { checked: dark, onChange: setDark } },
          ]}
        />

        {/* ============ COMPTE ============ */}
        <SectionHeader label={t("profile.sections.account")} />
        <MenuGroup
          index={2}
          items={[
            { icon: <Bell size={16} />, label: t("profile.menu.notifications"), tint: "oklch(0.62 0.24 20)", onClick: () => setSettingsOpen(true) },
            ...(profile?.is_seller
              ? [{
                  icon: <BadgeCheck size={16} />,
                  label: t("verify.menuLabel", "Certification"),
                  tint: "oklch(0.68 0.16 80)",
                  trailing: profile?.is_verified ? "✓" : undefined,
                  onClick: () => setCertOpen(true),
                }]
              : []),
            { icon: <UserX size={16} />, label: t("block.listTitle"), tint: "oklch(0.55 0.12 30)", onClick: () => setBlockedOpen(true) },
            { icon: <FileText size={16} />, label: t("profile.menu.privacy"), tint: "oklch(0.5 0.06 265)", onClick: () => setLegalOpen("privacy") },
            { icon: <FileText size={16} />, label: t("profile.menu.terms"), tint: "oklch(0.5 0.06 265)", onClick: () => setLegalOpen("terms") },
            { icon: <ShieldAlert size={16} />, label: t("legal.community"), tint: "oklch(0.55 0.16 155)", onClick: () => setLegalOpen("community") },
            { icon: <SettingsIcon size={16} />, label: t("profile.menu.settings"), tint: "oklch(0.55 0.02 285)", onClick: () => setSettingsOpen(true) },
            { icon: <HelpCircle size={16} />, label: t("profile.menu.help"), tint: "oklch(0.55 0.16 300)", onClick: () => setHelpOpen(true) },
          ]}
        />

        {/* ============ ADMINISTRATION ============ */}
        {serverAdmin === true && (
          <>
            <SectionHeader label={t("profile.sections.admin")} />
            <MenuGroup
              index={3}
              items={[
                { icon: <ShieldCheck size={16} />, label: t("admin.title"), tint: "oklch(0.3 0.06 265)", onClick: () => setAdminOpen(true) },
              ]}
            />
          </>
        )}

        {/* ============ Danger ============ */}
        <MenuGroup
          index={4}
          items={[
            {
              icon: signingOut ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />,
              label: signingOut ? t("common.loading") : t("profile.signOut"),
              tint: "oklch(0.6 0.24 27)",
              danger: true,
              onClick: signingOut ? undefined : handleSignOut,
            },
            {
              icon: <Trash2 size={16} />,
              label: t("account.delete.menuItem"),
              tint: "oklch(0.55 0.22 27)",
              danger: true,
              onClick: () => setDeleteOpen(true),
            },
          ]}
        />

        <p className="mt-4 text-center text-[11px] text-muted-foreground">KiDi+ v1.0.0</p>
      </div>

      {/* Push screens */}
      <SettingsPushScreen open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <EditProfileScreen open={editOpen} onClose={() => setEditOpen(false)} />
      <SellerEarningsScreen open={salesOpen} onClose={() => setSalesOpen(false)} />
      <AdminPayoutsScreen open={adminOpen} onClose={() => setAdminOpen(false)} />
      <WalletScreen open={walletOpen} onClose={() => setWalletOpen(false)} />
      <AddressBookScreen open={addressesOpen} onClose={() => setAddressesOpen(false)} />
      <SellerDeliverySettingsScreen open={deliveryOpen} onClose={() => setDeliveryOpen(false)} />
      <BlockedUsersScreen open={blockedOpen} onClose={() => setBlockedOpen(false)} />
      <LanguageSheet open={languageOpen} onClose={() => setLanguageOpen(false)} />
      <CurrencySheet open={currencyOpen} onClose={() => setCurrencyOpen(false)} />
      <LegalScreen open={legalOpen === "privacy"} onClose={() => setLegalOpen(null)} kind="privacy" />
      <LegalScreen open={legalOpen === "terms"} onClose={() => setLegalOpen(null)} kind="terms" />
      <LegalScreen open={legalOpen === "community"} onClose={() => setLegalOpen(null)} kind="community" />
      <DeleteAccountScreen open={deleteOpen} onClose={() => setDeleteOpen(false)} />
      <MyShopScreen open={shopOpen} onClose={() => setShopOpen(false)} />
      <CertificationSheet open={certOpen} onClose={() => setCertOpen(false)} />
      <ReferralScreen open={referralOpen} onClose={() => setReferralOpen(false)} />
      <HelpSupportScreen open={helpOpen} onClose={() => setHelpOpen(false)} />
      <DiscoverScreen open={discoverOpen} onClose={() => setDiscoverOpen(false)} />
    </div>
  );
}


/* ================= HERO subcomponents ================= */

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[16px] font-bold tabular-nums text-white">{value}</span>
      <span className="mt-0.5 text-[11px] font-medium text-white/60">{label}</span>
    </div>
  );
}
function HeroStatDivider() {
  return (
    <span
      className="mx-auto h-7 w-px"
      style={{ background: "rgba(255,255,255,0.10)" }}
      aria-hidden
    />
  );
}

function QuickAction({
  icon,
  label,
  caption,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  caption?: string;
  onClick?: () => void;
}) {
  return (
    <Press
      onClick={onClick}
      className="!block !min-h-0 !p-0 !bg-transparent"
    >
      <div className="flex flex-col items-center gap-1.5 py-1.5">
        <span
          className="grid h-11 w-11 place-items-center rounded-full"
          style={{
            background: "rgba(232,185,59,0.12)",
            color: GOLD,
            border: "1px solid rgba(232,185,59,0.28)",
          }}
        >
          {icon}
        </span>
        <span className="text-[11px] font-semibold text-white/90 leading-none">{label}</span>
        {caption && (
          <span className="text-[10px] tabular-nums text-white/50 leading-none">{caption}</span>
        )}
      </div>
    </Press>
  );
}

/* ================= Sections list ================= */

function SectionHeader({ label }: { label: string }) {
  return (
    <h2 className="mb-2 mt-6 px-6 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
      {label}
    </h2>
  );
}

type MenuItem = {
  icon: React.ReactNode;
  label: string;
  tint: string;
  onClick?: () => void;
  danger?: boolean;
  trailing?: string;
  toggle?: { checked: boolean; onChange: (v: boolean) => void };
};

function MenuGroup({ items, index }: { items: MenuItem[]; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: EASE_IOS, delay: 0.04 + index * 0.03 }}
      className="mx-4 mb-3 overflow-hidden rounded-2xl border border-border bg-card"
    >
      {items.map((it, i) => (
        <div key={it.label}>
          {it.toggle ? (
            <div className="flex items-center gap-3 px-3 py-2.5">
              <MenuIcon icon={it.icon} tint={it.tint} />
              <span className="flex-1 text-[15px] font-medium">{it.label}</span>
              <IOSSwitch
                checked={it.toggle.checked}
                onChange={it.toggle.onChange}
                label={it.label}
              />
            </div>
          ) : (
            <Press onClick={it.onClick} className="!block w-full !min-h-11 p-0 text-left">
              <div className="flex items-center gap-3 px-3 py-2.5">
                <MenuIcon icon={it.icon} tint={it.tint} />
                <span
                  className="flex-1 text-[15px] font-medium"
                  style={{ color: it.danger ? "oklch(0.6 0.24 27)" : "var(--foreground)" }}
                >
                  {it.label}
                </span>
                {it.trailing && (
                  <span className="text-[13px] text-muted-foreground">{it.trailing}</span>
                )}
                {!it.danger && <ChevronRight size={16} className="text-muted-foreground" />}
              </div>
            </Press>
          )}
          {i < items.length - 1 && <div className="ml-14 h-px bg-border" aria-hidden />}
        </div>
      ))}
    </motion.div>
  );
}

function MenuIcon({ icon, tint }: { icon: React.ReactNode; tint: string }) {
  return (
    <span
      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white"
      style={{ backgroundColor: tint }}
    >
      {icon}
    </span>
  );
}

/* ================= Settings push screen ================= */

function SettingsPushScreen({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { notif, setNotif, sounds, setSounds } = useSettings();
  const { status, requestWithPrePrompt, refresh } = usePush();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const statusLabel =
    status === "granted" ? "Autorisées"
    : status === "denied" ? "Refusées"
    : status === "prompt" ? "Non demandées"
    : "Inconnu";
  const statusTint =
    status === "granted" ? "oklch(0.72 0.17 150)"
    : status === "denied" ? "oklch(0.62 0.24 20)"
    : "oklch(0.7 0.02 285)";

  const onRetry = async () => {
    setBusy(true);
    haptic.medium();
    try {
      await requestWithPrePrompt("Réglages");
      // NOTE: ne pas appeler refresh() ici — doRequest a déjà mis le status.
      // Sur web, refresh() écraserait "granted" par "prompt", et sur natif
      // checkPermissions() juste après requestPermissions() peut renvoyer
      // une valeur pas encore propagée → statut "Inconnu".
    } finally {
      setBusy(false);
    }
  };

  return (
    <PushScreen open={open} onClose={onClose} title={t("settings.title")} zIndex={65}>
      <div className="px-4 py-4">
        <h2 className="mb-2 px-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          Notifications système
        </h2>
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-3 px-3 py-2.5">
            <MenuIcon icon={<Bell size={16} />} tint={statusTint} />
            <div className="flex-1">
              <div className="text-[15px] font-medium">Autorisation push</div>
              <div className="text-[12px] text-muted-foreground">{statusLabel}</div>
            </div>
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
              style={{ background: statusTint }}
            >
              {statusLabel}
            </span>
          </div>
          {status !== "granted" && (
            <>
              <Sep />
              <button
                type="button"
                onClick={onRetry}
                disabled={busy}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left disabled:opacity-60"
              >
                <MenuIcon icon={busy ? <Loader2 size={16} className="animate-spin" /> : <Bell size={16} />} tint="oklch(0.6 0.2 250)" />
                <span className="flex-1 text-[15px] font-medium">
                  {status === "denied" ? "Réessayer / Ouvrir Réglages" : "Activer les notifications"}
                </span>
                <ChevronRight size={16} className="text-muted-foreground" />
              </button>
            </>
          )}
        </div>
        {status === "denied" && (
          <p className="mt-2 px-2 text-[12px] text-muted-foreground">
            Si le système refuse la demande, active-les manuellement dans Réglages &gt; Notifications &gt; KiDi+.
          </p>
        )}

        <h2 className="mb-2 mt-6 px-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t("settings.preferences")}
        </h2>
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <ToggleRow
            icon={<Bell size={16} />}
            tint="oklch(0.62 0.24 20)"
            label={t("profile.menu.notifications")}
            checked={notif}
            onChange={setNotif}
          />
          <Sep />
          <ToggleRow
            icon={<Bell size={16} />}
            tint="oklch(0.6 0.2 250)"
            label={t("common.notifications")}
            checked={sounds}
            onChange={setSounds}
          />
        </div>

        <BiometricSettingsSection />
      </div>
    </PushScreen>
  );
}

function BiometricSettingsSection() {
  const { user } = useAuth();
  const [bio, setBio] = useState<BiometricInfo>({
    available: false,
    kind: null,
    label: "",
    native: false,
  });
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const info = await getBiometricInfo();
      setBio(info);
      setEnabled(isBiometricEnabled());
    })();
  }, []);

  const onToggle = useCallback(async (v: boolean) => {
    if (busy) return;
    setBusy(true);
    haptic.light();
    try {
      if (!v) {
        await disableBiometric();
        setEnabled(false);
        toast.success(`${bio.label || "Biométrie"} désactivé`);
        return;
      }
      const email = user?.email;
      if (!email) {
        toast.error("Compte introuvable");
        return;
      }
      const pwd = typeof window !== "undefined"
        ? window.prompt(`Entrez votre mot de passe pour activer ${bio.label || "la biométrie"} :`)
        : null;
      if (!pwd) return;
      // Verify the password by re-authenticating before we persist it.
      const { error } = await supabase.auth.signInWithPassword({ email, password: pwd });
      if (error) {
        haptic.error();
        toast.error("Mot de passe incorrect");
        return;
      }
      await enableBiometric(email, pwd);
      setEnabled(true);
      haptic.success();
      toast.success(`${bio.label || "Biométrie"} activé`);
    } catch (e) {
      haptic.error();
      console.warn("[biometric] toggle failed", e);
      toast.error("Impossible de modifier la biométrie");
    } finally {
      setBusy(false);
    }
  }, [busy, bio.label, user?.email]);

  const available = bio.available;
  const Icon = bio.kind === "faceId" || bio.kind === "face" ? ScanFace : Fingerprint;
  const label = bio.label || "Face ID / Empreinte";

  const statusHint = !bio.native
    ? "Disponible uniquement dans l'app mobile"
    : !available
      ? bio.reason === "not_enrolled"
        ? "Active un verrouillage d'écran + empreinte dans Réglages Android"
        : "Biométrie indisponible sur cet appareil"
      : enabled
        ? "Activée"
        : "Utilisez la biométrie pour vous reconnecter";

  const onUnavailableTap = () => {
    if (!bio.native) {
      toast.info("Ouvrez l'app mobile KiDi+ pour activer la biométrie");
      return;
    }
    if (bio.reason === "not_enrolled") {
      toast.info(
        "Android n'a pas d'empreinte / Face ID utilisable. Va dans Réglages → Sécurité → Empreinte digitale (et active un code PIN), puis reviens ici.",
      );
      return;
    }
    toast.error("Biométrie indisponible", {
      description: "Réessaie après avoir configuré le verrouillage d'écran.",
    });
  };

  return (
    <>
      <h2 className="mb-2 mt-6 px-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
        Sécurité
      </h2>
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center gap-3 px-3 py-2.5">
          <MenuIcon icon={<Icon size={16} />} tint="oklch(0.6 0.2 250)" />
          <div className="flex-1">
            <div className="text-[15px] font-medium">Connexion avec {label}</div>
            <div className="text-[12px] text-muted-foreground">{statusHint}</div>
          </div>
          <IOSSwitch
            checked={enabled && available}
            onChange={available ? onToggle : onUnavailableTap}
            label={label}
          />
        </div>
      </div>
      <p className="mt-2 px-2 text-[12px] text-muted-foreground">
        Vos identifiants sont stockés en sécurité dans le trousseau du téléphone.
      </p>
    </>
  );
}

function ToggleRow({
  icon, tint, label, checked, onChange,
}: {
  icon: React.ReactNode;
  tint: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <MenuIcon icon={icon} tint={tint} />
      <span className="flex-1 text-[15px] font-medium">{label}</span>
      <IOSSwitch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

function Sep() {
  return <div className="ml-14 h-px bg-border" aria-hidden />;
}

/* ================= Language selector ================= */

function LanguageSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { lang, setLang } = useLanguage();

  const choose = async (l: Lang) => {
    haptic.light();
    await setLang(l);
    onClose();
  };

  return (
    <PushScreen open={open} onClose={onClose} title={t("settings.chooseLanguage")} zIndex={70}>
      <div className="px-4 py-4">
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <LangRow label={t("settings.french")}  active={lang === "fr"} onClick={() => void choose("fr")} />
          <Sep />
          <LangRow label={t("settings.english")} active={lang === "en"} onClick={() => void choose("en")} />
        </div>
        <p className="mt-3 px-2 text-[12px] text-muted-foreground">{t("settings.languageSubtitle")}</p>
      </div>
    </PushScreen>
  );
}

function LangRow({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <Press onClick={onClick} className="!block w-full !min-h-11 p-0 text-left">
      <div className="flex items-center gap-3 px-3 py-3">
        <span className="flex-1 text-[15px] font-medium">{label}</span>
        {active && <BadgeCheck size={18} color="var(--primary)" />}
      </div>
    </Press>
  );
}

/* ================= Currency selector ================= */

function CurrencySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { profile, updateProfile, refreshProfile } = useAuth();
  const current = profile?.currency ?? "EUR";

  const choose = async (c: "XOF" | "EUR" | "CAD") => {
    if (c === current) { onClose(); return; }
    haptic.light();
    try {
      await updateProfile({ currency: c });
      const { supabase } = await import("@/integrations/supabase/client");
      const { error } = await supabase.from("wallets").update({ currency: c }).eq("user_id", profile!.id);
      if (error) toast.message(t("settings.currencyWalletLocked"));
      else toast.success(t("settings.currencyUpdated"));
      await refreshProfile();
    } catch (err) {
      toast.error(String(err));
    }
    onClose();
  };

  const rows: Array<{ code: "XOF" | "EUR" | "CAD"; label: string }> = [
    { code: "EUR", label: "🇪🇺 EUR — Euro" },
    { code: "XOF", label: "🇨🇮 FCFA (XOF)" },
    { code: "CAD", label: "🇨🇦 CAD — Dollar canadien" },
  ];

  return (
    <PushScreen open={open} onClose={onClose} title={t("settings.chooseCurrency")} zIndex={70}>
      <div className="px-4 py-4">
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {rows.map((r, i) => (
            <div key={r.code}>
              <LangRow label={r.label} active={current === r.code} onClick={() => void choose(r.code)} />
              {i < rows.length - 1 && <Sep />}
            </div>
          ))}
        </div>
        <p className="mt-3 px-2 text-[12px] text-muted-foreground">{t("settings.currencyHint")}</p>
      </div>
    </PushScreen>
  );
}
