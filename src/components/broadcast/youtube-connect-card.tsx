import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Press } from "@/components/press";
import {
  SocialConnectDisclaimerDialog,
  useSocialConnectDisclaimer,
} from "@/components/broadcast/social-connect-disclaimer";
import { haptic } from "@/lib/haptics";
import {
  broadcastOAuthReturnPath,
  stashBroadcastOAuthReturn,
} from "@/lib/broadcast-oauth-return";
import {
  connectYoutube,
  disconnectYoutube,
  fetchYoutubeStatus,
  type YoutubeStatus,
} from "@/lib/youtube-restream";

const GOLD = "oklch(0.82 0.14 85)";
const GOLD_SOFT = "oklch(0.82 0.14 85 / 0.35)";

export function YoutubeConnectCard() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<YoutubeStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const disclaimer = useSocialConnectDisclaimer();

  const refresh = useCallback(async () => {
    try {
      const s = await fetchYoutubeStatus();
      setStatus(s);
    } catch {
      setStatus({ connected: false });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onConnected = () => {
      void refresh();
      toast.success(
        t("broadcast.youtube.connectedToast", "YouTube connecté"),
      );
    };
    window.addEventListener("kidi:youtube-connected", onConnected);
    return () => window.removeEventListener("kidi:youtube-connected", onConnected);
  }, [refresh, t]);

  // Web return: ?youtube=connected
  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      const flag = u.searchParams.get("youtube");
      if (flag === "connected") {
        u.searchParams.delete("youtube");
        window.history.replaceState({}, "", u.pathname + u.search + u.hash);
        void refresh();
        toast.success(
          t("broadcast.youtube.connectedToast", "YouTube connecté"),
        );
      } else if (flag === "error") {
        u.searchParams.delete("youtube");
        window.history.replaceState({}, "", u.pathname + u.search + u.hash);
        toast.error(
          t("broadcast.youtube.connectFailed", "Connexion YouTube échouée"),
        );
      }
    } catch {
      /* ignore */
    }
  }, [refresh, t]);

  const runConnect = async () => {
    if (busy) return;
    setBusy(true);
    haptic.selection();
    stashBroadcastOAuthReturn("setup");
    try {
      await connectYoutube(broadcastOAuthReturnPath("youtube"));
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : t("broadcast.youtube.connectFailed", "Connexion YouTube échouée"),
      );
    } finally {
      setBusy(false);
    }
  };

  const onConnect = () => {
    if (busy) return;
    disclaimer.requestConnect(() => {
      void runConnect();
    });
  };

  const onDisconnect = async () => {
    if (busy) return;
    setBusy(true);
    haptic.selection();
    try {
      await disconnectYoutube();
      setStatus({ connected: false });
      toast.success(
        t("broadcast.youtube.disconnectedToast", "YouTube déconnecté"),
      );
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : t("common.error", "Une erreur est survenue"),
      );
    } finally {
      setBusy(false);
    }
  };

  const connected = !!status?.connected;

  return (
    <>
    <div
      className="flex w-full items-center justify-between rounded-2xl px-4 py-3"
      style={{
        border: `1px solid ${connected ? GOLD : GOLD_SOFT}`,
        background: connected
          ? "oklch(0.82 0.14 85 / 0.12)"
          : "oklch(0.13 0.03 260 / 0.7)",
      }}
    >
      <div className="min-w-0 pr-3">
        <p className="text-[14px] font-bold text-white">
          {t("broadcast.youtube.connectTitle", "YouTube")}
        </p>
        <p className="truncate text-[11px] text-white/65">
          {connected
            ? t("broadcast.youtube.connectedAs", {
                defaultValue: "Connecté · {{channel}}",
                channel: status?.channelTitle || "YouTube",
              })
            : t(
                "broadcast.youtube.connectHint",
                "Connecte ton compte pour diffuser aussi sur YouTube",
              )}
        </p>
      </div>
      <Press
        disabled={busy || status === null}
        onClick={() => {
          if (connected) void onDisconnect();
          else onConnect();
        }}
        className="!min-h-8 shrink-0 rounded-full px-3 text-[11px] font-bold"
        style={{
          background: connected ? "rgba(255,255,255,0.12)" : GOLD,
          color: connected ? "white" : "#0a0a12",
          opacity: busy || status === null ? 0.6 : 1,
        }}
      >
        {busy
          ? "…"
          : connected
            ? t("broadcast.youtube.disconnect", "Déconnecter")
            : t("broadcast.youtube.connect", "Connecter")}
      </Press>
    </div>
    <SocialConnectDisclaimerDialog
      open={disclaimer.open}
      provider="youtube"
      onConfirm={disclaimer.confirm}
      onCancel={disclaimer.cancel}
    />
    </>
  );
}
