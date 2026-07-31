/** Client-side helpers for the publish editor (trim / crop / text). */

export const MAX_PUBLISH_VIDEO_SEC = 60;
export const MAX_STORY_VIDEO_SEC = 15;

export function isVideoFile(f: File) {
  return f.type.startsWith("video/") || /\.(mp4|mov|m4v|webm|3gp|qt)$/i.test(f.name);
}

export function isImageFile(f: File) {
  return (
    f.type.startsWith("image/") ||
    /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(f.name)
  );
}

export function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => {
      const d = Number.isFinite(video.duration) ? video.duration : 0;
      URL.revokeObjectURL(url);
      resolve(d);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("metadata_failed"));
    };
    video.src = url;
  });
}

export type AspectPreset = "free" | "9:16" | "1:1" | "4:5";

export function aspectRatioValue(preset: AspectPreset): number | null {
  if (preset === "free") return null;
  if (preset === "1:1") return 1;
  if (preset === "4:5") return 4 / 5;
  return 9 / 16;
}

/** Normalized crop inside the source image (0–1). */
export type CropRect = { x: number; y: number; w: number; h: number };

/** Text sticker in normalized image coords (0–1), scale relative to width. */
export type TextSticker = {
  text: string;
  x: number;
  y: number;
  scale: number;
  color: string;
};

/**
 * Render image with a free/aspect crop + optional text stickers.
 * Crop is in source-image normalized coordinates.
 */
export async function renderEditedImage(
  file: File,
  opts: {
    crop: CropRect;
    texts?: TextSticker[];
  },
): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const sx = Math.round(clamp01(opts.crop.x) * img.naturalWidth);
    const sy = Math.round(clamp01(opts.crop.y) * img.naturalHeight);
    const sw = Math.max(1, Math.round(clamp01(opts.crop.w) * img.naturalWidth));
    const sh = Math.max(1, Math.round(clamp01(opts.crop.h) * img.naturalHeight));

    const maxEdge = 1440;
    const scale = Math.min(1, maxEdge / Math.max(sw, sh));
    const outW = Math.max(1, Math.round(sw * scale));
    const outH = Math.max(1, Math.round(sh * scale));

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);

    for (const sticker of opts.texts ?? []) {
      const text = sticker.text.trim();
      if (!text) continue;
      const fontSize = Math.max(16, Math.round(outW * 0.08 * sticker.scale));
      ctx.font = `700 ${fontSize}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      // Sticker x/y are relative to full source; map into crop space.
      const nx = (sticker.x - opts.crop.x) / Math.max(0.0001, opts.crop.w);
      const ny = (sticker.y - opts.crop.y) / Math.max(0.0001, opts.crop.h);
      const x = nx * outW;
      const y = ny * outH;
      if (x < -outW || x > outW * 2 || y < -outH || y > outH * 2) continue;
      ctx.lineWidth = Math.max(3, Math.round(fontSize * 0.14));
      ctx.strokeStyle = "rgba(0,0,0,0.7)";
      ctx.strokeText(text, x, y, outW * 0.92);
      ctx.fillStyle = sticker.color || "#FFFFFF";
      ctx.fillText(text, x, y, outW * 0.92);
    }

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.9),
    );
    if (!blob) throw new Error("encode");
    return new File([blob], `edit-${Date.now()}.jpg`, { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image_load"));
    img.src = url;
  });
}

/**
 * Re-encode a window of the source video via MediaRecorder + captureStream.
 * Works on Chromium / Android WebView; may fail on older iOS — caller should fallback.
 */
export async function trimVideoFile(
  file: File,
  startSec: number,
  durationSec: number,
  onProgress?: (p: number) => void,
): Promise<File> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url;
  video.muted = false;
  video.playsInline = true;
  video.preload = "auto";
  await waitForEvent(video, "loadeddata");

  const duration = Math.min(
    durationSec,
    Math.max(0.2, (video.duration || durationSec) - startSec),
  );
  video.currentTime = Math.max(0, startSec);
  await waitForEvent(video, "seeked");

  const capture =
    (
      video as HTMLVideoElement & {
        captureStream?: (fps?: number) => MediaStream;
        mozCaptureStream?: (fps?: number) => MediaStream;
      }
    ).captureStream?.bind(video) ||
    (
      video as HTMLVideoElement & {
        mozCaptureStream?: (fps?: number) => MediaStream;
      }
    ).mozCaptureStream?.bind(video);

  if (!capture) {
    URL.revokeObjectURL(url);
    throw new Error("capture_unsupported");
  }

  const stream = capture(30);
  const mimeCandidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  const mime = mimeCandidates.find(
    (m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m),
  );
  if (typeof MediaRecorder === "undefined") {
    stream.getTracks().forEach((t) => t.stop());
    URL.revokeObjectURL(url);
    throw new Error("recorder_unsupported");
  }

  const chunks: Blob[] = [];
  const recorder = mime
    ? new MediaRecorder(stream, { mimeType: mime })
    : new MediaRecorder(stream);

  const done = new Promise<File>((resolve, reject) => {
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onerror = () => reject(new Error("recorder_error"));
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      URL.revokeObjectURL(url);
      const outMime = recorder.mimeType || mime || "video/webm";
      const blob = new Blob(chunks, { type: outMime });
      if (blob.size < 1) {
        reject(new Error("empty_trim"));
        return;
      }
      const ext = outMime.includes("mp4") ? "mp4" : "webm";
      resolve(new File([blob], `trim-${Date.now()}.${ext}`, { type: outMime }));
    };
  });

  recorder.start(200);
  await video.play();

  const started = performance.now();
  await new Promise<void>((resolve) => {
    const tick = () => {
      const elapsed = (performance.now() - started) / 1000;
      onProgress?.(Math.min(1, elapsed / duration));
      if (elapsed >= duration || video.ended || video.currentTime >= startSec + duration) {
        try {
          video.pause();
        } catch {
          /* ignore */
        }
        if (recorder.state !== "inactive") recorder.stop();
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  return done;
}

function waitForEvent(el: HTMLMediaElement, event: string) {
  return new Promise<void>((resolve, reject) => {
    const ok = () => {
      cleanup();
      resolve();
    };
    const bad = () => {
      cleanup();
      reject(new Error(event));
    };
    const cleanup = () => {
      el.removeEventListener(event, ok);
      el.removeEventListener("error", bad);
    };
    el.addEventListener(event, ok, { once: true });
    el.addEventListener("error", bad, { once: true });
  });
}
