import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Press } from "@/components/press";
import { Logo } from "@/components/brand/logo";
import { EASE_IOS } from "@/lib/motion";
import { SignInScreen } from "./sign-in-screen";
import { SignUpScreen } from "./sign-up-screen";
import { ForgotPasswordScreen } from "./forgot-password-screen";

type View = "welcome" | "signin" | "signup" | "forgot";

export function AuthFlow() {
  const [view, setView] = useState<View>("welcome");

  return (
    <div
      className="relative mx-auto flex h-[100dvh] w-full max-w-xl flex-col overflow-hidden bg-background"
      style={{ isolation: "isolate" }}
    >
      <AnimatePresence mode="wait">
        {view === "welcome" && (
          <Welcome
            key="welcome"
            onSignIn={() => setView("signin")}
            onSignUp={() => setView("signup")}
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
}: {
  onSignIn: () => void;
  onSignUp: () => void;
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
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.4, ease: EASE_IOS }}
        >
          <Logo size={56} />
        </motion.span>
        <motion.p
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.4, ease: EASE_IOS, delay: 0.06 }}
          className="mt-3 max-w-xs text-[15px] leading-snug text-muted-foreground"
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
          className="!min-h-12 h-12 w-full rounded-2xl text-[15px] font-semibold"
          style={{
            backgroundColor: "transparent",
            color: "var(--foreground)",
            border: "1.5px solid var(--border)",
          }}
        >
          {t("auth.welcome.signIn")}
        </Press>
        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          {t("auth.signUp.terms")}
        </p>
      </motion.div>
    </motion.div>
  );
}
