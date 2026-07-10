// AuthPromptProvider — global "please sign in" sheet used across the guest UI.
//
// Any guest-facing control (bid, buy, gift, heart, follow, wallet, report…)
// calls `requireAuth(fn)`. If a session exists, `fn` runs immediately. If
// not, a friendly bottom sheet is shown ("Crée un compte pour participer 🎉")
// and the caller returns without side effects. This is the ONLY place we
// intercept guest actions — the DB / RPC layer is left untouched, so it
// remains the source of truth for who can write what.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { LogIn, UserPlus } from "lucide-react";
import { Press } from "@/components/press";
import { useAuth } from "@/lib/auth-context";
import { AuthFlow } from "@/components/auth/auth-flow";
import { EASE_IOS } from "@/lib/motion";

type AuthPromptCtx = {
  /** Run `fn` if signed in; otherwise open the auth sheet. */
  requireAuth: (fn: () => void) => void;
  /** Force-open the auth flow (e.g. from a "Se connecter" bar). */
  openAuth: () => void;
};

const Ctx = createContext<AuthPromptCtx | null>(null);

export function AuthPromptProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [flowOpen, setFlowOpen] = useState(false);

  const requireAuth = useCallback(
    (fn: () => void) => {
      if (session) {
        fn();
        return;
      }
      setSheetOpen(true);
    },
    [session],
  );

  const openAuth = useCallback(() => {
    if (session) return;
    setFlowOpen(true);
  }, [session]);

  // When a guest signs in successfully, tear down every overlay.
  if (session && (sheetOpen || flowOpen)) {
    setSheetOpen(false);
    setFlowOpen(false);
  }

  const value = useMemo<AuthPromptCtx>(
    () => ({ requireAuth, openAuth }),
    [requireAuth, openAuth],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <AuthSheet
        open={sheetOpen && !session}
        onClose={() => setSheetOpen(false)}
        onSignIn={() => {
          setSheetOpen(false);
          setFlowOpen(true);
        }}
        onSignUp={() => {
          setSheetOpen(false);
          setFlowOpen(true);
        }}
      />
      <AnimatePresence>
        {flowOpen && !session && (
          <motion.div
            key="auth-flow-overlay"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: EASE_IOS }}
            className="fixed inset-0 z-[95]"
          >
            <AuthFlow allowGuest={false} />
          </motion.div>
        )}
      </AnimatePresence>
    </Ctx.Provider>
  );
}

export function useAuthPrompt(): AuthPromptCtx {
  const ctx = useContext(Ctx);
  // Consumer-safe fallback: no-op requireAuth simply runs the callback.
  // In practice the provider is always mounted at app root.
  return (
    ctx ?? {
      requireAuth: (fn) => fn(),
      openAuth: () => {},
    }
  );
}

function AuthSheet({
  open,
  onClose,
  onSignIn,
  onSignUp,
}: {
  open: boolean;
  onClose: () => void;
  onSignIn: () => void;
  onSignUp: () => void;
}) {
  const { t } = useTranslation();
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="auth-prompt-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] flex items-end bg-black/55"
          onClick={onClose}
        >
          <motion.div
            key="auth-prompt-sheet"
            initial={{ y: 40, opacity: 0.5 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.22, ease: EASE_IOS }}
            className="mx-auto w-full max-w-lg rounded-t-3xl bg-background p-5 pb-safe"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-muted" />
            <h2 className="text-center text-[20px] font-black leading-tight">
              {t("auth.prompt.title", { defaultValue: "Crée un compte pour participer 🎉" })}
            </h2>
            <p className="mx-auto mt-2 max-w-xs text-center text-[13px] text-muted-foreground">
              {t("auth.prompt.subtitle", {
                defaultValue:
                  "Enchéris, achète, envoie des cadeaux et chatte avec les vendeurs — c'est gratuit.",
              })}
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <Press
                onClick={onSignUp}
                className="!min-h-12 flex h-12 items-center justify-center gap-2 rounded-full bg-accent text-[15px] font-bold text-accent-foreground"
              >
                <UserPlus size={16} />
                {t("auth.prompt.signUp", { defaultValue: "Créer un compte" })}
              </Press>
              <Press
                onClick={onSignIn}
                className="!min-h-12 flex h-12 items-center justify-center gap-2 rounded-full border border-border text-[15px] font-bold"
              >
                <LogIn size={16} />
                {t("auth.prompt.signIn", { defaultValue: "Se connecter" })}
              </Press>
              <Press
                onClick={onClose}
                className="!min-h-10 h-10 rounded-full text-[13px] text-muted-foreground"
              >
                {t("common.later", { defaultValue: "Plus tard" })}
              </Press>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
