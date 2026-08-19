// TrackProcessor LiveKit qui fait passer la caméra du host par Snap Camera Kit.
//
// Même mécanique que MirrorVideoProcessor : LiveKit nous donne la piste caméra
// brute, on renvoie la piste filtrée (canvas.captureStream). La piste publiée
// aux viewers contient donc le filtre AR rendu en temps réel.
//
// Le miroir selfie est géré ici aussi (Transform2D.MirrorX) puisque LiveKit
// n'accepte qu'un seul processor par piste.

import type { Track, TrackProcessor, VideoProcessorOptions } from "livekit-client";
import {
  createBridgeWebPipeline,
  type CameraKitPipeline,
} from "@/lib/filters/native-camera-kit-bridge";

export class CameraKitVideoProcessor
  implements TrackProcessor<Track.Kind.Video, VideoProcessorOptions>
{
  readonly name = "snap-camera-kit";
  processedTrack?: MediaStreamTrack;

  private pipeline: CameraKitPipeline | null = null;
  private lensId: string;
  private groupId: string | undefined;
  private mirror: boolean;

  constructor(args: { lensId: string; groupId?: string; mirror: boolean }) {
    this.lensId = args.lensId;
    this.groupId = args.groupId;
    this.mirror = args.mirror;
  }

  async init(opts: VideoProcessorOptions): Promise<void> {
    await this.start(opts.track);
  }

  async restart(opts: VideoProcessorOptions): Promise<void> {
    await this.destroy();
    await this.start(opts.track);
  }

  async destroy(): Promise<void> {
    const p = this.pipeline;
    this.pipeline = null;
    this.processedTrack = undefined;
    if (p) await p.destroy().catch(() => {});
  }

  /** Change la lens à chaud, sans re-créer la session ni republier la piste. */
  async setLens(lensId: string, groupId?: string): Promise<void> {
    this.lensId = lensId;
    this.groupId = groupId;
    if (this.pipeline) await this.pipeline.setLens(lensId, groupId);
  }

  private async start(source: MediaStreamTrack): Promise<void> {
    const pipeline = await createCameraKitPipeline({
      source,
      mirror: this.mirror,
      cameraType: this.mirror ? "user" : "environment",
    });
    this.pipeline = pipeline;
    this.processedTrack = pipeline.outputTrack;
    await pipeline.setLens(this.lensId, this.groupId).catch((e) => {
      console.warn("[camera-kit] applyLens failed", e);
    });
  }
}
