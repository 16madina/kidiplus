// Aperçu Camera Kit (mode setup, avant le live).
//
// Quand une vraie lens Snap est active, ce composant fait passer le flux
// caméra local par le moteur AR et affiche le canvas de rendu par-dessus le
// <video> brut. Le miroir selfie est appliqué en CSS (comme le <video>).

import { useEffect, useRef, useState } from "react";
import type { Lens } from "@/lib/filters/lenses-catalog";
import {
  createCameraKitPipeline,
  isCameraKitSupported,
  type CameraKitPipeline,
} from "@/lib/filters/camera-kit";

export function CameraKitPreview({
  stream,
  lens,
  mirrored,
}: {
  stream: MediaStream | null;
  lens: Lens;
  mirrored: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pipelineRef = useRef<CameraKitPipeline | null>(null);
  const [ready, setReady] = useState(false);

  const track = stream?.getVideoTracks()[0] ?? null;
  const active = !!track && lens.isSnapLens === true && isCameraKitSupported();

  // Crée/détruit le pipeline quand le flux change.
  useEffect(() => {
    if (!active || !track) return;
    let cancelled = false;
    setReady(false);

    void (async () => {
      try {
        const pipeline = await createCameraKitPipeline({
          source: track,
          mirror: false, // miroir géré en CSS pour l'aperçu
          cameraType: mirrored ? "user" : "environment",
        });
        if (cancelled) {
          await pipeline.destroy();
          return;
        }
        pipelineRef.current = pipeline;
        const el = containerRef.current;
        if (el) {
          pipeline.canvas.style.width = "100%";
          pipeline.canvas.style.height = "100%";
          pipeline.canvas.style.objectFit = "cover";
          el.replaceChildren(pipeline.canvas);
        }
        await pipeline.setLens(lens.lensId, lens.groupId);
        if (!cancelled) setReady(true);
      } catch (e) {
        console.warn("[camera-kit] preview pipeline failed", e);
      }
    })();

    return () => {
      cancelled = true;
      const p = pipelineRef.current;
      pipelineRef.current = null;
      if (p) void p.destroy();
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, track]);

  // Changement de lens à chaud sur le pipeline existant.
  useEffect(() => {
    const p = pipelineRef.current;
    if (!p || !active) return;
    void p.setLens(lens.lensId, lens.groupId).catch((e) => {
      console.warn("[camera-kit] preview setLens failed", e);
    });
  }, [lens.lensId, lens.groupId, active]);

  if (!active) return null;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{
        transform: mirrored ? "scaleX(-1)" : undefined,
        opacity: ready ? 1 : 0,
        transition: "opacity 0.2s ease",
      }}
    />
  );
}
