// Android system Picture-in-Picture bridge for live viewing.
// No-op on iOS / web — in-app mini player remains the cross-platform UX.
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export type PipModeChangeEvent = { active: boolean };

export interface LivePipPlugin {
  setEnabled(options: { enabled: boolean }): Promise<{ enabled: boolean }>;
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

export async function pipIsSupported(): Promise<boolean> {
  if (!isAndroidPipPlatform()) return false;
  try {
    const r = await LivePip.isSupported();
    return !!r.value;
  } catch {
    return false;
  }
}

/** Tell native whether Home should auto-enter system PiP. */
export async function pipSetEnabled(enabled: boolean): Promise<void> {
  if (!isAndroidPipPlatform()) return;
  try {
    await LivePip.setEnabled({ enabled });
  } catch (e) {
    console.debug("[pip] setEnabled failed", e);
  }
}

export async function pipEnter(): Promise<boolean> {
  if (!isAndroidPipPlatform()) return false;
  try {
    const r = await LivePip.enter();
    return !!r.entered;
  } catch (e) {
    console.debug("[pip] enter failed", e);
    return false;
  }
}

/** Close the Android system PiP bubble if it is showing. */
export async function pipDismiss(): Promise<boolean> {
  if (!isAndroidPipPlatform()) return false;
  try {
    const r = await LivePip.dismiss();
    return !!r.dismissed;
  } catch (e) {
    console.debug("[pip] dismiss failed", e);
    return false;
  }
}

export async function pipIsActive(): Promise<boolean> {
  if (!isAndroidPipPlatform()) return false;
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
  if (!isAndroidPipPlatform()) return Promise.resolve(null);
  return LivePip.addListener("pipModeChange", (e) => cb(!!e.active)).catch(() => null);
}

export { LivePip };
