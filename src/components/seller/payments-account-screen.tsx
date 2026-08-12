// SellerPaymentsAccountScreen — "Devenir vendeur" / Stripe Connect Express.
//
// Shows the three onboarding steps, the live account status
// (Vérification en cours / Compte vendeur actif / Action requise) and, when
// active, a link to the seller's Stripe Express dashboard.

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  BadgeCheck,
  Banknote,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { PushScreen } from "@/components/push-screen";
import { Press } from "@/components/press";
import { CountryFlag } from "@/components/country-flag";
import { haptic } from "@/lib/haptics";
import {
  CONNECT_COUNTRY_LIST,
  DEFAULT_CONNECT_COUNTRY,
} from "@/lib/connect-countries";
import {
  fetchConnectStatus,
  openExpressDashboard,
  startConnectOnboarding,
  type ConnectStatus,
} from "@/lib/stripe-connect-client";

const GOLD = "#c8a24a";
const NAVY_INSET = "rgba(255,255,255,0.04)";

export function SellerPaymentsAccountScreen({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<ConnectStatus>("none");
  const [unavailable, setUnavailable] = useState(false);
  const [eligible, setEligible] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await fetchConnectStatus();
    if (r.ok) {
      setStatus(r.status);
      setEligible(r.eligible);
      setUnavailable(Boolean(r.connectUnavailable));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const onboard = async () => {
    haptic.medium();
    setBusy(true);
    const r = await startConnectOnboarding();
    setBusy(false);
    if (!r.ok) {
      haptic.warning();
      toast.error(
        r.error === "connect_currency_unsupported" || r.error === "connect_country_unsupported"
          ? t("connect.errors.unsupported")
          : r.error === "connect_not_enabled"
            ? t("connect.errors.notEnabled")
            : t("connect.errors.onboard"),
      );
    }
  };

  const dashboard = async () => {
    haptic.light();
    setBusy(true);
    const r = await openExpressDashboard();
    setBusy(false);
    if (!r.ok) toast.error(t("connect.errors.dashboard", { defaultValue: "Lien Stripe indisponible." }));
  };

  const badge =
    status === "active"
      ? {
          icon: <BadgeCheck size={18} />,
          tint: "oklch(0.72 0.2 155)",
          label: t("connect.state.active", { defaultValue: "Compte vendeur actif" }),
          hint: t("connect.activeHint"),
        }
      : status === "restricted"
        ? {
            icon: <TriangleAlert size={18} />,
            tint: "oklch(0.7 0.19 30)",
            label: t("connect.state.restricted", { defaultValue: "Action requise" }),
            hint: t("connect.restrictedHint"),
          }
        : status === "pending"
          ? {
              icon: <Loader2 size={18} />,
              tint: "oklch(0.75 0.16 80)",
              label: t("connect.state.pending", { defaultValue: "Vérification en cours" }),
              hint: t("connect.pendingHint"),
            }
          : {
              icon: <Banknote size={18} />,
              tint: GOLD,
              label: t("connect.state.none", { defaultValue: "Compte de paiement non configuré" }),
              hint: t("connect.setupHint"),
            };

  const steps = [
    t("connect.steps.one", { defaultValue: "Crée ton compte vendeur sécurisé Stripe." }),
    t("connect.steps.two", { defaultValue: "Vérifie ton identité et ajoute ton compte bancaire." }),
    t("connect.steps.three", {
      defaultValue: "Reçois tes ventes automatiquement — KiDi+ garde 10 % de commission.",
    }),
  ];

  return (
    <PushScreen
      open={open}
      onClose={onClose}
      title={t("connect.screenTitle", { defaultValue: "Devenir vendeur" })}
    >
      <div className="space-y-4 px-4 py-4">
        {/* Status card */}
        <div
          className="rounded-2xl p-4"
          style={{ background: NAVY_INSET, border: "1px solid rgba(255,255,255,0.08)" }}
        >
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-white/70">
              <Loader2 className="animate-spin" size={16} />
              {t("connect.checking")}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2" style={{ color: badge.tint }}>
                {badge.icon}
                <span className="text-[15px] font-bold">{badge.label}</span>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-white/70">{badge.hint}</p>
              {unavailable && (
                <p className="mt-2 text-[13px] text-white/60">{t("connect.errors.notEnabled")}</p>
              )}
              {!eligible && (
                <p className="mt-2 text-[13px] text-white/60">{t("connect.errors.unsupported")}</p>
              )}
            </>
          )}
        </div>

        {/* Steps */}
        <div
          className="rounded-2xl p-4"
          style={{ background: NAVY_INSET, border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="mb-3 flex items-center gap-2 text-white/85">
            <ShieldCheck size={16} style={{ color: GOLD }} />
            <span className="text-[13px] font-semibold">
              {t("connect.stepsTitle", { defaultValue: "Comment ça marche" })}
            </span>
          </div>
          <ol className="space-y-2">
            {steps.map((s, i) => (
              <li key={s} className="flex gap-3 text-[13px] text-white/75">
                <span
                  className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold"
                  style={{ background: "rgba(200,162,74,0.18)", color: GOLD }}
                >
                  {i + 1}
                </span>
                {s}
              </li>
            ))}
          </ol>
        </div>

        {/* Actions */}
        {status !== "active" && (
          <Press
            onClick={onboard}
            disabled={busy || loading || unavailable || !eligible}
            className="w-full rounded-2xl py-3.5 text-[15px] font-bold disabled:opacity-50"
            style={{ backgroundColor: GOLD, color: "#10162B" }}
          >
            {status === "none"
              ? t("connect.onboardCta")
              : t("connect.resumeCta", { defaultValue: "Reprendre la configuration" })}
          </Press>
        )}

        {status === "active" && (
          <Press
            onClick={dashboard}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-bold disabled:opacity-50"
            style={{ backgroundColor: GOLD, color: "#10162B" }}
          >
            <ExternalLink size={16} />
            {t("connect.dashboardCta", { defaultValue: "Ouvrir mon tableau de bord Stripe" })}
          </Press>
        )}

        <Press
          onClick={() => void refresh()}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-[14px] font-semibold text-white/80"
          style={{ border: "1px solid rgba(255,255,255,0.12)" }}
        >
          <RefreshCw size={15} />
          {t("connect.refresh", { defaultValue: "Actualiser le statut" })}
        </Press>
      </div>
    </PushScreen>
  );
}
