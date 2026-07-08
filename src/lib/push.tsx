// Push notification pre-prompt + permission wrapper.
// The pre-prompt bottom sheet is shown BEFORE the OS dialog so users understand why.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";
import { PushNotifications, type Token } from "@capacitor/push-notifications";
import { Press } from "@/components/press";
import { EASE_IOS } from "@/lib/motion";
import { haptic } from "@/lib/haptics";

export type PushStatus = "unknown" | "granted" | "denied" | "prompt";

type Ctx = {
  status: PushStatus;
  /** Ask (with pre-prompt if never asked). Returns granted?. */
  requestWithPrePrompt: (reason: string) => Promise<boolean>;
  refresh: () => Promise<void>;
};

const PushContext = createContext<Ctx | null>(null);

function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

const PREPROMPT_SHOWN_KEY = "push:preprompt_shown";

export function PushProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<PushStatus>("unknown");
  const [prompt, setPrompt] = useState<{ reason: string; resolve: (b: boolean) => void } | null>(null);

  const refresh = useCallback(async () => {
    if (!isNative()) {
      setStatus("prompt");
      return;
    }
    try {
      const s = await PushNotifications.checkPermissions();
      setStatus(s.receive as PushStatus);
    } catch {
      setStatus("unknown");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Device token wiring — ready to hand off to a push service later.
  // Wrapped in try/catch so a missing Firebase config on Android
  // (no google-services.json / FCM not initialised) can't crash the app.
  useEffect(() => {
    if (!isNative()) return;
    const handles: Array<{ remove: () => void }> = [];
    try {
      PushNotifications.addListener("registration", (t: Token) => {
        // TODO: forward token to your push backend.
        console.info("[push] token", t.value);
      }).then((h) => handles.push(h)).catch((e) => console.warn("[push] listener registration failed", e));
      PushNotifications.addListener("registrationError", (e) => {
        console.warn("[push] registration error", e);
      }).then((h) => handles.push(h)).catch(() => {});
      PushNotifications.addListener("pushNotificationReceived", (n) => {
        if (n.title) toast(n.title, { description: n.body });
      }).then((h) => handles.push(h)).catch(() => {});
    } catch (e) {
      console.warn("[push] plugin unavailable", e);
    }
    return () => {
      try { handles.forEach((h) => h.remove()); } catch {}
    };
  }, []);


  const doRequest = useCallback(async (): Promise<boolean> => {
    if (!isNative()) {
      // On web: pretend granted so downstream UX proceeds.
      setStatus("granted");
      return true;
    }
    try {
      const res = await PushNotifications.requestPermissions();
      const granted = res.receive === "granted";
      setStatus(res.receive as PushStatus);
      if (granted) {
        await PushNotifications.register();
        toast.success("Notifications activées");
        haptic.success();
      } else {
        toast("Notifications non activées");
      }
      return granted;
    } catch {
      return false;
    }
  }, []);

  const requestWithPrePrompt = useCallback(
    async (reason: string): Promise<boolean> => {
      // Already granted → no-op.
      if (status === "granted") return true;
      // Pre-prompt only once. If they already saw it or OS already denied, go direct.
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
    <PushContext.Provider value={{ status, requestWithPrePrompt, refresh }}>
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
