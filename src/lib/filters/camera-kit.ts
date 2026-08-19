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

function readEnv(key: string): string {
  try {
    const v = (import.meta.env as Record<string, string | undefined>)[key];
    return (v ?? "").trim();
  } catch {
    return "";
  }
}

/**
 * Snap Camera Kit API token for the KiDi+ Web app.
 *
 * Paste the Staging token in .env / .env.production as
 * VITE_SNAP_CAMERA_KIT_API_TOKEN. The production token will be configured
 * later, once Snap approves Production Camera Kit status for kidiplus.com.
 */
export function snapApiToken(): string {
  return readEnv("VITE_SNAP_CAMERA_KIT_API_TOKEN");
}

export function isSnapProductionToken(): boolean {
  const t = snapApiToken();
  const payload = t.split(".")[1];
  if (!payload) return false;
  try {
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return json.includes("~PRODUCTION~");
  } catch {
    return false;
  }
}


/** Lens Group displayed in the Filters carousel — KiDi+ Web "test 1" group.
 * Add/remove lenses on my-lenses.snapchat.com ; they appear in-app without
 * code changes. Configure via VITE_SNAP_LENS_GROUP_ID. */
export const SNAP_LENS_GROUP_ID =
  readEnv("VITE_SNAP_LENS_GROUP_ID") || "df287f43-6646-4b01-a711-1a0e632c211a";

/** Unique groupe chargé par défaut. L'utilisateur ajoutera ses futurs filtres
 * directement dans ce groupe. Configurable via VITE_SNAP_LENS_GROUP_IDS
 * (liste séparée par des virgules) pour charger des groupes additionnels. */
export const SNAP_LENS_GROUP_IDS: string[] = Array.from(
  new Set(
    [
      SNAP_LENS_GROUP_ID,
      ...readEnv("VITE_SNAP_LENS_GROUP_IDS")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ].filter(Boolean),
  ),
);

/** Supporté = WebGL2 + WebAssembly + un token Camera Kit configuré.
 * Si le token est vide, le carrousel tombe automatiquement sur les filtres CSS. */
export function isCameraKitSupported(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof WebAssembly === "undefined") return false;
  if (!snapApiToken()) return false;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    return !!gl;
  } catch {
    return false;
  }
}

let bootstrapPromise: Promise<CameraKit> | null = null;

/** Bootstrap paresseux (télécharge le runtime WASM au premier appel).
 * Nécessite que VITE_SNAP_CAMERA_KIT_API_TOKEN soit renseigné. */
export function getCameraKit(): Promise<CameraKit> {
  const token = snapApiToken();
  if (!token) {
    return Promise.reject(
      new Error("VITE_SNAP_CAMERA_KIT_API_TOKEN is not configured"),
    );
  }
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      const { bootstrapCameraKit } = await import("@snap/camera-kit");
      return bootstrapCameraKit({ apiToken: token });
    })().catch((e) => {
      bootstrapPromise = null; // permettre un retry au prochain appel
      throw e;
    });
  }
  return bootstrapPromise;
}

let lensesCache: SnapLens[] | null = null;
let lensesPromise: Promise<SnapLens[]> | null = null;

/** Vide le cache mémoire des lenses (pour re-télécharger le groupe). */
export function clearSnapLensesCache(): void {
  lensesCache = null;
  lensesPromise = null;
}

/** Charge (et met en cache) les lenses du groupe KIDI+. */
export function loadSnapLenses(force = false): Promise<SnapLens[]> {
  if (force) clearSnapLensesCache();
  if (lensesCache) return Promise.resolve(lensesCache);
  if (!lensesPromise) {
    lensesPromise = (async () => {
      const cameraKit = await getCameraKit();
      const { lenses, errors } =
        await cameraKit.lensRepository.loadLensGroups(SNAP_LENS_GROUP_IDS);
      if (errors.length) {
        console.warn("[camera-kit] lens group load errors", errors.map(String));
      }
      console.info(
        `[camera-kit] groups ${SNAP_LENS_GROUP_IDS.join(", ")}: ${lenses.length} lens(es)`,
        lenses.map((l) => `${l.name} (${l.groupId})`),
      );
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

/** Appareil "modeste" : très peu de cœurs CPU → on rend le filtre plus petit.
 * Attention : iOS (iPhone 13→16) expose souvent 6 cœurs tout en étant très
 * puissant ; on ne les dégrade donc PAS d'office, une mesure de FPS réelle
 * (voir plus bas) décide d'un éventuel repli. */
function lowPowerDevice(): boolean {
  try {
    const ua = navigator.userAgent || "";
    const isApple = /iPhone|iPad|Macintosh/.test(ua);
    const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
    const cores = navigator.hardwareConcurrency ?? 4;
    if (isApple) return cores <= 4; // A9/A10 et plus anciens uniquement
    if (typeof mem === "number" && mem <= 3) return true;
    return cores <= 4;
  } catch {
    return false;
  }
}


export async function createCameraKitPipeline(args: {
  source: MediaStreamTrack;
  /** Miroir selfie horizontal appliqué au rendu (caméra avant publiée). */
  mirror: boolean;
  cameraType: "user" | "environment";
  fps?: number;
  /** Plafond du plus grand côté du rendu AR (défaut : 1280, 960 si mobile modeste). */
  maxLongSide?: number;
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

  const fps = args.fps ?? (lowPowerDevice() ? 24 : 30);
  await session.setFPSLimit(fps).catch(() => {});

  await session.play("live");

  // Plafonne la résolution de rendu AR (après play, requis par le SDK).
  try {
    const s = args.source.getSettings();
    const sw = s.width ?? 720;
    const sh = s.height ?? 1280;
    const cap = args.maxLongSide ?? (lowPowerDevice() ? 960 : 1280);
    const long = Math.max(sw, sh);
    if (long > cap) {
      const k = cap / long;
      await source.setRenderSize(Math.round(sw * k), Math.round(sh * k));
    }
  } catch (e) {
    console.warn("[camera-kit] setRenderSize failed", e);
  }

  const canvas = session.output.live;
  const out = canvas.captureStream(fps);
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
