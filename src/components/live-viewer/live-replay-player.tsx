import { useEffect, useState } from "react";
import { Download, Loader2, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Press } from "@/components/press";
import { haptic } from "@/lib/haptics";
import { downloadLiveReplay } from "@/lib/live-replay-download";
import { deleteLiveReplay } from "@/lib/live-replay-client";

/** Full-screen HTML5 player for a seller's own live replay MP4. */
export function LiveReplayPlayer({
  url,
  title,
  liveId,
  onClose,
  onDeleted,
}: {
  url: string;
  title?: string;
  /** When set, shows a delete control (owner-only flows). */
  liveId?: string;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const { t } = useTranslation();
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const close = () => {
    haptic.light();
    onClose();
  };

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

  const onDelete = async () => {
    if (!liveId || deleting) return;
    const ok = window.confirm(
      t(
        "broadcast.replay.deleteConfirm",
        "Supprimer ce replay définitivement ? Tu ne pourras plus le revoir.",
      ),
    );
    if (!ok) return;
    setDeleting(true);
    haptic.medium();
    const res = await deleteLiveReplay(liveId);
    setDeleting(false);
    if (!res.ok) {
      toast.error(
        t("broadcast.replay.deleteFailed", "Impossible de supprimer — réessaie"),
      );
      return;
    }
    haptic.success();
    toast.success(t("broadcast.replay.deleted", "Replay supprimé"));
    onDeleted?.();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-black/95"
      role="dialog"
      aria-modal="true"
      aria-label={t("broadcast.replay.playerTitle", "Replay du live")}
      onClick={close}
    >
      <div
        className="relative z-[210] flex items-center gap-2 px-3 pb-3"
        style={{ paddingTop: "max(env(safe-area-inset-top), 14px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="min-w-0 flex-1 truncate text-[14px] font-semibold text-white">
          {title?.trim() || t("broadcast.replay.playerTitle", "Replay du live")}
        </p>
        <Press
          onClick={() => void onDownload()}
          disabled={downloading || deleting}
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-white/20 px-3.5 text-[12px] font-bold text-white disabled:opacity-60"
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
        {liveId ? (
          <Press
            onClick={() => void onDelete()}
            disabled={deleting || downloading}
            className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-red-500/90 px-3.5 text-[12px] font-bold text-white disabled:opacity-60"
            aria-label={t("broadcast.replay.delete", "Supprimer")}
          >
            {deleting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Trash2 size={16} />
            )}
            <span>
              {deleting
                ? t("common.loading", "…")
                : t("broadcast.replay.delete", "Supprimer")}
            </span>
          </Press>
        ) : null}
        <Press
          onClick={close}
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white text-black shadow-lg"
          aria-label={t("common.close", "Fermer")}
        >
          <X size={22} strokeWidth={2.5} />
        </Press>
      </div>

      <div
        className="relative z-[205] flex min-h-0 flex-1 items-center justify-center px-3 pb-safe"
        onClick={(e) => e.stopPropagation()}
      >
        <video
          key={url}
          src={url}
          controls
          playsInline
          autoPlay
          controlsList="nodownload"
          className="max-h-full max-w-full rounded-xl bg-black"
          style={{ width: "100%", maxHeight: "100%" }}
        />
      </div>

      <p
        className="relative z-[210] px-4 pb-safe text-center text-[11px] text-white/55"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {t("broadcast.replay.tapOutsideToClose", "Touche hors de la vidéo ou ✕ pour fermer")}
      </p>
    </div>
  );
}
