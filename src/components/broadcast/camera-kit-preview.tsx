// Aperçu Camera Kit (mode setup, avant le live).
//
// Web : pipeline WASM canvas. iOS/Android natif : preview SCSDKCameraKit
// derrière la WebView transparente (pas de double capture caméra).

import { useEffect, useRef, useState } from "react";
import type { Lens } from "@/lib/filters/lenses-catalog";
import {
  applyBridgeLens,
  clearBridgeLens,
  createBridgeWebPipeline,
  isCameraKitSupported,
  isNativeCameraKitAvailable,
  type CameraKitPipeline,
} from "@/lib/filters/native-camera-kit-bridge";

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
  const useNative = isNativeCameraKitAvailable();
  const active =
    lens.isSnapLens === true &&
    isCameraKitSupported() &&
    (useNative || !!track);

  // Natif : le parent (broadcast-video) possède la preview Camera Kit.
  // Ici on applique / retire seulement la lens — un stopPreview ici
  // coupait la caméra au passage setup → live.
  useEffect(() => {
    if (!useNative) return;
    if (!active) {
      void clearBridgeLens().catch(() => {});
      setReady(false);
      return;
    }

    let cancelled = false;
    setReady(false);
    void applyBridgeLens(lens)
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((e: unknown) => {
        console.warn("[camera-kit] native preview lens failed", e);
      });

    return () => {
      cancelled = true;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useNative, active, mirrored]);

  useEffect(() => {
    if (!useNative || !active) return;
    void applyBridgeLens(lens).catch((e: unknown) => {
      console.warn("[camera-kit] native setLens failed", e);
    });
  }, [useNative, active, lens.lensId, lens.groupId, lens]);

  // Web : pipeline canvas.
  useEffect(() => {
    if (useNative) return;
    if (!active || !track) return;
    let cancelled = false;
    setReady(false);

    void (async () => {
      try {
        const pipeline = await createBridgeWebPipeline({
          source: track,
          mirror: false,
          cameraType: mirrored ? "user" : "environment",
          fps: 24,
          maxLongSide: 960,
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
  }, [useNative, active, track]);

  useEffect(() => {
    if (useNative) return;
    const p = pipelineRef.current;
    if (!p || !active) return;
    void p.setLens(lens.lensId, lens.groupId).catch((e: unknown) => {
      console.warn("[camera-kit] preview setLens failed", e);
    });
  }, [useNative, lens.lensId, lens.groupId, active]);

  if (!active) return null;
  if (useNative) {
    // Preview dessinée nativement sous la WebView.
    return (
      <div
        className="absolute inset-0 bg-transparent"
        style={{ opacity: ready ? 1 : 0, transition: "opacity 0.2s ease" }}
        aria-hidden
      />
    );
  }

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
