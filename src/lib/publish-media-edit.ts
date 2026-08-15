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
    let settled = false;
    const finish = (d: number) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(d);
    };
    const fail = () => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      reject(new Error("metadata_failed"));
    };
    const tryRead = () => {
      const d = video.duration;
      if (Number.isFinite(d) && d > 0) {
        finish(d);
        return true;
      }
      return false;
    };
    video.onloadedmetadata = () => {
      if (tryRead()) return;
      video.ondurationchange = () => {
        if (tryRead()) video.ondurationchange = null;
      };
    };
    video.onerror = fail;
    window.setTimeout(() => {
      if (!tryRead()) fail();
    }, 6000);
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

type CaptureVideo = HTMLVideoElement & {
  captureStream?: (fps?: number) => MediaStream;
  mozCaptureStream?: (fps?: number) => MediaStream;
};

function getElementCapture(video: HTMLVideoElement): ((fps?: number) => MediaStream) | null {
  const v = video as CaptureVideo;
  if (typeof v.captureStream === "function") return v.captureStream.bind(v);
  if (typeof v.mozCaptureStream === "function") return v.mozCaptureStream.bind(v);
  return null;
}

export function canTrimVideoInBrowser(): boolean {
  if (typeof MediaRecorder === "undefined") return false;
  const probe = document.createElement("video");
  if (getElementCapture(probe)) return true;
  const canvas = document.createElement("canvas");
  return typeof canvas.captureStream === "function";
}

function timeoutError(ms: number, code: string): Promise<never> {
  return new Promise((_, reject) => {
    window.setTimeout(() => reject(new Error(code)), ms);
  });
}

async function waitVideoReady(video: HTMLVideoElement, allowReload = false): Promise<void> {
  if (video.readyState >= 2 && Number.isFinite(video.duration) && video.duration > 0) return;
  await Promise.race([
    new Promise<void>((resolve, reject) => {
      const ok = () => {
        if (video.readyState >= 2) {
          cleanup();
          resolve();
        }
      };
      const bad = () => {
        cleanup();
        reject(new Error("video_error"));
      };
      const cleanup = () => {
        video.removeEventListener("loadeddata", ok);
        video.removeEventListener("canplay", ok);
        video.removeEventListener("error", bad);
      };
      video.addEventListener("loadeddata", ok);
      video.addEventListener("canplay", ok);
      video.addEventListener("error", bad);
      if (allowReload) {
        try {
          video.load();
        } catch {
          /* ignore */
        }
      }
    }),
    timeoutError(12000, "metadata_timeout"),
  ]);
}

async function seekVideo(video: HTMLVideoElement, timeSec: number): Promise<void> {
  const dur = Number.isFinite(video.duration) ? video.duration : timeSec;
  const target = Math.min(Math.max(0, timeSec), Math.max(0, dur - 0.05));
  if (Math.abs(video.currentTime - target) < 0.15) return;
  await Promise.race([
    new Promise<void>((resolve) => {
      const ok = () => resolve();
      video.addEventListener("seeked", ok, { once: true });
      try {
        video.currentTime = target;
      } catch {
        video.removeEventListener("seeked", ok);
        resolve();
      }
    }),
    timeoutError(5000, "seek_timeout"),
  ]).catch(() => undefined);
}

function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "video/mp4;codecs=avc1,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m));
}

function startCanvasCapture(video: HTMLVideoElement, fps: number): {
  stream: MediaStream;
  stop: () => void;
} {
  const sw = video.videoWidth || 720;
  const sh = video.videoHeight || 1280;
  const scale = Math.min(1, 720 / sw);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(2, Math.round(sw * scale));
  canvas.height = Math.max(2, Math.round(sh * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx || typeof canvas.captureStream !== "function") {
    throw new Error("capture_unsupported");
  }
  let raf = 0;
  const draw = () => {
    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    } catch {
      /* ignore */
    }
    raf = requestAnimationFrame(draw);
  };
  draw();
  const stream = canvas.captureStream(fps);
  const fromEl = getElementCapture(video);
  try {
    fromEl?.(fps)
      ?.getAudioTracks()
      .forEach((tr) => stream.addTrack(tr));
  } catch {
    /* ignore */
  }
  return {
    stream,
    stop: () => cancelAnimationFrame(raf),
  };
}

/**
 * Re-encode a window of the source video via MediaRecorder + captureStream.
 * Prefer the already-decoded preview <video> (opts.videoEl) so mobile WebViews
 * don't hang on a detached element. Never wait forever — timeouts + stall guard.
 */
export async function trimVideoFile(
  file: File,
  startSec: number,
  durationSec: number,
  onProgress?: (p: number) => void,
  opts?: { videoEl?: HTMLVideoElement | null },
): Promise<File> {
  if (typeof MediaRecorder === "undefined") throw new Error("recorder_unsupported");
  onProgress?.(0.02);

  const owned = !opts?.videoEl;
  const video = opts?.videoEl ?? document.createElement("video");
  let objectUrl: string | null = null;
  const prevMuted = video.muted;

  if (owned) {
    objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;
    video.playsInline = true;
    video.muted = true;
    video.preload = "auto";
    video.setAttribute("playsinline", "true");
    video.style.cssText =
      "position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.02;pointer-events:none;z-index:0";
    document.body.appendChild(video);
  }

  let stopDraw: (() => void) | null = null;
  const streamTracks: MediaStreamTrack[] = [];

  const cleanup = () => {
    stopDraw?.();
    streamTracks.forEach((t) => {
      try {
        t.stop();
      } catch {
        /* ignore */
      }
    });
    if (owned) {
      try {
        video.pause();
      } catch {
        /* ignore */
      }
      video.removeAttribute("src");
      try {
        video.load();
      } catch {
        /* ignore */
      }
      video.remove();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    } else {
      video.muted = prevMuted;
    }
  };

  try {
    video.muted = true;
    video.playsInline = true;
    await waitVideoReady(video, owned);
    onProgress?.(0.06);

    const duration = Math.min(
      durationSec,
      Math.max(0.2, (Number.isFinite(video.duration) ? video.duration : durationSec) - startSec),
    );

    await seekVideo(video, startSec);
    onProgress?.(0.1);

    const mime = pickRecorderMime();
    const elementCapture = getElementCapture(video);
    let stream: MediaStream;
    if (elementCapture) {
      stream = elementCapture(30);
    } else {
      const canvasCap = startCanvasCapture(video, 30);
      stream = canvasCap.stream;
      stopDraw = canvasCap.stop;
    }
    stream.getTracks().forEach((t) => streamTracks.push(t));
    if (!stream.getVideoTracks().length) throw new Error("capture_unsupported");

    const chunks: Blob[] = [];
    const recorder = mime
      ? new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_500_000 })
      : new MediaRecorder(stream);

    const done = new Promise<File>((resolve, reject) => {
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onerror = () => reject(new Error("recorder_error"));
      recorder.onstop = () => {
        const outMime = recorder.mimeType || mime || "video/webm";
        const blob = new Blob(chunks, { type: outMime.split(";")[0] });
        if (blob.size < 1) {
          reject(new Error("empty_trim"));
          return;
        }
        const ext = outMime.includes("mp4") ? "mp4" : "webm";
        resolve(new File([blob], `trim-${Date.now()}.${ext}`, { type: blob.type }));
      };
    });

    recorder.start(200);
    video.muted = true;
    try {
      await Promise.race([
        video.play().then(() => undefined),
        timeoutError(4000, "play_timeout"),
      ]);
    } catch {
      video.muted = true;
      await Promise.race([
        video.play().then(() => undefined),
        timeoutError(3000, "play_timeout"),
      ]);
    }

    const started = performance.now();
    let lastTime = video.currentTime;
    let stalledMs = 0;
    await Promise.race([
      new Promise<void>((resolve, reject) => {
        const tick = () => {
          const elapsed = (performance.now() - started) / 1000;
          onProgress?.(Math.min(0.98, 0.1 + 0.88 * (elapsed / duration)));
          const t = video.currentTime;
          if (Math.abs(t - lastTime) < 0.02) stalledMs += 32;
          else {
            stalledMs = 0;
            lastTime = t;
          }
          if (stalledMs > 4500 && elapsed > 1.2) {
            try {
              video.pause();
            } catch {
              /* ignore */
            }
            if (recorder.state !== "inactive") recorder.stop();
            reject(new Error("trim_stalled"));
            return;
          }
          if (elapsed >= duration || video.ended || t >= startSec + duration - 0.05) {
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
      }),
      timeoutError(Math.ceil(duration * 1000 + 12000), "trim_timeout"),
    ]);

    return await Promise.race([done, timeoutError(8000, "recorder_timeout")]);
  } finally {
    cleanup();
  }
}
