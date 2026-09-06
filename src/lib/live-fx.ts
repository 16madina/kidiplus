/**
 * Small, transport-safe description of the visual layer of a live.
 *
 * CameraKit/Snap effects are baked into the published video track. The
 * metadata here is for the parts a viewer can reliably reconstruct on top of
 * that track (poster, tint and a background treatment). Never accept local
 * file/blob URLs from a realtime payload: another device cannot load them.
 */

export type PosterMode = "off" | "cover";
export type BackgroundMode = "none" | "blur" | "image";
export type PosterTransform = { x: number; y: number; scale: number };

const DEFAULT_POSTER_TRANSFORM: PosterTransform = { x: 0.5, y: 0.4, scale: 1 };

const POSTER_MODES = new Set<PosterMode>(["off", "cover"]);
const BACKGROUND_MODES = new Set<BackgroundMode>(["none", "blur", "image"]);

export const LIVE_FX_EVENT = "live:fx";
export const LIVE_FX_REQUEST_EVENT = "live:fx:request";
export const LIVE_FX_VERSION = 1;

export function liveFxChannelName(liveId: string): string {
  return `live-fx:${liveId}`;
}

export type LiveFxPayload = {
  v: typeof LIVE_FX_VERSION;
  posterUrl: string | null;
  posterMode: PosterMode;
  posterX: number;
  posterY: number;
  posterScale: number;
  backgroundMode: BackgroundMode;
  backgroundUrl: string | null;
  lensId: string;
  lensName: string;
  tint: string;
};

export const EMPTY_LIVE_FX: LiveFxPayload = {
  v: LIVE_FX_VERSION,
  posterUrl: null,
  posterMode: "off",
  posterX: DEFAULT_POSTER_TRANSFORM.x,
  posterY: DEFAULT_POSTER_TRANSFORM.y,
  posterScale: DEFAULT_POSTER_TRANSFORM.scale,
  backgroundMode: "none",
  backgroundUrl: null,
  lensId: "none",
  lensName: "",
  tint: "transparent",
};

function clipString(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function remoteImageUrl(value: unknown): string | null {
  if (typeof value !== "string" || !/^https:\/\//i.test(value)) return null;
  return value.slice(0, 2_048);
}

function safeCssColor(value: unknown): string {
  const color = clipString(value, 64).trim();
  if (!color) return "transparent";
  if (/^transparent$/i.test(color)) return "transparent";
  if (/^#[0-9a-f]{3,8}$/i.test(color)) return color;
  if (/^(?:rgb|hsl)a?\([\d.,%+\-\s]+\)$/i.test(color)) return color;
  return "transparent";
}

export function clampPosterTransform(input: PosterTransform): PosterTransform {
  const finite = (value: number, fallback: number) => (Number.isFinite(value) ? value : fallback);
  return {
    x: Math.min(0.95, Math.max(0.05, finite(input.x, DEFAULT_POSTER_TRANSFORM.x))),
    y: Math.min(0.95, Math.max(0.05, finite(input.y, DEFAULT_POSTER_TRANSFORM.y))),
    scale: Math.min(3, Math.max(0.35, finite(input.scale, DEFAULT_POSTER_TRANSFORM.scale))),
  };
}

/** Normalize untrusted Realtime data before it reaches the viewer UI. */
export function sanitizeLiveFx(input: Partial<LiveFxPayload> | null | undefined): LiveFxPayload {
  const posterMode = POSTER_MODES.has(input?.posterMode as PosterMode)
    ? (input!.posterMode as PosterMode)
    : "off";
  const backgroundMode = BACKGROUND_MODES.has(input?.backgroundMode as BackgroundMode)
    ? (input!.backgroundMode as BackgroundMode)
    : "none";
  const transform = clampPosterTransform({
    x: Number(input?.posterX),
    y: Number(input?.posterY),
    scale: Number(input?.posterScale),
  });
  const posterUrl = remoteImageUrl(input?.posterUrl);

  return {
    v: LIVE_FX_VERSION,
    posterUrl: posterMode === "cover" ? posterUrl : null,
    posterMode: posterUrl && posterMode === "cover" ? "cover" : "off",
    posterX: transform.x,
    posterY: transform.y,
    posterScale: transform.scale,
    backgroundMode,
    backgroundUrl: backgroundMode === "image" ? remoteImageUrl(input?.backgroundUrl) : null,
    lensId: clipString(input?.lensId, 80) || "none",
    lensName: clipString(input?.lensName, 40),
    tint: safeCssColor(input?.tint),
  };
}

export function posterTransformOf(fx: LiveFxPayload): PosterTransform {
  return clampPosterTransform({
    x: fx.posterX,
    y: fx.posterY,
    scale: fx.posterScale,
  });
}

export function liveFxHasVisual(fx: LiveFxPayload): boolean {
  return (
    (fx.posterMode === "cover" && !!fx.posterUrl) ||
    fx.backgroundMode !== "none" ||
    (fx.tint !== "" && fx.tint !== "transparent")
  );
}
