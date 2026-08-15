/**
 * Optimisation des médias avant upload (Vitrine).
 * - Recadrage "cover" au format 9:16 (1080x1920 max)
 * - Compression JPEG/WebP pour alléger le poids
 * - Vidéo : re-encodage best-effort quand le navigateur le supporte
 */

export const TARGET_W = 1080;
export const TARGET_H = 1920;
const IMAGE_QUALITY = 0.82;
/** Au-delà, on tente un re-encodage vidéo (best-effort). */
const VIDEO_TRANSCODE_MIN_BYTES = 12 * 1024 * 1024;

export function isVideoFileLike(f: File) {
  return f.type.startsWith("video/") || /\.(mp4|mov|m4v|webm|3gp|qt)$/i.test(f.name);
}

export function isImageFileLike(f: File) {
  return f.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(f.name);
}

function pickImageMime(): { mime: string; ext: string } {
  try {
    const c = document.createElement("canvas");
    if (c.toDataURL("image/webp").startsWith("data:image/webp")) {
      return { mime: "image/webp", ext: "webp" };
    }
  } catch {
    /* ignore */
  }
  return { mime: "image/jpeg", ext: "jpg" };
}

function drawCover(
  source: CanvasImageSource,
  sw: number,
  sh: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = TARGET_W;
  canvas.height = TARGET_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, TARGET_W, TARGET_H);
  const scale = Math.max(TARGET_W / sw, TARGET_H / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, (TARGET_W - dw) / 2, (TARGET_H - dh) / 2, dw, dh);
  return canvas;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image_decode_failed"));
    };
    img.src = url;
  });
}

/** Recadre une photo en 9:16 (cover) et la compresse. Renvoie le fichier d'origine en cas d'échec. */
export async function optimizeImageFor916(file: File): Promise<File> {
  try {
    const img = await loadImage(file);
    const canvas = drawCover(img, img.naturalWidth, img.naturalHeight);
    const { mime, ext } = pickImageMime();
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), mime, IMAGE_QUALITY),
    );
    if (!blob || blob.size === 0) return file;
    // Ne jamais alourdir un fichier déjà plus léger et déjà au bon ratio.
    const ratio = img.naturalWidth / img.naturalHeight;
    const already916 = Math.abs(ratio - TARGET_W / TARGET_H) < 0.02;
    if (already916 && blob.size >= file.size) return file;
    const base = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${base}-916.${ext}`, { type: mime });
  } catch {
    return file;
  }
}

function supportedRecorderMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"];
  for (const m of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/**
 * Re-encode une vidéo en 9:16 (cover, 1080x1920) avec un bitrate maîtrisé.
 * Best-effort : si le navigateur ne supporte pas la capture canvas, on
 * renvoie le fichier d'origine inchangé.
 */
export async function optimizeVideoFor916(
  file: File,
  onProgress?: (p: number) => void,
): Promise<File> {
  if (file.size < VIDEO_TRANSCODE_MIN_BYTES) return file;
  const mime = supportedRecorderMime();
  if (!mime) return file;

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url;
  video.muted = false;
  video.playsInline = true;
  video.preload = "auto";

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("video_metadata_failed"));
    });
    const sw = video.videoWidth;
    const sh = video.videoHeight;
    if (!sw || !sh) return file;

    const canvas = document.createElement("canvas");
    canvas.width = TARGET_W;
    canvas.height = TARGET_H;
    const ctx = canvas.getContext("2d");
    if (!ctx || typeof canvas.captureStream !== "function") return file;

    const stream = canvas.captureStream(30);
    // Conserve l'audio quand le navigateur l'expose.
    const withAudio = video as HTMLVideoElement & {
      captureStream?: () => MediaStream;
    };
    try {
      const srcStream = withAudio.captureStream?.();
      srcStream?.getAudioTracks().forEach((tr) => stream.addTrack(tr));
    } catch {
      /* ignore */
    }

    const recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: 2_500_000,
      audioBitsPerSecond: 128_000,
    });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    const done = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });

    const scale = Math.max(TARGET_W / sw, TARGET_H / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    const dx = (TARGET_W - dw) / 2;
    const dy = (TARGET_H - dh) / 2;

    let raf = 0;
    const draw = () => {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, TARGET_W, TARGET_H);
      ctx.drawImage(video, dx, dy, dw, dh);
      if (video.duration > 0) onProgress?.(Math.min(1, video.currentTime / video.duration));
      raf = requestAnimationFrame(draw);
    };

    recorder.start(1000);
    await video.play().catch(() => undefined);
    draw();

    await new Promise<void>((resolve) => {
      video.onended = () => resolve();
    });
    cancelAnimationFrame(raf);
    recorder.stop();
    await done;
    onProgress?.(1);

    const outMime = mime.split(";")[0] ?? "video/mp4";
    const blob = new Blob(chunks, { type: outMime });
    if (!blob.size || blob.size >= file.size) return file;
    const base = file.name.replace(/\.[^.]+$/, "") || "video";
    const ext = outMime.includes("webm") ? "webm" : "mp4";
    return new File([blob], `${base}-916.${ext}`, { type: outMime });
  } catch {
    return file;
  } finally {
    try {
      video.pause();
    } catch {
      /* ignore */
    }
    URL.revokeObjectURL(url);
  }
}

/** Point d'entrée unique : optimise photo ou vidéo pour le rendu 9:16. */
export async function optimizeMediaFor916(
  file: File,
  onProgress?: (p: number) => void,
): Promise<File> {
  if (isVideoFileLike(file)) return optimizeVideoFor916(file, onProgress);
  if (isImageFileLike(file)) return optimizeImageFor916(file);
  return file;
}
