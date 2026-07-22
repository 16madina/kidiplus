// Snap Camera Kit (Web SDK) — bootstrap + chargement des lenses + pipeline.
//
// Le SDK tourne en WebAssembly directement dans le navigateur / la WebView
// Capacitor : vrai suivi du visage, maquillage, masques 3D — le même moteur
// AR que l'app Snapchat. Pas de plugin natif nécessaire.
//
// Pipeline : caméra (MediaStreamTrack) → CameraKitSession (applique la lens,
// rend sur un <canvas>) → canvas.captureStream() → piste vidéo filtrée.
// - En preview (avant le live) : le canvas est affiché à la place du <video>.
// - En live : la piste filtrée remplace la piste caméra publiée sur LiveKit
//   via un TrackProcessor (voir camera-kit-processor.ts) — les viewers voient
//   le filtre en temps réel.
//
// Tokens : les tokens API Camera Kit sont des jetons clients publics (ils
// sont embarqués dans les apps mobiles de la même façon). Le token staging
// affiche un filigrane "Camera Kit Staging" ; après validation de l'app par
// Snap, basculer sur le token production (VITE_SNAP_CAMERA_KIT_API_TOKEN).

import type { CameraKit, CameraKitSession, Lens as SnapLens } from "@snap/camera-kit";

// Client-side Camera Kit tokens (public JWT, same model as native embeds).
const STAGING_API_TOKEN =
  "eyJhbGciOiJIUzI1NiIsImtpZCI6IkNhbnZhc1MyU0hNQUNQcm9kIiwidHlwIjoiSldUIn0.eyJhdWQiOiJjYW52YXMtY2FudmFzYXBpIiwiaXNzIjoiY2FudmFzLXMyc3Rva2VuIiwibmJmIjoxNzg0MDQzNzkxLCJzdWIiOiIxOWJhOGM5OC1jMDRhLTRlOTgtOGVkYi04YWM4ZDQyODUzMzN-U1RBR0lOR34zMDk5ZGFjNS01ZGNiLTQ0MzEtYjQ2Ni1kMGE1ZGJiMzhiNTAifQ.TJkEJQDegkU7PiogT3QoedmWYg4mPQsu-Jj60sGALgM";

/** Production token — use after Snap Kit review approval (kit.snapchat.com). */
const PRODUCTION_API_TOKEN =
  "eyJhbGciOiJIUzI1NiIsImtpZCI6IkNhbnZhc1MyU0hNQUNQcm9kIiwidHlwIjoiSldUIn0.eyJhdWQiOiJjYW52YXMtY2FudmFzYXBpIiwiaXNzIjoiY2FudmFzLXMyc3Rva2VuIiwibmJmIjoxNzg0MDQzNzkxLCJzdWIiOiIxOWJhOGM5OC1jMDRhLTRlOTgtOGVkYi04YWM4ZDQyODUzMzN-UFJPRFVDVElPTn43OTRjMjZhNC02ZDg0LTQ5NGYtOGE4Ny04MmZkMmVkZDVmYTUifQ.YE50FTWYfbngNKJGigMDb-I_eVvfASwRF9NRsQ4MD_4";

function readEnv(key: string): string {
  try {
    const v = (import.meta.env as Record<string, string | undefined>)[key];
    return (v ?? "").trim();
  } catch {
    return "";
  }
}

/**
 * Prefer `VITE_SNAP_CAMERA_KIT_API_TOKEN`. In production builds, default to
 * the production token so App Store / kidiplus.com are not stuck on staging
 * (which often fails Trusted Origins / Camera Kit review gates).
 */
export function snapApiToken(): string {
  const fromEnv = readEnv("VITE_SNAP_CAMERA_KIT_API_TOKEN");
  if (fromEnv) return fromEnv;
  try {
    if (import.meta.env.PROD) return PRODUCTION_API_TOKEN;
  } catch {
    /* ignore */
  }
  return STAGING_API_TOKEN;
}

export function isSnapProductionToken(): boolean {
  const t = snapApiToken();
  return t === PRODUCTION_API_TOKEN || t.includes("~PRODUCTION~");
}

/** Groupe de lenses affiché dans le carrousel — groupe "test 1" de KIDI+.
 * Ajoute/retire des lenses sur my-lenses.snapchat.com : elles apparaissent
 * dans l'app automatiquement, sans changement de code. */
export const SNAP_LENS_GROUP_ID =
  readEnv("VITE_SNAP_LENS_GROUP_ID") || "9dd9798c-cef5-443b-a494-af0cc480059e";

/** Supporté = WebGL2 + WebAssembly disponibles (WKWebView iOS + Chrome ok). */
export function isCameraKitSupported(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof WebAssembly === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    return !!gl;
  } catch {
    return false;
  }
}

let bootstrapPromise: Promise<CameraKit> | null = null;

/** Bootstrap paresseux (télécharge le runtime WASM au premier appel). */
export function getCameraKit(): Promise<CameraKit> {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      const { bootstrapCameraKit } = await import("@snap/camera-kit");
      return bootstrapCameraKit({ apiToken: snapApiToken() });
    })().catch((e) => {
      bootstrapPromise = null; // permettre un retry au prochain appel
      throw e;
    });
  }
  return bootstrapPromise;
}

let lensesCache: SnapLens[] | null = null;
let lensesPromise: Promise<SnapLens[]> | null = null;

/** Charge (et met en cache) les lenses du groupe KIDI+. */
export function loadSnapLenses(): Promise<SnapLens[]> {
  if (lensesCache) return Promise.resolve(lensesCache);
  if (!lensesPromise) {
    lensesPromise = (async () => {
      const cameraKit = await getCameraKit();
      const { lenses, errors } = await cameraKit.lensRepository.loadLensGroups([
        SNAP_LENS_GROUP_ID,
      ]);
      if (errors.length) {
        console.warn("[camera-kit] lens group load errors", errors.map(String));
      }
      lensesCache = lenses;
      return lenses;
    })().catch((e) => {
      lensesPromise = null;
      throw e;
    });
  }
  return lensesPromise;
}

// ---------------------------------------------------------------------------
// Pipeline de rendu (une session Camera Kit par flux vidéo)
// ---------------------------------------------------------------------------

export type CameraKitPipeline = {
  /** Canvas où le moteur AR dessine (affichable en preview). */
  canvas: HTMLCanvasElement;
  /** Piste vidéo filtrée (captureStream du canvas) — à publier sur LiveKit. */
  outputTrack: MediaStreamTrack;
  /** Applique une lens du groupe (remplace la précédente). */
  setLens: (lensId: string, groupId?: string) => Promise<void>;
  /** Retire la lens (la vidéo brute continue de passer). */
  clearLens: () => Promise<void>;
  destroy: () => Promise<void>;
};

export async function createCameraKitPipeline(args: {
  source: MediaStreamTrack;
  /** Miroir selfie horizontal appliqué au rendu (caméra avant publiée). */
  mirror: boolean;
  cameraType: "user" | "environment";
  fps?: number;
}): Promise<CameraKitPipeline> {
  const [cameraKit, mod] = await Promise.all([
    getCameraKit(),
    import("@snap/camera-kit"),
  ]);
  const { createMediaStreamSource, Transform2D } = mod;

  const session: CameraKitSession = await cameraKit.createSession();
  session.events.addEventListener("error", (event) => {
    console.warn("[camera-kit] session error", event.detail?.error);
  });

  const stream = new MediaStream([args.source]);
  const source = createMediaStreamSource(stream, {
    cameraType: args.cameraType,
    disableSourceAudio: true,
    ...(args.mirror ? { transform: Transform2D.MirrorX } : {}),
  });
  await session.setSource(source);
  await session.play("live");

  const canvas = session.output.live;
  const out = canvas.captureStream(args.fps ?? 30);
  const outputTrack = out.getVideoTracks()[0];
  if (!outputTrack) {
    await session.destroy().catch(() => {});
    throw new Error("camera-kit: no output track");
  }

  let destroyed = false;
  return {
    canvas,
    outputTrack,
    setLens: async (lensId: string, groupId: string = SNAP_LENS_GROUP_ID) => {
      if (destroyed) return;
      const lens = await cameraKit.lensRepository.loadLens(lensId, groupId);
      await session.applyLens(lens);
    },
    clearLens: async () => {
      if (destroyed) return;
      await session.removeLens();
    },
    destroy: async () => {
      if (destroyed) return;
      destroyed = true;
      try { outputTrack.stop(); } catch { /* ignore */ }
      try { await session.pause("live"); } catch { /* ignore */ }
      try { await session.destroy(); } catch { /* ignore */ }
    },
  };
}
