// PayPal return route. Reached when the buyer approves (or cancels) the
// PayPal Order created by /api/paypal-topup/create. PayPal appends
// `?token=<ORDER_ID>&PayerID=<PAYER_ID>` on success and
// `?token=<ORDER_ID>&cancelled=1` on our cancel URL. This screen calls the
// capture endpoint, animates the outcome, and closes / navigates home.
//
// On native, kidiplus.com is a Universal Link so PayPal's automatic redirect
// re-opens the app straight into this route.

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  capturePaypalTopup,
  clearPendingPaypalOrder,
  mapPaypalTopupError,
  readPendingPaypalOrder,
} from "@/lib/paypal-topup-client";
import { haptic } from "@/lib/haptics";

export const Route = createFileRoute("/paypal-return")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Retour PayPal — KiDi+" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PaypalReturn,
});

type State =
  | { kind: "loading" }
  | { kind: "success"; amount: number; currency: string }
  | { kind: "cancelled" }
  | { kind: "error"; message: string }
  | { kind: "pending" };

function PaypalReturn() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const orderId = params.get("token") ?? readPendingPaypalOrder();
      const wasCancelled = params.get("cancelled") === "1";

      if (wasCancelled) {
        clearPendingPaypalOrder();
        haptic.warning();
        setState({ kind: "cancelled" });
        setTimeout(() => navigate({ to: "/" }), 1400);
        return;
      }
      if (!orderId) {
        setState({ kind: "error", message: t("wallet.topup.paypalNoOrder", { defaultValue: "Session PayPal introuvable." }) });
        return;
      }

      const r = await capturePaypalTopup(orderId);
      if (cancelled) return;
      if (r.ok) {
        clearPendingPaypalOrder();
        haptic.success();
        if (!r.duplicate) toast.success(t("wallet.topup.success", { defaultValue: "Portefeuille rechargé ✓" }));
        setState({ kind: "success", amount: r.amount, currency: r.currency });
        setTimeout(() => navigate({ to: "/" }), 1400);
      } else {
        haptic.warning();
        setState({ kind: "error", message: mapPaypalTopupError(r.error, r.message) });
      }
    })();
    return () => { cancelled = true; };
  }, [navigate, t]);

  return (
    <div className="grid min-h-[100dvh] place-items-center bg-background px-6 text-center">
      <div className="flex flex-col items-center gap-3">
        {state.kind === "loading" && (
          <>
            <Loader2 className="animate-spin text-primary" size={40} />
            <p className="text-[15px] font-semibold">
              {t("wallet.topup.paypalConfirming", { defaultValue: "Confirmation du paiement PayPal…" })}
            </p>
          </>
        )}
        {state.kind === "success" && (
          <>
            <div className="grid h-16 w-16 place-items-center rounded-full" style={{ backgroundColor: "oklch(0.72 0.2 155)" }}>
              <Check size={36} color="white" strokeWidth={3} />
            </div>
            <p className="text-lg font-bold">{t("wallet.topup.success", { defaultValue: "Portefeuille rechargé ✓" })}</p>
            <p className="text-sm text-muted-foreground">
              +{state.amount.toFixed(2)} {state.currency}
            </p>
          </>
        )}
        {state.kind === "cancelled" && (
          <>
            <div className="grid h-16 w-16 place-items-center rounded-full bg-muted">
              <X size={32} className="text-muted-foreground" />
            </div>
            <p className="text-lg font-bold">
              {t("wallet.topup.paypalCancelled", { defaultValue: "Paiement annulé" })}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("wallet.topup.paypalCancelledHint", { defaultValue: "Aucun montant n'a été prélevé." })}
            </p>
          </>
        )}
        {state.kind === "error" && (
          <>
            <div className="grid h-16 w-16 place-items-center rounded-full bg-destructive/15">
              <X size={32} className="text-destructive" />
            </div>
            <p className="text-lg font-bold">{t("wallet.topup.paypalFailed", { defaultValue: "Paiement PayPal non finalisé" })}</p>
            <p className="max-w-[280px] text-sm text-muted-foreground">{state.message}</p>
            <button
              type="button"
              onClick={() => navigate({ to: "/" })}
              className="mt-3 rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground"
            >
              {t("common.close", { defaultValue: "Fermer" })}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
