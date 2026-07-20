// Native app update policy helpers.
// Web UI updates already ship via https://kidiplus.com (server.url).
// This covers App Store / Play Store binary updates only.

import { EMAIL_CONFIG } from "@/lib/email/config";
import { isNative } from "@/lib/native";

export type NativePlatform = "ios" | "android";

export type AppVersionPolicy = {
  minVersion: string;
  latestVersion: string;
  force: boolean;
  message: string | null;
  iosStoreUrl: string;
  androidStoreUrl: string;
};

export type UpdateDecision =
  | { kind: "none"; installed: string; policy: AppVersionPolicy }
  | { kind: "soft"; installed: string; policy: AppVersionPolicy }
  | { kind: "force"; installed: string; policy: AppVersionPolicy };

const SNOOZE_KEY = "kidi:update_snooze_until";
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

/** Compare dotted versions (5.0 < 5.1 < 5.1.2). Returns -1 / 0 / 1. */
export function compareVersions(a: string, b: string): number {
  const norm = (v: string) =>
    v
      .trim()
      .replace(/^v/i, "")
      .split(/[.+_-]/)
      .map((p) => {
        const n = parseInt(p.replace(/\D/g, ""), 10);
        return Number.isFinite(n) ? n : 0;
      });
  const pa = norm(a || "0");
  const pb = norm(b || "0");
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da < db) return -1;
    if (da > db) return 1;
  }
  return 0;
}

export function isSnoozed(): boolean {
  try {
    const raw = localStorage.getItem(SNOOZE_KEY);
    if (!raw) return false;
    const until = Number(raw);
    return Number.isFinite(until) && Date.now() < until;
  } catch {
    return false;
  }
}

export function snoozeSoftUpdate(): void {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
  } catch {
    /* ignore */
  }
}

export async function fetchAppVersionPolicy(
  platform?: NativePlatform,
): Promise<AppVersionPolicy | null> {
  try {
    const qs = platform ? `?platform=${encodeURIComponent(platform)}` : "";
    const res = await fetch(`/api/public/app-version${qs}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<AppVersionPolicy>;
    return {
      minVersion: String(body.minVersion ?? "0.0.0"),
      latestVersion: String(body.latestVersion ?? "0.0.0"),
      force: !!body.force,
      message: typeof body.message === "string" ? body.message : null,
      iosStoreUrl: String(body.iosStoreUrl || EMAIL_CONFIG.APP_STORE_URL),
      androidStoreUrl: String(body.androidStoreUrl || EMAIL_CONFIG.PLAY_STORE_URL),
    };
  } catch {
    return null;
  }
}

export async function readInstalledNativeVersion(): Promise<{
  platform: NativePlatform;
  version: string;
} | null> {
  if (!isNative()) return null;
  try {
    const { App } = await import("@capacitor/app");
    const { Capacitor } = await import("@capacitor/core");
    const info = await App.getInfo();
    const platform = Capacitor.getPlatform() === "ios" ? "ios" : "android";
    const version = String(info.version || "").trim();
    if (!version) return null;
    return { platform, version };
  } catch {
    return null;
  }
}

export function decideUpdate(
  installed: string,
  policy: AppVersionPolicy,
): UpdateDecision {
  if (compareVersions(installed, policy.minVersion) < 0) {
    return { kind: "force", installed, policy };
  }
  if (compareVersions(installed, policy.latestVersion) < 0) {
    return { kind: policy.force ? "force" : "soft", installed, policy };
  }
  return { kind: "none", installed, policy };
}

export async function openStoreForPlatform(platform: NativePlatform, policy: AppVersionPolicy) {
  const url = platform === "ios" ? policy.iosStoreUrl : policy.androidStoreUrl;
  try {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url });
    return;
  } catch {
    /* fall through */
  }
  try {
    window.location.assign(url);
  } catch {
    /* ignore */
  }
}
