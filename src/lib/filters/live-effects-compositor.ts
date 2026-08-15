/**
 * Compose virtual background (TikTok-style cutout) + poster overlay
 * onto a camera frame. Used by setup preview and the LiveKit processor
 * so viewers see the same picture.
 */

import { FilesetResolver, ImageSegmenter } from "@mediapipe/tasks-vision";

export type PosterMode = "off" | "cover" | "side";

const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";

let segmenterPromise: Promise<ImageSegmenter | null> | null = null;

async function getSegmenter(): Promise<ImageSegmenter | null> {
  if (segmenterPromise) return segmenterPromise;
  segmenterPromise = (async () => {
    try {
      const vision = await FilesetResolver.forVisionTasks(WASM_URL);
      try {
        return await ImageSegmenter.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
          runningMode: "VIDEO",
          outputCategoryMask: true,
          outputConfidenceMasks: false,
        });
      } catch {
        return await ImageSegmenter.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
          runningMode: "VIDEO",
          outputCategoryMask: true,
          outputConfidenceMasks: false,
        });
      }
    } catch (e) {
      console.warn("[live-effects] segmenter unavailable", e);
      return null;
    }
  })();
  return segmenterPromise;
}

export function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image_load"));
    img.src = url;
  });
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  w: number,
  h: number,
  sw?: number,
  sh?: number,
) {
  const iw = sw ?? (img as HTMLImageElement).naturalWidth ?? (img as HTMLVideoElement).videoWidth ?? w;
  const ih = sh ?? (img as HTMLImageElement).naturalHeight ?? (img as HTMLVideoElement).videoHeight ?? h;
  if (!iw || !ih) {
    ctx.drawImage(img, 0, 0, w, h);
    return;
  }
  const scale = Math.max(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

function drawCoverAt(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const iw =
    (img as HTMLImageElement).naturalWidth ||
    (img as HTMLVideoElement).videoWidth ||
    w;
  const ih =
    (img as HTMLImageElement).naturalHeight ||
    (img as HTMLVideoElement).videoHeight ||
    h;
  const scale = Math.max(w / Math.max(1, iw), h / Math.max(1, ih));
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function drawRoundedImage(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.clip();
  drawCoverAt(ctx, img, x, y, w, h);
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = "rgba(232,185,59,0.85)";
  ctx.lineWidth = Math.max(2, Math.round(w * 0.012));
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.stroke();
  ctx.restore();
}

export type PosterTransform = { x: number; y: number; scale: number };

export const DEFAULT_POSTER_TRANSFORM: Record<"cover" | "side", PosterTransform> = {
  cover: { x: 0.5, y: 0.4, scale: 1 },
  side: { x: 0.78, y: 0.5, scale: 1 },
};

export function clampPosterTransform(t: PosterTransform): PosterTransform {
  return {
    x: Math.min(0.95, Math.max(0.05, t.x)),
    y: Math.min(0.95, Math.max(0.05, t.y)),
    scale: Math.min(3, Math.max(0.35, t.scale)),
  };
}

export class LiveEffectsCompositor {
  background: HTMLImageElement | null = null;
  poster: HTMLImageElement | null = null;
  posterMode: PosterMode = "off";
  posterX = 0.5;
  posterY = 0.4;
  posterScale = 1;
  mirror = false;

  private person = document.createElement("canvas");
  private personCtx: CanvasRenderingContext2D | null = this.person.getContext("2d", {
    willReadFrequently: true,
  });
  private lastMask: Uint8Array | null = null;
  private lastMaskW = 0;
  private lastMaskH = 0;
  private frame = 0;
  private segmenterReady = false;

  async warmup(): Promise<void> {
    const s = await getSegmenter();
    this.segmenterReady = !!s;
  }

  async draw(video: HTMLVideoElement, dest: HTMLCanvasElement): Promise<void> {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;
    const maxW = 720;
    const scale = Math.min(1, maxW / vw);
    const w = Math.max(2, Math.round(vw * scale));
    const h = Math.max(2, Math.round(vh * scale));
    if (dest.width !== w || dest.height !== h) {
      dest.width = w;
      dest.height = h;
    }
    const ctx = dest.getContext("2d", { alpha: false });
    if (!ctx) return;

    const hasBg = !!this.background;
    const hasPoster = !!this.poster && this.posterMode !== "off";

    // Still images (fond + poster) stay unmirrored so text/logos read the
    // same for the host and for viewers. Only the live camera is flipped
    // (selfie), matching what the host sees on screen.
    if (hasBg && this.background) {
      drawCover(ctx, this.background, w, h);
    } else {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);
    }

    ctx.save();
    if (this.mirror) {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    if (hasBg) {
      await this.drawPersonCutout(ctx, video, w, h, vw, vh);
    } else {
      ctx.drawImage(video, 0, 0, w, h);
    }
    ctx.restore();

    // Poster: same pixels for host preview and published track.
    if (hasPoster && this.poster) {
      const iw = this.poster.naturalWidth || 1;
      const ih = this.poster.naturalHeight || 1;
      const baseW = w * (this.posterMode === "side" ? 0.4 : 0.72) * this.posterScale;
      const baseH = baseW * (ih / iw);
      const maxH = h * 0.88;
      const ph = Math.min(baseH, maxH);
      const pw = ph * (iw / ih);
      const px = this.posterX * w - pw / 2;
      const py = this.posterY * h - ph / 2;
      drawRoundedImage(ctx, this.poster, px, py, pw, ph, Math.max(12, Math.round(pw * 0.04)));
    }
  }

  private async drawPersonCutout(
    ctx: CanvasRenderingContext2D,
    video: HTMLVideoElement,
    w: number,
    h: number,
    vw: number,
    vh: number,
  ) {
    if (this.person.width !== w || this.person.height !== h) {
      this.person.width = w;
      this.person.height = h;
    }
    const pctx = this.personCtx;
    if (!pctx) {
      ctx.drawImage(video, 0, 0, w, h);
      return;
    }
    pctx.drawImage(video, 0, 0, w, h);

    const segmenter = await getSegmenter();
    this.segmenterReady = !!segmenter;
    if (segmenter) {
      try {
        this.frame += 1;
        // Reuse mask every other frame on phones.
        if (this.frame % 2 === 1 || !this.lastMask) {
          const result = segmenter.segmentForVideo(video, performance.now());
          const mask = result.categoryMask;
          if (mask) {
            this.lastMask = mask.getAsUint8Array();
            this.lastMaskW = mask.width;
            this.lastMaskH = mask.height;
          }
          result.close();
        }
      } catch (e) {
        console.warn("[live-effects] segment failed", e);
      }
    }

    if (this.lastMask && this.lastMaskW && this.lastMaskH) {
      const img = pctx.getImageData(0, 0, w, h);
      const data = img.data;
      const mw = this.lastMaskW;
      const mh = this.lastMaskH;
      const mask = this.lastMask;
      for (let y = 0; y < h; y++) {
        const my = Math.min(mh - 1, ((y * mh) / h) | 0);
        for (let x = 0; x < w; x++) {
          const mx = Math.min(mw - 1, ((x * mw) / w) | 0);
          const m = mask[my * mw + mx] ?? 0;
          // selfie_segmenter: 0 = background, >0 = person
          const a = m > 0 ? 255 : 0;
          data[(y * w + x) * 4 + 3] = a;
        }
      }
      pctx.putImageData(img, 0, 0);
      ctx.drawImage(this.person, 0, 0);
      return;
    }

    // Fallback while the model loads / if it fails: small camera pip on the bg.
    const pipW = Math.round(w * 0.34);
    const pipH = Math.round(h * 0.28);
    const pipX = Math.round(w * 0.04);
    const pipY = h - pipH - Math.round(h * 0.04);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(pipX, pipY, pipW, pipH, 14);
    ctx.clip();
    ctx.drawImage(video, pipX, pipY, pipW, pipH);
    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(pipX, pipY, pipW, pipH, 14);
    ctx.stroke();
    void vw;
    void vh;
  }
}
