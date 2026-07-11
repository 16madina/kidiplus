// Admin card: replace the pinned "Démo" video AND its cover image shown on
// the home feed.
//
// - Video is uploaded to the private `demo-videos` bucket; a long-lived
//   signed URL is stored in app_config.demo_video_url.
// - Cover is uploaded to the private `demo-covers` bucket; a long-lived
//   signed URL is stored in app_config.demo_cover_url.
// - Every replacement bumps `demo_version`, so clients cache-bust the URLs
//   with `?v=<version>` and pick up the new asset within seconds (on next
//   window focus or app reload) — no redeploy needed.

import { useEffect, useRef, useState } from "react";
import { Loader2, Upload, Video, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { Press } from "@/components/press";
import { haptic } from "@/lib/haptics";
import {
  DEMO_VIDEO_FALLBACK_URL,
  DEMO_COVER_FALLBACK_URL,
  fetchDemoConfig,
  uploadDemoVideo,
  uploadDemoCover,
  withVersion,
} from "@/lib/demo-video-db";

const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MB
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const ACCEPTED_VIDEO = ["video/mp4", "video/webm", "video/quicktime", "video/x-quicktime"];
const ACCEPTED_IMAGE = ["image/jpeg", "image/png", "image/webp"];

export function AdminDemoVideoCard() {
  const [videoUrl, setVideoUrl] = useState<string>(DEMO_VIDEO_FALLBACK_URL);
  const [coverUrl, setCoverUrl] = useState<string>(DEMO_COVER_FALLBACK_URL);
  const [version, setVersion] = useState<string>("0");
  const [loading, setLoading] = useState(true);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const cfg = await fetchDemoConfig();
      setVideoUrl(cfg.videoUrl);
      setCoverUrl(cfg.coverUrl);
      setVersion(cfg.version);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void reload(); }, []);

  const videoIsOverride = videoUrl !== DEMO_VIDEO_FALLBACK_URL;
  const coverIsOverride = coverUrl !== DEMO_COVER_FALLBACK_URL;

  const onPickVideo = () => { haptic.selection(); videoInputRef.current?.click(); };
  const onPickCover = () => { haptic.selection(); coverInputRef.current?.click(); };

  const onVideoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = "";
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("video/") && !ACCEPTED_VIDEO.includes(file.type)) {
      setError("Format vidéo non supporté. Utilise .mp4, .webm ou .mov.");
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      setError(`Vidéo trop volumineuse (${(file.size / 1024 / 1024).toFixed(0)} MB). Max 100 MB.`);
      return;
    }
    setUploadingVideo(true);
    try {
      await uploadDemoVideo(file);
      await reload();
      toast.success("Vidéo démo mise à jour ✅");
      haptic.selection();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload échoué";
      setError(msg);
      toast.error(msg);
    } finally {
      setUploadingVideo(false);
    }
  };

  const onCoverFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = "";
    if (!file) return;
    setError(null);
    if (!ACCEPTED_IMAGE.includes(file.type)) {
      setError("Format image non supporté. Utilise .jpg, .png ou .webp.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError(`Image trop volumineuse (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 10 MB.`);
      return;
    }
    setUploadingCover(true);
    try {
      await uploadDemoCover(file);
      await reload();
      toast.success("Couverture démo mise à jour ✅");
      haptic.selection();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload échoué";
      setError(msg);
      toast.error(msg);
    } finally {
      setUploadingCover(false);
    }
  };

  const previewCoverUrl = withVersion(coverUrl, version);
  const previewVideoUrl = withVersion(videoUrl, version);

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Video size={16} className="text-muted-foreground" />
        <h3 className="text-[14px] font-semibold">Démo (carte épinglée)</h3>
      </div>

      <p className="mb-3 text-[12px] text-muted-foreground">
        Remplace la couverture (image) et la vidéo affichées en première position du feed home.
        Toute nouvelle version est diffusée en quelques secondes — aucun redéploiement requis.
      </p>

      {/* COVER preview + upload */}
      <div className="mb-2 flex items-center gap-2">
        <ImageIcon size={14} className="text-muted-foreground" />
        <span className="text-[12px] font-medium">Image de couverture</span>
      </div>
      <div
        className="relative mb-2 overflow-hidden rounded-xl bg-black"
        style={{ aspectRatio: "3 / 4", maxWidth: 220 }}
      >
        {loading ? (
          <div className="absolute inset-0 grid place-items-center">
            <Loader2 className="animate-spin text-white/60" size={20} />
          </div>
        ) : (
          <img
            key={previewCoverUrl}
            src={previewCoverUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
      </div>
      <div className="mb-2 text-[11px] text-muted-foreground">
        {coverIsOverride ? "Couverture personnalisée active" : "Couverture par défaut (bundlée)"}
      </div>
      <input
        ref={coverInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={onCoverFile}
      />
      <Press
        onClick={onPickCover}
        disabled={uploadingCover}
        className="mb-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-[13px] font-semibold text-background disabled:opacity-60"
      >
        {uploadingCover ? (
          <><Loader2 size={16} className="animate-spin" /> Upload en cours…</>
        ) : (
          <><Upload size={16} /> Remplacer la couverture</>
        )}
      </Press>

      {/* VIDEO preview + upload */}
      <div className="mb-2 flex items-center gap-2">
        <Video size={14} className="text-muted-foreground" />
        <span className="text-[12px] font-medium">Vidéo démo</span>
      </div>
      <div
        className="relative mb-2 overflow-hidden rounded-xl bg-black"
        style={{ aspectRatio: "16 / 9" }}
      >
        {loading ? (
          <div className="absolute inset-0 grid place-items-center">
            <Loader2 className="animate-spin text-white/60" size={20} />
          </div>
        ) : (
          <video
            key={previewVideoUrl}
            src={previewVideoUrl}
            controls
            playsInline
            preload="metadata"
            className="absolute inset-0 h-full w-full object-contain"
          />
        )}
      </div>
      <div className="mb-2 text-[11px] text-muted-foreground">
        {videoIsOverride ? "Vidéo personnalisée active" : "Vidéo par défaut (bundlée)"}
      </div>
      <input
        ref={videoInputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime,video/*"
        className="hidden"
        onChange={onVideoFile}
      />
      <Press
        onClick={onPickVideo}
        disabled={uploadingVideo}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-[13px] font-semibold text-background disabled:opacity-60"
      >
        {uploadingVideo ? (
          <><Loader2 size={16} className="animate-spin" /> Upload en cours…</>
        ) : (
          <><Upload size={16} /> Remplacer la vidéo</>
        )}
      </Press>

      {error && <p className="mt-2 text-[12px] text-destructive">{error}</p>}
      <p className="mt-2 text-[11px] text-muted-foreground">
        Image : .jpg, .png, .webp · Max 10 MB &nbsp;·&nbsp; Vidéo : .mp4, .webm, .mov · Max 100 MB
        <br />
        Version actuelle : <code>{version}</code>
      </p>
    </div>
  );
}
