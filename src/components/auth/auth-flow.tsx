import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { User } from "lucide-react";
import { Press } from "@/components/press";
import { Logo } from "@/components/brand/logo";
import { EASE_IOS } from "@/lib/motion";
import { SignInScreen } from "./sign-in-screen";
import { SignUpScreen } from "./sign-up-screen";
import { ForgotPasswordScreen } from "./forgot-password-screen";
import { useAuth } from "@/lib/auth-context";
import heroPodium from "@/assets/kidi-hero-podium.png.asset.json";

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
          "radial-gradient(120% 90% at 50% 0%, #1A2454 0%, #131B3F 45%, #0B1230 100%)",
        color: "white",
      }}
    >
      {/* Soft corner arc, top-left, evokes the mockup's decorative curve */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full"
        style={{
          background:
            "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.10), rgba(255,255,255,0) 70%)",
        }}
      />
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
  const GOLD = "#F5C34A";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, ease: EASE_IOS }}
      className="relative flex h-full flex-col px-6 pt-safe"
      style={{
        paddingTop: "calc(env(safe-area-inset-top) + 24px)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)",
      }}
    >
      {/* Top: badge + wordmark + tagline + hero */}
      <div className="flex flex-1 flex-col items-center text-center">
        <motion.div
          initial={{ scale: 0.7, opacity: 0, y: 8 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE_IOS }}
          style={{ filter: "drop-shadow(0 10px 30px rgba(245, 195, 74, 0.28))" }}
        >
          <Logo size={104} />
        </motion.div>

        <motion.h1
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, ease: EASE_IOS, delay: 0.15 }}
          className="mt-3 text-white"
          style={{
            fontSize: 44,
            fontWeight: 900,
            letterSpacing: "-0.02em",
            lineHeight: 1,
          }}
        >
          KIDI<span style={{ color: "#fff" }}>+</span>
        </motion.h1>

        <motion.p
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, ease: EASE_IOS, delay: 0.25 }}
          className="mt-3 max-w-[300px] text-[15px] leading-snug text-white/90"
        >
          {t("auth.welcome.tagline")}
          <br />
          <span style={{ color: GOLD, fontWeight: 700 }}>
            {t("auth.welcome.taglineAccent")}
          </span>
        </motion.p>

        <motion.img
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE_IOS, delay: 0.3 }}
          src={heroPodium.url}
          alt=""
          draggable={false}
          className="mt-4 w-full max-w-[360px] select-none"
          style={{
            objectFit: "contain",
            filter: "drop-shadow(0 20px 40px rgba(0,0,0,0.45))",
          }}
        />
      </div>

      {/* Bottom: actions */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: EASE_IOS, delay: 0.35 }}
        className="mt-2 flex flex-col gap-2.5"
      >
        <Press
          onClick={onSignUp}
          className="!min-h-[52px] h-[52px] w-full rounded-2xl text-[15px] font-bold"
          style={{
            background: `linear-gradient(180deg, #F5CA55 0%, ${GOLD} 55%, #D9A73A 100%)`,
            color: "#1A1330",
            boxShadow:
              "0 10px 30px rgba(245, 195, 74, 0.25), inset 0 1px 0 rgba(255,255,255,0.35)",
          }}
        >
          {t("auth.welcome.signUp")}
        </Press>
        <Press
          onClick={onSignIn}
          className="!min-h-[50px] h-[50px] w-full rounded-2xl text-[15px] font-semibold text-white"
          style={{
            backgroundColor: "transparent",
            border: "1.5px solid rgba(255,255,255,0.28)",
          }}
        >
          {t("auth.welcome.signIn")}
        </Press>

        {onGuest && (
          <>
            <div className="my-1 flex items-center gap-3">
              <span className="h-px flex-1" style={{ background: "rgba(255,255,255,0.18)" }} />
              <span className="text-[11px] font-semibold tracking-[0.18em] text-white/60">
                {t("auth.welcome.or")}
              </span>
              <span className="h-px flex-1" style={{ background: "rgba(255,255,255,0.18)" }} />
            </div>
            <Press
              onClick={onGuest}
              className="!min-h-[50px] flex h-[50px] w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold text-white"
              style={{
                backgroundColor: "transparent",
                border: "1.5px solid rgba(255,255,255,0.22)",
              }}
            >
              <User size={16} strokeWidth={2} />
              {t("auth.welcome.continueAsGuest")}
            </Press>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
