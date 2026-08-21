/**
 * Compose virtual background (blur or image replacement) + poster overlay
 * onto a camera frame. Used by setup preview and the LiveKit processor
 * so viewers see the same picture.
 *
 * Segmentation: MediaPipe Tasks Vision ImageSegmenter with the selfie model,
 * using CONFIDENCE masks (soft alpha) rather than the binary category mask.
 * The soft mask is temporally smoothed (EMA) and feathered (canvas blur)
 * before compositing with source-over alpha, which removes the blocky /
 * shimmering edges of a raw binary mask.
 */

import { FilesetResolver, ImageSegmenter } from "@mediapipe/tasks-vision";

export type PosterMode = "off" | "cover";
export type BackgroundMode = "none" | "blur" | "image";

const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";

let segmenterPromise: Promise<ImageSegmenter | null> | null = null;

/** Lazy: only loaded the first time a background effect is enabled. */
async function getSegmenter(): Promise<ImageSegmenter | null> {
  if (segmenterPromise) return segmenterPromise;
  segmenterPromise = (async () => {
    try {
      const vision = await FilesetResolver.forVisionTasks(WASM_URL);
      const opts = (delegate: "GPU" | "CPU") =>
        ({
          baseOptions: { modelAssetPath: MODEL_URL, delegate },
          runningMode: "VIDEO" as const,
          outputCategoryMask: true,
          outputConfidenceMasks: true,
        });
      try {
        return await ImageSegmenter.createFromOptions(vision, opts("GPU"));
      } catch {
        return await ImageSegmenter.createFromOptions(vision, opts("CPU"));
      }
    } catch (e) {
      console.warn("[live-effects] segmenter unavailable", e);
      return null;
    }
  })();
  return segmenterPromise;
}

/** True once we know the model can't run here (WebGL/WASM/model failure). */
export async function isSegmentationSupported(): Promise<boolean> {
  return !!(await getSegmenter());
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

export const DEFAULT_POSTER_TRANSFORM: PosterTransform = {
  x: 0.5,
  y: 0.4,
  scale: 1,
};

export function clampPosterTransform(t: PosterTransform): PosterTransform {
  return {
    x: Math.min(0.95, Math.max(0.05, t.x)),
    y: Math.min(0.95, Math.max(0.05, t.y)),
    scale: Math.min(3, Math.max(0.35, t.scale)),
  };
}

/** Render width ladder used by the perf guard (height follows the aspect). */
const WIDTH_LADDER = [720, 540, 400] as const;

export class LiveEffectsCompositor {
  background: HTMLImageElement | null = null;
  backgroundMode: BackgroundMode = "none";
  poster: HTMLImageElement | null = null;
  posterMode: PosterMode = "off";
  posterX = 0.5;
  posterY = 0.4;
  posterScale = 1;
  mirror = false;

  /** Called once when the device is too slow to sustain segmentation. */
  onUnavailable: (() => void) | null = null;
  /** Called when the pipeline downgrades resolution (informational). */
  onDowngrade: ((width: number) => void) | null = null;

  segmentationFailed = false;

  private person = document.createElement("canvas");
  private personCtx = this.person.getContext("2d") as CanvasRenderingContext2D | null;
  private maskRaw = document.createElement("canvas");
  private maskRawCtx = this.maskRaw.getContext("2d") as CanvasRenderingContext2D | null;
  private maskSoft = document.createElement("canvas");
  private maskSoftCtx = this.maskSoft.getContext("2d") as CanvasRenderingContext2D | null;
  private blurLayer = document.createElement("canvas");
  private blurCtx = this.blurLayer.getContext("2d") as CanvasRenderingContext2D | null;

  private prevAlpha: Float32Array | null = null;
  private maskW = 0;
  private maskH = 0;
  private hasMask = false;
  private personIndex: number | null = null;

  // Perf guard
  private ladderIndex = 0;
  private lastTs = 0;
  private slowFrames = 0;
  private fastFrames = 0;
  private disabled = false;

  async warmup(): Promise<void> {
    const ok = await isSegmentationSupported();
    this.segmentationFailed = !ok;
  }

  get maxWidth(): number {
    return WIDTH_LADDER[this.ladderIndex] ?? 400;
  }

  private trackFps(now: number) {
    if (this.lastTs) {
      const dt = now - this.lastTs;
      if (dt > 70) {
        // < ~14 fps
        this.slowFrames += 1;
        this.fastFrames = 0;
      } else {
        this.fastFrames += 1;
        if (this.fastFrames > 30) this.slowFrames = 0;
      }
      if (this.slowFrames > 45) {
        this.slowFrames = 0;
        if (this.ladderIndex < WIDTH_LADDER.length - 1) {
          this.ladderIndex += 1;
          this.onDowngrade?.(this.maxWidth);
        } else if (!this.disabled) {
          this.disabled = true;
          this.onUnavailable?.();
        }
      }
    }
    this.lastTs = now;
  }

  async draw(video: HTMLVideoElement, dest: HTMLCanvasElement): Promise<void> {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;
    const scale = Math.min(1, this.maxWidth / vw);
    const w = Math.max(2, Math.round(vw * scale));
    const h = Math.max(2, Math.round(vh * scale));
    if (dest.width !== w || dest.height !== h) {
      dest.width = w;
      dest.height = h;
    }
    const ctx = dest.getContext("2d", { alpha: false });
    if (!ctx) return;

    const wantBg = this.backgroundMode !== "none" && !this.disabled;
    const hasPoster = !!this.poster && this.posterMode !== "off";

    // Replacement images stay unmirrored (text/logos readable); only the
    // live camera (selfie) is flipped. Blurred backgrounds come from the
    // camera itself so they follow the same mirror as the person.
    const mirrorScope = (fn: () => void) => {
      ctx.save();
      if (this.mirror) {
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
      }
      fn();
      ctx.restore();
    };

    if (wantBg) {
      this.trackFps(performance.now());
      const ok = await this.updateMask(video);
      if (ok) {
        if (this.backgroundMode === "image" && this.background) {
          drawCover(ctx, this.background, w, h);
        } else {
          mirrorScope(() => this.drawBackgroundLayer(ctx, video, w, h));
        }
        mirrorScope(() => this.drawPerson(ctx, video, w, h));
      } else {
        mirrorScope(() => ctx.drawImage(video, 0, 0, w, h));
      }
    } else {
      mirrorScope(() => ctx.drawImage(video, 0, 0, w, h));
    }

    // Poster: same pixels for host preview and published track (unmirrored).
    if (hasPoster && this.poster) {
      const iw = this.poster.naturalWidth || 1;
      const ih = this.poster.naturalHeight || 1;
      const baseW = w * 0.72 * this.posterScale;
      const baseH = baseW * (ih / iw);
      const maxH = h * 0.88;
      const ph = Math.min(baseH, maxH);
      const pw = ph * (iw / ih);
      const px = this.posterX * w - pw / 2;
      const py = this.posterY * h - ph / 2;
      drawRoundedImage(ctx, this.poster, px, py, pw, ph, Math.max(12, Math.round(pw * 0.04)));
    }
  }

  /** Background = blurred camera, or the chosen image (cover). */
  private drawBackgroundLayer(
    ctx: CanvasRenderingContext2D,
    video: HTMLVideoElement,
    w: number,
    h: number,
  ) {
    if (this.backgroundMode === "image" && this.background) {
      drawCover(ctx, this.background, w, h);
      return;
    }
    // Blur mode (also the fallback when an image failed to load).
    const bctx = this.blurCtx;
    if (!bctx) {
      ctx.drawImage(video, 0, 0, w, h);
      return;
    }
    // Blur at half res: cheaper and smoother.
    const bw = Math.max(2, Math.round(w / 2));
    const bh = Math.max(2, Math.round(h / 2));
    if (this.blurLayer.width !== bw || this.blurLayer.height !== bh) {
      this.blurLayer.width = bw;
      this.blurLayer.height = bh;
    }
    bctx.filter = "none";
    bctx.drawImage(video, 0, 0, bw, bh);
    ctx.save();
    ctx.filter = `blur(${Math.max(6, Math.round(w * 0.02))}px)`;
    ctx.drawImage(this.blurLayer, 0, 0, w, h);
    ctx.restore();
    // Slight darkening keeps the subject popping.
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  /** Camera frame masked by the soft alpha, drawn source-over on the bg. */
  private drawPerson(
    ctx: CanvasRenderingContext2D,
    video: HTMLVideoElement,
    w: number,
    h: number,
  ) {
    const pctx = this.personCtx;
    if (!pctx || !this.hasMask) {
      ctx.drawImage(video, 0, 0, w, h);
      return;
    }
    if (this.person.width !== w || this.person.height !== h) {
      this.person.width = w;
      this.person.height = h;
    }
    pctx.globalCompositeOperation = "source-over";
    pctx.clearRect(0, 0, w, h);
    pctx.drawImage(video, 0, 0, w, h);
    pctx.globalCompositeOperation = "destination-in";
    pctx.imageSmoothingEnabled = true;
    pctx.imageSmoothingQuality = "high";
    pctx.drawImage(this.maskSoft, 0, 0, w, h);
    pctx.globalCompositeOperation = "source-over";
    ctx.drawImage(this.person, 0, 0, w, h);
  }

  /**
   * Run the segmenter, apply temporal smoothing on the soft mask, and render
   * it (feathered) into `maskSoft` as an alpha-only white bitmap.
   */
  private async updateMask(video: HTMLVideoElement): Promise<boolean> {
    const segmenter = await getSegmenter();
    if (!segmenter) {
      this.segmentationFailed = true;
      return false;
    }
    try {
      const result = segmenter.segmentForVideo(video, performance.now());
      const confidences = result.confidenceMasks;
      let values: Float32Array | null = null;
      let mw = 0;
      let mh = 0;

      if (confidences && confidences.length > 0) {
        if (this.personIndex === null) {
          this.personIndex = this.pickPersonIndex(result);
        }
        const chosen = confidences[Math.min(this.personIndex, confidences.length - 1)];
        if (chosen) {
          values = chosen.getAsFloat32Array();
          mw = chosen.width;
          mh = chosen.height;
        }
      }
      if (!values && result.categoryMask) {
        const cm = result.categoryMask;
        const u8 = cm.getAsUint8Array();
        mw = cm.width;
        mh = cm.height;
        values = new Float32Array(u8.length);
        for (let i = 0; i < u8.length; i++) values[i] = (u8[i] ?? 0) > 0 ? 1 : 0;
      }
      result.close();
      if (!values || !mw || !mh) return this.hasMask;

      // Temporal smoothing (EMA) to kill edge shimmer.
      if (!this.prevAlpha || this.maskW !== mw || this.maskH !== mh) {
        this.prevAlpha = new Float32Array(values.length);
        this.prevAlpha.set(values);
        this.maskW = mw;
        this.maskH = mh;
      } else {
        const prev = this.prevAlpha;
        for (let i = 0; i < values.length; i++) {
          prev[i] = (prev[i] ?? 0) * 0.55 + (values[i] ?? 0) * 0.45;
        }
      }
      const alpha = this.prevAlpha;

      const rawCtx = this.maskRawCtx;
      const softCtx = this.maskSoftCtx;
      if (!rawCtx || !softCtx) return false;
      if (this.maskRaw.width !== mw || this.maskRaw.height !== mh) {
        this.maskRaw.width = mw;
        this.maskRaw.height = mh;
        this.maskSoft.width = mw;
        this.maskSoft.height = mh;
      }
      const img = rawCtx.createImageData(mw, mh);
      const d = img.data;
      for (let i = 0; i < alpha.length; i++) {
        const a = alpha[i] ?? 0;
        // Soft contrast curve: push confident areas to 0/1, keep a soft band.
        const v = a <= 0.35 ? 0 : a >= 0.65 ? 1 : (a - 0.35) / 0.3;
        const o = i * 4;
        d[o] = 255;
        d[o + 1] = 255;
        d[o + 2] = 255;
        d[o + 3] = (v * 255) | 0;
      }
      rawCtx.putImageData(img, 0, 0);

      // Feathering: small blur on the alpha mask (falls back to the raw mask
      // when ctx.filter is unsupported).
      softCtx.clearRect(0, 0, mw, mh);
      const radius = Math.max(1, Math.round(mw * 0.008));
      softCtx.filter = `blur(${radius}px)`;
      softCtx.drawImage(this.maskRaw, 0, 0);
      softCtx.filter = "none";

      this.hasMask = true;
      return true;
    } catch (e) {
      console.warn("[live-effects] segment failed", e);
      return this.hasMask;
    }
  }

  /**
   * The selfie model can expose 1 or 2 confidence masks; pick the channel
   * that represents the person (heuristic: the center of the frame is much
   * more likely to be the subject than the frame border).
   */
  private pickPersonIndex(result: {
    confidenceMasks?: Array<{ getAsFloat32Array(): Float32Array; width: number; height: number }>;
  }): number {
    const masks = result.confidenceMasks ?? [];
    if (masks.length < 2) return 0;
    let best = 0;
    let bestScore = -Infinity;
    masks.forEach((m, idx) => {
      const v = m.getAsFloat32Array();
      const w = m.width;
      const h = m.height;
      const cx = (w / 2) | 0;
      const cy = (h / 2) | 0;
      const center = v[cy * w + cx] ?? 0;
      const corner = ((v[0] ?? 0) + (v[w - 1] ?? 0) + (v[(h - 1) * w] ?? 0)) / 3;
      const score = center - corner;
      if (score > bestScore) {
        bestScore = score;
        best = idx;
      }
    });
    return best;
  }
}
