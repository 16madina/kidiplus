// Shows Restream/OBS RTMP URL + stream key after a multi-platform live starts.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, Radio, X } from "lucide-react";
import { toast } from "sonner";
import { BottomSheet } from "@/components/live-viewer/bottom-sheet";
import { Press } from "@/components/press";
import { haptic } from "@/lib/haptics";
import type { RtmpCreds } from "@/lib/broadcast-context";

const GOLD = "oklch(0.82 0.14 85)";

async function copyText(label: string, value: string) {
  try {
    await navigator.clipboard.writeText(value);
    haptic.light();
    toast.success(label);
  } catch {
    toast.error("Copy failed");
  }
}

export function RtmpCredentialsSheet({
  open,
  onClose,
  creds,
}: {
  open: boolean;
  onClose: () => void;
  creds: RtmpCreds | null;
}) {
  const { t } = useTranslation();
  const [showKey, setShowKey] = useState(false);

  if (!creds) return null;

  return (
    <BottomSheet open={open} onClose={onClose} heightPercent={72}>
      <div className="flex h-full flex-col overflow-y-auto px-5 pb-6">
        <div className="flex items-start justify-between gap-3 pb-3 pt-1">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <Radio size={18} style={{ color: GOLD }} />
              <h2 className="text-[18px] font-bold text-foreground">
                {t("broadcast.rtmp.title", "Multi-plateformes")}
              </h2>
            </div>
            <p className="text-[13px] leading-snug text-muted-foreground">
              {t(
                "broadcast.rtmp.subtitle",
                "Colle ces infos dans Restream (destination Custom RTMP), puis lance le live depuis Restream.",
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
          <li>{t("broadcast.rtmp.step1", "Installe l’app Restream (téléphone ou ordi).")}</li>
          <li>
            {t(
              "broadcast.rtmp.step2",
              "Connecte TikTok, Facebook, YouTube dans Restream.",
            )}
          </li>
          <li>
            {t(
              "broadcast.rtmp.step3",
              "Ajoute une destination Custom RTMP avec l’URL et la clé ci-dessous.",
            )}
          </li>
          <li>
            {t(
              "broadcast.rtmp.step4",
              "Lance le live dans Restream — la vidéo apparaît ici et chez les viewers KiDi+.",
            )}
          </li>
        </ol>

        <label className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t("broadcast.rtmp.serverUrl", "URL RTMP (Server)")}
        </label>
        <div
          className="mt-1.5 mb-3 flex items-center gap-2 rounded-xl border bg-muted px-3 py-2.5"
          style={{ borderColor: "var(--border)" }}
        >
          <code className="min-w-0 flex-1 break-all text-[12px] text-foreground">
            {creds.url}
          </code>
          <Press
            onClick={() =>
              void copyText(
                t("broadcast.rtmp.copiedUrl", "URL copiée"),
                creds.url,
              )
            }
            className="!min-h-9 h-9 w-9 shrink-0 rounded-full p-0"
            aria-label={t("common.copy", "Copier")}
          >
            <Copy size={16} />
          </Press>
        </div>

        <label className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t("broadcast.rtmp.streamKey", "Clé de stream (Stream key)")}
        </label>
        <div
          className="mt-1.5 mb-2 flex items-center gap-2 rounded-xl border bg-muted px-3 py-2.5"
          style={{ borderColor: "var(--border)" }}
        >
          <code className="min-w-0 flex-1 break-all text-[12px] text-foreground">
            {showKey ? creds.streamKey : "••••••••••••••••••••"}
          </code>
          <Press
            onClick={() => setShowKey((v) => !v)}
            className="!min-h-9 shrink-0 rounded-full px-2.5 text-[11px] font-semibold"
          >
            {showKey
              ? t("broadcast.rtmp.hide", "Masquer")
              : t("broadcast.rtmp.show", "Voir")}
          </Press>
          <Press
            onClick={() =>
              void copyText(
                t("broadcast.rtmp.copiedKey", "Clé copiée"),
                creds.streamKey,
              )
            }
            className="!min-h-9 h-9 w-9 shrink-0 rounded-full p-0"
            aria-label={t("common.copy", "Copier")}
          >
            <Copy size={16} />
          </Press>
        </div>

        <p className="mb-4 text-[11px] text-muted-foreground">
          {t(
            "broadcast.rtmp.securityNote",
            "Ne partage pas ta clé de stream. Elle donne le droit de publier sur ce live.",
          )}
        </p>

        <Press
          onClick={onClose}
          className="!min-h-12 mt-auto h-12 w-full rounded-2xl text-[15px] font-bold"
          style={{
            background: `linear-gradient(135deg, ${GOLD}, oklch(0.72 0.16 70))`,
            color: "#0a0a12",
          }}
        >
          <Check size={18} className="mr-1.5" />
          {t("broadcast.rtmp.done", "J’ai configuré Restream")}
        </Press>
      </div>
    </BottomSheet>
  );
}
