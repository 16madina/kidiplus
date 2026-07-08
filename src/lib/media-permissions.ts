// Cross-platform camera + microphone access.
//
// On web: relies on the browser to prompt (via getUserMedia).
// On native (Capacitor iOS/Android): FIRST asks the native @capacitor/camera
// permission API (which reads Info.plist / AndroidManifest usage descriptions
// and triggers the OS prompt), THEN calls getUserMedia so the webview stream
// is granted.
//
// A frequent iOS bug: if Info.plist is missing NSCameraUsageDescription, the
// permission API silently reports "denied" WITHOUT prompting and the app
// never appears under iOS Settings > Privacy > Camera. We surface that as
// `config_missing` so the UI can tell the user (or us) that it's a build
// problem, not a permission the user denied.

import { Capacitor } from "@capacitor/core";

export type MediaPermissionResult =
  | { status: "granted"; stream: MediaStream }
  | { status: "denied_by_user" }
  | { status: "config_missing" } // Info.plist / AndroidManifest entries absent
  | { status: "no_device" }
  | { status: "unsupported" }
  | { status: "error"; message: string };

export type MediaRequest = {
  video: boolean | { facingMode?: "user" | "environment" };
  audio: boolean;
};

function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Ask for camera (and optionally mic) access. On native we route the request
 * through the @capacitor/camera plugin first so the OS prompt fires.
 */
export async function ensureCameraMicAccess(
  req: MediaRequest = { video: true, audio: true },
): Promise<MediaPermissionResult> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return { status: "unsupported" };
  }

  if (isNative() && req.video) {
    try {
      // Dynamic import so the web bundle doesn't pull the native module.
      const { Camera } = await import("@capacitor/camera");
      let perms = await Camera.checkPermissions();
      // The plugin reports "prompt" when nothing has been asked yet, and
      // "prompt-with-rationale" once denied but re-requestable.
      if (perms.camera !== "granted") {
        try {
          perms = await Camera.requestPermissions({ permissions: ["camera"] });
        } catch (err) {
          // A thrown error here on iOS almost always means NSCameraUsageDescription
          // is missing from Info.plist — the OS refuses to even show the prompt.
          return { status: "config_missing" };
        }
      }
      if (perms.camera === "denied") {
        return { status: "denied_by_user" };
      }
      if (perms.camera !== "granted") {
        // Undetermined AND not promptable ⇒ build config problem.
        return { status: "config_missing" };
      }
    } catch (err) {
      // Plugin missing or bridge failure. On native this is a build issue.
      return {
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // Now attempt the actual stream. On native, mic permission is handled by
  // iOS/Android via the RECORD_AUDIO manifest entry / NSMicrophoneUsageDescription
  // — Capacitor's webview bridges the request to native once app-level entries exist.
  try {
    const constraints: MediaStreamConstraints = {
      video: req.video === false ? false : typeof req.video === "object" ? { facingMode: req.video.facingMode ? { ideal: req.video.facingMode } : undefined } : true,
      audio: req.audio,
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    return { status: "granted", stream };
  } catch (err) {
    const name = err instanceof DOMException ? err.name : "";
    if (name === "NotAllowedError" || name === "SecurityError") {
      // On native this typically means the user tapped "Don't allow" at the
      // OS prompt OR that mic Info.plist entry is missing when audio:true.
      // We already validated the video path above via the plugin, so treat
      // this as user-denied by default.
      return { status: "denied_by_user" };
    }
    if (
      name === "NotFoundError" ||
      name === "OverconstrainedError" ||
      name === "NotReadableError" ||
      name === "AbortError"
    ) {
      return { status: "no_device" };
    }
    return {
      status: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/** True when running inside a Capacitor native container (iOS/Android). */
export function isNativeApp(): boolean {
  return isNative();
}
