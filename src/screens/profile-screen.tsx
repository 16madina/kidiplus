import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ChevronRight,
  CreditCard,
  MapPin,
  ShoppingBag,
  Bell,
  Settings as SettingsIcon,
  HelpCircle,
  Moon,
  Volume2,
  BellRing,
  LogOut,
  BadgeCheck,
  Loader2,
  Languages,
  Check,
  Wallet as WalletIcon,
  Coins,
} from "lucide-react";

import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Press } from "@/components/press";
import { PushScreen } from "@/components/push-screen";
import { IOSSwitch } from "@/components/ios-switch";
import { EASE_IOS } from "@/lib/motion";
import { usePush } from "@/lib/push";
import { useSettings } from "@/lib/settings-context";
import { useAuth } from "@/lib/auth-context";
import { resolveAvatarUrl } from "@/lib/avatar-url";
import { EditProfileScreen } from "@/components/auth/edit-profile-screen";
import { SellerSalesScreen } from "@/components/seller-sales-screen";
import { WalletScreen } from "@/components/wallet/wallet-screen";

import { haptic } from "@/lib/haptics";
import { useLanguage } from "@/i18n/language-context";
import type { Lang } from "@/i18n";

export function ProfileScreen() {
  const { t } = useTranslation();
  const { profile, signOut } = useAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [salesOpen, setSalesOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!profile) return setAvatarUrl(null);
    void resolveAvatarUrl(profile.avatar_url).then(setAvatarUrl);
  }, [profile]);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      haptic.success();
    } finally {
      setSigningOut(false);
    }
  };

  const initial = (profile?.display_name || "?").slice(0, 1).toUpperCase();
  const soon = t("common.loading");

  return (
    <div className="flex h-full flex-col">
      <div
        className="min-h-0 flex-1 overflow-y-auto pt-safe"
        style={{
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
          paddingBottom: "calc(3.5rem + env(safe-area-inset-bottom))",
        }}
      >
        {/* Header */}
        <div className="px-5 pb-4 pt-4">
          <div className="flex items-center gap-4">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                className="h-[72px] w-[72px] rounded-full object-cover ring-2 ring-border"
                draggable={false}
              />
            ) : (
              <div className="grid h-[72px] w-[72px] place-items-center rounded-full bg-muted text-[28px] font-bold text-muted-foreground ring-2 ring-border">
                {initial}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h1 className="flex items-center gap-1.5 truncate text-[20px] font-bold tracking-tight">
                {profile?.display_name ?? "…"}
                {profile?.is_seller && (
                  <BadgeCheck size={16} color="oklch(0.62 0.2 250)" />
                )}
              </h1>
              <p className="text-[13px] text-muted-foreground">
                @{profile?.handle ?? "…"}
              </p>
              {profile?.country && (
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  {profile.country}
                </p>
              )}
            </div>
          </div>
          {profile?.bio && (
            <p className="mt-3 text-[13px] leading-snug text-foreground/90">
              {profile.bio}
            </p>
          )}
          <Press
            onClick={() => setEditOpen(true)}
            className="mt-3 h-10 w-full rounded-full text-[13px] font-semibold"
            style={{
              backgroundColor: "transparent",
              color: "var(--foreground)",
              border: "1.5px solid var(--border)",
            }}
          >
            {t("profile.editProfile")}
          </Press>
        </div>

        {/* Stats */}
        <div className="mx-4 mb-5 grid grid-cols-3 rounded-2xl border border-border py-3">
          <Stat label={t("profile.stats.followers")} value="—" />
          <StatDivider />
          <Stat label={t("profile.stats.following")} value="—" />
          <StatDivider />
          <Stat label={t("profile.stats.sales")} value="—" />
        </div>

        <MenuGroup
          items={[
            {
              icon: <WalletIcon size={16} />,
              label: t("wallet.title"),
              tint: "oklch(0.68 0.14 75)",
              onClick: () => setWalletOpen(true),
            },
            { icon: <CreditCard size={16} />, label: t("profile.menu.payments"), tint: "oklch(0.6 0.2 250)", onClick: () => toast(soon) },
            { icon: <MapPin size={16} />, label: t("profile.menu.addresses"), tint: "oklch(0.6 0.17 155)", onClick: () => toast(soon) },
            { icon: <ShoppingBag size={16} />, label: t("profile.menu.purchases"), tint: "oklch(0.7 0.17 55)", onClick: () => toast(soon) },
            ...(profile?.is_seller
              ? [{
                  icon: <BadgeCheck size={16} />,
                  label: t("profile.mySales"),
                  tint: "oklch(0.65 0.16 60)",
                  onClick: () => setSalesOpen(true),
                }]
              : []),
          ]}
          index={0}
        />

        <MenuGroup
          items={[
            { icon: <Bell size={16} />, label: t("profile.menu.notifications"), tint: "oklch(0.62 0.24 20)", onClick: () => toast(soon) },
            { icon: <SettingsIcon size={16} />, label: t("profile.menu.settings"), tint: "oklch(0.55 0.02 285)", onClick: () => setSettingsOpen(true) },
            { icon: <HelpCircle size={16} />, label: t("profile.menu.help"), tint: "oklch(0.55 0.16 300)", onClick: () => toast(soon) },
          ]}
          index={1}
        />
        <MenuGroup
          items={[
            {
              icon: signingOut ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />,
              label: signingOut ? t("common.loading") : t("profile.signOut"),
              tint: "oklch(0.6 0.24 27)",
              danger: true,
              onClick: signingOut ? undefined : handleSignOut,
            },
          ]}
          index={2}
        />

        <p className="mt-4 text-center text-[11px] text-muted-foreground">KiDi+ v1.0.0</p>
      </div>

      <SettingsPushScreen open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <EditProfileScreen open={editOpen} onClose={() => setEditOpen(false)} />
      <SellerSalesScreen open={salesOpen} onClose={() => setSalesOpen(false)} />
      <WalletScreen open={walletOpen} onClose={() => setWalletOpen(false)} />

    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[15px] font-bold tabular-nums">{value}</span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}
function StatDivider() {
  return <span className="mx-auto h-6 w-px bg-border" aria-hidden />;
}

type MenuItem = {
  icon: React.ReactNode;
  label: string;
  tint: string;
  onClick?: () => void;
  danger?: boolean;
};

function MenuGroup({ items, index }: { items: MenuItem[]; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: EASE_IOS, delay: 0.04 + index * 0.04 }}
      className="mx-4 mb-3 overflow-hidden rounded-2xl border border-border bg-card"
    >
      {items.map((it, i) => (
        <div key={it.label}>
          <Press
            onClick={it.onClick}
            className="!block w-full !min-h-11 p-0 text-left"
          >
            <div className="flex items-center gap-3 px-3 py-2.5">
              <span
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white"
                style={{ backgroundColor: it.tint }}
              >
                {it.icon}
              </span>
              <span
                className="flex-1 text-[15px] font-medium"
                style={{ color: it.danger ? "oklch(0.6 0.24 27)" : "var(--foreground)" }}
              >
                {it.label}
              </span>
              {!it.danger && <ChevronRight size={16} className="text-muted-foreground" />}
            </div>
          </Press>
          {i < items.length - 1 && (
            <div className="ml-14 h-px bg-border" aria-hidden />
          )}
        </div>
      ))}
    </motion.div>
  );
}

/* ================= Settings push screen ================= */

function SettingsPushScreen({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { dark, setDark, notif, setNotif, sounds, setSounds } = useSettings();
  const { status: pushStatus, requestWithPrePrompt, refresh } = usePush();
  const { lang } = useLanguage();
  const { profile } = useAuth();
  const [languageOpen, setLanguageOpen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);

  const wasOpen = useState(open)[0];
  if (open && !wasOpen) void refresh();

  const pushGranted = pushStatus === "granted";
  const pushOn = pushGranted && notif;

  const currencyLabel =
    profile?.currency === "XOF" ? "🇨🇮 FCFA (XOF)"
    : profile?.currency === "CAD" ? "🇨🇦 CAD"
    : "🇪🇺 EUR";

  return (
    <PushScreen open={open} onClose={onClose} title={t("settings.title")} zIndex={65}>
      <div className="px-4 py-4">
        <h2 className="mb-2 px-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t("settings.preferences")}
        </h2>
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <ToggleRow
            icon={<BellRing size={16} />}
            tint="oklch(0.62 0.24 20)"
            label={t("profile.menu.notifications")}
            checked={pushOn}
            onChange={async (v) => {
              setNotif(v);
              if (v && !pushGranted) {
                const ok = await requestWithPrePrompt(
                  t("profile.menu.notifications"),
                );
                if (!ok) setNotif(false);
              }
            }}
          />
          <Sep />
          <ToggleRow
            icon={<Volume2 size={16} />}
            tint="oklch(0.6 0.2 250)"
            label={t("common.notifications")}
            checked={sounds}
            onChange={setSounds}
          />
          <Sep />
          <ToggleRow
            icon={<Moon size={16} />}
            tint="oklch(0.35 0.02 285)"
            label={lang === "fr" ? "Mode sombre" : "Dark mode"}
            checked={dark}
            onChange={setDark}
          />
          <Sep />
          <NavRow
            icon={<Languages size={16} />}
            tint="oklch(0.55 0.16 210)"
            label={t("settings.language")}
            value={lang === "fr" ? t("settings.french") : t("settings.english")}
            onClick={() => setLanguageOpen(true)}
          />
          <Sep />
          <NavRow
            icon={<Coins size={16} />}
            tint="oklch(0.68 0.14 75)"
            label={t("settings.currency")}
            value={currencyLabel}
            onClick={() => setCurrencyOpen(true)}
          />
        </div>
      </div>

      <LanguageSheet open={languageOpen} onClose={() => setLanguageOpen(false)} />
      <CurrencySheet open={currencyOpen} onClose={() => setCurrencyOpen(false)} />
    </PushScreen>
  );
}

function ToggleRow({
  icon,
  tint,
  label,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  tint: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <span
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white"
        style={{ backgroundColor: tint }}
      >
        {icon}
      </span>
      <span className="flex-1 text-[15px] font-medium">{label}</span>
      <IOSSwitch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

function NavRow({
  icon,
  tint,
  label,
  value,
  onClick,
}: {
  icon: React.ReactNode;
  tint: string;
  label: string;
  value?: string;
  onClick: () => void;
}) {
  return (
    <Press
      onClick={onClick}
      className="!block w-full !min-h-11 p-0 text-left"
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white"
          style={{ backgroundColor: tint }}
        >
          {icon}
        </span>
        <span className="flex-1 text-[15px] font-medium">{label}</span>
        {value && (
          <span className="text-[13px] text-muted-foreground">{value}</span>
        )}
        <ChevronRight size={16} className="text-muted-foreground" />
      </div>
    </Press>
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
          <LangRow
            label={t("settings.french")}
            active={lang === "fr"}
            onClick={() => void choose("fr")}
          />
          <Sep />
          <LangRow
            label={t("settings.english")}
            active={lang === "en"}
            onClick={() => void choose("en")}
          />
        </div>
        <p className="mt-3 px-2 text-[12px] text-muted-foreground">
          {t("settings.languageSubtitle")}
        </p>
      </div>
    </PushScreen>
  );
}

function LangRow({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Press
      onClick={onClick}
      className="!block w-full !min-h-11 p-0 text-left"
    >
      <div className="flex items-center gap-3 px-3 py-3">
        <span className="flex-1 text-[15px] font-medium">{label}</span>
        {active && <Check size={18} color="var(--primary)" strokeWidth={2.4} />}
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
      // Try to bring the wallet currency along; DB trigger rejects if balance > 0.
      const { supabase } = await import("@/integrations/supabase/client");
      const { error } = await supabase
        .from("wallets")
        .update({ currency: c })
        .eq("user_id", profile!.id);
      if (error) {
        toast.message(t("settings.currencyWalletLocked"));
      } else {
        toast.success(t("settings.currencyUpdated"));
      }
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
        <p className="mt-3 px-2 text-[12px] text-muted-foreground">
          {t("settings.currencyHint")}
        </p>
      </div>
    </PushScreen>
  );
}
