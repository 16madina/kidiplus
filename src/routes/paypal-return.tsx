// PayPal return route. Reached when the buyer approves (or cancels) the
// PayPal Order. PayPal appends `?token=<ORDER_ID>&PayerID=…` on success.
//
// Important: the approve flow opens SFSafariViewController / Chrome Custom
// Tab. That context is a *normal website* (Capacitor.isNativePlatform() ===
// false), so Universal Links often do NOT reopen the app. We therefore:
//   1) On mobile browser → hand off via custom scheme kidiplus://paypal-return
//   2) Inside the Capacitor WebView → capture + open wallet section

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
import { supabase } from "@/integrations/supabase/client";
import { isNative } from "@/lib/native";
import { NATIVE_OAUTH_SCHEME } from "@/lib/social-login-config";
import { dispatchOpenSection, stashSoftSection } from "@/lib/soft-profile-routes";

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
  | { kind: "handoff" }
  | { kind: "loading" }
  | { kind: "success"; amount: number; currency: string }
  | { kind: "cancelled" }
  | { kind: "error"; message: string }
  | { kind: "pending" };

function isMobileBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
}

function nativeDeepLinkFromLocation(): string {
  const qs = typeof window !== "undefined" ? window.location.search || "" : "";
  return `${NATIVE_OAUTH_SCHEME}://paypal-return${qs}`;
}

function PaypalReturn() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const native = isNative();
  const [state, setState] = useState<State>(() =>
    !native && isMobileBrowser() ? { kind: "handoff" } : { kind: "loading" },
  );

  // Mobile Safari / SFSafariViewController / Chrome Custom Tab → bounce into app.
  useEffect(() => {
    if (native || !isMobileBrowser()) return;
    const deep = nativeDeepLinkFromLocation();
    try {
      window.location.href = deep;
    } catch {
      /* ignore */
    }
  }, [native]);

  // Capacitor WebView (or desktop web) → capture payment.
  useEffect(() => {
    if (!native && isMobileBrowser()) return; // handoff page handles mobile browser

    let cancelled = false;
    (async () => {
      if (native) {
        try {
          const { Browser } = await import("@capacitor/browser");
          await Browser.close();
        } catch {
          /* ignore */
        }
      }

      const params = new URLSearchParams(window.location.search);
      const orderId = params.get("token") ?? readPendingPaypalOrder();
      const wasCancelled = params.get("cancelled") === "1";

      if (wasCancelled) {
        clearPendingPaypalOrder();
        haptic.warning();
        setState({ kind: "cancelled" });
        setTimeout(() => finishInApp(false), 1200);
        return;
      }
      if (!orderId) {
        setState({
          kind: "error",
          message: t("wallet.topup.paypalNoOrder", { defaultValue: "Session PayPal introuvable." }),
        });
        return;
      }

      for (let i = 0; i < 8; i++) {
        const { data } = await supabase.auth.getSession();
        if (data.session?.access_token) break;
        await new Promise((r) => setTimeout(r, 150));
        if (cancelled) return;
      }

      const r = await capturePaypalTopup(orderId);
      if (cancelled) return;
      if (r.ok) {
        clearPendingPaypalOrder();
        haptic.success();
        try {
          window.dispatchEvent(
            new CustomEvent("kidi:paypal-topup-done", {
              detail: { ok: true, amount: r.amount, currency: r.currency, duplicate: r.duplicate },
            }),
          );
        } catch {
          /* ignore */
        }
        if (!r.duplicate) {
          toast.success(t("wallet.topup.success", { defaultValue: "Portefeuille rechargé ✓" }));
        }
        setState({ kind: "success", amount: r.amount, currency: r.currency });
        setTimeout(() => finishInApp(true), 1000);
      } else if (r.error === "not_signed_in" || r.error === "unauthorized") {
        haptic.success();
        setState({ kind: "pending" });
        setTimeout(() => finishInApp(true), 2000);
      } else {
        haptic.warning();
        setState({ kind: "error", message: mapPaypalTopupError(r.error, r.message) });
      }
    })();
    return () => {
      cancelled = true;
    };

    function finishInApp(openWallet: boolean) {
      if (openWallet) {
        stashSoftSection("wallet");
        dispatchOpenSection("wallet");
      }
      navigate({ to: "/" });
    }
  }, [native, navigate, t]);

  const openApp = () => {
    try {
      window.location.href = nativeDeepLinkFromLocation();
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="grid min-h-[100dvh] place-items-center bg-background px-6 text-center">
      <div className="flex flex-col items-center gap-3">
        {state.kind === "handoff" && (
          <>
            <Loader2 className="animate-spin text-primary" size={40} />
            <p className="text-[15px] font-semibold">
              {t("wallet.topup.paypalOpenApp", { defaultValue: "Retour dans KiDi+…" })}
            </p>
            <p className="max-w-[280px] text-sm text-muted-foreground">
              {t("wallet.topup.paypalOpenAppHint", {
                defaultValue: "Si l'app ne s'ouvre pas, appuie sur le bouton ci-dessous.",
              })}
            </p>
            <button
              type="button"
              onClick={openApp}
              className="mt-3 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground"
            >
              {t("wallet.topup.paypalOpenAppCta", { defaultValue: "Ouvrir KiDi+" })}
            </button>
          </>
        )}
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
        {state.kind === "pending" && (
          <>
            <div className="grid h-16 w-16 place-items-center rounded-full" style={{ backgroundColor: "oklch(0.72 0.2 155)" }}>
              <Check size={36} color="white" strokeWidth={3} />
            </div>
            <p className="text-lg font-bold">
              {t("wallet.topup.paypalPendingTitle", { defaultValue: "Paiement reçu ✓" })}
            </p>
            <p className="max-w-[280px] text-sm text-muted-foreground">
              {t("wallet.topup.paypalPendingHint", {
                defaultValue: "Ton portefeuille sera crédité dans quelques secondes. Retour à l'app…",
              })}
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
              onClick={() => {
                stashSoftSection("wallet");
                navigate({ to: "/" });
              }}
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
