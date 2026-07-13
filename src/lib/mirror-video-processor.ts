// Mirrors a local video track horizontally (selfie-style) so front-camera
// publishes match the on-screen preview. Without this, the host sees a CSS
// mirrored preview while viewers receive the un-mirrored camera feed.
import type { Track, TrackProcessor, VideoProcessorOptions } from "livekit-client";

export class MirrorVideoProcessor implements TrackProcessor<Track.Kind.Video, VideoProcessorOptions> {
  readonly name = "mirror-x";
  processedTrack?: MediaStreamTrack;

  private video?: HTMLVideoElement;
  private canvas?: HTMLCanvasElement;
  private ctx?: CanvasRenderingContext2D | null;
  private raf = 0;
  private running = false;

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
    this.ctx = null;
  }

  private async start(source: MediaStreamTrack): Promise<void> {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "true");
    video.srcObject = new MediaStream([source]);
    // Don't hang forever if autoplay is blocked — canvas can still draw later.
    await Promise.race([
      video.play().catch(() => undefined),
      new Promise<void>((r) => setTimeout(r, 400)),
    ]);

    const canvas = document.createElement("canvas");
    const settings = source.getSettings();
    canvas.width = Math.max(2, settings.width ?? (video.videoWidth || 720));
    canvas.height = Math.max(2, settings.height ?? (video.videoHeight || 1280));
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("mirror processor: 2d context unavailable");

    const out = canvas.captureStream(30);
    const processed = out.getVideoTracks()[0];
    if (!processed) throw new Error("mirror processor: no output track");

    this.video = video;
    this.canvas = canvas;
    this.ctx = ctx;
    this.processedTrack = processed;
    this.running = true;

    const tick = () => {
      if (!this.running || !this.video || !this.canvas || !this.ctx) return;
      const vw = this.video.videoWidth;
      const vh = this.video.videoHeight;
      if (vw > 0 && vh > 0 && (this.canvas.width !== vw || this.canvas.height !== vh)) {
        this.canvas.width = vw;
        this.canvas.height = vh;
      }
      const w = this.canvas.width;
      const h = this.canvas.height;
      this.ctx.clearRect(0, 0, w, h);
      this.ctx.save();
      this.ctx.translate(w, 0);
      this.ctx.scale(-1, 1);
      this.ctx.drawImage(this.video, 0, 0, w, h);
      this.ctx.restore();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }
}
