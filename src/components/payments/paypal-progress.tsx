// Progress panel shown while a PayPal payment is in flight.
// PayPal refuses to be displayed inside an iframe, so the approval page opens
// in the top window or a new tab — this panel makes that explicit and tracks
// the flow until the payment is confirmed.

import { Check, ExternalLink, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

export type PaypalStep = "creating" | "handoff" | "waiting";

const ORDER: PaypalStep[] = ["creating", "handoff", "waiting"];

export function PaypalProgress({
  step,
  openedInNewTab,
  approveUrl,
}: {
  step: PaypalStep;
  openedInNewTab?: boolean;
  approveUrl?: string | null;
}) {
  const { t } = useTranslation();
  const index = ORDER.indexOf(step);

  const labels: Record<PaypalStep, { title: string; hint: string }> = {
    creating: {
      title: t("pay.paypal.step1", { defaultValue: "Préparation du paiement sécurisé" }),
      hint: t("pay.paypal.step1Hint", { defaultValue: "Création de la commande PayPal…" }),
    },
    handoff: {
      title: t("pay.paypal.step2", { defaultValue: "Ouverture de PayPal" }),
      hint: openedInNewTab
        ? t("pay.paypal.step2HintTab", {
            defaultValue:
              "PayPal ne peut pas s'afficher dans l'aperçu : la page s'ouvre dans un nouvel onglet.",
          })
        : t("pay.paypal.step2Hint", {
            defaultValue: "Tu es redirigé(e) vers la page sécurisée PayPal.",
          }),
    },
    waiting: {
      title: t("pay.paypal.step3", { defaultValue: "Confirmation du paiement" }),
      hint: t("pay.paypal.step3Hint", {
        defaultValue: "Termine le paiement sur PayPal, puis reviens ici — on confirme tout seul.",
      }),
    },
  };

  return (
    <div className="mt-4 rounded-2xl border border-border bg-muted/40 p-4">
      <ol className="space-y-3">
        {ORDER.map((s, i) => {
          const done = i < index;
          const active = i === index;
          return (
            <li key={s} className="flex items-start gap-3">
              <span
                className={cn(
                  "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                  done && "border-primary bg-primary text-primary-foreground",
                  active && "border-primary text-primary",
                  !done && !active && "border-border text-muted-foreground",
                )}
              >
                {done ? (
                  <Check size={13} />
                ) : active ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  i + 1
                )}
              </span>
              <div className="min-w-0">
                <p
                  className={cn(
                    "text-[13px] font-semibold",
                    active ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {labels[s].title}
                </p>
                {active && (
                  <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
                    {labels[s].hint}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {step === "waiting" && approveUrl && (
        <a
          href={approveUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-[12px] font-semibold text-foreground"
        >
          <ExternalLink size={14} />
          {t("pay.paypal.reopen", { defaultValue: "Rouvrir la page PayPal" })}
        </a>
      )}
    </div>
  );
}
