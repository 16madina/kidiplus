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
let resolveNativePromise: Promise<boolean> | null = null;
let resolvedNativeAvailable: boolean | null = null;

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
  getStatus?(): Promise<{
    ready?: boolean;
    initialized?: boolean;
    sessionStarted?: boolean;
    captureRunning?: boolean;
    plistToken?: boolean;
    plistGroup?: string;
  }>;
  addListener?(
    eventName: "pluginLoaded" | "captureState" | "status",
    callback: (payload: Record<string, unknown>) => void,
  ): Promise<{ remove: () => Promise<void> }>;
};

type WindowCapacitor = {
  getPlatform?: () => string;
  isNativePlatform?: () => boolean;
  isPluginAvailable?: (name: string) => boolean;
  nativePromise?: (plugin: string, method: string, options?: object) => Promise<unknown>;
  Plugins?: Record<string, KidiCameraKitPlugin | undefined>;
  PluginHeaders?: Array<{ name?: string }>;
};

function windowCapacitor(): WindowCapacitor | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { Capacitor?: WindowCapacitor }).Capacitor;
}

function nativeForceOff(): boolean {
  return import.meta.env.VITE_NATIVE_CAMERA_KIT_ENABLED === "false";
}

function isNativeApp(): boolean {
  try {
    if (Capacitor.isNativePlatform()) return true;
    const C = windowCapacitor();
    if (C?.isNativePlatform?.() === true) return true;
    const platform = Capacitor.getPlatform() || C?.getPlatform?.();
    return platform === "ios" || platform === "android";
  } catch {
    return false;
  }
}

function pluginInitializeType(): string {
  const plugin = windowCapacitor()?.Plugins?.KidiCameraKit;
  return typeof plugin?.initialize;
}

function isPluginVisibleNow(): boolean {
  try {
    const C = windowCapacitor();
    if (C?.isNativePlatform?.() && pluginInitializeType() === "function") return true;
    if (Capacitor.isPluginAvailable("KidiCameraKit")) return true;
    if (C?.isPluginAvailable?.("KidiCameraKit") === true) return true;
    if (C?.Plugins && "KidiCameraKit" in C.Plugins) return true;
    return (C?.PluginHeaders ?? []).some((h) => h?.name === "KidiCameraKit");
  } catch {
    return false;
  }
}

function detectionMissReason(): string {
  const C = windowCapacitor();
  if (!C) return "window.Capacitor missing";
  if (C.isNativePlatform?.() !== true && !Capacitor.isNativePlatform()) {
    return `not native (platform=${C.getPlatform?.() || Capacitor.getPlatform()})`;
  }
  if (!C.Plugins) return "Capacitor.Plugins missing";
  if (!C.Plugins.KidiCameraKit) return "Capacitor.Plugins.KidiCameraKit missing";
  if (pluginInitializeType() !== "function") {
    return `initialize is ${pluginInitializeType()}`;
  }
  return "visible";
}

function logNativeProbe(tag: string): void {
  const C = windowCapacitor();
  const detection = {
    tag,
    t: Date.now(),
    why: detectionMissReason(),
    platform: C?.getPlatform?.() || Capacitor.getPlatform(),
    native: C?.isNativePlatform?.() ?? Capacitor.isNativePlatform(),
    available:
      Capacitor.isPluginAvailable("KidiCameraKit") ||
      C?.isPluginAvailable?.("KidiCameraKit") === true,
    hasPlugin: !!C?.Plugins?.KidiCameraKit,
    initializeType: pluginInitializeType(),
    headers: (C?.PluginHeaders ?? []).map((h) => h?.name),
  };
  console.info("[native-camera-kit] detection", detection);
}

function isUnimplementedError(e: unknown): boolean {
  const msg = pluginErrorMessage(e).toLowerCase();
  return msg.includes("not implemented") || msg.includes("unimplemented");
}

function markNativeFailed(reason: string): void {
  console.warn("[native-camera-kit] native disabled:", reason);
  nativePlugin = null;
  resolvedNativeAvailable = false;
  resolveNativePromise = Promise.resolve(false);
}

function fromWindowPlugins(): KidiCameraKitPlugin | null {
  const plugin = windowCapacitor()?.Plugins?.KidiCameraKit;
  if (plugin && typeof plugin.initialize === "function") return plugin;
  return null;
}

function fromNativePromise(): KidiCameraKitPlugin | null {
  const cap = windowCapacitor();
  const nativePromise = cap?.nativePromise?.bind(cap);
  if (!nativePromise) return null;
  const call = (method: string, options: object = {}) =>
    nativePromise("KidiCameraKit", method, options);
  return {
    initialize: (options) => call("initialize", options).then(() => undefined),
    loadLenses: (options) =>
      call("loadLenses", options) as Promise<{
        lenses: Array<{
          id: string;
          groupId: string;
          name: string;
          iconUrl?: string;
          previewUrl?: string;
        }>;
      }>,
    applyLens: (options) => call("applyLens", options).then(() => undefined),
    clearLens: () => call("clearLens").then(() => undefined),
    startPreview: (options) => call("startPreview", options).then(() => undefined),
    stopPreview: () => call("stopPreview").then(() => undefined),
    setPublishEnabled: (options) =>
      call("setPublishEnabled", options).then(() => undefined),
    getStatus: () => call("getStatus") as Promise<{
      ready?: boolean;
      initialized?: boolean;
      sessionStarted?: boolean;
      captureRunning?: boolean;
      plistToken?: boolean;
      plistGroup?: string;
    }>,
  };
}

async function probePlugin(
  plugin: KidiCameraKitPlugin,
  path: string,
): Promise<boolean> {
  if (!plugin.getStatus) return true;
  try {
    const status = await Promise.race([
      plugin.getStatus(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("getStatus timeout")), 1500),
      ),
    ]);
    console.info("[native-camera-kit] getStatus", status);
    return true;
  } catch (e) {
    const errMsg = pluginErrorMessage(e);
    if (isUnimplementedError(e)) {
      console.warn("[native-camera-kit] path broken", { path, errMsg });
      return false;
    }
    console.info("[native-camera-kit] getStatus skipped", { path, errMsg });
    return true;
  }
}

async function bindNativePlugin(): Promise<KidiCameraKitPlugin | null> {
  const windowPlugin = fromWindowPlugins();
  if (windowPlugin && (await probePlugin(windowPlugin, "window.Capacitor.Plugins"))) {
    console.info("[native-camera-kit] using window.Capacitor.Plugins.KidiCameraKit");
    return windowPlugin;
  }

  const promisePlugin = fromNativePromise();
  if (promisePlugin && (await probePlugin(promisePlugin, "Capacitor.nativePromise"))) {
    console.info("[native-camera-kit] using Capacitor.nativePromise bridge");
    return promisePlugin;
  }

  try {
    const { registerPlugin } = await import("@capacitor/core");
    const registered = registerPlugin<KidiCameraKitPlugin>("KidiCameraKit");
    if (await probePlugin(registered, "registerPlugin")) {
      console.info("[native-camera-kit] using registerPlugin fallback");
      return registered;
    }
  } catch (e) {
    console.warn("[native-camera-kit] registerPlugin failed", {
      errMsg: pluginErrorMessage(e),
    });
  }

  console.warn("[native-camera-kit] no native path available — web fallback");
  return null;
}

function attachNativeListeners(plugin: KidiCameraKitPlugin): void {
  if (!plugin.addListener) return;
  void plugin.addListener("pluginLoaded", (payload) => {
    console.info("[native-camera-kit] pluginLoaded", payload);
  });
  void plugin.addListener("captureState", (payload) => {
    console.info("[native-camera-kit] captureState", payload);
  });
  void plugin.addListener("status", (payload) => {
    console.info("[native-camera-kit] status", payload);
  });
}

/**
 * Attend que Capacitor expose KidiCameraKit. Le site de prod peut tester
 * `isPluginAvailable` trop tôt, avant l'injection du bridge — d'où le retry.
 * Sur iOS/Android, on enregistre le plugin même si le flag reste faux : le
 * proxy Capacitor joindra le natif dès que le bridge est prêt.
 */
export async function waitForNativeCameraKit(timeoutMs = 2000): Promise<boolean> {
  if (nativeForceOff()) return false;
  if (resolvedNativeAvailable !== null) return resolvedNativeAvailable;
  if (resolveNativePromise) return resolveNativePromise;

  resolveNativePromise = (async () => {
    if (!isNativeApp()) {
      logNativeProbe("not-native");
      resolvedNativeAvailable = false;
      return false;
    }

    logNativeProbe("start");
    const started = Date.now();
    while (!isPluginVisibleNow() && Date.now() - started < timeoutMs) {
      await new Promise((r) => setTimeout(r, 50));
    }
    logNativeProbe(isPluginVisibleNow() ? "visible" : "timeout-register-anyway");

    try {
      nativePlugin = await bindNativePlugin();
      if (!nativePlugin) {
        resolvedNativeAvailable = false;
        return false;
      }
      attachNativeListeners(nativePlugin);
      resolvedNativeAvailable = true;
      return true;
    } catch (e) {
      const errMsg = pluginErrorMessage(e);
      console.warn("[native-camera-kit] plugin registration failed", { errMsg });
      nativePlugin = null;
      resolvedNativeAvailable = false;
      return false;
    }
  })();

  return resolveNativePromise;
}

function hasNativePluginImpl(): boolean {
  if (nativeForceOff()) return false;
  if (resolvedNativeAvailable === false) return false;
  if (resolvedNativeAvailable === true) return true;
  return isNativeApp();
}

async function getNativePlugin(): Promise<KidiCameraKitPlugin | null> {
  if (nativePlugin) return nativePlugin;
  const ok = await waitForNativeCameraKit();
  return ok ? nativePlugin : null;
}

export function isNativeCameraKitAvailable(): boolean {
  return hasNativePluginImpl();
}

/** Prépare Snap dès l'ouverture de l'écran live (setup / go live). */
export async function warmupNativeCameraKit(reason = "live-screen"): Promise<boolean> {
  console.info("[native-camera-kit] warmup", { reason, platform: Capacitor.getPlatform() });
  const plugin = await getNativePlugin();
  if (!plugin) {
    console.warn("[native-camera-kit] warmup skipped — web fallback");
    return false;
  }
  try {
    const token = snapApiToken();
    if (!token) throw new Error("VITE_SNAP_CAMERA_KIT_API_TOKEN is not configured");
    console.info("[native-camera-kit] initialize");
    await plugin.initialize({ apiToken: token, groupIds: SNAP_LENS_GROUP_IDS });
    console.info("[native-camera-kit] warmup ok");
    return true;
  } catch (e) {
    const msg = pluginErrorMessage(e);
    if (isUnimplementedError(e)) markNativeFailed(msg);
    console.warn("[native-camera-kit] warmup failed — web fallback", { errMsg: msg });
    return false;
  }
}

export function isCameraKitSupported(): boolean {
  if (hasNativePluginImpl()) return true;
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
    nativeLensesPromise = loadNativeLenses(plugin).catch(async (e) => {
      const msg = pluginErrorMessage(e);
      if (isUnimplementedError(e) || msg.includes("0 lens")) {
        markNativeFailed(msg);
      }
      console.warn("[native-camera-kit] native lenses failed, using web", { errMsg: msg });
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
  console.info("[native-camera-kit] initialize");
  await plugin.initialize({ apiToken: token, groupIds: SNAP_LENS_GROUP_IDS });
  const res = await plugin.loadLenses({ groupIds: SNAP_LENS_GROUP_IDS });
  console.info(`[native-camera-kit] ${res.lenses.length} lens(es) loaded`);
  if (res.lenses.length === 0) throw new Error("0 lenses");
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

function pluginErrorMessage(e: unknown): string {
  if (typeof e === "string" && e.trim()) return e;
  if (e instanceof Error) {
    const rec = e as Error & { code?: string; errorMessage?: string };
    const bits = [rec.message, rec.errorMessage, rec.code].filter(
      (v): v is string => typeof v === "string" && v.length > 0 && v !== "{}",
    );
    if (bits.length) return bits.join(" — ");
    return rec.name || "Error";
  }
  if (e && typeof e === "object") {
    const rec = e as Record<string, unknown>;
    const bits = [rec.message, rec.errorMessage, rec.code, rec.error]
      .filter((v): v is string => typeof v === "string" && v.length > 0 && v !== "{}");
    if (bits.length) return bits.join(" — ");
    try {
      const json = JSON.stringify(e);
      if (json && json !== "{}") return json;
    } catch {
      /* ignore */
    }
  }
  return String(e);
}

function asPluginError(e: unknown): Error {
  const errMsg = pluginErrorMessage(e);
  return errMsg ? new Error(errMsg) : new Error("native camera kit error");
}

/** Active/désactive la publication LiveKit côté natif. C'est le plugin iOS/
 * Android qui publie la vidéo filtrée, pas le SDK web LiveKit. */
export async function setNativePublishEnabled(args: {
  enabled: boolean;
  roomUrl?: string;
  token?: string;
}): Promise<void> {
  const plugin = await getNativePlugin();
  if (!plugin) return; // web : la publication est gérée par broadcast-video
  try {
    if (args.enabled) {
      // Live can start before the filter carousel — always warm the Snap session.
      const token = snapApiToken();
      if (!token) throw new Error("VITE_SNAP_CAMERA_KIT_API_TOKEN is not configured");
      console.info("[native-camera-kit] initialize");
      await plugin.initialize({ apiToken: token, groupIds: SNAP_LENS_GROUP_IDS });
    }
    console.info("[native-camera-kit] setPublishEnabled", { enabled: args.enabled });
    await plugin.setPublishEnabled(args);
  } catch (e) {
    const msg = pluginErrorMessage(e);
    if (isUnimplementedError(e)) markNativeFailed(msg);
    console.warn("[native-camera-kit] setPublishEnabled failed", { errMsg: msg });
    throw asPluginError(e);
  }
}

let previewRetain = 0;
let previewStopTimer: ReturnType<typeof setTimeout> | null = null;

/** Démarre/arrête l'aperçu natif (affichage du flux filtré). */
export async function setNativePreview(args: {
  active: boolean;
  mirrored?: boolean;
  facing?: "user" | "environment";
}): Promise<void> {
  const plugin = await getNativePlugin();
  if (!plugin) return;
  if (args.active) {
    previewRetain += 1;
    if (previewStopTimer) {
      clearTimeout(previewStopTimer);
      previewStopTimer = null;
    }
    try {
      const token = snapApiToken();
      if (!token) throw new Error("VITE_SNAP_CAMERA_KIT_API_TOKEN is not configured");
      console.info("[native-camera-kit] initialize");
      await plugin.initialize({ apiToken: token, groupIds: SNAP_LENS_GROUP_IDS });
      console.info("[native-camera-kit] startPreview", {
        mirrored: args.mirrored ?? false,
        facing: args.facing ?? "user",
      });
      await plugin.startPreview({
        mirrored: args.mirrored ?? false,
        facing: args.facing ?? "user",
      });
    } catch (e) {
      previewRetain = Math.max(0, previewRetain - 1);
      const msg = pluginErrorMessage(e);
      if (isUnimplementedError(e)) markNativeFailed(msg);
      console.warn("[native-camera-kit] startPreview failed", { errMsg: msg });
      throw asPluginError(e);
    }
    return;
  }

  previewRetain = Math.max(0, previewRetain - 1);
  if (previewRetain > 0) return;
  if (previewStopTimer) clearTimeout(previewStopTimer);
  previewStopTimer = setTimeout(() => {
    previewStopTimer = null;
    if (previewRetain > 0) return;
    void plugin.stopPreview().catch(() => {});
  }, 400);
}
