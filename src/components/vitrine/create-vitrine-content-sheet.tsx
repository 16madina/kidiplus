import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Video, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PushScreen } from "@/components/push-screen";
import { Press } from "@/components/press";
import { haptic } from "@/lib/haptics";
import type { PublishKind } from "@/lib/publish";
import {
  createVitrinePost,
  createVitrineStory,
  isVideoUrl,
  uploadVitrineMediaDetailed,
} from "@/lib/vitrine-db";

const GOLD = "#E8B93B";

type MediaKind = Exclude<PublishKind, "announce">;

function titleKey(kind: MediaKind): string {
  switch (kind) {
    case "story":
      return "publish.compose.story";
    case "video":
      return "publish.compose.video";
    case "photo":
      return "publish.compose.photo";
    case "carousel":
      return "publish.compose.carousel";
  }
}

function acceptFor(kind: MediaKind): string {
  if (kind === "video") return "video/*";
  if (kind === "story") return "image/*,video/*";
  return "image/*";
}

export function CreateVitrineContentSheet({
  open,
  kind,
  onClose,
  onDone,
}: {
  open: boolean;
  kind: MediaKind;
  onClose: () => void;
  onDone?: () => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFiles([]);
    setPreviews([]);
    setCaption("");
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }, [open, kind]);

  const close = () => {
    previews.forEach((u) => {
      try {
        URL.revokeObjectURL(u);
      } catch {
        /* ignore */
      }
    });
    setFiles([]);
    setPreviews([]);
    setCaption("");
    setBusy(false);
    onClose();
  };

  const onPick = (list: FileList | null) => {
    if (!list?.length) return;
    const next: File[] = [];
    for (let i = 0; i < list.length; i++) {
      const f = list.item(i);
      if (!f) continue;
      if (kind === "video" && !f.type.startsWith("video/")) {
        toast.error(t("publish.needVideo", { defaultValue: "Choisis une vidéo." }));
        return;
      }
      if ((kind === "photo" || kind === "carousel") && !f.type.startsWith("image/")) {
        toast.error(t("publish.needPhoto", { defaultValue: "Choisis une photo." }));
        return;
      }
      if (kind === "story" && !f.type.startsWith("image/") && !f.type.startsWith("video/")) {
        toast.error(t("vitrine.badMedia", { defaultValue: "Choisis une photo ou une vidéo." }));
        return;
      }
      next.push(f);
      if (kind !== "carousel") break;
      if (next.length >= 10) break;
    }
    if (!next.length) return;
    const merged = kind === "carousel" ? [...files, ...next].slice(0, 10) : next;
    setFiles(merged);
    setPreviews(merged.map((f) => URL.createObjectURL(f)));
  };

  const removeAt = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
    setPreviews((prev) => {
      const u = prev[idx];
      if (u) {
        try {
          URL.revokeObjectURL(u);
        } catch {
          /* ignore */
        }
      }
      return prev.filter((_, i) => i !== idx);
    });
  };

  const uploadErrorMessage = (code: string) => {
    switch (code) {
      case "not_authenticated":
        return t("vitrine.authRequired", { defaultValue: "Connecte-toi pour continuer" });
      case "file_too_large":
        return t("publish.fileTooLarge", {
          defaultValue: "Fichier trop lourd (max 100 Mo).",
        });
      case "bad_mime":
        return t("publish.badMime", {
          defaultValue: "Format non supporté. Utilise MP4 ou MOV.",
        });
      case "bucket_missing":
        return t("publish.bucketMissing", {
          defaultValue: "Stockage Vitrine indisponible. Réessaie plus tard.",
        });
      case "forbidden":
        return t("publish.uploadForbidden", {
          defaultValue: "Envoi refusé. Vérifie que tu es bien connecté en vendeur.",
        });
      case "empty_file":
        return t("publish.emptyFile", { defaultValue: "Fichier vide. Choisis une autre vidéo." });
      default: {
        const base = t("vitrine.uploadFail", { defaultValue: "Échec de l'envoi. Réessaie." });
        if (code && code.length > 2 && code.length < 140) return `${base} (${code})`;
        return base;
      }
    }
  };

  const publish = async () => {
    if (!files.length || busy) return;
    setBusy(true);
    haptic.medium();
    try {
      const urls: string[] = [];
      for (const f of files) {
        const up = await uploadVitrineMediaDetailed(f);
        if (!up.ok) {
          toast.error(uploadErrorMessage(up.error));
          return;
        }
        urls.push(up.url);
      }

      if (kind === "story") {
        const story = await createVitrineStory(urls[0]!);
        if (!story) {
          toast.error(t("vitrine.publishFail", { defaultValue: "Impossible de publier." }));
          return;
        }
        toast.success(
          t("publish.storyPublished", { defaultValue: "Story en ligne · 24 h" }),
        );
        onDone?.();
        close();
        return;
      }

      const mediaType =
        kind === "carousel"
          ? "carousel"
          : kind === "video" || files[0]?.type.startsWith("video/") || isVideoUrl(urls[0] ?? "")
            ? "video"
            : "image";

      const post = await createVitrinePost({
        mediaUrls: urls,
        mediaType,
        caption,
      });
      if (!post) {
        toast.error(t("vitrine.publishFail", { defaultValue: "Impossible de publier." }));
        return;
      }
      toast.success(t("vitrine.published", { defaultValue: "Publication en ligne" }));
      onDone?.();
      close();
    } finally {
      setBusy(false);
    }
  };

  const multi = kind === "carousel";
  const canPublish = files.length > 0 && (kind !== "carousel" || files.length >= 2);

  return (
    <PushScreen
      open={open}
      onClose={close}
      title={t(titleKey(kind), {
        defaultValue:
          kind === "story"
            ? "Nouvelle story"
            : kind === "video"
              ? "Nouvelle vidéo"
              : kind === "carousel"
                ? "Carrousel"
                : "Nouvelle photo",
      })}
      zIndex={86}
    >
      <div className="flex h-full flex-col px-4 py-3">
        <input
          ref={inputRef}
          type="file"
          accept={acceptFor(kind)}
          multiple={multi}
          className="hidden"
          onChange={(e) => {
            onPick(e.target.files);
            e.target.value = "";
          }}
        />

        {multi && previews.length > 0 ? (
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ WebkitOverflowScrolling: "touch" }}>
            {previews.map((src, i) => (
              <div key={src} className="relative h-36 w-28 shrink-0 overflow-hidden rounded-xl bg-muted">
                <img src={src} alt="" className="h-full w-full object-cover" />
                <Press
                  onClick={() => removeAt(i)}
                  className="absolute right-1 top-1 !min-h-7 !min-w-7 h-7 w-7 rounded-full bg-black/55 text-white"
                >
                  <X size={14} />
                </Press>
              </div>
            ))}
            {files.length < 10 && (
              <Press
                onClick={() => inputRef.current?.click()}
                className="flex h-36 w-28 shrink-0 flex-col items-center justify-center rounded-xl border border-dashed border-border text-muted-foreground"
              >
                <ImagePlus size={22} />
                <span className="mt-1 text-[11px] font-medium">
                  {t("publish.addPhoto", { defaultValue: "Ajouter" })}
                </span>
              </Press>
            )}
          </div>
        ) : (
          <Press
            onClick={() => inputRef.current?.click()}
            className="relative flex aspect-[9/14] w-full flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border bg-muted/30"
          >
            {previews[0] ? (
              files[0]?.type.startsWith("video/") ? (
                <video
                  src={previews[0]}
                  className="h-full w-full object-cover"
                  muted
                  playsInline
                  controls
                />
              ) : (
                <img src={previews[0]} alt="" className="h-full w-full object-cover" />
              )
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <div className="flex gap-3">
                  {kind === "video" ? <Video size={28} /> : <ImagePlus size={28} />}
                  {kind === "story" ? <Video size={28} /> : null}
                </div>
                <p className="px-4 text-center text-[13px] font-medium">
                  {kind === "video"
                    ? t("publish.pickVideo", { defaultValue: "Ajouter une vidéo" })
                    : kind === "story"
                      ? t("vitrine.pickMedia", { defaultValue: "Ajouter une photo ou une vidéo" })
                      : t("publish.pickPhoto", { defaultValue: "Ajouter une photo" })}
                </p>
                {kind === "story" && (
                  <p className="text-[11px] text-muted-foreground">
                    {t("publish.storyHint", { defaultValue: "Visible 24 heures" })}
                  </p>
                )}
              </div>
            )}
          </Press>
        )}

        {kind === "carousel" && files.length === 1 && (
          <p className="mt-2 text-center text-[12px] text-muted-foreground">
            {t("publish.carouselMin", { defaultValue: "Ajoute au moins 2 photos" })}
          </p>
        )}

        {kind !== "story" && (
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value.slice(0, 500))}
            rows={3}
            placeholder={t("vitrine.captionPlaceholder", { defaultValue: "Légende…" })}
            className="mt-3 w-full resize-none rounded-2xl border border-border bg-card px-3 py-2.5 text-[14px] outline-none"
          />
        )}

        <Press
          onClick={() => void publish()}
          disabled={!canPublish || busy}
          className="mt-4 !min-h-11 flex h-11 items-center justify-center gap-2 rounded-full text-[15px] font-bold text-[#10162B] disabled:opacity-40"
          style={{ background: GOLD }}
        >
          {busy ? <Loader2 size={18} className="animate-spin" /> : null}
          {t("vitrine.publish", { defaultValue: "Publier" })}
        </Press>
      </div>
    </PushScreen>
  );
}
