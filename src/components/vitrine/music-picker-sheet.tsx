import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Music2, Pause, Play, Upload, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Press } from "@/components/press";
import { registerOverlay, guardBack } from "@/components/push-screen";
import { EASE_IOS } from "@/lib/motion";
import { haptic } from "@/lib/haptics";
import {
  MUSIC_LIBRARY,
  defaultMusicFor,
  AUDIO_ACCEPT,
  isAudioFile,
  uploadMusicFile,
  MAX_MUSIC_BYTES,
  type VitrineMusic,
} from "@/lib/vitrine-music";

const GOLD = "#E8B93B";

export function MusicPickerSheet({
  open,
  current,
  onClose,
  onPick,
}: {
  open: boolean;
  current: VitrineMusic | null;
  onClose: () => void;
  onPick: (music: VitrineMusic | null) => void;
}) {
  const { t } = useTranslation();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    return registerOverlay(() => {
      if (!guardBack()) return;
      onCloseRef.current();
    }, 97);
  }, [open]);

  const stopPreview = () => {
    const el = audioRef.current;
    if (el) {
      try {
        el.pause();
      } catch {
        /* ignore */
      }
    }
    setPreviewId(null);
  };

  useEffect(() => {
    if (!open) stopPreview();
    return () => stopPreview();
  }, [open]);

  const togglePreview = (id: string, url: string) => {
    haptic.selection();
    if (previewId === id) {
      stopPreview();
      return;
    }
    let el = audioRef.current;
    if (!el) {
      el = new Audio();
      el.loop = true;
      audioRef.current = el;
    }
    el.src = url;
    el.volume = 0.9;
    void el.play().catch(() => undefined);
    setPreviewId(id);
  };

  const onImport = async (list: FileList | null) => {
    const f = list?.item(0);
    if (!f) return;
    if (!isAudioFile(f)) {
      toast.error(t("publish.music.needAudio", { defaultValue: "Choisis un fichier audio." }));
      return;
    }
    if (f.size > MAX_MUSIC_BYTES) {
      toast.error(t("publish.music.tooLarge", { defaultValue: "Audio trop lourd (max 15 Mo)." }));
      return;
    }
    setUploading(true);
    try {
      const res = await uploadMusicFile(f);
      if (!res.ok) {
        // La fiche musique reste ouverte : on informe seulement.
        toast.error(
          res.error === "file_too_large"
            ? t("publish.music.tooLarge", { defaultValue: "Audio trop lourd (max 15 Mo)." })
            : res.error === "bad_mime"
              ? t("publish.music.needAudio", {
                  defaultValue: "Format audio non pris en charge.",
                })
              : res.error === "not_authenticated"
                ? t("publish.music.needAuth", {
                    defaultValue: "Reconnecte-toi pour importer une musique.",
                  })
                : t("publish.music.uploadFail", {
                    defaultValue: "Import audio impossible. Réessaie.",
                  }),
        );
        return;
      }
      stopPreview();
      onPick(
        defaultMusicFor({
          url: res.url,
          title: f.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 60),
          artist: t("publish.music.myPhone", { defaultValue: "Mon téléphone" }),
        }),
      );
      onClose();
    } catch (err) {
      console.error("[music-picker] import crashed", err);
      toast.error(
        t("publish.music.uploadFail", { defaultValue: "Import audio impossible. Réessaie." }),
      );
    } finally {
      setUploading(false);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[97] flex items-end bg-black/60"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="max-h-[78vh] w-full overflow-y-auto rounded-t-3xl bg-[#10162B] pb-[max(1rem,env(safe-area-inset-bottom))] text-white"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.3, ease: EASE_IOS }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between bg-[#10162B] px-4 pb-2 pt-3">
              <p className="text-[15px] font-bold">
                {t("publish.music.title", { defaultValue: "Ajouter une musique" })}
              </p>
              <Press onClick={onClose} className="h-9 w-9 rounded-full bg-white/10">
                <X size={18} />
              </Press>
            </div>

            <div className="px-4 pb-2">
              <Press
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="!min-h-11 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-white/10 text-[13px] font-semibold"
              >
                {uploading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Upload size={16} />
                )}
                {t("publish.music.import", { defaultValue: "Importer depuis mon téléphone" })}
              </Press>
              <input
                ref={fileRef}
                type="file"
                accept={AUDIO_ACCEPT}
                className="hidden"
                onChange={(e) => {
                  const input = e.currentTarget;
                  const files = input.files;
                  void onImport(files).finally(() => {
                    try {
                      input.value = "";
                    } catch {
                      /* ignore */
                    }
                  });
                }}
              />
              <p className="mt-1 text-center text-[11px] text-white/45">
                {t("publish.music.rightsHint", {
                  defaultValue:
                    "Utilise uniquement de la musique dont tu détiens les droits.",
                })}
              </p>
            </div>

            <div className="px-4 pt-1">
              {current?.url && (
                <Press
                  onClick={() => {
                    stopPreview();
                    onPick(null);
                    onClose();
                  }}
                  className="!min-h-10 mb-2 flex h-10 w-full items-center justify-center rounded-full bg-white/5 text-[12px] font-semibold text-white/70"
                >
                  {t("publish.music.remove", { defaultValue: "Retirer la musique" })}
                </Press>
              )}
              <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-white/45">
                {t("publish.music.library", { defaultValue: "Bibliothèque KiDi+" })}
              </p>
              <div className="space-y-2">
                {MUSIC_LIBRARY.map((track) => {
                  const selected = current?.url === track.url;
                  return (
                    <div
                      key={track.id}
                      className="flex items-center gap-3 rounded-2xl px-3 py-2.5"
                      style={{
                        background: selected ? "rgba(232,185,59,0.16)" : "rgba(255,255,255,0.06)",
                        border: `1px solid ${selected ? GOLD : "transparent"}`,
                      }}
                    >
                      <Press
                        onClick={() => togglePreview(track.id, track.url)}
                        className="!min-h-10 h-10 w-10 shrink-0 rounded-full bg-white/10"
                      >
                        {previewId === track.id ? <Pause size={16} /> : <Play size={16} />}
                      </Press>
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => {
                          haptic.selection();
                          stopPreview();
                          onPick(defaultMusicFor(track));
                          onClose();
                        }}
                      >
                        <p className="truncate text-[14px] font-semibold">{track.title}</p>
                        <p className="truncate text-[12px] text-white/55">
                          {track.artist} · {track.mood}
                        </p>
                      </button>
                      <Music2 size={16} className="shrink-0 text-white/35" />
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
