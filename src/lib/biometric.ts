// Biometric authentication (Face ID / Touch ID / Fingerprint).
// Uses @capgo/capacitor-native-biometric for both biometric prompt and
// secure credential storage (iOS Keychain / Android Keystore).
// Every call is a no-op / safe fallback on web.

import { isNative } from "@/lib/native";

const SERVER = "kidiplus.credentials";
const ENABLED_KEY = "kidi:bio:enabled";
const EMAIL_HINT_KEY = "kidi:bio:email";

// Lazy dynamic import so we don't break the web bundle if the plugin's
// native bindings aren't registered.
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
};

export async function getBiometricInfo(): Promise<BiometricInfo> {
  if (!isNative()) return { available: false, kind: null, label: "" };
  try {
    const { NativeBiometric, BiometryType } = await loadPlugin();
    const res = await NativeBiometric.isAvailable();
    if (!res.isAvailable) return { available: false, kind: null, label: "" };
    switch (res.biometryType) {
      case BiometryType.FACE_ID:
        return { available: true, kind: "faceId", label: "Face ID" };
      case BiometryType.TOUCH_ID:
        return { available: true, kind: "touchId", label: "Touch ID" };
      case BiometryType.FINGERPRINT:
        return { available: true, kind: "fingerprint", label: "Empreinte" };
      case BiometryType.FACE_AUTHENTICATION:
        return { available: true, kind: "face", label: "Reconnaissance faciale" };
      case BiometryType.IRIS_AUTHENTICATION:
        return { available: true, kind: "iris", label: "Iris" };
      default:
        return { available: true, kind: "fingerprint", label: "Biométrie" };
    }
  } catch {
    return { available: false, kind: null, label: "" };
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
  if (!isNative()) throw new Error("Biométrie non disponible sur le web");
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
  if (!isNative()) return;
  try {
    const { NativeBiometric } = await loadPlugin();
    await NativeBiometric.deleteCredentials({ server: SERVER });
  } catch { /* ignore */ }
}

/** Prompt biometric, then return the stored credentials. Throws on cancel. */
export async function verifyAndGetCredentials(
  reason = "Connectez-vous à KiDi+"
): Promise<{ email: string; password: string }> {
  if (!isNative()) throw new Error("Biométrie non disponible");
  const { NativeBiometric } = await loadPlugin();
  await NativeBiometric.verifyIdentity({
    reason,
    title: "Authentification",
    subtitle: "KiDi+",
    description: reason,
  });
  const creds = await NativeBiometric.getCredentials({ server: SERVER });
  return { email: creds.username, password: creds.password };
}
