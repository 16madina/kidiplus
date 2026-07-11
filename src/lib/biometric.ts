// Biometric authentication (Face ID / Touch ID / Fingerprint).
// Uses @capgo/capacitor-native-biometric for both biometric prompt and
// secure credential storage (iOS Keychain / Android Keystore).
// Every call is a no-op / safe fallback on web.

import { Capacitor } from "@capacitor/core";
import { isNative } from "@/lib/native";

const SERVER = "kidiplus.credentials";
const ENABLED_KEY = "kidi:bio:enabled";
const EMAIL_HINT_KEY = "kidi:bio:email";

async function loadPlugin() {
  const mod = await import("@capgo/capacitor-native-biometric");
  return { NativeBiometric: mod.NativeBiometric, BiometryType: mod.BiometryType };
}

export type BiometricInfo = {
  available: boolean;
  /** "faceId" | "touchId" | "fingerprint" | "face" | "iris" | null */
  kind: "faceId" | "touchId" | "fingerprint" | "face" | "iris" | null;
  /** Localised human label. */
  label: string;
  /** True when Capacitor native shell is active (APK / IPA). */
  native: boolean;
  /** Why unavailable, when native but biometrics can't be used. */
  reason?: "not_enrolled" | "unavailable" | "plugin_error" | "web";
};

function nativeShell(): boolean {
  try {
    if (isNative()) return true;
    if (Capacitor.isNativePlatform()) return true;
    const p = Capacitor.getPlatform();
    if (p === "ios" || p === "android") return true;
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined") {
    const w = window as Window & {
      androidBridge?: unknown;
      webkit?: { messageHandlers?: { bridge?: unknown } };
      Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
    };
    if (w.androidBridge || w.webkit?.messageHandlers?.bridge) return true;
    try {
      if (w.Capacitor?.isNativePlatform?.()) return true;
      const p = w.Capacitor?.getPlatform?.();
      if (p === "ios" || p === "android") return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

function mapKind(
  biometryType: number,
  BiometryType: Record<string, number>,
): Pick<BiometricInfo, "kind" | "label"> {
  switch (biometryType) {
    case BiometryType.FACE_ID:
      return { kind: "faceId", label: "Face ID" };
    case BiometryType.TOUCH_ID:
      return { kind: "touchId", label: "Touch ID" };
    case BiometryType.FINGERPRINT:
      return { kind: "fingerprint", label: "Empreinte" };
    case BiometryType.FACE_AUTHENTICATION:
      return { kind: "face", label: "Reconnaissance faciale" };
    case BiometryType.IRIS_AUTHENTICATION:
      return { kind: "iris", label: "Iris" };
    default:
      return { kind: "fingerprint", label: "Biométrie" };
  }
}

export async function getBiometricInfo(): Promise<BiometricInfo> {
  // If the native plugin answers at all, we are inside the Capacitor shell —
  // never tell the user to "open the mobile app".
  let probedNative = nativeShell();

  try {
    const { NativeBiometric, BiometryType } = await loadPlugin();
    const res = await NativeBiometric.isAvailable({ useFallback: true });
    probedNative = true;
    const mapped = mapKind(res.biometryType, BiometryType as unknown as Record<string, number>);

    if (res.isAvailable) {
      return { available: true, ...mapped, native: true };
    }

    // Hardware present (fingerprint/face) but nothing enrolled, or no screen lock.
    const errorCode = (res as { errorCode?: number }).errorCode;
    const deviceIsSecure = (res as { deviceIsSecure?: boolean }).deviceIsSecure;
    console.warn("[biometric] not available", { errorCode, deviceIsSecure, biometryType: res.biometryType });

    return {
      available: false,
      ...mapped,
      native: true,
      reason:
        !deviceIsSecure || errorCode === 3 || errorCode === 11
          ? "not_enrolled"
          : "unavailable",
    };
  } catch (e) {
    console.warn("[biometric] isAvailable failed", e);
    if (probedNative || nativeShell()) {
      return {
        available: false,
        kind: "fingerprint",
        label: "Empreinte",
        native: true,
        reason: "plugin_error",
      };
    }
    return { available: false, kind: null, label: "", native: false, reason: "web" };
  }
}

export function isBiometricEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

export function getSavedBiometricEmail(): string | null {
  try {
    return localStorage.getItem(EMAIL_HINT_KEY);
  } catch {
    return null;
  }
}

/** Save credentials in Keychain / Keystore and enable biometric login. */
export async function enableBiometric(email: string, password: string): Promise<void> {
  if (!nativeShell()) throw new Error("Biométrie non disponible sur le web");
  const { NativeBiometric } = await loadPlugin();
  await NativeBiometric.setCredentials({ username: email, password, server: SERVER });
  try {
    localStorage.setItem(ENABLED_KEY, "1");
    localStorage.setItem(EMAIL_HINT_KEY, email);
  } catch { /* ignore */ }
}

export async function disableBiometric(): Promise<void> {
  try {
    localStorage.removeItem(ENABLED_KEY);
    localStorage.removeItem(EMAIL_HINT_KEY);
  } catch { /* ignore */ }
  if (!nativeShell()) return;
  try {
    const { NativeBiometric } = await loadPlugin();
    await NativeBiometric.deleteCredentials({ server: SERVER });
  } catch { /* ignore */ }
}

/** Prompt biometric, then return the stored credentials. Throws on cancel. */
export async function verifyAndGetCredentials(
  reason = "Connectez-vous à KiDi+"
): Promise<{ email: string; password: string }> {
  if (!nativeShell()) throw new Error("Biométrie non disponible");
  const { NativeBiometric } = await loadPlugin();
  await NativeBiometric.verifyIdentity({
    reason,
    title: "Authentification",
    subtitle: "KiDi+",
    description: reason,
    useFallback: true,
  });
  const creds = await NativeBiometric.getCredentials({ server: SERVER });
  return { email: creds.username, password: creds.password };
}
