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
let nativeLensApplyQueue: Promise<void> = Promise.resolve();

type KidiCameraKitPlugin = {
  getStatus(): Promise<{
    ready: boolean;
    initialized: boolean;
    sessionStarted: boolean;
    captureRunning: boolean;
    publishing?: boolean;
    frameCount?: number;
    lastFrameAgeMs?: number;
  }>;
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
let nativeDisabled = false; // set when the native path proves unusable
let detectionLogged = false;
/** A single stall used to kill the native path for the WHOLE app session: the
 * module flag never reset, so every later live on Android reported "Camera Kit
 * non supporté" and no native call was ever made again (visible in Logcat as a
 * live that publishes a raw WebRTC track with zero KidiCameraKit calls). Allow
 * a bounded number of retries, one per new broadcast session. */
let nativeFailureCount = 0;
const MAX_NATIVE_FAILURES = 3;

function pluginFromWindow(): unknown {
  try {
    const cap = (globalThis as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } })
      .Capacitor;
    return cap?.Plugins?.["KidiCameraKit"] ?? null;
  } catch {
    return null;
  }
}

function hasNativePluginImpl(): boolean {
  try {
    if (nativeDisabled) return false;
    if (!Capacitor.isNativePlatform()) return false;
    // iOS stays safety-gated until its publisher also acknowledges real frames.
    // Android has frame-level acknowledgement in KidiCameraKitPlugin.
    if (Capacitor.getPlatform() !== "android") return false;
    // `isPluginAvailable` only knows about plugins listed in the Capacitor
    // registry; our app-level plugin is registered manually, so also look it
    // up directly on `window.Capacitor.Plugins`.
    const available =
      Capacitor.isPluginAvailable("KidiCameraKit") || !!pluginFromWindow();
    if (!detectionLogged) {
      detectionLogged = true;
      console.info(
        "[native-camera-kit] detection",
        JSON.stringify({
          platform: Capacitor.getPlatform(),
          isPluginAvailable: Capacitor.isPluginAvailable("KidiCameraKit"),
          onWindow: !!pluginFromWindow(),
          available,
        }),
      );
    }
    return available;
  } catch {
    return false;
  }
}

const NATIVE_METHODS = [
  "getStatus",
  "initialize",
  "loadLenses",
  "applyLens",
  "clearLens",
  "startPreview",
  "stopPreview",
  "setPublishEnabled",
] as const;

/** Direct bridge call. `registerPlugin()` only routes to native when the plugin
 * appears in `Capacitor.PluginHeaders`; KidiCameraKit is registered manually on
 * the bridge (capacitorDidLoad), so its header is missing and the generated
 * proxy rejects with "not implemented on ios" WITHOUT ever reaching Swift —
 * exactly the silent fallback seen in Xcode. `Capacitor.nativePromise` talks to
 * the bridge directly and always reaches the Swift method. */
function nativePromiseBridge(): KidiCameraKitPlugin | null {
  const cap = (globalThis as unknown as {
    Capacitor?: { nativePromise?: (p: string, m: string, o?: unknown) => Promise<unknown> };
  }).Capacitor;
  if (typeof cap?.nativePromise !== "function") return null;
  const call = cap.nativePromise.bind(cap);
  const obj = {} as Record<string, (o?: unknown) => Promise<unknown>>;
  for (const m of NATIVE_METHODS) {
    obj[m] = (o?: unknown) => call("KidiCameraKit", m, o ?? {});
  }
  return obj as unknown as KidiCameraKitPlugin;
}

async function getNativePlugin(): Promise<KidiCameraKitPlugin | null> {
  if (nativeDisabled) return null;
  if (nativePlugin) return nativePlugin;
  if (!hasNativePluginImpl()) return null;

  // 1) Plugin object injected by the native bridge (routes straight to Swift).
  const fromWindow = pluginFromWindow() as KidiCameraKitPlugin | null;
  if (fromWindow && typeof fromWindow.initialize === "function") {
    console.info("[native-camera-kit] using window.Capacitor.Plugins.KidiCameraKit");
    nativePlugin = fromWindow;
    return nativePlugin;
  }

  // 2) Low-level bridge call (works even without a PluginHeader entry).
  const bridged = nativePromiseBridge();
  if (bridged) {
    console.info("[native-camera-kit] using Capacitor.nativePromise bridge");
    nativePlugin = bridged;
    return nativePlugin;
  }

  // 3) Last resort: standard registration.
  try {
    const { registerPlugin } = await import("@capacitor/core");
    console.info("[native-camera-kit] using registerPlugin proxy");
    nativePlugin = registerPlugin<KidiCameraKitPlugin>("KidiCameraKit");
    return nativePlugin;
  } catch (e) {
    console.warn("[native-camera-kit] plugin registration failed", errMsg(e));
    return null;
  }
}


/** Capacitor's console proxy stringifies Errors as `{}` — always log a string
 * so Xcode/Logcat show the real reason instead of an empty object. */
export function errMsg(e: unknown): string {
  if (!e) return "unknown error";
  if (typeof e === "string") return e;
  const o = e as { message?: unknown; errorMessage?: unknown; code?: unknown };
  const msg = o.message ?? o.errorMessage;
  if (typeof msg === "string" && msg) {
    return o.code ? `${msg} (code=${String(o.code)})` : msg;
  }
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

/** A missing/broken native implementation must not strand the host on a black
 * screen: disable the native path for the rest of the session and let the web
 * pipeline take over. */
function disableNative(reason: unknown): void {
  if (nativeDisabled) return;
  nativeDisabled = true;
  console.warn("[native-camera-kit] disabled, falling back to web:", errMsg(reason));
}

export function disableNativeCameraKit(reason: unknown): void {
  disableNative(reason);
}

export async function getNativeCameraKitHealth(): Promise<{
  publishing: boolean;
  frameCount: number;
  lastFrameAgeMs: number;
} | null> {
  const plugin = await getNativePlugin();
  if (!plugin) return null;
  const status = await plugin.getStatus();
  return {
    publishing: status.publishing === true,
    frameCount: status.frameCount ?? 0,
    lastFrameAgeMs: status.lastFrameAgeMs ?? 0,
  };
}

function isUnimplemented(e: unknown): boolean {
  return /not implemented|unimplemented|not available|UNIMPLEMENTED/i.test(errMsg(e));
}



export function isNativeCameraKitAvailable(): boolean {
  return hasNativePluginImpl();
}

/**
 * Boots the native Snap session ahead of time (plugin registration +
 * `initialize` + lens list). Called when the broadcast screen mounts so the
 * Xcode/Logcat trace shows `KidiCameraKit initialize` immediately and any
 * failure disables the native path BEFORE the host taps "go live".
 */
export async function waitForNativeCameraKit(): Promise<boolean> {
  return warmupNativeCameraKit();
}

export async function warmupNativeCameraKit(_reason?: string): Promise<boolean> {
  const plugin = await getNativePlugin();
  if (!plugin) {
    console.info("[native-camera-kit] warmup skipped (no native plugin)");
    return false;
  }
  const token = snapApiToken();
  if (!token) {
    disableNative("missing VITE_SNAP_CAMERA_KIT_API_TOKEN");
    return false;
  }
  try {
    console.info("[native-camera-kit] warmup initialize()", SNAP_LENS_GROUP_IDS.join(","));
    await plugin.initialize({ apiToken: token, groupIds: SNAP_LENS_GROUP_IDS });
    const lenses = await loadBridgeLenses();
    console.info(`[native-camera-kit] warmup ok, ${lenses.length} lens(es)`);
    return !nativeDisabled;
  } catch (e) {
    console.warn("[native-camera-kit] warmup error", errMsg(e));
    disableNative(e);
    return false;
  }
}


export function isCameraKitSupported(): boolean {
  if (!Capacitor.isNativePlatform()) return isWebCameraKitSupported();
  // iOS natif : le plugin Snap natif est safety-gated (voir hasNativePluginImpl),
  // mais le pipeline WEB Camera Kit (WASM + TrackProcessor LiveKit) est le
  // chemin filtres éprouvé sur iPhone. Ne JAMAIS renvoyer false ici : c'est
  // ce qui affichait « Camera Kit non supporté sur cet appareil » et faisait
  // disparaître tous les filtres du carrousel.
  if (Capacitor.getPlatform() === "ios") return isWebCameraKitSupported();
  // Android natif : plugin natif (GPU) uniquement — le pipeline web y fige
  // l'image, il ne sert que de secours lens-list côté bridge.
  return hasNativePluginImpl();
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
    nativeLensesPromise = loadNativeLenses(plugin).catch(async (e) => {
      // Native SDK missing/erroring → never leave the carousel empty.
      disableNative(e);
      return loadWebLenses();
    });
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
  console.info("[native-camera-kit] initialize()", SNAP_LENS_GROUP_IDS.join(","));
  await plugin.initialize({ apiToken: token, groupIds: SNAP_LENS_GROUP_IDS });
  const res = await plugin.loadLenses({ groupIds: SNAP_LENS_GROUP_IDS });
  console.info(`[native-camera-kit] ${res.lenses?.length ?? 0} lens(es) loaded`);
  if (!res.lenses?.length) throw new Error("native returned 0 lenses");
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
    nativeLensApplyQueue = nativeLensApplyQueue
      .catch(() => {})
      .then(async () => {
        try {
          await plugin.applyLens({ lensId: lens.lensId, groupId: lens.groupId });
        } catch (e) {
          if (isUnimplemented(e)) disableNative(e);
          throw e;
        }
      });
    return nativeLensApplyQueue;
  }
  // Web : la lens est appliquée par le pipeline en cours (voir broadcast-video).
}

export async function clearBridgeLens(): Promise<void> {
  const plugin = await getNativePlugin();
  if (!plugin) return;
  try {
    await plugin.clearLens();
  } catch (e) {
    if (isUnimplemented(e)) disableNative(e);
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
  /** Relais du watchdog frame-level : sortie figée malgré les reprises. */
  onFatalStall?: () => void;
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
  // Cleanup must still reach the cached plugin after it has been disabled;
  // otherwise its native camera remains open and blocks the raw fallback.
  const plugin = !args.enabled && nativePlugin
    ? nativePlugin
    : await getNativePlugin();
  if (!plugin) return; // web : la publication est gérée par broadcast-video
  try {
    if (args.enabled) {
      // Live can start before the filter carousel — always warm the Snap session.
      const token = snapApiToken();
      if (!token) throw new Error("VITE_SNAP_CAMERA_KIT_API_TOKEN is not configured");
      await plugin.initialize({ apiToken: token, groupIds: SNAP_LENS_GROUP_IDS });
    }
    console.info("[native-camera-kit] setPublishEnabled", args.enabled);
    await plugin.setPublishEnabled(args);
  } catch (e) {
    if (isUnimplemented(e)) disableNative(e);
    throw e;
  }
}

/** Démarre/arrête l'aperçu natif (affichage du flux filtré). */
export async function setNativePreview(args: {
  active: boolean;
  mirrored?: boolean;
  facing?: "user" | "environment";
}): Promise<void> {
  const plugin = !args.active && nativePlugin
    ? nativePlugin
    : await getNativePlugin();
  if (!plugin) return;
  try {
    if (args.active) {
      const token = snapApiToken();
      if (token) {
        await plugin.initialize({ apiToken: token, groupIds: SNAP_LENS_GROUP_IDS });
      }
      console.info("[native-camera-kit] startPreview", args.facing ?? "user");
      await plugin.startPreview({
        mirrored: args.mirrored ?? false,
        facing: args.facing ?? "user",
      });
    } else {
      await plugin.stopPreview();
    }
  } catch (e) {
    if (isUnimplemented(e)) disableNative(e);
    throw e;
  }

}
