// GuestEmptyState — shown inside a tab when the tab needs an account.
// One-shot, no dead rows: heading + short reason + Se connecter / Créer
// un compte buttons that invoke the shared AuthPrompt flow.

import { useTranslation } from "react-i18next";
import { LogIn, UserPlus } from "lucide-react";
import { Press } from "@/components/press";
import { useAuthPrompt } from "@/lib/auth-prompt-context";
import { Logo } from "@/components/brand/logo";

export function GuestEmptyState({
  title,
  subtitle,
  icon,
}: {
  title: string;
  subtitle: string;
  icon?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const { openAuth } = useAuthPrompt();
  return (
    <div
      className="flex h-full flex-col items-center justify-center px-6 pt-safe text-center"
      style={{ paddingBottom: "calc(6rem + env(safe-area-inset-bottom))" }}
    >
      <div className="mb-4 opacity-90">{icon ?? <Logo size={96} />}</div>
      <h2 className="text-[20px] font-black leading-tight">{title}</h2>
      <p className="mt-2 max-w-xs text-[13.5px] text-muted-foreground">{subtitle}</p>
      <div className="mt-6 flex w-full max-w-xs flex-col gap-2">
        <Press
          onClick={openAuth}
          className="!min-h-12 flex h-12 items-center justify-center gap-2 rounded-full bg-accent text-[15px] font-bold text-accent-foreground"
        >
          <UserPlus size={16} />
          {t("auth.prompt.signUp", { defaultValue: "Créer un compte" })}
        </Press>
        <Press
          onClick={openAuth}
          className="!min-h-12 flex h-12 items-center justify-center gap-2 rounded-full border border-border text-[15px] font-bold"
        >
          <LogIn size={16} />
          {t("auth.prompt.signIn", { defaultValue: "Se connecter" })}
        </Press>
      </div>
    </div>
  );
}
