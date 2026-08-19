// Pont unifié Snap Camera Kit : web (WASM) vs natif (iOS/Android SDK).
//
// Ce module expose une seule API TypeScript pour le reste de l'app. Selon la
// plateforme, il délègue au SDK web (`@snap/camera-kit`) ou au plugin Capacitor
// natif (`KidiCameraKit`). Le plugin natif gère lui-même la capture caméra,
// l'application de lens et la publication LiveKit côté natif — ce qui soulage
// le CPU de la WebView et corrige les saccades constatées sur iPhone 15 Pro Max.
//
// Sur le web / PWA, le SDK web reste utilisé : pipeline canvas + TrackProcessor
// LiveKit (voir `camera-kit.ts` et `camera-kit-processor.ts`).

import { Capacitor } from "@capacitor/core";
import type { Lens } from "./lenses-catalog";
import {
  isCameraKitSupported as isWebCameraKitSupported,
  loadSnapLenses as loadWebSnapLenses,
  clearSnapLensesCache as clearWebLensesCache,
  snapApiToken,
  SNAP_LENS_GROUP_ID,
  SNAP_LENS_GROUP_IDS,
  createCameraKitPipeline,
  type CameraKitPipeline,
} from "./camera-kit";

export type { CameraKitPipeline };

// ---------------------------------------------------------------------------
// Détection du plugin natif
// ---------------------------------------------------------------------------

let nativePlugin: KidiCameraKitPlugin | null = null;

type KidiCameraKitPlugin = {
  initialize(options: { apiToken: string; groupIds: string[] }): Promise<void>;
  loadLenses(options: { groupIds: string[] }): Promise<{
    lenses: Array<{
      id: string;
      groupId: string;
      name: string;
      iconUrl?: string;
      previewUrl?: string;
    }>;
  }>;
  applyLens(options: { lensId: string; groupId: string }): Promise<void>;
  clearLens(): Promise<void>;
  startPreview(options: { mirrored: boolean; facing: "user" | "environment" }): Promise<void>;
  stopPreview(): Promise<void>;
  setPublishEnabled(options: {
    enabled: boolean;
    roomUrl?: string;
    token?: string;
  }): Promise<void>;
};

/**
 * Le plugin natif n'existe que si l'implémentation iOS/Android est réellement
 * embarquée dans le build. `registerPlugin()` réussit toujours (proxy JS), donc
 * il FAUT vérifier `isPluginAvailable` : sinon, sur un build natif sans le
 * plugin compilé, on bascule sur un chemin natif fantôme et la caméra reste
 * bloquée sur « Connexion au live… ».
 */
function hasNativePluginImpl(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("KidiCameraKit");
  } catch {
    return false;
  }
}

async function getNativePlugin(): Promise<KidiCameraKitPlugin | null> {
  if (nativePlugin) return nativePlugin;
  if (!hasNativePluginImpl()) return null;
  try {
    const { registerPlugin } = await import("@capacitor/core");
    nativePlugin = registerPlugin<KidiCameraKitPlugin>("KidiCameraKit");
    return nativePlugin;
  } catch (e) {
    console.warn("[native-camera-kit] plugin registration failed", e);
    return null;
  }
}

export function isNativeCameraKitAvailable(): boolean {
  return hasNativePluginImpl();
}

export function isCameraKitSupported(): boolean {
  if (hasNativePluginImpl()) return true; // le plugin natif fournit le support
  return isWebCameraKitSupported();
}

// ---------------------------------------------------------------------------
// Chargement des lenses
// ---------------------------------------------------------------------------

export type BridgeLens = {
  lensId: string;
  groupId: string;
  name: string;
  iconUrl?: string;
  previewUrl?: string;
};

let nativeLensesPromise: Promise<BridgeLens[]> | null = null;
let nativeLensesCache: BridgeLens[] | null = null;

export async function loadBridgeLenses(force = false): Promise<BridgeLens[]> {
  if (force) {
    nativeLensesPromise = null;
    nativeLensesCache = null;
    clearWebLensesCache();
  }
  if (nativeLensesCache) return nativeLensesCache;
  if (nativeLensesPromise) return nativeLensesPromise;

  const plugin = await getNativePlugin();
  if (plugin) {
    nativeLensesPromise = loadNativeLenses(plugin);
  } else {
    nativeLensesPromise = loadWebLenses();
  }

  nativeLensesPromise
    .then((lenses) => {
      nativeLensesCache = lenses;
    })
    .catch(() => {
      nativeLensesPromise = null;
    });

  return nativeLensesPromise;
}

async function loadNativeLenses(plugin: KidiCameraKitPlugin): Promise<BridgeLens[]> {
  const token = snapApiToken();
  if (!token) throw new Error("VITE_SNAP_CAMERA_KIT_API_TOKEN is not configured");
  await plugin.initialize({ apiToken: token, groupIds: SNAP_LENS_GROUP_IDS });
  const res = await plugin.loadLenses({ groupIds: SNAP_LENS_GROUP_IDS });
  console.info(`[native-camera-kit] ${res.lenses.length} lens(es) loaded`);
  return res.lenses.map((l) => ({
    lensId: l.id,
    groupId: l.groupId || SNAP_LENS_GROUP_ID,
    name: l.name || "Lens",
    iconUrl: l.iconUrl,
    previewUrl: l.previewUrl,
  }));
}

async function loadWebLenses(): Promise<BridgeLens[]> {
  const lenses = await loadWebSnapLenses(false);
  return lenses.map((l) => ({
    lensId: l.id,
    groupId: l.groupId || SNAP_LENS_GROUP_ID,
    name: l.name || "Lens",
    iconUrl: l.iconUrl || l.preview?.imageUrl,
  }));
}

export function clearBridgeLensesCache(): void {
  nativeLensesPromise = null;
  nativeLensesCache = null;
  clearWebLensesCache();
}

// ---------------------------------------------------------------------------
// Application / retrait d'une lens
// ---------------------------------------------------------------------------

export async function applyBridgeLens(lens: Lens): Promise<void> {
  if (lens.lensId === "none") {
    await clearBridgeLens();
    return;
  }
  const plugin = await getNativePlugin();
  if (plugin) {
    await plugin.applyLens({ lensId: lens.lensId, groupId: lens.groupId });
    return;
  }
  // Web : la lens est appliquée par le pipeline en cours (voir broadcast-video).
}

export async function clearBridgeLens(): Promise<void> {
  const plugin = await getNativePlugin();
  if (plugin) {
    await plugin.clearLens();
  }
}

// ---------------------------------------------------------------------------
// Preview / pipeline web
// ---------------------------------------------------------------------------

/** Crée un pipeline web Camera Kit (canvas + captureStream). Sur natif, cette
 * fonction n'est pas utilisée : le plugin natif gère sa propre preview. */
export async function createBridgeWebPipeline(args: {
  source: MediaStreamTrack;
  mirror: boolean;
  cameraType: "user" | "environment";
  fps?: number;
  maxLongSide?: number;
}): Promise<CameraKitPipeline> {
  return createCameraKitPipeline(args);
}

// ---------------------------------------------------------------------------
// Contrôle de la publication native LiveKit
// ---------------------------------------------------------------------------

/** Active/désactive la publication LiveKit côté natif. C'est le plugin iOS/
 * Android qui publie la vidéo filtrée, pas le SDK web LiveKit. */
export async function setNativePublishEnabled(args: {
  enabled: boolean;
  roomUrl?: string;
  token?: string;
}): Promise<void> {
  const plugin = await getNativePlugin();
  if (!plugin) return; // web : la publication est gérée par broadcast-video
  await plugin.setPublishEnabled(args);
}

/** Démarre/arrête l'aperçu natif (affichage du flux filtré). */
export async function setNativePreview(args: {
  active: boolean;
  mirrored?: boolean;
  facing?: "user" | "environment";
}): Promise<void> {
  const plugin = await getNativePlugin();
  if (!plugin) return;
  if (args.active) {
    await plugin.startPreview({
      mirrored: args.mirrored ?? false,
      facing: args.facing ?? "user",
    });
  } else {
    await plugin.stopPreview();
  }
}
