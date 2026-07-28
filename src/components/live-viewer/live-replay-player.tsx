import { useEffect, useState } from "react";
import { Download, Loader2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Press } from "@/components/press";
import { haptic } from "@/lib/haptics";
import { downloadLiveReplay } from "@/lib/live-replay-download";

/** Full-screen HTML5 player for a public live replay MP4. */
export function LiveReplayPlayer({
  url,
  title,
  onClose,
}: {
  url: string;
  title?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    haptic.light();
    try {
      const mode = await downloadLiveReplay(url, title);
      if (mode === "shared") {
        toast.success(
          t("broadcast.replay.downloadShared", "Enregistrement prêt à partager"),
        );
      } else if (mode === "downloaded") {
        toast.success(
          t("broadcast.replay.downloadStarted", "Téléchargement lancé"),
        );
      } else {
        toast.message(
          t(
            "broadcast.replay.downloadOpened",
            "Ouvre la vidéo puis enregistre-la sur ton téléphone",
          ),
        );
      }
    } catch {
      toast.error(
        t("broadcast.replay.downloadFailed", "Impossible de télécharger — réessaie"),
      );
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col bg-black"
      role="dialog"
      aria-modal="true"
      aria-label={t("broadcast.replay.playerTitle", "Replay du live")}
    >
      <div
        className="flex items-center justify-between gap-3 px-4 pb-2 pt-safe"
        style={{ paddingTop: "max(env(safe-area-inset-top), 12px)" }}
      >
        <p className="min-w-0 flex-1 truncate text-[14px] font-semibold text-white">
          {title?.trim() || t("broadcast.replay.playerTitle", "Replay du live")}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Press
            onClick={() => void onDownload()}
            disabled={downloading}
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white/15 px-3 text-[12px] font-bold text-white disabled:opacity-60"
            aria-label={t("broadcast.replay.download", "Télécharger")}
          >
            {downloading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Download size={16} />
            )}
            <span>
              {downloading
                ? t("common.loading", "…")
                : t("broadcast.replay.download", "Télécharger")}
            </span>
          </Press>
          <Press
            onClick={() => {
              haptic.light();
              onClose();
            }}
            className="grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white"
            aria-label={t("common.close", "Fermer")}
          >
            <X size={18} />
          </Press>
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-safe">
        <video
          key={url}
          src={url}
          controls
          playsInline
          autoPlay
          className="max-h-full max-w-full rounded-lg bg-black"
          style={{ width: "100%", maxHeight: "100%" }}
        />
      </div>
    </div>
  );
}
