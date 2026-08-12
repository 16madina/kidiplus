import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { fetchConnectStatus, type ConnectStatus } from "@/lib/stripe-connect-client";
import { Press } from "@/components/press";

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

  useEffect(() => {
    let alive = true;
    void (async () => {
      const r = await fetchConnectStatus();
      if (!alive) return;
      setStatus(r.ok ? r.status : "error");
    })();
    return () => {
      alive = false;
    };
  }, []);

  const active = status === "active";
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      {status === "loading" ? (
        <>
          <Loader2 className="animate-spin" size={32} />
          <p className="text-sm text-muted-foreground">
            {t("connect.checking", { defaultValue: "Vérification de ton compte…" })}
          </p>
        </>
      ) : active ? (
        <>
          <CheckCircle2 size={48} style={{ color: "oklch(0.72 0.2 155)" }} />
          <h1 className="text-lg font-bold">
            {t("connect.readyTitle", { defaultValue: "Compte de paiement prêt ✅" })}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("connect.readyBody", {
              defaultValue: "Tu peux maintenant retirer tes gains directement sur ta banque.",
            })}
          </p>
        </>
      ) : (
        <>
          <AlertTriangle size={44} style={{ color: "oklch(0.72 0.18 70)" }} />
          <h1 className="text-lg font-bold">
            {t("connect.pendingTitle", { defaultValue: "Configuration incomplète" })}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("connect.pendingBody", {
              defaultValue:
                "Stripe vérifie encore tes informations. Reviens dans quelques minutes ou complète les étapes manquantes.",
            })}
          </p>
        </>
      )}
      <Press
        onClick={() => navigate({ to: "/" })}
        className="mt-2 rounded-2xl px-5 py-3 text-[15px] font-bold"
        style={{ backgroundColor: "#c8a24a", color: "#10162B" }}
      >
        {t("common.back", { defaultValue: "Retour" })}
      </Press>
    </div>
  );
}
