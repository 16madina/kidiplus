// Registers iOS/Android push notifications and syncs the FCM token to Lovable Cloud.
// Safe to call on web (no-op). Re-runs whenever the auth state changes so users who
// sign in after app launch also get registered.
import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { supabase } from "@/integrations/supabase/client";
import { registerDeviceToken } from "@/lib/device-tokens.functions";
import { logPushEvent } from "@/lib/push-debug.functions";

const registeredUserIds = new Set<string>();

async function log(platform: string, step: string, ok: boolean, message?: string) {
  try {
    await logPushEvent({ data: { platform, step, ok, message: message?.slice(0, 1000) } });
  } catch {
    // best-effort; ignore
  }
  if (ok) console.log(`[push] ${step}`);
  else console.warn(`[push] ${step}`, message);
}

async function runRegistration(userId: string) {
  if (registeredUserIds.has(userId)) return;
  registeredUserIds.add(userId);
  const platform = Capacitor.getPlatform() as "ios" | "android";

  try {
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== "granted") {
      await log(platform, "permission_denied", false, `receive=${perm.receive}`);
      registeredUserIds.delete(userId);
      return;
    }
    await log(platform, "permission_granted", true);

    const tokenPromise = new Promise<string>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("fcm_token_timeout")), 15_000);
      void PushNotifications.addListener("registration", (t) => {
        window.clearTimeout(timer);
        resolve(t.value);
      });
      void PushNotifications.addListener("registrationError", (e) => {
        window.clearTimeout(timer);
        reject(new Error((e as { error?: string }).error ?? "registration_error"));
      });
    });

    await PushNotifications.register();
    await log(platform, "native_register", true);

    const token = await tokenPromise;
    if (!token) {
      await log(platform, "fcm_token_empty", false);
      registeredUserIds.delete(userId);
      return;
    }
    await log(platform, "fcm_token_ok", true, `len=${token.length}`);

    await registerDeviceToken({ data: { token, platform } });
    await log(platform, "saved_to_backend", true);

    await PushNotifications.addListener("pushNotificationReceived", (notif) => {
      console.log("[push] received", notif);
    });
  } catch (err) {
    await log(platform, "init_failed", false, err instanceof Error ? err.message : String(err));
    registeredUserIds.delete(userId);
  }
}

let listenerAttached = false;

export function usePushNotifications() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    // Try immediately if a session already exists.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) void runRegistration(session.user.id);
    });

    if (listenerAttached) return;
    listenerAttached = true;

    supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user?.id) {
        void runRegistration(session.user.id);
      }
      if (event === "SIGNED_OUT") {
        registeredUserIds.clear();
      }
    });
  }, []);
}
