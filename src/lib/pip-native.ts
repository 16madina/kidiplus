// Native Picture-in-Picture bridge for live viewing.
//
// Android: Activity PiP shows the WebView (JS prepares fullscreen video-only UI).
// iOS: LivePip plugin connects a native LiveKit viewer and drives
// AVPictureInPictureController (WebView WebRTC cannot feed system PiP).
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export type PipModeChangeEvent = { active: boolean };

export type PipEnableOptions = {
  enabled: boolean;
  /** iOS native LiveKit session — required when enabling on iOS. */
  url?: string;
  token?: string;
};

export interface LivePipPlugin {
  setEnabled(options: PipEnableOptions): Promise<{ enabled: boolean }>;
  enter(): Promise<{ entered: boolean }>;
  dismiss(): Promise<{ dismissed: boolean }>;
  isInPip(): Promise<{ value: boolean }>;
  isSupported(): Promise<{ value: boolean }>;
  addListener(
    eventName: "pipModeChange",
    listenerFunc: (event: PipModeChangeEvent) => void,
  ): Promise<PluginListenerHandle>;
}

const LivePip = registerPlugin<LivePipPlugin>("LivePip");

export function isAndroidPipPlatform(): boolean {
  try {
    return Capacitor.getPlatform() === "android" && Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function isIosPipPlatform(): boolean {
  try {
    return Capacitor.getPlatform() === "ios" && Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** Android WebView PiP or iOS native LiveKit PiP. */
export function isNativePipPlatform(): boolean {
  return isAndroidPipPlatform() || isIosPipPlatform();
}

export async function pipIsSupported(): Promise<boolean> {
  if (!isNativePipPlatform()) return false;
  try {
    const r = await LivePip.isSupported();
    return !!r.value;
  } catch {
    return false;
  }
}

/** Tell native whether Home should auto-enter system PiP. */
export async function pipSetEnabled(
  enabled: boolean,
  session?: { url: string; token: string },
): Promise<void> {
  if (!isNativePipPlatform()) return;
  try {
    await LivePip.setEnabled({
      enabled,
      url: session?.url,
      token: session?.token,
    });
  } catch (e) {
    console.debug("[pip] setEnabled failed", e);
  }
}

export async function pipEnter(): Promise<boolean> {
  if (!isNativePipPlatform()) return false;
  try {
    const r = await LivePip.enter();
    return !!r.entered;
  } catch (e) {
    console.debug("[pip] enter failed", e);
    return false;
  }
}

/** Close the system PiP bubble if it is showing. */
export async function pipDismiss(): Promise<boolean> {
  if (!isNativePipPlatform()) return false;
  try {
    const r = await LivePip.dismiss();
    return !!r.dismissed;
  } catch (e) {
    console.debug("[pip] dismiss failed", e);
    return false;
  }
}

export async function pipIsActive(): Promise<boolean> {
  if (!isNativePipPlatform()) return false;
  try {
    const r = await LivePip.isInPip();
    return !!r.value;
  } catch {
    return false;
  }
}

export function addPipModeListener(
  cb: (active: boolean) => void,
): Promise<PluginListenerHandle | null> {
  if (!isNativePipPlatform()) return Promise.resolve(null);
  return LivePip.addListener("pipModeChange", (e) => cb(!!e.active)).catch(() => null);
}

export { LivePip };
