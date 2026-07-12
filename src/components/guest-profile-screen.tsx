// GuestProfileScreen — shown in the Profile tab for non-authenticated users.
// Rich onboarding pitch: brand logo, headline with gold accent, illustration,
// four feature icons and dual CTAs to sign up / sign in.

import { UserPlus, LogIn, Wallet, Package, MapPin, Settings, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Press } from "@/components/press";
import { Logo } from "@/components/brand/logo";
import { useAuthPrompt } from "@/lib/auth-prompt-context";
import { haptic } from "@/lib/haptics";
import illustration from "@/assets/guest-profile-illustration.png";

const GOLD = "#E8B93B";

export function GuestProfileScreen() {
  const { t } = useTranslation();
  const { openAuth } = useAuthPrompt();

  const go = () => { haptic.light(); openAuth(); };

  return (
    <div
      className="flex h-full flex-col overflow-y-auto bg-background pt-safe"
      style={{
        WebkitOverflowScrolling: "touch",
        paddingBottom: "calc(5.5rem + env(safe-area-inset-bottom))",
      }}
    >
      <div className="mx-auto flex w-full max-w-md flex-col items-center px-6 pt-8 text-center">
        {/* Brand */}
        <div className="mb-6">
          <Logo size={44} />
        </div>

        {/* Headline */}
        <h1 className="text-[26px] font-black leading-[1.15] tracking-tight text-foreground">
          {t("guestProfile.title1", { defaultValue: "Crée un compte pour" })}
          <br />
          <span style={{ color: GOLD }}>
            {t("guestProfile.title2", { defaultValue: "débloquer ton profil" })}
          </span>
        </h1>
        <p className="mt-3 max-w-xs text-[14px] leading-snug text-muted-foreground">
          {t("guestProfile.subtitle", {
            defaultValue: "Ton portefeuille, tes commandes, tes adresses et tes réglages — tout est à un tap.",
          })}
        </p>

        {/* Illustration */}
        <img
          src={illustration}
          alt=""
          width={1024}
          height={1024}
          loading="lazy"
          draggable={false}
          className="my-4 h-auto w-[260px] select-none"
        />

        {/* Feature grid */}
        <div className="mt-2 grid w-full grid-cols-4 gap-2">
          <Feature icon={<Wallet size={20} />} label={t("guestProfile.feat.wallet", { defaultValue: "Portefeuille sécurisé" })} />
          <Feature icon={<Package size={20} />} label={t("guestProfile.feat.orders", { defaultValue: "Suivi de tes commandes" })} />
          <Feature icon={<MapPin size={20} />} label={t("guestProfile.feat.addresses", { defaultValue: "Adresses enregistrées" })} />
          <Feature icon={<Settings size={20} />} label={t("guestProfile.feat.settings", { defaultValue: "Réglages personnalisés" })} />
        </div>

        {/* CTAs */}
        <div className="mt-7 flex w-full flex-col gap-3">
          <Press
            onClick={go}
            className="!min-h-14 flex h-14 items-center justify-center gap-2 rounded-full text-[16px] font-bold text-white"
            style={{ background: GOLD, boxShadow: "0 10px 24px -8px rgba(232,185,59,0.55)" }}
          >
            <UserPlus size={18} />
            {t("auth.prompt.signUp", { defaultValue: "Créer un compte" })}
          </Press>
          <Press
            onClick={go}
            className="!min-h-14 flex h-14 items-center justify-center gap-2 rounded-full border border-border bg-card text-[16px] font-bold text-foreground"
          >
            <LogIn size={18} />
            {t("auth.prompt.signIn", { defaultValue: "Se connecter" })}
          </Press>
        </div>

        {/* Trust footer */}
        <div className="mt-6 flex items-center gap-3 rounded-2xl px-4 py-3 text-left">
          <div
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
            style={{ background: "rgba(232,185,59,0.15)", color: GOLD }}
          >
            <ShieldCheck size={20} />
          </div>
          <div>
            <p className="text-[13px] font-bold text-foreground">
              {t("guestProfile.trust.title", { defaultValue: "Tes données sont protégées" })}
            </p>
            <p className="text-[11.5px] text-muted-foreground">
              {t("guestProfile.trust.sub", { defaultValue: "Paiement sécurisé • Confidentialité garantie" })}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Feature({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className="grid h-11 w-11 place-items-center rounded-full text-foreground/70"
        style={{ background: "var(--muted)" }}
      >
        {icon}
      </div>
      <p className="text-[10.5px] font-semibold leading-tight text-muted-foreground">{label}</p>
    </div>
  );
}
