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

/** Décode en respectant l'orientation EXIF (iPhone paysage stocké en portrait, etc.). */
async function loadOrientedImage(
  file: File,
): Promise<{ source: CanvasImageSource; w: number; h: number }> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { source: bmp, w: bmp.width, h: bmp.height };
  } catch {
    const img = await loadImage(file);
    return { source: img, w: img.naturalWidth, h: img.naturalHeight };
  }
}

/** Recadre une photo en 9:16 (cover) et la compresse. Renvoie le fichier d'origine en cas d'échec. */
export async function optimizeImageFor916(file: File): Promise<File> {
  try {
    const { source, w, h } = await loadOrientedImage(file);
    const canvas = drawCover(source, w, h);
    const { mime, ext } = pickImageMime();
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), mime, IMAGE_QUALITY),
    );
    if (!blob || blob.size === 0) return file;
    const ratio = w / h;
    const already916 = Math.abs(ratio - TARGET_W / TARGET_H) < 0.02;
    if (already916 && blob.size >= file.size) return file;
    const base = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${base}-916.${ext}`, { type: mime });
  } catch {
    return file;
  }
}

/**
 * Génère une vignette (poster) JPEG à partir de la première image d'une vidéo.
 * Utilisée dans le feed pour ne PAS télécharger la vidéo entière au scroll.
 */
export async function generateVideoPoster(file: File): Promise<File | null> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";
  try {
    await new Promise<void>((resolve, reject) => {
      const to = window.setTimeout(() => reject(new Error("poster_timeout")), 8000);
      video.onloadeddata = () => {
        window.clearTimeout(to);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(to);
        reject(new Error("poster_decode_failed"));
      };
    });
    try {
      video.currentTime = Math.min(0.2, (video.duration || 1) / 10);
      await new Promise<void>((resolve) => {
        const to = window.setTimeout(() => resolve(), 1500);
        video.onseeked = () => {
          window.clearTimeout(to);
          resolve();
        };
      });
    } catch {
      /* ignore */
    }
    const sw = video.videoWidth;
    const sh = video.videoHeight;
    if (!sw || !sh) return null;
    const canvas = drawCover(video, sw, sh);
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.7),
    );
    if (!blob || blob.size === 0) return null;
    return new File([blob], `poster-${Date.now()}.jpg`, { type: "image/jpeg" });
  } catch {
    return null;
  } finally {
    try {
      video.pause();
    } catch {
      /* ignore */
    }
    URL.revokeObjectURL(url);
  }
}

/**
 * Vidéo : plus de ré-encodage 9:16 temps réel (MediaRecorder rejouait la vidéo
 * en entier). En revanche, les .mov QuickTime/HEVC filmés sur iPhone sont
 * convertis en MPEG-4/H.264 pour être lisibles sur Android et partout ailleurs.
 */
export async function optimizeVideoFor916(
  file: File,
  onProgress?: (p: number) => void,
): Promise<File> {
  const { isQuickTimeFile, transcodeMovToMp4 } = await import("@/lib/video-transcode");
  if (!isQuickTimeFile(file)) return file;
  return transcodeMovToMp4(file, onProgress);
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


