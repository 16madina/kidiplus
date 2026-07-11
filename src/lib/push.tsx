// Push notification pre-prompt + permission wrapper.
// - Auto-registers on startup if the OS permission is already granted.
// - Persists the FCM/APNS device token to the backend when it arrives.
// - Exposes a clear `status` so the UI can show a "notifications refusées" state.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";
import { PushNotifications, type Token } from "@capacitor/push-notifications";
import { FirebaseMessaging } from "@capacitor-firebase/messaging";
import { Press } from "@/components/press";
import { EASE_IOS } from "@/lib/motion";
import { haptic } from "@/lib/haptics";
import { supabase } from "@/integrations/supabase/client";
import { registerDeviceToken } from "@/lib/device-tokens.functions";
import { normalizePushData, openFromPush } from "@/lib/push-router";

export type PushStatus = "unknown" | "granted" | "denied" | "prompt";

type Ctx = {
  status: PushStatus;
  /** Ask (with pre-prompt if never asked). Returns granted?. */
  requestWithPrePrompt: (reason: string) => Promise<boolean>;
  refresh: () => Promise<void>;
  /** Latest FCM/APNS token, once registered. */
  token: string | null;
};

const PushContext = createContext<Ctx | null>(null);

function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function currentPlatform(): "ios" | "android" | "web" {
  try {
    const p = Capacitor.getPlatform();
    if (p === "ios" || p === "android") return p;
  } catch {}
  return "web";
}

const PREPROMPT_SHOWN_KEY = "push:preprompt_shown";
const LAST_TOKEN_KEY = "push:last_token";

/**
 * Capacitor peut renvoyer "granted" | "denied" | "prompt" | "prompt-with-rationale"
 * (Android). On mappe tout ce qui n'est pas granted/denied vers "prompt" pour
 * éviter l'état "Inconnu" dans l'UI.
 */
function normalizePermission(v: string | undefined | null): PushStatus {
  if (v === "granted" || v === "denied" || v === "prompt") return v;
  if (v === "prompt-with-rationale") return "prompt";
  return "prompt";
}

export function PushProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<PushStatus>("unknown");
  const [token, setToken] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<{ reason: string; resolve: (b: boolean) => void } | null>(null);
  const savedTokenRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isNative()) {
      setStatus("prompt");
      return;
    }
    try {
      const s = await PushNotifications.checkPermissions();
      setStatus(normalizePermission(s.receive));
    } catch {
      setStatus("unknown");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Persist token to backend once we have both a user session and a token.
  const persistToken = useCallback(async (value: string) => {
    if (savedTokenRef.current === value) return;
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return; // will retry on next auth change
      await registerDeviceToken({ data: { token: value, platform: currentPlatform() } });
      savedTokenRef.current = value;
      try { localStorage.setItem(LAST_TOKEN_KEY, value); } catch {}
    } catch (e) {
      console.warn("[push] failed to persist device token", e);
    }
  }, []);

  const registerForPush = useCallback(async () => {
    await PushNotifications.register();

    // Android fallback: on some builds the native registration listener can be
    // late, so read the FCM token directly and persist it right away.
    if (currentPlatform() === "android") {
      try {
        const { token: fcmToken } = await FirebaseMessaging.getToken();
        if (fcmToken) {
          setToken(fcmToken);
          void persistToken(fcmToken);
        }
      } catch (e) {
        console.warn("[push] android fcm token fallback failed", e);
      }
    }
  }, [persistToken]);

  // Listeners + auto-register when permission is already granted.
  useEffect(() => {
    if (!isNative()) return;
    const handles: Array<{ remove: () => void }> = [];
    let cancelled = false;

    try {
      PushNotifications.addListener("registration", (t: Token) => {
        console.info("[push] token received");
        setToken(t.value);
        void persistToken(t.value);
      }).then((h) => handles.push(h)).catch((e) => console.warn("[push] listener registration failed", e));

      PushNotifications.addListener("registrationError", (e) => {
        console.warn("[push] registration error", e);
      }).then((h) => handles.push(h)).catch(() => {});

      PushNotifications.addListener("pushNotificationReceived", (n) => {
        const data = normalizePushData((n as unknown as { data?: unknown }).data);
        if (n.title) {
          toast(n.title, {
            description: n.body,
            action: data
              ? { label: "Ouvrir", onClick: () => openFromPush(data) }
              : undefined,
          });
        }
      }).then((h) => handles.push(h)).catch(() => {});

      // Tap on a push (background/quit → foreground). Routes to the right screen.
      PushNotifications.addListener("pushNotificationActionPerformed", (a) => {
        const raw = (a as unknown as { notification?: { data?: unknown } })?.notification?.data;
        openFromPush(normalizePushData(raw));
      }).then((h) => handles.push(h)).catch(() => {});
    } catch (e) {
      console.warn("[push] plugin unavailable", e);
    }

    // If OS permission is already granted, register at startup so we get a token.
    (async () => {
      try {
        const s = await PushNotifications.checkPermissions();
        if (cancelled) return;
        if (s.receive === "granted") {
          await registerForPush();
          // Cold-start: check for a notification that launched the app.
          try {
            const delivered = await PushNotifications.getDeliveredNotifications();
            const first = delivered?.notifications?.[0];
            if (first) {
              const raw = (first as unknown as { data?: unknown }).data;
              openFromPush(normalizePushData(raw));
              await PushNotifications.removeAllDeliveredNotifications().catch(() => {});
            }
          } catch {}
        }
      } catch (e) {
        console.warn("[push] auto-register failed", e);
      }
    })();


    return () => {
      cancelled = true;
      try { handles.forEach((h) => h.remove()); } catch {}
    };
  }, [persistToken, registerForPush]);

  // Re-persist token when the user signs in later.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "USER_UPDATED") return;
      const t = token ?? (typeof localStorage !== "undefined" ? localStorage.getItem(LAST_TOKEN_KEY) : null);
      if (t) void persistToken(t);
    });
    return () => { sub.subscription.unsubscribe(); };
  }, [token, persistToken]);

  const doRequest = useCallback(async (): Promise<boolean> => {
    if (!isNative()) {
      setStatus("granted");
      return true;
    }
    try {
      // Sur Android, si l'OS a déjà refusé, requestPermissions() renvoie
      // "denied" immédiatement sans afficher de dialogue. On log pour
      // diagnostiquer et on guide l'utilisateur vers les Réglages système.
      const before = await PushNotifications.checkPermissions().catch(() => null);
      console.info("[push] before request:", before?.receive);
      const res = await PushNotifications.requestPermissions();
      console.info("[push] request result:", res.receive);
      const granted = res.receive === "granted";
      setStatus(normalizePermission(res.receive));
      if (granted) {
        await registerForPush();
        toast.success("Notifications activées");
        haptic.success();
      } else {
        const alreadyDenied = before?.receive === "denied";
        toast.error("Notifications refusées", {
          description: alreadyDenied
            ? "Ouvre Réglages système > Applications > KiDi+ > Notifications pour les activer."
            : "Active-les dans Réglages > Notifications > KiDi+.",
        });
      }
      return granted;
    } catch (e) {
      console.warn("[push] requestPermissions threw", e);
      toast.error("Impossible de demander l'autorisation", {
        description: "Réessaie ou active les notifications dans les Réglages système.",
      });
      return false;
    }
  }, []);

  const requestWithPrePrompt = useCallback(
    async (reason: string): Promise<boolean> => {
      if (status === "granted") return true;
      const seen = typeof localStorage !== "undefined" && localStorage.getItem(PREPROMPT_SHOWN_KEY);
      if (seen || status === "denied") {
        return doRequest();
      }
      try {
        localStorage.setItem(PREPROMPT_SHOWN_KEY, "1");
      } catch {}
      return new Promise<boolean>((resolve) => {
        setPrompt({ reason, resolve });
      });
    },
    [status, doRequest],
  );

  // Auto pre-prompt au démarrage : dès qu'un utilisateur est connecté et que
  // l'autorisation OS n'est ni accordée ni refusée, on ouvre le pré-prompt
  // (une fois par session, natif uniquement, après un petit délai pour laisser
  // le splash / l'UI s'installer).
  const autoPromptedRef = useRef(false);
  useEffect(() => {
    if (!isNative()) return;
    if (autoPromptedRef.current) return;
    if (status !== "prompt") return;

    let cancelled = false;
    const maybeAsk = async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled || !data?.user) return;
      if (autoPromptedRef.current) return;
      autoPromptedRef.current = true;
      // petit délai pour ne pas apparaître pendant le splash
      setTimeout(() => {
        if (!cancelled) void requestWithPrePrompt("Reçois les alertes de lives, messages et nouveautés en temps réel.");
      }, 1200);
    };

    void maybeAsk();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") void maybeAsk();
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [status, requestWithPrePrompt]);


  const onActivate = async () => {
    haptic.medium();
    const ok = await doRequest();
    prompt?.resolve(ok);
    setPrompt(null);
  };
  const onLater = () => {
    prompt?.resolve(false);
    setPrompt(null);
  };

  return (
    <PushContext.Provider value={{ status, requestWithPrePrompt, refresh, token }}>
      {children}
      <AnimatePresence>
        {prompt && (
          <div className="fixed inset-0 z-[85]">
            <motion.div
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={onLater}
              style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: 0.3, ease: EASE_IOS }}
              className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-background pb-safe"
              style={{ boxShadow: "0 -10px 40px rgba(0,0,0,0.35)" }}
            >
              <div className="grid place-items-center pt-2.5 pb-1">
                <span className="h-1 w-10 rounded-full bg-muted-foreground/40" />
              </div>
              <div className="flex flex-col items-center px-6 pb-6 pt-4 text-center">
                <motion.div
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 340, damping: 20 }}
                  className="mb-3 grid h-16 w-16 place-items-center rounded-full"
                  style={{
                    background:
                      "linear-gradient(135deg, oklch(0.7 0.26 15), oklch(0.55 0.24 25))",
                  }}
                >
                  <Bell size={28} color="white" strokeWidth={2.2} />
                </motion.div>
                <h2 className="text-[18px] font-bold">Ne rate aucun live</h2>
                <p className="mt-1 max-w-xs text-[13px] leading-snug text-muted-foreground">
                  {prompt.reason}
                </p>
                <div className="mt-5 w-full space-y-2">
                  <Press
                    onClick={onActivate}
                    className="!min-h-11 w-full rounded-full bg-primary py-3 text-[14px] font-bold text-primary-foreground"
                  >
                    Activer
                  </Press>
                  <Press
                    onClick={onLater}
                    className="!min-h-11 w-full rounded-full py-3 text-[14px] font-semibold text-muted-foreground"
                  >
                    Plus tard
                  </Press>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </PushContext.Provider>
  );
}

export function usePush(): Ctx {
  const v = useContext(PushContext);
  if (!v) throw new Error("usePush must be used within PushProvider");
  return v;
}
