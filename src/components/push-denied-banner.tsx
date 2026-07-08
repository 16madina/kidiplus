// Small banner shown when push permission was denied by the user/OS.
// Gives them a clear next step (open OS settings on native, or dismiss on web).
import { useState } from "react";
import { BellOff, X } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { usePush } from "@/lib/push";
import { Press } from "@/components/press";

const DISMISS_KEY = "push:denied_banner_dismissed";

export function PushDeniedBanner() {
  const { status } = usePush();
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
  });

  if (status !== "denied" || dismissed) return null;

  const isNative = (() => { try { return Capacitor.isNativePlatform(); } catch { return false; } })();

  const openSettings = async () => {
    if (!isNative) return;
    try {
      // Best-effort deep-link to OS notification settings.
      // @capacitor/app is optional; fall back silently if not installed.
      const mod = await import("@capacitor/app").catch(() => null as unknown as { App?: { openUrl?: (o: { url: string }) => Promise<unknown> } });
      const App = (mod as { App?: { openUrl?: (o: { url: string }) => Promise<unknown> } })?.App;
      if (App?.openUrl) {
        await App.openUrl({ url: "app-settings:" });
      }
    } catch { /* ignore */ }
  };

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch {}
    setDismissed(true);
  };

  return (
    <div
      role="status"
      className="mx-3 mt-2 flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-[13px]"
    >
      <BellOff size={18} className="mt-0.5 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-destructive">Notifications désactivées</div>
        <div className="mt-0.5 text-muted-foreground">
          {isNative
            ? "Active-les dans Réglages système > Notifications > KiDi+ pour ne rater aucun live."
            : "Autorise les notifications dans les paramètres de ton navigateur."}
        </div>
        {isNative && (
          <Press
            onClick={openSettings}
            className="mt-2 inline-flex !min-h-8 items-center rounded-full bg-destructive px-3 py-1.5 text-[12px] font-semibold text-destructive-foreground"
          >
            Ouvrir les réglages
          </Press>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Fermer"
        className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-muted/40"
      >
        <X size={16} />
      </button>
    </div>
  );
}
