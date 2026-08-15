import type { Track, TrackProcessor, VideoProcessorOptions } from "livekit-client";
import {
  LiveEffectsCompositor,
  loadImageFromUrl,
  type PosterMode,
} from "@/lib/filters/live-effects-compositor";

export type LiveEffectsConfig = {
  backgroundUrl: string | null;
  posterUrl: string | null;
  posterMode: PosterMode;
  posterX?: number;
  posterY?: number;
  posterScale?: number;
  mirror: boolean;
};

export class LiveEffectsVideoProcessor
  implements TrackProcessor<Track.Kind.Video, VideoProcessorOptions>
{
  readonly name = "kidi-live-effects";
  processedTrack?: MediaStreamTrack;

  private video?: HTMLVideoElement;
  private canvas?: HTMLCanvasElement;
  private raf = 0;
  private running = false;
  private compositor = new LiveEffectsCompositor();
  private config: LiveEffectsConfig;

  constructor(config: LiveEffectsConfig) {
    this.config = config;
    this.compositor.mirror = config.mirror;
  }

  async init(opts: VideoProcessorOptions): Promise<void> {
    await this.start(opts.track);
  }

  async restart(opts: VideoProcessorOptions): Promise<void> {
    await this.destroy();
    await this.start(opts.track);
  }

  async destroy(): Promise<void> {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    try {
      this.processedTrack?.stop();
    } catch {
      /* ignore */
    }
    this.processedTrack = undefined;
    if (this.video) {
      try {
        this.video.pause();
        this.video.srcObject = null;
      } catch {
        /* ignore */
      }
    }
    this.video = undefined;
    this.canvas = undefined;
  }

  async setConfig(config: LiveEffectsConfig): Promise<void> {
    this.config = config;
    this.compositor.mirror = config.mirror;
    await this.syncImages();
  }

  private async syncImages() {
    try {
      this.compositor.background = this.config.backgroundUrl
        ? await loadImageFromUrl(this.config.backgroundUrl)
        : null;
    } catch {
      this.compositor.background = null;
    }
    try {
      this.compositor.poster = this.config.posterUrl
        ? await loadImageFromUrl(this.config.posterUrl)
        : null;
    } catch {
      this.compositor.poster = null;
    }
    this.compositor.posterMode = this.config.posterMode;
    this.compositor.posterX = this.config.posterX ?? 0.5;
    this.compositor.posterY = this.config.posterY ?? 0.4;
    this.compositor.posterScale = this.config.posterScale ?? 1;
  }

  setTransform(x: number, y: number, scale: number) {
    this.compositor.posterX = x;
    this.compositor.posterY = y;
    this.compositor.posterScale = scale;
  }

  private async start(source: MediaStreamTrack): Promise<void> {
    await this.compositor.warmup();
    await this.syncImages();

    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "true");
    video.srcObject = new MediaStream([source]);
    await Promise.race([
      video.play().catch(() => undefined),
      new Promise<void>((r) => setTimeout(r, 400)),
    ]);

    const canvas = document.createElement("canvas");
    const settings = source.getSettings();
    canvas.width = Math.max(2, settings.width ?? (video.videoWidth || 720));
    canvas.height = Math.max(2, settings.height ?? (video.videoHeight || 1280));

    const out = canvas.captureStream(30);
    const processed = out.getVideoTracks()[0];
    if (!processed) throw new Error("live-effects: no output track");

    this.video = video;
    this.canvas = canvas;
    this.processedTrack = processed;
    this.running = true;

    const tick = () => {
      if (!this.running || !this.video || !this.canvas) return;
      void this.compositor.draw(this.video, this.canvas);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }
}
