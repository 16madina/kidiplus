import { useEffect } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Press } from "@/components/press";
import { haptic } from "@/lib/haptics";

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
        <Press
          onClick={() => {
            haptic.light();
            onClose();
          }}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/15 text-white"
          aria-label={t("common.close", "Fermer")}
        >
          <X size={18} />
        </Press>
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
