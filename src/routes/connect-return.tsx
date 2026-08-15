import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import {
  fetchConnectStatus,
  startConnectOnboarding,
  type ConnectStatus,
  type ConnectStatusResult,
} from "@/lib/stripe-connect-client";
import { Press } from "@/components/press";
import { toast } from "sonner";

export const Route = createFileRoute("/connect-return")({
  ssr: false,
  component: ConnectReturn,
  head: () => ({
    meta: [
      { title: "Configuration des paiements · KiDi+" },
      {
        name: "description",
        content:
          "Retour de la configuration Stripe pour recevoir tes retraits KiDi+ directement sur ton compte bancaire.",
      },
      { property: "og:title", content: "Configuration des paiements · KiDi+" },
      {
        property: "og:description",
        content: "Vérification de ton compte de paiement vendeur KiDi+.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function ConnectReturn() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [status, setStatus] = useState<ConnectStatus | "loading" | "error">("loading");
  const [snapshot, setSnapshot] = useState<Extract<ConnectStatusResult, { ok: true }> | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    let attempts = 0;
    const apply = (r: ConnectStatusResult) => {
      if (!r.ok) {
        setStatus("error");
        return false;
      }
      setSnapshot(r);
      setStatus(r.status);
      return r.status === "active";
    };
    const tick = async () => {
      const r = await fetchConnectStatus();
      if (!alive) return;
      const done = apply(r);
      attempts += 1;
      if (!done && attempts < 6) {
        window.setTimeout(() => {
          if (alive) void tick();
        }, 1500);
      }
    };
    void tick();
    return () => {
      alive = false;
    };
  }, []);

  const resume = async () => {
    setBusy(true);
    const r = await startConnectOnboarding();
    if (!r.ok) {
      setBusy(false);
      toast.error(
        t("connect.errors.onboard", {
          defaultValue: "Impossible d'ouvrir la configuration Stripe.",
        }),
      );
    }
  };

  const active = status === "active";
  const needsMore =
    !active &&
    ((snapshot?.currentlyDue?.length ?? 0) > 0 || (snapshot?.pastDue?.length ?? 0) > 0);

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-background px-6 text-center text-foreground">
      {status === "loading" ? (
        <>
          <Loader2 className="animate-spin" size={32} />
          <p className="text-sm text-foreground/70">
            {t("connect.checking", { defaultValue: "Vérification de ton compte…" })}
          </p>
        </>
      ) : active ? (
        <>
          <CheckCircle2 size={48} style={{ color: "oklch(0.72 0.2 155)" }} />
          <h1 className="text-lg font-bold">
            {t("connect.readyTitle", { defaultValue: "Compte de paiement prêt ✅" })}
          </h1>
          <p className="text-sm text-foreground/70">
            {t("connect.readyBody", {
              defaultValue: "Tu peux maintenant retirer tes gains directement sur ta banque.",
            })}
          </p>
          <Press
            onClick={() => navigate({ to: "/" })}
            className="mt-2 rounded-2xl px-5 py-3 text-[15px] font-bold"
            style={{ backgroundColor: "#c8a24a", color: "#10162B" }}
          >
            {t("common.back", { defaultValue: "Retour" })}
          </Press>
        </>
      ) : (
        <>
          <AlertTriangle size={44} style={{ color: "oklch(0.72 0.18 70)" }} />
          <h1 className="text-lg font-bold">
            {t("connect.pendingTitle", { defaultValue: "Configuration incomplète" })}
          </h1>
          <p className="text-sm text-foreground/70">
            {needsMore
              ? t("connect.pendingBody", {
                  defaultValue:
                    "Il reste des étapes sur Stripe (identité + banque). Clique ci-dessous pour les terminer.",
                })
              : t("connect.verifyingBody", {
                  defaultValue:
                    "Tes infos sont envoyées. Stripe vérifie encore — ce n'est pas la peine de recommencer le formulaire.",
                })}
          </p>
          {needsMore && (
            <Press
              onClick={busy ? undefined : resume}
              disabled={busy}
              className="mt-2 flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-[15px] font-bold text-white"
              style={{ backgroundColor: "#635BFF" }}
            >
              {busy && <Loader2 size={16} className="animate-spin" />}
              {t("connect.resumeCta", { defaultValue: "Reprendre la configuration" })}
            </Press>
          )}
          <Press
            onClick={() => navigate({ to: "/" })}
            className="rounded-2xl px-5 py-2 text-[14px] font-semibold text-foreground/70"
          >
            {t("common.back", { defaultValue: "Retour" })}
          </Press>
        </>
      )}
    </div>
  );
}
