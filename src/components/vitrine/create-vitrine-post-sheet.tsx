import { useRef, useState } from "react";
import { ImagePlus, Loader2, Video } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PushScreen } from "@/components/push-screen";
import { Press } from "@/components/press";
import { haptic } from "@/lib/haptics";
import {
  createVitrinePost,
  isVideoUrl,
  uploadVitrineMedia,
  type VitrinePost,
} from "@/lib/vitrine-db";

const GOLD = "#E8B93B";

export function CreateVitrinePostSheet({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (post: VitrinePost) => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setPreview(null);
    setFile(null);
    setCaption("");
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const close = () => {
    reset();
    onClose();
  };

  const onPick = (f: File | null) => {
    if (!f) return;
    if (!f.type.startsWith("image/") && !f.type.startsWith("video/")) {
      toast.error(t("vitrine.badMedia", { defaultValue: "Choisis une photo ou une vidéo." }));
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const publish = async () => {
    if (!file || busy) return;
    setBusy(true);
    haptic.medium();
    try {
      const url = await uploadVitrineMedia(file);
      if (!url) {
        toast.error(t("vitrine.uploadFail", { defaultValue: "Échec de l'envoi. Réessaie." }));
        return;
      }
      const mediaType = file.type.startsWith("video/") || isVideoUrl(url)
        ? "video"
        : "image";
      const post = await createVitrinePost({
        mediaUrls: [url],
        mediaType,
        caption,
      });
      if (!post) {
        toast.error(t("vitrine.publishFail", { defaultValue: "Impossible de publier." }));
        return;
      }
      toast.success(t("vitrine.published", { defaultValue: "Publication en ligne" }));
      onCreated?.(post);
      close();
    } finally {
      setBusy(false);
    }
  };

  return (
    <PushScreen
      open={open}
      onClose={close}
      title={t("vitrine.createTitle", { defaultValue: "Nouveau post" })}
      zIndex={82}
    >
      <div className="flex h-full flex-col px-4 py-3">
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        />

        <Press
          onClick={() => inputRef.current?.click()}
          className="relative flex aspect-[9/14] w-full flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border bg-muted/30"
        >
          {preview ? (
            file?.type.startsWith("video/") ? (
              <video src={preview} className="h-full w-full object-cover" muted playsInline controls />
            ) : (
              <img src={preview} alt="" className="h-full w-full object-cover" />
            )
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <div className="flex gap-3">
                <ImagePlus size={28} />
                <Video size={28} />
              </div>
              <p className="text-[13px] font-medium">
                {t("vitrine.pickMedia", { defaultValue: "Ajouter une photo ou une vidéo" })}
              </p>
            </div>
          )}
        </Press>

        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value.slice(0, 500))}
          rows={3}
          placeholder={t("vitrine.captionPlaceholder", { defaultValue: "Légende…" })}
          className="mt-3 w-full resize-none rounded-2xl border border-border bg-card px-3 py-2.5 text-[14px] outline-none"
        />

        <Press
          onClick={() => void publish()}
          disabled={!file || busy}
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
