// GuestProfileScreen — shown in the Profile tab for non-authenticated users.
// Onboarding pitch with soft gold background, CTAs pinned at top, illustration
// and features below.

import { UserPlus, LogIn, Wallet, Package, MapPin, Settings, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Press } from "@/components/press";
import { Logo } from "@/components/brand/logo";
import { useAuthPrompt } from "@/lib/auth-prompt-context";
import { haptic } from "@/lib/haptics";
import illustration from "@/assets/guest-profile-illustration.png";
import background from "@/assets/guest-profile-bg-v2.png.asset.json";

const GOLD = "#E8B93B";

export function GuestProfileScreen() {
  const { t } = useTranslation();
  const { openAuth } = useAuthPrompt();

  const go = () => { haptic.light(); openAuth(); };

  return (
    <div
      className="relative flex h-full flex-col overflow-y-auto pt-safe"
      style={{
        WebkitOverflowScrolling: "touch",
        paddingBottom: "calc(6.5rem + env(safe-area-inset-bottom))",
        backgroundImage: `linear-gradient(rgba(251,246,236,0.78), rgba(251,246,236,0.88)), url(${background})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundColor: "#FBF6EC",
      }}
    >
      <div className="relative mx-auto flex w-full max-w-md flex-col items-center px-6 pt-4 text-center">
        {/* Brand */}
        <div className="mb-1">
          <Logo size={160} />
        </div>

        {/* Headline */}
        <h1 className="text-[24px] font-black leading-[1.15] tracking-tight text-[#10162B]">
          {t("guestProfile.title1", { defaultValue: "Crée un compte pour" })}
          <br />
          <span style={{ color: GOLD }}>
            {t("guestProfile.title2", { defaultValue: "débloquer ton profil" })}
          </span>
        </h1>
        <p className="mt-1 max-w-xs text-[13px] leading-snug text-[#10162B]/60">
          {t("guestProfile.subtitle", {
            defaultValue: "Ton portefeuille, tes commandes, tes adresses et tes réglages — tout est à un tap.",
          })}
        </p>

        {/* CTAs — pinned near the top */}
        <div className="mt-3 flex w-full flex-col gap-2">
          <Press
            onClick={go}
            className="!min-h-11 flex h-11 items-center justify-center gap-2 rounded-full text-[15px] font-bold text-white"
            style={{ background: GOLD, boxShadow: "0 10px 24px -8px rgba(232,185,59,0.55)" }}
          >
            <UserPlus size={17} />
            {t("auth.prompt.signUp", { defaultValue: "Créer un compte" })}
          </Press>
          <Press
            onClick={go}
            className="!min-h-11 flex h-11 items-center justify-center gap-2 rounded-full border border-[#10162B]/10 bg-white/80 text-[15px] font-bold text-[#10162B] backdrop-blur"
          >
            <LogIn size={17} />
            {t("auth.prompt.signIn", { defaultValue: "Se connecter" })}
          </Press>
        </div>

        {/* Illustration */}
        <img
          src={illustration}
          alt=""
          width={1024}
          height={1024}
          loading="lazy"
          draggable={false}
          className="-mt-2 -mb-6 h-auto w-[90px] select-none"
        />

        {/* Feature grid */}
        <div className="mt-0 grid w-full grid-cols-4 gap-1">
          <Feature icon={<Wallet size={17} />} label={t("guestProfile.feat.wallet", { defaultValue: "Portefeuille sécurisé" })} />
          <Feature icon={<Package size={17} />} label={t("guestProfile.feat.orders", { defaultValue: "Suivi de tes commandes" })} />
          <Feature icon={<MapPin size={17} />} label={t("guestProfile.feat.addresses", { defaultValue: "Adresses enregistrées" })} />
          <Feature icon={<Settings size={17} />} label={t("guestProfile.feat.settings", { defaultValue: "Réglages personnalisés" })} />
        </div>

        {/* Trust footer */}
        <div className="mt-1 flex items-center gap-3 rounded-2xl bg-white/60 px-4 py-2 text-left backdrop-blur">
          <div
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
            style={{ background: "rgba(232,185,59,0.2)", color: GOLD }}
          >
            <ShieldCheck size={17} />
          </div>
          <div>
            <p className="text-[12.5px] font-bold text-[#10162B]">
              {t("guestProfile.trust.title", { defaultValue: "Tes données sont protégées" })}
            </p>
            <p className="text-[11px] text-[#10162B]/60">
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
    <div className="flex flex-col items-center gap-0.5">
      <div
        className="grid h-9 w-9 place-items-center rounded-full bg-white/80 text-[#10162B]/70 backdrop-blur"
        style={{ boxShadow: "0 2px 8px rgba(16,22,43,0.06)" }}
      >
        {icon}
      </div>
      <p className="text-[10px] font-semibold leading-tight text-[#10162B]/70">{label}</p>
    </div>
  );
}
