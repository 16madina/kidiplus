// PayPal return route. Reached when the buyer approves (or cancels) the
// PayPal Order. PayPal appends `?token=<ORDER_ID>&PayerID=…` on success.
//
// Important: the approve flow opens SFSafariViewController / Chrome Custom
// Tab. That context is a *normal website* (Capacitor.isNativePlatform() ===
// false), so Universal Links often do NOT reopen the app. We therefore:
//   1) On mobile browser → hand off via custom scheme kidiplus://paypal-return
//   2) Inside the Capacitor WebView → capture once + leave this route for good

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
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
import { KIDI_LOGO_URI } from "@/components/brand/brand-logos";

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

const DONE_PREFIX = "kidi:paypal_return_done:";

function isMobileBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
}

function nativeDeepLinkFromLocation(): string {
  const qs = typeof window !== "undefined" ? window.location.search || "" : "";
  return `${NATIVE_OAUTH_SCHEME}://paypal-return${qs}`;
}

function markOrderHandled(orderId: string) {
  try {
    sessionStorage.setItem(`${DONE_PREFIX}${orderId}`, "1");
  } catch {
    /* ignore */
  }
}

function wasOrderHandled(orderId: string): boolean {
  try {
    return sessionStorage.getItem(`${DONE_PREFIX}${orderId}`) === "1";
  } catch {
    return false;
  }
}

function stripReturnQuery() {
  try {
    window.history.replaceState(null, "", "/paypal-return");
  } catch {
    /* ignore */
  }
}

function PaypalReturn() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const native = isNative();
  const ranRef = useRef(false);
  const handoffRef = useRef(false);
  const [state, setState] = useState<State>(() =>
    !native && isMobileBrowser() ? { kind: "handoff" } : { kind: "loading" },
  );

  // Mobile Safari / SFSafariViewController / Chrome Custom Tab → bounce into app (once).
  useEffect(() => {
    if (native || !isMobileBrowser()) return;
    if (handoffRef.current) return;
    handoffRef.current = true;
    const deep = nativeDeepLinkFromLocation();
    try {
      window.location.href = deep;
    } catch {
      /* ignore */
    }
  }, [native]);

  // Capacitor WebView (or desktop web) → capture payment exactly once.
  useEffect(() => {
    if (!native && isMobileBrowser()) return;
    if (ranRef.current) return;
    ranRef.current = true;

    let leaveTimer: ReturnType<typeof setTimeout> | undefined;

    const leaveHome = (openWallet: boolean) => {
      stripReturnQuery();
      if (openWallet) {
        stashSoftSection("wallet");
        dispatchOpenSection("wallet");
      }
      // Hard replace avoids TanStack remounting this route with the same token.
      try {
        window.location.replace("/");
      } catch {
        navigate({ to: "/" });
      }
    };

    void (async () => {
      if (native) {
        try {
          const { Browser } = await import("@capacitor/browser");
          await Browser.close();
        } catch {
          /* ignore */
        }
      }

      const params = new URLSearchParams(window.location.search);
      const orderId = (params.get("token") ?? readPendingPaypalOrder() ?? "").trim();
      const wasCancelled = params.get("cancelled") === "1";

      // Drop token from the URL immediately so remounts / UL re-entry can't loop.
      stripReturnQuery();

      if (wasCancelled) {
        clearPendingPaypalOrder();
        haptic.warning();
        setState({ kind: "cancelled" });
        leaveTimer = setTimeout(() => leaveHome(false), 900);
        return;
      }

      if (!orderId) {
        setState({
          kind: "error",
          message: t("wallet.topup.paypalNoOrder", { defaultValue: "Session PayPal introuvable." }),
        });
        return;
      }

      if (wasOrderHandled(orderId)) {
        clearPendingPaypalOrder();
        leaveHome(true);
        return;
      }

      for (let i = 0; i < 8; i++) {
        const { data } = await supabase.auth.getSession();
        if (data.session?.access_token) break;
        await new Promise((r) => setTimeout(r, 150));
      }

      const r = await capturePaypalTopup(orderId);
      markOrderHandled(orderId);
      clearPendingPaypalOrder();

      if (r.ok) {
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
        leaveTimer = setTimeout(() => leaveHome(true), 900);
        return;
      }

      if (r.error === "not_signed_in" || r.error === "unauthorized") {
        haptic.success();
        setState({ kind: "pending" });
        leaveTimer = setTimeout(() => leaveHome(true), 1600);
        return;
      }

      haptic.warning();
      setState({ kind: "error", message: mapPaypalTopupError(r.error, r.message) });
    })();

    return () => {
      if (leaveTimer) clearTimeout(leaveTimer);
    };
    // Intentionally run once — do not re-run on `t` / navigate identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openApp = () => {
    try {
      window.location.href = nativeDeepLinkFromLocation();
    } catch {
      /* ignore */
    }
  };

  const logoBadge = (
    <img
      src={KIDI_LOGO_URI}
      alt="KiDi+"
      className="h-14 w-auto max-w-[240px] object-contain drop-shadow-sm"
      draggable={false}
    />
  );

  return (
    <div className="grid min-h-[100dvh] place-items-center bg-background px-6 text-center">
      <div className="flex flex-col items-center gap-3">
        {state.kind === "handoff" && (
          <>
            {logoBadge}
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
            {logoBadge}
            <Loader2 className="animate-spin text-primary" size={40} />
            <p className="text-[15px] font-semibold">
              {t("wallet.topup.paypalConfirming", { defaultValue: "Confirmation du paiement PayPal…" })}
            </p>
          </>
        )}
        {state.kind === "success" && (
          <>
            {logoBadge}
            <div
              className="h-1.5 w-28 rounded-full"
              style={{ backgroundColor: "oklch(0.72 0.2 155)", boxShadow: "0 0 16px oklch(0.72 0.2 155 / 0.45)" }}
              aria-hidden
            />
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
            {logoBadge}
            <div
              className="h-1.5 w-28 rounded-full"
              style={{ backgroundColor: "oklch(0.72 0.2 155)", boxShadow: "0 0 16px oklch(0.72 0.2 155 / 0.45)" }}
              aria-hidden
            />
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
            {logoBadge}
            <div className="h-1.5 w-28 rounded-full bg-destructive" aria-hidden />
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
            {logoBadge}
            <div className="h-1.5 w-28 rounded-full bg-destructive" aria-hidden />
            <div className="grid h-16 w-16 place-items-center rounded-full bg-destructive/15">
              <X size={32} className="text-destructive" />
            </div>
            <p className="text-lg font-bold">{t("wallet.topup.paypalFailed", { defaultValue: "Paiement PayPal non finalisé" })}</p>
            <p className="max-w-[280px] text-sm text-muted-foreground">{state.message}</p>
            <button
              type="button"
              onClick={() => {
                stashSoftSection("wallet");
                try {
                  window.location.replace("/");
                } catch {
                  navigate({ to: "/" });
                }
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
