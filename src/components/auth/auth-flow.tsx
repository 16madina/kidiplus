import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Press } from "@/components/press";
import { Logo } from "@/components/brand/logo";
import { EASE_IOS } from "@/lib/motion";
import { SignInScreen } from "./sign-in-screen";
import { SignUpScreen } from "./sign-up-screen";
import { ForgotPasswordScreen } from "./forgot-password-screen";
import { useAuth } from "@/lib/auth-context";

type View = "welcome" | "signin" | "signup" | "forgot";

export function AuthFlow({ allowGuest = true }: { allowGuest?: boolean } = {}) {
  const [view, setView] = useState<View>("welcome");
  const { enterGuestMode } = useAuth();


  return (
    <div
      className="relative mx-auto flex h-[100dvh] w-full max-w-xl flex-col overflow-hidden"
      style={{
        isolation: "isolate",
        background:
          "radial-gradient(120% 80% at 50% 0%, #2A3560 0%, #1E2749 40%, #141B33 100%)",
        color: "white",
      }}
    >
      <AnimatePresence mode="wait">
        {view === "welcome" && (
          <Welcome
            key="welcome"
            onSignIn={() => setView("signin")}
            onSignUp={() => setView("signup")}
            onGuest={allowGuest ? enterGuestMode : undefined}
          />
        )}

        {view === "signin" && (
          <SignInScreen
            key="signin"
            onBack={() => setView("welcome")}
            onGoSignUp={() => setView("signup")}
            onForgot={() => setView("forgot")}
          />
        )}
        {view === "signup" && (
          <SignUpScreen
            key="signup"
            onBack={() => setView("welcome")}
            onGoSignIn={() => setView("signin")}
          />
        )}
        {view === "forgot" && (
          <ForgotPasswordScreen key="forgot" onBack={() => setView("signin")} />
        )}
      </AnimatePresence>
    </div>
  );
}

function Welcome({
  onSignIn,
  onSignUp,
  onGuest,
}: {
  onSignIn: () => void;
  onSignUp: () => void;
  onGuest?: () => void;
}) {

  const { t } = useTranslation();
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, ease: EASE_IOS }}
      className="flex h-full flex-col px-6 pt-safe"
      style={{
        paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)",
      }}
    >
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <motion.span
          initial={{ scale: 0.6, opacity: 0, y: 8 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE_IOS, type: "spring", stiffness: 120, damping: 14 }}
          className="inline-block"
          style={{ filter: "drop-shadow(0 12px 40px rgba(255, 195, 90, 0.25))" }}
        >
          <motion.span
            className="inline-block"
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 4.5, ease: "easeInOut", repeat: Infinity, delay: 0.8 }}
          >
            <Logo size={240} />
          </motion.span>
        </motion.span>
        <motion.p
          initial={{ y: 14, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6, ease: EASE_IOS, delay: 0.35 }}
          className="mt-5 max-w-xs text-[15px] leading-snug text-muted-foreground"
        >
          {t("auth.welcome.tagline")}
        </motion.p>

      </div>

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: EASE_IOS, delay: 0.12 }}
        className="flex flex-col gap-2"
      >
        <Press
          onClick={onSignUp}
          className="!min-h-12 h-12 w-full rounded-2xl text-[15px] font-bold text-white"
          style={{
            background:
              "linear-gradient(135deg, oklch(0.7 0.26 15), oklch(0.62 0.24 20))",
          }}
        >
          {t("auth.welcome.signUp")}
        </Press>
        <Press
          onClick={onSignIn}
          className="!min-h-12 h-12 w-full rounded-2xl text-[15px] font-semibold text-white"
          style={{
            backgroundColor: "transparent",
            border: "1.5px solid rgba(255,255,255,0.25)",
          }}
        >
          {t("auth.welcome.signIn")}
        </Press>
        {onGuest && (
          <Press
            onClick={onGuest}
            className="!min-h-11 h-11 w-full rounded-2xl text-[14px] font-semibold text-white/85"
            style={{ backgroundColor: "transparent" }}
          >
            {t("auth.welcome.continueAsGuest", { defaultValue: "Continuer en tant qu'invité →" })}
          </Press>
        )}
        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          {t("auth.signUp.terms")}
        </p>
      </motion.div>
    </motion.div>
  );
}

