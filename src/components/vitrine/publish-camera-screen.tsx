import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Press } from "@/components/press";
import { registerOverlay, guardBack } from "@/components/push-screen";
import { EASE_IOS } from "@/lib/motion";
import { haptic } from "@/lib/haptics";
import { ensureCameraMicAccess } from "@/lib/media-permissions";
import {
  createVitrinePost,
  createVitrineStory,
  isVideoUrl,
  uploadVitrineMediaDetailed,
  uploadVitrinePoster,
} from "@/lib/vitrine-db";
import {
  MAX_PUBLISH_VIDEO_SEC,
  MAX_STORY_VIDEO_SEC,
  isImageFile,
  isVideoFile,
} from "@/lib/publish-media-edit";
import { PublishEditor } from "@/components/vitrine/publish-editor";
import type { VitrineMusic } from "@/lib/vitrine-music";

const GOLD = "#E8B93B";
const MODES = ["story", "photo", "video"] as const;
export type PublishCameraMode = (typeof MODES)[number];

const MAX_VIDEO_MS = MAX_PUBLISH_VIDEO_SEC * 1000;
const MAX_STORY_VIDEO_MS = MAX_STORY_VIDEO_SEC * 1000;

async function captureStill(video: HTMLVideoElement): Promise<File | null> {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return null;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.92),
  );
  if (!blob) return null;
  return new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" });
}

export function PublishCameraScreen({
  open,
  onClose,
  onDone,
  initialMode = "photo",
}: {
  open: boolean;
  onClose: () => void;
  onDone?: () => void;
  initialMode?: PublishCameraMode;
}) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const modeStripRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [mode, setMode] = useState<PublishCameraMode>(initialMode);
  const [facing, setFacing] = useState<"user" | "environment">("environment");
  const [camError, setCamError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordMs, setRecordMs] = useState(0);
  const [phase, setPhase] = useState<"camera" | "review">("camera");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const startCamera = useCallback(async () => {
    setCamError(null);
    stopStream();
    const res = await ensureCameraMicAccess({
      video: { facingMode: facing },
      // Always mic-ready so Story/Vidéo recording has sound without restarting.
      audio: true,
    });
    if (res.status !== "granted") {
      const msg =
        res.status === "denied_by_user"
          ? t("publish.cameraDenied", {
              defaultValue: "Autorise la caméra pour publier.",
            })
          : res.status === "config_missing"
            ? t("publish.cameraConfig", {
                defaultValue: "Caméra indisponible sur cet appareil.",
              })
            : t("publish.cameraUnavailable", {
                defaultValue: "Impossible d’ouvrir la caméra.",
              });
      setCamError(msg);
      return;
    }
    streamRef.current = res.stream;
    if (videoRef.current) {
      videoRef.current.srcObject = res.stream;
      void videoRef.current.play().catch(() => undefined);
    }
  }, [facing, stopStream, t]);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setPhase("camera");
    setFile(null);
    setPreview(null);
    setCaption("");
    setBusy(false);
    setRecording(false);
    setRecordMs(0);
  }, [open, initialMode]);

  useEffect(() => {
    if (!open || phase !== "camera") {
      stopStream();
      return;
    }
    void startCamera();
    return () => stopStream();
  }, [open, phase, facing, startCamera, stopStream]);

  useEffect(() => {
    if (!open) return;
    return registerOverlay(() => {
      if (!guardBack()) return;
      onCloseRef.current();
    }, 95);
  }, [open]);

  // Keep selected mode label centered in the swipe strip.
  useEffect(() => {
    const strip = modeStripRef.current;
    if (!strip || phase !== "camera") return;
    const i = MODES.indexOf(mode);
    const el = strip.children[i] as HTMLElement | undefined;
    if (!el) return;
    const left = el.offsetLeft - strip.clientWidth / 2 + el.clientWidth / 2;
    strip.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }, [mode, phase, open]);

  const revokePreview = () => {
    if (preview) {
      try {
        URL.revokeObjectURL(preview);
      } catch {
        /* ignore */
      }
    }
  };

  const close = () => {
    if (!guardBack()) return;
    if (recording) stopRecording(false);
    revokePreview();
    stopStream();
    setFile(null);
    setPreview(null);
    setPhase("camera");
    onClose();
  };

  const goReview = (f: File) => {
    revokePreview();
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setPhase("review");
    stopStream();
    haptic.medium();
  };

  const acceptForMode = () => {
    if (mode === "video") return "video/*";
    if (mode === "photo") return "image/*";
    return "image/*,video/*";
  };

  const onGallery = (list: FileList | null) => {
    const f = list?.item(0);
    if (!f) return;
    if (mode === "video" && !isVideoFile(f)) {
      toast.error(t("publish.needVideo", { defaultValue: "Choisis une vidéo." }));
      return;
    }
    if (mode === "photo" && !isImageFile(f)) {
      toast.error(t("publish.needPhoto", { defaultValue: "Choisis une photo." }));
      return;
    }
    if (mode === "story" && !isImageFile(f) && !isVideoFile(f)) {
      toast.error(t("vitrine.badMedia", { defaultValue: "Choisis une photo ou une vidéo." }));
      return;
    }
    goReview(f);
  };

  const stopRecording = (commit: boolean) => {
    const rec = recorderRef.current;
    if (recordTimerRef.current != null) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    setRecording(false);
    setRecordMs(0);
    if (!rec) return;
    recorderRef.current = null;
    if (!commit) {
      try {
        if (rec.state !== "inactive") rec.stop();
      } catch {
        /* ignore */
      }
      chunksRef.current = [];
      return;
    }
    rec.onstop = () => {
      const mime = rec.mimeType || "video/webm";
      const blob = new Blob(chunksRef.current, { type: mime });
      chunksRef.current = [];
      if (blob.size < 1) {
        toast.error(t("publish.emptyFile", { defaultValue: "Enregistrement vide." }));
        return;
      }
      const ext = mime.includes("mp4") ? "mp4" : "webm";
      goReview(new File([blob], `video-${Date.now()}.${ext}`, { type: mime }));
    };
    try {
      if (rec.state !== "inactive") rec.stop();
    } catch {
      /* ignore */
    }
  };

  const startRecording = () => {
    const stream = streamRef.current;
    if (!stream) {
      toast.error(
        t("publish.cameraUnavailable", { defaultValue: "Impossible d’ouvrir la caméra." }),
      );
      return;
    }
    const mimeCandidates = [
      "video/mp4",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ];
    const mime = mimeCandidates.find((m) =>
      typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m),
    );
    try {
      const rec = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorderRef.current = rec;
      rec.start(200);
      setRecording(true);
      setRecordMs(0);
      haptic.medium();
      const maxMs = mode === "story" ? MAX_STORY_VIDEO_MS : MAX_VIDEO_MS;
      const started = Date.now();
      recordTimerRef.current = window.setInterval(() => {
        const elapsed = Date.now() - started;
        setRecordMs(elapsed);
        if (elapsed >= maxMs) stopRecording(true);
      }, 100);
    } catch {
      toast.error(
        t("publish.recordFail", { defaultValue: "Enregistrement impossible sur cet appareil." }),
      );
    }
  };

  // Story: hold shutter to record video; short tap = photo.
  const storyHoldRef = useRef<number | null>(null);
  const storyHoldArmedRef = useRef(false);

  const onShutter = async () => {
    if (busy) return;
    if (mode === "video") {
      if (recording) stopRecording(true);
      else startRecording();
      return;
    }
    if (mode === "story") {
      if (recording || storyHoldArmedRef.current) {
        // Hold-to-record path handles stop on pointer up.
        return;
      }
      const v = videoRef.current;
      if (!v) return;
      const still = await captureStill(v);
      if (!still) {
        toast.error(t("publish.captureFail", { defaultValue: "Capture impossible." }));
        return;
      }
      goReview(still);
      return;
    }
    // Photo
    const v = videoRef.current;
    if (!v) return;
    const still = await captureStill(v);
    if (!still) {
      toast.error(t("publish.captureFail", { defaultValue: "Capture impossible." }));
      return;
    }
    goReview(still);
  };

  const onShutterPointerDown = () => {
    if (mode !== "story" || recording || phase !== "camera") return;
    storyHoldArmedRef.current = false;
    storyHoldRef.current = window.setTimeout(() => {
      storyHoldRef.current = null;
      storyHoldArmedRef.current = true;
      startRecording();
    }, 280);
  };
  const onShutterPointerUp = () => {
    if (storyHoldRef.current != null) {
      window.clearTimeout(storyHoldRef.current);
      storyHoldRef.current = null;
    }
    if (mode === "story" && recording) {
      stopRecording(true);
      storyHoldArmedRef.current = false;
    }
  };

  const uploadErrorMessage = (code: string) => {
    switch (code) {
      case "not_authenticated":
        return t("vitrine.authRequired", { defaultValue: "Connecte-toi pour continuer" });
      case "file_too_large":
        return t("publish.fileTooLarge", { defaultValue: "Fichier trop lourd (max 100 Mo)." });
      case "bad_mime":
        return t("publish.badMime", { defaultValue: "Format non supporté. Utilise MP4 ou MOV." });
      case "bucket_missing":
        return t("publish.bucketMissing", {
          defaultValue: "Stockage Vitrine indisponible. Réessaie plus tard.",
        });
      case "forbidden":
        return t("publish.uploadForbidden", {
          defaultValue: "Envoi refusé. Vérifie que tu es bien connecté en vendeur.",
        });
      case "upload_stalled":
      case "upload_timeout":
      case "signed_url_timeout":
        return t("publish.uploadTimeout", {
          defaultValue: "Connexion trop lente : l'envoi n'a pas abouti. Réessaie.",
        });
      case "empty_file":
        return t("publish.emptyFile", { defaultValue: "Fichier vide." });
      default: {
        const base = t("vitrine.uploadFail", { defaultValue: "Échec de l'envoi. Réessaie." });
        return code && code.length < 140 ? `${base} (${code})` : base;
      }
    }
  };

  const publish = async (uploadFile: File, music?: VitrineMusic | null) => {
    if (!uploadFile || busy) return;
    setBusy(true);
    setProgress(0);
    haptic.medium();
    try {
      const isVid = mode === "video" || isVideoFile(uploadFile);
      const [up, posterUrl] = await Promise.all([
        uploadVitrineMediaDetailed(uploadFile, (f) => setProgress(f)),
        isVid ? uploadVitrinePoster(uploadFile) : Promise.resolve(null),
      ]);
      if (!up.ok) {
        toast.error(uploadErrorMessage(up.error));
        return;
      }
      if (mode === "story") {
        const story = await createVitrineStory(up.url, music, posterUrl);
        if (!story) {
          toast.error(t("vitrine.publishFail", { defaultValue: "Impossible de publier." }));
          return;
        }
        toast.success(t("publish.storyPublished", { defaultValue: "Story en ligne · 24 h" }));
      } else {
        const mediaType =
          mode === "video" || isVideoFile(uploadFile) || isVideoUrl(up.url)
            ? "video"
            : "image";
        const post = await createVitrinePost({
          mediaUrls: [up.url],
          mediaType,
          caption: mode === "photo" || mode === "video" ? caption : undefined,
          music,
          posterUrl,
        });
        if (!post) {
          toast.error(t("vitrine.publishFail", { defaultValue: "Impossible de publier." }));
          return;
        }
        toast.success(t("vitrine.published", { defaultValue: "Publication en ligne" }));
      }
      onDone?.();
      revokePreview();
      setFile(null);
      setPreview(null);
      setPhase("camera");
      onClose();
    } catch (e) {
      console.warn("[publish] failed", e);
      toast.error(t("vitrine.publishFail", { defaultValue: "Impossible de publier." }));
    } finally {
      setBusy(false);
    }
  };


  const modeLabel = (m: PublishCameraMode) => {
    if (m === "story") return t("publish.modes.story", { defaultValue: "STORY" });
    if (m === "video") return t("publish.modes.video", { defaultValue: "VIDÉO" });
    return t("publish.modes.photo", { defaultValue: "PHOTO" });
  };

  if (typeof document === "undefined") return null;

  const recordSec = Math.floor(recordMs / 1000);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="publish-camera"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: EASE_IOS }}
          className="fixed inset-0 z-[95] flex flex-col bg-black text-white"
        >
          <input
            ref={galleryRef}
            type="file"
            accept={acceptForMode()}
            className="hidden"
            onChange={(e) => {
              onGallery(e.target.files);
              e.target.value = "";
            }}
          />

          {phase === "camera" ? (
            <>
              <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
                <video
                  ref={videoRef}
                  className="absolute inset-0 h-full w-full object-cover"
                  playsInline
                  muted
                  autoPlay
                />
                {camError && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/85 px-8 text-center">
                    <p className="text-[14px] text-white/80">{camError}</p>
                    <Press
                      onClick={() => galleryRef.current?.click()}
                      className="!min-h-10 h-10 rounded-full px-4 text-[13px] font-bold text-[#10162B]"
                      style={{ background: GOLD }}
                    >
                      {t("publish.fromGallery", { defaultValue: "Choisir dans la galerie" })}
                    </Press>
                  </div>
                )}

                <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
                  <Press
                    onClick={close}
                    className="pointer-events-auto h-11 w-11 rounded-full bg-black/40 text-white"
                  >
                    <X size={22} />
                  </Press>
                  {recording && (
                    <span className="mt-2 rounded-full bg-red-500/90 px-2.5 py-1 text-[12px] font-bold tabular-nums">
                      {String(Math.floor(recordSec / 60)).padStart(2, "0")}:
                      {String(recordSec % 60).padStart(2, "0")}
                    </span>
                  )}
                  <Press
                    onClick={() => {
                      haptic.light();
                      setFacing((f) => (f === "user" ? "environment" : "user"));
                    }}
                    className="pointer-events-auto h-11 w-11 rounded-full bg-black/40 text-white"
                  >
                    <RefreshCw size={20} />
                  </Press>
                </div>
              </div>

              <div
                className="shrink-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3"
                style={{
                  backgroundImage:
                    "linear-gradient(to top, rgba(0,0,0,0.92), rgba(0,0,0,0.55))",
                }}
              >
                <div
                  ref={modeStripRef}
                  className="mb-4 flex snap-x snap-mandatory gap-6 overflow-x-auto px-[28%] pb-1"
                  style={{
                    WebkitOverflowScrolling: "touch",
                    scrollbarWidth: "none",
                  }}
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    const center = el.scrollLeft + el.clientWidth / 2;
                    let best = 0;
                    let bestDist = Infinity;
                    for (let i = 0; i < el.children.length; i++) {
                      const c = el.children[i] as HTMLElement;
                      const mid = c.offsetLeft + c.clientWidth / 2;
                      const d = Math.abs(mid - center);
                      if (d < bestDist) {
                        bestDist = d;
                        best = i;
                      }
                    }
                    const next = MODES[best];
                    if (next && next !== mode && !recording) {
                      setMode(next);
                      haptic.selection();
                    }
                  }}
                >
                  {MODES.map((m) => {
                    const active = m === mode;
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          if (recording) return;
                          haptic.selection();
                          setMode(m);
                        }}
                        className="snap-center shrink-0 text-[13px] font-bold tracking-[0.08em] transition-colors"
                        style={{
                          color: active ? GOLD : "rgba(255,255,255,0.55)",
                          transform: active ? "scale(1.08)" : "scale(1)",
                        }}
                      >
                        {modeLabel(m)}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between px-2">
                  <Press
                    onClick={() => galleryRef.current?.click()}
                    className="h-12 w-12 overflow-hidden rounded-xl border border-white/30 bg-white/10"
                    aria-label={t("publish.fromGallery", { defaultValue: "Galerie" })}
                  >
                    <ImageIcon size={22} />
                  </Press>

                  <button
                    type="button"
                    aria-label={t("publish.capture", { defaultValue: "Capturer" })}
                    onClick={() => void onShutter()}
                    onPointerDown={onShutterPointerDown}
                    onPointerUp={onShutterPointerUp}
                    onPointerLeave={onShutterPointerUp}
                    onPointerCancel={onShutterPointerUp}
                    className="relative grid h-[76px] w-[76px] place-items-center rounded-full"
                    style={{
                      border: `4px solid ${recording ? "#ef4444" : "#fff"}`,
                      background: "transparent",
                    }}
                  >
                    <span
                      className="rounded-full transition-all"
                      style={{
                        width: recording ? 28 : 58,
                        height: recording ? 28 : 58,
                        borderRadius: recording ? 6 : 9999,
                        background: recording
                          ? "#ef4444"
                          : mode === "video"
                            ? "#ef4444"
                            : "#fff",
                      }}
                    />
                  </button>

                  <div className="h-12 w-12" aria-hidden />
                </div>

                <p className="mt-3 text-center text-[11px] text-white/50">
                  {mode === "story"
                    ? t("publish.storyHintCapture", {
                        defaultValue: "Appuie pour une photo · Maintiens pour une vidéo",
                      })
                    : mode === "video"
                      ? t("publish.videoHintCapture", {
                          defaultValue: "Appuie pour démarrer / arrêter l’enregistrement",
                        })
                      : t("publish.photoHintCapture", {
                          defaultValue: "Appuie pour prendre une photo",
                        })}
                </p>
              </div>
            </>
          ) : file && preview ? (
            <PublishEditor
              file={file}
              previewUrl={preview}
              isStory={mode === "story"}
              caption={caption}
              onCaptionChange={setCaption}
              busy={busy}
              progress={progress}
              onBack={() => {
                revokePreview();
                setFile(null);
                setPreview(null);
                setCaption("");
                setPhase("camera");
              }}
              onConfirm={(edited, music) => {
                void publish(edited, music);
              }}
            />
          ) : null}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
