// GuestActivityScreen — shown in the Activity tab for non-authenticated users.
// Onboarding pitch with soft gold themed background, CTAs pinned at top,
// features and trust footer below.

import { UserPlus, LogIn, Bell, Package, ShieldAlert, Wallet, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Press } from "@/components/press";
import { Logo } from "@/components/brand/logo";
import { useAuthPrompt } from "@/lib/auth-prompt-context";
import { haptic } from "@/lib/haptics";
import background from "@/assets/guest-activity-bg.jpg";

const GOLD = "#E8B93B";

export function GuestActivityScreen() {
  const { t } = useTranslation();
  const { openAuth } = useAuthPrompt();

  const go = () => { haptic.light(); openAuth(); };

  return (
    <div
      className="relative flex h-full flex-col overflow-y-auto pt-safe"
      style={{
        WebkitOverflowScrolling: "touch",
        paddingBottom: "calc(5.5rem + env(safe-area-inset-bottom))",
        backgroundImage: `linear-gradient(rgba(251,246,236,0.78), rgba(251,246,236,0.88)), url(${background})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundColor: "#FBF6EC",
      }}
    >
      <div className="relative mx-auto flex w-full max-w-md flex-col items-center px-6 pt-6 text-center">
        {/* Brand */}
        <div className="mb-3">
          <Logo size={160} />
        </div>

        {/* Headline */}
        <h1 className="text-[24px] font-black leading-[1.15] tracking-tight text-[#10162B]">
          {t("guestActivity.title1", { defaultValue: "Crée un compte pour voir" })}
          <br />
          <span style={{ color: GOLD }}>
            {t("guestActivity.title2", { defaultValue: "toute ton activité" })}
          </span>
        </h1>
        <p className="mt-2.5 max-w-xs text-[13.5px] leading-snug text-[#10162B]/60">
          {t("guestActivity.subtitle", {
            defaultValue: "Notifications, commandes, escrow, litiges — tout est ici une fois connecté.",
          })}
        </p>

        {/* CTAs — pinned near the top */}
        <div className="mt-6 flex w-full flex-col gap-3">
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
            className="!min-h-14 flex h-14 items-center justify-center gap-2 rounded-full border border-[#10162B]/10 bg-white/80 text-[16px] font-bold text-[#10162B] backdrop-blur"
          >
            <LogIn size={18} />
            {t("auth.prompt.signIn", { defaultValue: "Se connecter" })}
          </Press>
        </div>

        {/* Feature grid */}
        <div className="mt-8 grid w-full grid-cols-4 gap-2">
          <Feature icon={<Bell size={20} />} label={t("guestActivity.feat.notifs", { defaultValue: "Notifications en direct" })} />
          <Feature icon={<Package size={20} />} label={t("guestActivity.feat.orders", { defaultValue: "Suivi de commandes" })} />
          <Feature icon={<Wallet size={20} />} label={t("guestActivity.feat.escrow", { defaultValue: "Escrow sécurisé" })} />
          <Feature icon={<ShieldAlert size={20} />} label={t("guestActivity.feat.disputes", { defaultValue: "Gestion des litiges" })} />
        </div>

        {/* Trust footer */}
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white/60 px-4 py-3 text-left backdrop-blur">
          <div
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
            style={{ background: "rgba(232,185,59,0.2)", color: GOLD }}
          >
            <ShieldCheck size={20} />
          </div>
          <div>
            <p className="text-[13px] font-bold text-[#10162B]">
              {t("guestProfile.trust.title", { defaultValue: "Tes données sont protégées" })}
            </p>
            <p className="text-[11.5px] text-[#10162B]/60">
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
        className="grid h-11 w-11 place-items-center rounded-full bg-white/80 text-[#10162B]/70 backdrop-blur"
        style={{ boxShadow: "0 2px 8px rgba(16,22,43,0.06)" }}
      >
        {icon}
      </div>
      <p className="text-[10.5px] font-semibold leading-tight text-[#10162B]/70">{label}</p>
    </div>
  );
}
