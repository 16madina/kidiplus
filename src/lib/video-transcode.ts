/**
 * Conversion automatique des vidéos QuickTime (.mov / HEVC filmées sur iPhone)
 * vers MPEG-4 / H.264, pour qu'elles soient lisibles partout (Android, Chrome,
 * navigateurs desktop).
 *
 * Stratégie :
 *  1. Si le fichier n'est pas un .mov/quicktime → on ne touche à rien.
 *  2. Si le navigateur sait décoder le fichier ET encoder en `video/mp4`
 *     (Safari iOS/macOS), on ré-encode via MediaRecorder branché sur le flux
 *     capturé de la vidéo (H.264 + AAC), en accélérant la lecture.
 *  3. Sinon (navigateur incapable de décoder ou d'encoder du MP4) → on renvoie
 *     le fichier d'origine ; l'upload continue normalement.
 */

export type TranscodeProgress = (fraction: number) => void;

const MP4_MIME_CANDIDATES = [
  'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
  'video/mp4;codecs=avc1',
  "video/mp4",
];

/** Vitesse de relecture pendant le ré-encodage (compromis fiabilité/rapidité). */
const PLAYBACK_RATE = 3;
/** Sécurité : au-delà, on abandonne et on garde l'original. */
const MAX_DURATION_SECONDS = 180;

export function isQuickTimeFile(file: File): boolean {
  return (
    /quicktime/i.test(file.type) ||
    /^video\/x-quicktime$/i.test(file.type) ||
    /\.(mov|qt)$/i.test(file.name)
  );
}

function pickMp4RecorderMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const mime of MP4_MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** Le navigateur courant sait-il décoder ce fichier ? */
function canDecode(file: File): boolean {
  try {
    const probe = document.createElement("video");
    const type = file.type || (isQuickTimeFile(file) ? "video/quicktime" : "video/mp4");
    if (probe.canPlayType(type)) return true;
    // Certains Safari renvoient "" pour video/quicktime mais savent lire le HEVC.
    return probe.canPlayType('video/mp4; codecs="hvc1"') !== "";
  } catch {
    return false;
  }
}

type CapturableVideo = HTMLVideoElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

function captureStreamOf(video: CapturableVideo): MediaStream | null {
  try {
    if (typeof video.captureStream === "function") return video.captureStream();
    if (typeof video.mozCaptureStream === "function") return video.mozCaptureStream();
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Ré-encode un .mov en .mp4 (H.264). Renvoie le fichier d'origine si la
 * conversion est impossible sur cet appareil.
 */
export async function transcodeMovToMp4(
  file: File,
  onProgress?: TranscodeProgress,
): Promise<File> {
  if (!isQuickTimeFile(file)) return file;
  if (typeof document === "undefined") return file;

  const mime = pickMp4RecorderMime();
  if (!mime || !canDecode(file)) return file;

  const url = URL.createObjectURL(file);
  const video = document.createElement("video") as CapturableVideo;
  video.src = url;
  video.muted = false;
  video.playsInline = true;
  video.preload = "auto";
  video.crossOrigin = "anonymous";

  const cleanup = () => {
    try {
      video.pause();
    } catch {
      /* ignore */
    }
    video.removeAttribute("src");
    URL.revokeObjectURL(url);
  };

  try {
    await new Promise<void>((resolve, reject) => {
      const to = window.setTimeout(() => reject(new Error("metadata_timeout")), 15000);
      video.onloadeddata = () => {
        window.clearTimeout(to);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(to);
        reject(new Error("decode_failed"));
      };
    });

    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    if (!duration || duration > MAX_DURATION_SECONDS) {
      cleanup();
      return file;
    }

    const stream = captureStreamOf(video);
    if (!stream || stream.getVideoTracks().length === 0) {
      cleanup();
      return file;
    }

    const recorder = new MediaRecorder(stream, { mimeType: mime });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    const done = new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: "video/mp4" }));
      recorder.onerror = () => reject(new Error("recorder_error"));
    });

    const progressTimer = window.setInterval(() => {
      if (duration > 0) onProgress?.(Math.min(0.99, video.currentTime / duration));
    }, 200);

    recorder.start(1000);
    try {
      video.playbackRate = PLAYBACK_RATE;
    } catch {
      /* ignore */
    }
    await video.play();

    await new Promise<void>((resolve) => {
      const guard = window.setTimeout(
        () => resolve(),
        Math.max(10000, ((duration / PLAYBACK_RATE) * 1000) + 8000),
      );
      video.onended = () => {
        window.clearTimeout(guard);
        resolve();
      };
    });

    window.clearInterval(progressTimer);
    if (recorder.state !== "inactive") recorder.stop();
    stream.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        /* ignore */
      }
    });

    const blob = await done;
    cleanup();
    if (!blob || blob.size < 1024) return file;

    onProgress?.(1);
    const base = file.name.replace(/\.[^.]+$/, "") || "video";
    return new File([blob], `${base}.mp4`, { type: "video/mp4" });
  } catch {
    cleanup();
    return file;
  }
}
