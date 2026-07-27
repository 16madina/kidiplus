// Host pastes TikTok LIVE Studio RTMP server + stream key to restream KiDi+ UI.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Radio, X } from "lucide-react";
import { BottomSheet } from "@/components/live-viewer/bottom-sheet";
import { Press } from "@/components/press";
import { haptic } from "@/lib/haptics";

const PINK = "#FE2C55";

export function TiktokRtmpSheet({
  open,
  onClose,
  busy,
  onStart,
}: {
  open: boolean;
  onClose: () => void;
  busy?: boolean;
  onStart: (creds: { serverUrl: string; streamKey: string }) => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const [serverUrl, setServerUrl] = useState("");
  const [streamKey, setStreamKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  const canStart = serverUrl.trim().length > 8 && streamKey.trim().length > 4;

  return (
    <BottomSheet open={open} onClose={onClose} heightPercent={78}>
      <div className="flex h-full flex-col overflow-y-auto px-5 pb-6">
        <div className="flex items-start justify-between gap-3 pb-3 pt-1">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <Radio size={18} style={{ color: PINK }} />
              <h2 className="text-[18px] font-bold text-foreground">
                {t("broadcast.tiktok.title", "Diffuser sur TikTok")}
              </h2>
            </div>
            <p className="text-[13px] leading-snug text-muted-foreground">
              {t(
                "broadcast.tiktok.subtitle",
                "Colle le serveur RTMP et la clé depuis TikTok LIVE Studio. Les viewers TikTok verront l’interface KiDi+ (enchères, chat, carte produit).",
              )}
            </p>
          </div>
          <Press
            onClick={onClose}
            className="!min-h-10 !min-w-10 h-10 w-10 shrink-0 rounded-full bg-muted p-0"
            aria-label={t("common.close", "Fermer")}
          >
            <X size={18} />
          </Press>
        </div>

        <ol className="mb-4 list-decimal space-y-1.5 pl-5 text-[13px] text-muted-foreground">
          <li>
            {t(
              "broadcast.tiktok.step1",
              "Sur ordi : ouvre TikTok LIVE Studio (ou Go Live) et crée un live.",
            )}
          </li>
          <li>
            {t(
              "broadcast.tiktok.step2",
              "Choisis « Streaming software » / RTMP et copie Serveur + Clé.",
            )}
          </li>
          <li>
            {t(
              "broadcast.tiktok.step3",
              "Colle-les ici, puis lance. Garde le live TikTok ouvert.",
            )}
          </li>
        </ol>

        <label className="mb-1 text-[12px] font-semibold text-foreground">
          {t("broadcast.tiktok.server", "Serveur RTMP")}
        </label>
        <input
          value={serverUrl}
          onChange={(e) => setServerUrl(e.target.value)}
          placeholder="rtmps://…"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="mb-3 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-[14px] outline-none"
        />

        <div className="mb-1 flex items-center justify-between">
          <label className="text-[12px] font-semibold text-foreground">
            {t("broadcast.tiktok.key", "Clé de stream")}
          </label>
          <button
            type="button"
            className="text-[12px] font-semibold"
            style={{ color: PINK }}
            onClick={() => setShowKey((v) => !v)}
          >
            {showKey
              ? t("common.hide", "Masquer")
              : t("common.show", "Afficher")}
          </button>
        </div>
        <input
          value={streamKey}
          onChange={(e) => setStreamKey(e.target.value)}
          type={showKey ? "text" : "password"}
          placeholder="••••••••"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="mb-4 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-[14px] outline-none"
        />

        <p className="mb-4 text-[12px] leading-snug text-muted-foreground">
          {t(
            "broadcast.tiktok.note",
            "Les commentaires TikTok ne reviennent pas dans KiDi+ (pas d’API officielle). L’enchère se fait via le lien KiDi+.",
          )}
        </p>

        <Press
          disabled={!canStart || busy}
          onClick={() => {
            if (!canStart || busy) return;
            haptic.selection();
            void onStart({
              serverUrl: serverUrl.trim(),
              streamKey: streamKey.trim(),
            });
          }}
          className="!min-h-12 h-12 w-full rounded-full text-[15px] font-bold text-white"
          style={{
            background: canStart && !busy
              ? `linear-gradient(135deg, ${PINK}, #c41e3a)`
              : "rgba(0,0,0,0.25)",
          }}
        >
          {busy
            ? t("broadcast.tiktok.working", "Connexion TikTok…")
            : t("broadcast.tiktok.start", "Lancer sur TikTok")}
        </Press>
      </div>
    </BottomSheet>
  );
}
