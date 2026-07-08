// Registers iOS/Android push notifications and syncs the FCM token to Lovable Cloud.
// Safe to call on web (no-op). Requires the user to be signed in.
import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { FirebaseMessaging } from "@capacitor-firebase/messaging";
import { supabase } from "@/integrations/supabase/client";
import { registerDeviceToken } from "@/lib/device-tokens.functions";

let initialized = false;

export function usePushNotifications() {
  useEffect(() => {
    if (initialized) return;
    if (!Capacitor.isNativePlatform()) return;
    initialized = true;

    const platform = Capacitor.getPlatform() as "ios" | "android";

    (async () => {
      try {
        // Only register once the user is signed in (server fn requires auth).
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          initialized = false;
          return;
        }

        // 1. Ask permission
        let perm = await PushNotifications.checkPermissions();
        if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
          perm = await PushNotifications.requestPermissions();
        }
        if (perm.receive !== "granted") {
          console.warn("[push] permission not granted");
          return;
        }

        // 2. Register with APNs (iOS) / FCM (Android)
        await PushNotifications.register();

        // 3. Get the FCM token via Firebase Messaging (works on both iOS + Android)
        const { token } = await FirebaseMessaging.getToken();
        if (!token) {
          console.warn("[push] no FCM token returned");
          return;
        }

        // 4. Save to Lovable Cloud
        await registerDeviceToken({ data: { token, platform } });
        console.log("[push] token registered");

        // 5. Refresh on token change
        await FirebaseMessaging.addListener("tokenReceived", async ({ token: newToken }) => {
          if (!newToken) return;
          try {
            await registerDeviceToken({ data: { token: newToken, platform } });
          } catch (e) {
            console.error("[push] token refresh failed", e);
          }
        });

        // Foreground notif handler (optional log)
        await PushNotifications.addListener("pushNotificationReceived", (notif) => {
          console.log("[push] received", notif);
        });
      } catch (err) {
        console.error("[push] init failed", err);
        initialized = false;
      }
    })();
  }, []);
}
