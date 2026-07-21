import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Press } from "@/components/press";
import { BottomSheet } from "@/components/live-viewer/bottom-sheet";
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
  connectFacebook,
  disconnectFacebook,
  fetchFacebookPages,
  fetchFacebookStatus,
  selectFacebookPage,
  type FacebookPageOption,
  type FacebookStatus,
} from "@/lib/facebook-restream";

const GOLD = "oklch(0.82 0.14 85)";
const GOLD_SOFT = "oklch(0.82 0.14 85 / 0.35)";

export function FacebookConnectCard() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<FacebookStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pages, setPages] = useState<FacebookPageOption[]>([]);
  const disclaimer = useSocialConnectDisclaimer();

  const refresh = useCallback(async () => {
    try {
      const s = await fetchFacebookStatus();
      setStatus(s);
      if (s.connected && s.needsPageSelection) {
        setPickerOpen(true);
      }
    } catch {
      setStatus({ connected: false, needsPageSelection: false });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onConnected = (ev: Event) => {
      const detail = (ev as CustomEvent<{ status?: string }>).detail;
      void refresh();
      if (detail?.status === "select_page") {
        setPickerOpen(true);
        toast.message(
          t("broadcast.facebook.pickPageToast", "Choisis ta Page Facebook"),
        );
      } else if (detail?.status !== "error") {
        toast.success(
          t("broadcast.facebook.connectedToast", "Facebook connecté"),
        );
      }
    };
    window.addEventListener("kidi:facebook-connected", onConnected);
    return () => window.removeEventListener("kidi:facebook-connected", onConnected);
  }, [refresh, t]);

  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      const flag = u.searchParams.get("facebook");
      if (!flag) return;
      const missingParam = u.searchParams.get("fb_missing");
      u.searchParams.delete("facebook");
      u.searchParams.delete("fb_page");
      u.searchParams.delete("fb_missing");
      window.history.replaceState({}, "", u.pathname + u.search + u.hash);
      void refresh();
      if (flag === "select_page") {
        setPickerOpen(true);
        toast.message(
          t("broadcast.facebook.pickPageToast", "Choisis ta Page Facebook"),
        );
      } else if (flag === "connected" || flag === "ok") {
        toast.success(
          t("broadcast.facebook.connectedToast", "Facebook connecté"),
        );
      } else if (flag === "missing_chat_perms") {
        const missing = missingParam || "pages_read_user_content";
        toast.error("Permission commentaires Facebook manquante", {
          description: `Sur le token : manque ${missing}. Vérifie Login Configuration Meta (même ID que FACEBOOK_LOGIN_CONFIG_ID), puis Déconnecter → Connecter.`,
          duration: 60_000,
          closeButton: true,
        });
      } else if (flag === "error") {
        toast.error(
          t("broadcast.facebook.connectFailed", "Connexion Facebook échouée"),
        );
      }
    } catch {
      /* ignore */
    }
  }, [refresh, t]);

  useEffect(() => {
    if (!pickerOpen) return;
    let cancelled = false;
    void fetchFacebookPages()
      .then((r) => {
        if (!cancelled) setPages(r.pages);
      })
      .catch(() => {
        if (!cancelled) setPages([]);
      });
    return () => {
      cancelled = true;
    };
  }, [pickerOpen]);

  const runConnect = async () => {
    if (busy) return;
    setBusy(true);
    haptic.selection();
    stashBroadcastOAuthReturn("setup");
    try {
      await connectFacebook(broadcastOAuthReturnPath("facebook"));
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : t("broadcast.facebook.connectFailed", "Connexion Facebook échouée"),
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
      await disconnectFacebook();
      setStatus({ connected: false, needsPageSelection: false });
      toast.success(
        t("broadcast.facebook.disconnectedToast", "Facebook déconnecté"),
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

  const onPickPage = async (pageId: string) => {
    if (busy) return;
    setBusy(true);
    haptic.selection();
    try {
      const selected = await selectFacebookPage(pageId);
      setStatus({
        connected: true,
        needsPageSelection: false,
        pageId: selected.pageId,
        pageName: selected.pageName,
      });
      setPickerOpen(false);
      toast.success(
        t("broadcast.facebook.pageSelected", {
          defaultValue: "Page « {{page}} » sélectionnée",
          page: selected.pageName,
        }),
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
  const ready = connected && !status?.needsPageSelection && !!status?.pageName;
  const chatBlocked =
    ready &&
    Array.isArray(status?.missingChatPermissions) &&
    status.missingChatPermissions.length > 0;

  const onReconnectForChat = async () => {
    if (busy) return;
    setBusy(true);
    haptic.selection();
    try {
      await disconnectFacebook();
      setStatus({ connected: false, needsPageSelection: false });
      stashBroadcastOAuthReturn("setup");
      await connectFacebook(broadcastOAuthReturnPath("facebook"));
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : t("broadcast.facebook.connectFailed", "Connexion Facebook échouée"),
      );
      setBusy(false);
    }
  };

  return (
    <>
      <div
        className="flex w-full flex-col gap-2 rounded-2xl px-4 py-3"
        style={{
          border: `1px solid ${chatBlocked ? "rgba(255,100,100,0.55)" : ready ? GOLD : GOLD_SOFT}`,
          background: ready
            ? chatBlocked
              ? "oklch(0.35 0.08 25 / 0.35)"
              : "oklch(0.82 0.14 85 / 0.12)"
            : "oklch(0.13 0.03 260 / 0.7)",
        }}
      >
        <div className="flex w-full items-center justify-between">
          <div className="min-w-0 pr-3">
            <p className="text-[14px] font-bold text-white">
              {t("broadcast.facebook.connectTitle", "Facebook")}
            </p>
            <p className="truncate text-[11px] text-white/65">
              {ready
                ? t("broadcast.facebook.connectedAs", {
                    defaultValue: "Page · {{page}}",
                    page: status?.pageName || "Facebook",
                  })
                : connected && status?.needsPageSelection
                  ? t(
                      "broadcast.facebook.needPage",
                      "Compte lié — choisis ta Page",
                    )
                  : t(
                      "broadcast.facebook.connectHint",
                      "Connecte une Page pour diffuser aussi sur Facebook",
                    )}
            </p>
            {status?.configIdSuffix ? (
              <p className="mt-0.5 text-[10px] text-white/45">
                Login config …{status.configIdSuffix}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {connected && status?.needsPageSelection && (
              <Press
                disabled={busy}
                onClick={() => setPickerOpen(true)}
                className="!min-h-8 rounded-full px-3 text-[11px] font-bold"
                style={{ background: GOLD, color: "#0a0a12" }}
              >
                {t("broadcast.facebook.choosePage", "Page")}
              </Press>
            )}
            {ready && (
              <Press
                disabled={busy}
                onClick={() => setPickerOpen(true)}
                className="!min-h-8 rounded-full px-2.5 text-[11px] font-bold text-white/90"
                style={{ background: "rgba(255,255,255,0.12)" }}
              >
                {t("broadcast.facebook.changePage", "Changer")}
              </Press>
            )}
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
                  ? t("broadcast.facebook.disconnect", "Déconnecter")
                  : t("broadcast.facebook.connect", "Connecter")}
            </Press>
          </div>
        </div>

        {chatBlocked && (
          <div className="rounded-xl bg-black/35 px-3 py-2">
            <p className="text-[11px] font-semibold leading-snug text-red-200">
              Commentaires FB bloqués : manque{" "}
              {status?.missingChatPermissions?.join(", ")}. Dans Meta, ouvre la
              Login Configuration dont l’ID finit par …{status?.configIdSuffix},
              coche pages_read_user_content, puis reconnecte.
            </p>
            <Press
              disabled={busy}
              onClick={() => void onReconnectForChat()}
              className="!min-h-8 mt-2 rounded-full px-3 text-[11px] font-bold"
              style={{ background: GOLD, color: "#0a0a12" }}
            >
              Reconnecter pour commentaires
            </Press>
          </div>
        )}
      </div>

      <SocialConnectDisclaimerDialog
        open={disclaimer.open}
        provider="facebook"
        onConfirm={disclaimer.confirm}
        onCancel={disclaimer.cancel}
      />

      <BottomSheet open={pickerOpen} onClose={() => setPickerOpen(false)} heightPercent={55}>
        <div className="flex h-full min-h-0 flex-col px-4 pb-6">
          <p className="pb-1 pt-1 text-[16px] font-bold text-white">
            {t("broadcast.facebook.pickPageTitle", "Quelle Page Facebook ?")}
          </p>
          <p className="pb-3 text-[12px] text-white/60">
            {t(
              "broadcast.facebook.pickPageHint",
              "Le live KiDi+ sera diffusé sur cette Page.",
            )}
          </p>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
            {pages.length === 0 ? (
              <p className="text-[13px] text-white/50">
                {t("broadcast.facebook.noPages", "Aucune Page trouvée…")}
              </p>
            ) : (
              pages.map((p) => {
                const active = status?.pageId === p.id;
                return (
                  <Press
                    key={p.id}
                    disabled={busy}
                    onClick={() => void onPickPage(p.id)}
                    className="!min-h-12 flex w-full items-center justify-between rounded-2xl px-4 text-left"
                    style={{
                      border: `1px solid ${active ? GOLD : "rgba(255,255,255,0.12)"}`,
                      background: active
                        ? "oklch(0.82 0.14 85 / 0.15)"
                        : "rgba(255,255,255,0.06)",
                    }}
                  >
                    <span className="truncate text-[14px] font-semibold text-white">
                      {p.name}
                    </span>
                    {active && (
                      <span className="text-[11px] font-bold" style={{ color: GOLD }}>
                        OK
                      </span>
                    )}
                  </Press>
                );
              })
            )}
          </div>
        </div>
      </BottomSheet>
    </>
  );
}
