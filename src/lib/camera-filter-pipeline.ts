// Camera filter pipeline.
//
// Wraps a raw camera MediaStreamTrack in an offscreen <canvas> pipeline that
// applies a CSS `ctx.filter` per frame and republishes the result as a fresh
// MediaStreamTrack via `canvas.captureStream()`. Because the filtered track
// is what LiveKit publishes, ALL viewers see the effect (not just the local
// preview).
//
// Usage:
//   const pipe = createFilterPipeline(rawTrack, "warm");
//   await pipe.ready;
//   const publishedTrack = pipe.outputTrack;  // give to LiveKit
//   pipe.setFilter("brightness");
//   pipe.stop();
//
// Performance:
//  - Caps processing at the source resolution (usually already 720p from LK).
//  - Uses `requestAnimationFrame` — pauses when the tab is hidden.
//  - Basic fps guard: if avg fps < FPS_FLOOR over the first 2s, `pipe.ready`
//    resolves with `{ ok: false, reason: "slow" }` so the caller can revert.

export type FilterKey =
  | "none"
  | "bright"
  | "warm"
  | "soft"
  | "bw"
  | "vivid";

export const FILTER_LABELS_FR: Record<FilterKey, string> = {
  none:   "Aucun",
  bright: "Lumineux",
  warm:   "Chaleur",
  soft:   "Doux",
  bw:     "N&B",
  vivid:  "Vif",
};

export const FILTER_LABELS_EN: Record<FilterKey, string> = {
  none:   "None",
  bright: "Bright",
  warm:   "Warm",
  soft:   "Soft",
  bw:     "B&W",
  vivid:  "Vivid",
};

const FILTER_CSS: Record<FilterKey, string> = {
  none:   "none",
  bright: "brightness(1.12) contrast(1.06)",
  warm:   "saturate(1.15) sepia(0.12) hue-rotate(-8deg)",
  soft:   "brightness(1.05) blur(0.6px) contrast(0.95)",
  bw:     "grayscale(1) contrast(1.05)",
  vivid:  "saturate(1.35) contrast(1.12)",
};

export function isFilterPipelineSupported(): boolean {
  if (typeof HTMLCanvasElement === "undefined") return false;
  const proto = HTMLCanvasElement.prototype as unknown as { captureStream?: unknown };
  return typeof proto.captureStream === "function";
}

export type PipelineReady =
  | { ok: true }
  | { ok: false; reason: "slow" | "no_track" | "unsupported" };

export type FilterPipeline = {
  outputTrack: MediaStreamTrack;
  setFilter: (k: FilterKey) => void;
  ready: Promise<PipelineReady>;
  stop: () => void;
};

const FPS_FLOOR = 18;

export function createFilterPipeline(
  source: MediaStreamTrack,
  initial: FilterKey,
): FilterPipeline {
  if (!isFilterPipelineSupported()) {
    return {
      outputTrack: source,
      setFilter: () => {},
      ready: Promise.resolve({ ok: false, reason: "unsupported" }),
      stop: () => {},
    };
  }

  const settings = source.getSettings();
  const width = Math.min(1280, settings.width ?? 1280);
  const height = Math.min(720, settings.height ?? 720);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });

  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  video.srcObject = new MediaStream([source]);

  let currentFilter: FilterKey = initial;
  let stopped = false;
  let raf = 0;

  const started = video.play().catch(() => {});

  const readyPromise = new Promise<PipelineReady>((resolve) => {
    let frames = 0;
    const start = performance.now();
    let resolved = false;

    const tick = () => {
      if (stopped) return;
      if (!ctx) return;
      try {
        ctx.filter = FILTER_CSS[currentFilter];
        ctx.drawImage(video, 0, 0, width, height);
      } catch {}
      frames++;
      if (!resolved) {
        const elapsed = performance.now() - start;
        if (elapsed >= 2000) {
          const fps = (frames / elapsed) * 1000;
          resolved = true;
          resolve(fps < FPS_FLOOR ? { ok: false, reason: "slow" } : { ok: true });
        }
      }
      raf = requestAnimationFrame(tick);
    };

    void started.finally(() => {
      raf = requestAnimationFrame(tick);
    });
  });

  const stream = (canvas as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream })
    .captureStream(30);
  const outputTrack = stream.getVideoTracks()[0];
  if (!outputTrack) {
    return {
      outputTrack: source,
      setFilter: () => {},
      ready: Promise.resolve({ ok: false, reason: "no_track" }),
      stop: () => { cancelAnimationFrame(raf); stopped = true; },
    };
  }

  return {
    outputTrack,
    setFilter: (k) => { currentFilter = k; },
    ready: readyPromise,
    stop: () => {
      stopped = true;
      cancelAnimationFrame(raf);
      try { outputTrack.stop(); } catch {}
      try { video.srcObject = null; } catch {}
    },
  };
}
