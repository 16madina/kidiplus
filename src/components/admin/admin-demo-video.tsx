// Admin card: replace the pinned "Démo" video shown on the home feed.
//
// - Reads the current URL from app_config (falls back to bundled asset).
// - Lets an admin upload a new .mp4/.webm/.mov into the private
//   `demo-videos` Storage bucket; a long-lived signed URL is minted and
//   stored back into app_config so every client picks it up.

import { useEffect, useRef, useState } from "react";
import { Loader2, Upload, Video } from "lucide-react";
import { toast } from "sonner";
import { Press } from "@/components/press";
import { haptic } from "@/lib/haptics";
import {
  DEMO_VIDEO_FALLBACK_URL,
  fetchDemoVideoUrl,
  uploadDemoVideo,
} from "@/lib/demo-video-db";

const MAX_BYTES = 100 * 1024 * 1024; // 100 MB
const ACCEPTED = ["video/mp4", "video/webm", "video/quicktime", "video/x-quicktime"];

export function AdminDemoVideoCard() {
  const [url, setUrl] = useState<string>(DEMO_VIDEO_FALLBACK_URL);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const u = await fetchDemoVideoUrl();
      setUrl(u);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void reload(); }, []);

  const isOverride = url !== DEMO_VIDEO_FALLBACK_URL;

  const onPick = () => {
    haptic.selection();
    inputRef.current?.click();
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = "";
    if (!file) return;
    setError(null);

    if (!file.type.startsWith("video/") && !ACCEPTED.includes(file.type)) {
      setError("Format non supporté. Utilise .mp4, .webm ou .mov.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`Fichier trop volumineux (${(file.size / 1024 / 1024).toFixed(0)} MB). Max 100 MB.`);
      return;
    }

    setUploading(true);
    try {
      const { url: newUrl } = await uploadDemoVideo(file);
      setUrl(newUrl);
      toast.success("Vidéo démo mise à jour ✅");
      haptic.selection();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload échoué";
      setError(msg);
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Video size={16} className="text-muted-foreground" />
        <h3 className="text-[14px] font-semibold">Vidéo démo (carte épinglée)</h3>
      </div>

      <p className="mb-3 text-[12px] text-muted-foreground">
        Cette vidéo s'affiche en première position du feed home dans la carte "🎬 DÉMO".
        Uploade un nouveau fichier pour la remplacer instantanément — aucun redéploiement requis.
      </p>

      <div
        className="relative mb-3 overflow-hidden rounded-xl bg-black"
        style={{ aspectRatio: "16 / 9" }}
      >
        {loading ? (
          <div className="absolute inset-0 grid place-items-center">
            <Loader2 className="animate-spin text-white/60" size={20} />
          </div>
        ) : (
          <video
            key={url}
            src={url}
            controls
            playsInline
            preload="metadata"
            className="absolute inset-0 h-full w-full object-contain"
          />
        )}
      </div>

      <div className="mb-3 text-[11px] text-muted-foreground">
        {isOverride ? "Vidéo personnalisée active" : "Vidéo par défaut (bundlée)"}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime,video/*"
        className="hidden"
        onChange={onFile}
      />

      <Press
        onClick={onPick}
        disabled={uploading}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-[13px] font-semibold text-background disabled:opacity-60"
      >
        {uploading ? (
          <><Loader2 size={16} className="animate-spin" /> Upload en cours…</>
        ) : (
          <><Upload size={16} /> Remplacer la vidéo</>
        )}
      </Press>

      {error && (
        <p className="mt-2 text-[12px] text-destructive">{error}</p>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">
        Formats acceptés : .mp4, .webm, .mov · Max 100 MB
      </p>
    </div>
  );
}
