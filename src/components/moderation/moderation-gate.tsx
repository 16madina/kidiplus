// Moderation gate — full-screen ban block + top banner for suspensions.
// Rendered once inside AppShell, above tab content.

import { useTranslation } from "react-i18next";
import { AlertOctagon, ShieldAlert, Snowflake } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useMyModerationState } from "@/lib/moderation-admin";
import { Press } from "@/components/press";

export function ModerationBanGate({ children }: { children: React.ReactNode }) {
  const { t, i18n } = useTranslation();
  const { user, signOut } = useAuth();
  const { state } = useMyModerationState(user?.id ?? null);

  if (state.status !== "banned") return <>{children}</>;

  const reason = state.active_sanction?.reason ?? "";
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-background px-6 pt-safe text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: "oklch(0.55 0.2 27 / 0.15)" }}>
        <AlertOctagon size={36} style={{ color: "oklch(0.55 0.2 27)" }} />
      </div>
      <h1 className="text-[22px] font-bold">{t("moderation.banned.title")}</h1>
      <p className="max-w-sm text-[14px] leading-relaxed text-muted-foreground">
        {t("moderation.banned.body")}
      </p>
      {reason && (
        <div className="max-w-sm rounded-2xl border border-border p-3 text-left">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("moderation.reason")}
          </p>
          <p className="mt-1 text-[13px]">{reason}</p>
        </div>
      )}
      <p className="text-[12px] text-muted-foreground">
        {t("moderation.banned.support")}
      </p>
      <Press
        onClick={() => void signOut()}
        className="mt-4 rounded-2xl border border-border px-6 py-2.5 text-[13px] font-semibold"
      >
        {t("common.signOut", { defaultValue: i18n.language === "fr" ? "Se déconnecter" : "Sign out" })}
      </Press>
    </div>
  );
}

// Suspension banner (non-blocking) — mount just under the app top area.
export function SuspensionBanner() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { state } = useMyModerationState(user?.id ?? null);

  if (state.status !== "suspended" || !state.active_sanction) return null;
  const s = state.active_sanction;
  const end = s.expires_at ? new Date(s.expires_at).toLocaleString(i18n.language, { dateStyle: "medium", timeStyle: "short" }) : null;
  return (
    <div
      className="mx-3 my-2 flex items-start gap-2 rounded-2xl border p-3 text-[12px]"
      style={{ backgroundColor: "oklch(0.62 0.18 60 / 0.12)", borderColor: "oklch(0.62 0.18 60 / 0.4)" }}
    >
      <ShieldAlert size={16} className="mt-0.5 shrink-0" style={{ color: "oklch(0.55 0.16 60)" }} />
      <div className="min-w-0">
        <p className="font-semibold" style={{ color: "oklch(0.4 0.16 60)" }}>
          {end ? t("moderation.suspendedUntil", { date: end }) : t("moderation.suspendedIndefinite")}
        </p>
        <p className="mt-0.5 text-muted-foreground">{s.reason}</p>
      </div>
    </div>
  );
}

// Frozen-account banner (non-blocking) — displays when an admin has paused
// the account for anti-fraud review. Wallet actions, payouts and gifting
// are blocked server-side; browsing still works.
export function AccountFrozenBanner() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { state } = useMyModerationState(user?.id ?? null);
  if (!state.is_frozen) return null;
  return (
    <div
      className="mx-3 my-2 flex items-start gap-2 rounded-2xl border p-3 text-[12px]"
      style={{ backgroundColor: "oklch(0.6 0.15 240 / 0.12)", borderColor: "oklch(0.6 0.15 240 / 0.4)" }}
    >
      <Snowflake size={16} className="mt-0.5 shrink-0" style={{ color: "oklch(0.45 0.15 240)" }} />
      <div className="min-w-0">
        <p className="font-semibold" style={{ color: "oklch(0.35 0.15 240)" }}>
          {t("moderation.frozen.title", "Compte en vérification")}
        </p>
        <p className="mt-0.5 text-muted-foreground">
          {state.frozen_reason || t("moderation.frozen.body", "Les retraits, achats via portefeuille et cadeaux sont temporairement bloqués. Contacte le support si besoin.")}
        </p>
      </div>
    </div>
  );
}
