import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { User } from "lucide-react";
import { Press } from "@/components/press";
import { EASE_IOS } from "@/lib/motion";
import { SignInScreen } from "./sign-in-screen";
import { SignUpScreen } from "./sign-up-screen";
import { ForgotPasswordScreen } from "./forgot-password-screen";
import { useAuth } from "@/lib/auth-context";
import heroPodium from "@/assets/kidi-hero-podium.png.asset.json";
import kBadge from "@/assets/kidi-k-badge.png.asset.json";

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
          "radial-gradient(120% 90% at 50% 0%, #1A2454 0%, #0F1738 55%, #070C22 100%)",
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
  const GOLD = "#F5C34A";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: EASE_IOS }}
      className="relative flex h-full flex-col"
    >
      {/* Blurred hero background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <img
          src={heroPodium.url}
          alt=""
          aria-hidden
          draggable={false}
          className="absolute left-1/2 top-1/2 h-[115%] w-[130%] max-w-none -translate-x-1/2 -translate-y-1/2 select-none object-cover"
          style={{
            filter: "blur(28px) saturate(1.05) brightness(0.72)",
            transform: "translate(-50%, -50%) scale(1.15)",
            opacity: 0.85,
          }}
        />
        {/* Dark vignette + gradient for legibility */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(9,14,38,0.55) 0%, rgba(9,14,38,0.35) 45%, rgba(7,12,34,0.85) 78%, rgba(7,12,34,0.96) 100%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(80% 55% at 50% 42%, rgba(0,0,0,0) 0%, rgba(7,12,34,0.55) 100%)",
          }}
        />
      </div>

      {/* Foreground */}
      <div
        className="relative flex h-full flex-col px-6"
        style={{
          paddingTop: "calc(env(safe-area-inset-top) + 40px)",
          paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)",
        }}
      >
        {/* Top: K badge + title */}
        <div className="flex flex-col items-center text-center">
          <motion.img
            initial={{ scale: 0.7, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE_IOS }}
            src={kBadge.url}
            alt="KIDI+"
            draggable={false}
            className="select-none"
            style={{
              width: 108,
              height: 108,
              filter: "drop-shadow(0 12px 28px rgba(245,195,74,0.35))",
            }}
          />

          <motion.h1
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, ease: EASE_IOS, delay: 0.12 }}
            className="mt-5 text-white"
            style={{
              fontSize: 40,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              lineHeight: 1,
              textShadow: "0 4px 24px rgba(0,0,0,0.5)",
            }}
          >
            {t("auth.welcome.tagline")}{" "}
            <span style={{ color: GOLD }}>{t("auth.welcome.taglineAccent")}</span>
          </motion.h1>
        </div>

        <div className="flex-1" />

        {/* Bottom: actions */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.4, ease: EASE_IOS, delay: 0.2 }}
          className="flex flex-col gap-2.5"
        >
          <Press
            onClick={onSignUp}
            className="!min-h-[54px] h-[54px] w-full rounded-2xl text-[16px] font-bold"
            style={{
              background: `linear-gradient(180deg, #F7CE5A 0%, ${GOLD} 55%, #D9A73A 100%)`,
              color: "#151022",
              boxShadow:
                "0 14px 36px rgba(245,195,74,0.32), inset 0 1px 0 rgba(255,255,255,0.4)",
            }}
          >
            {t("auth.welcome.signUp")}
          </Press>
          <Press
            onClick={onSignIn}
            className="!min-h-[52px] h-[52px] w-full rounded-2xl text-[15px] font-semibold text-white"
            style={{
              backgroundColor: "rgba(255,255,255,0.10)",
              border: "1.5px solid rgba(255,255,255,0.35)",
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
            }}
          >
            {t("auth.welcome.signIn")}
          </Press>

          {onGuest && (
            <>
              <div className="my-1 flex items-center gap-3">
                <span
                  className="h-px flex-1"
                  style={{ background: "rgba(255,255,255,0.22)" }}
                />
                <span className="text-[11px] font-semibold tracking-[0.18em] text-white/70">
                  {t("auth.welcome.or")}
                </span>
                <span
                  className="h-px flex-1"
                  style={{ background: "rgba(255,255,255,0.22)" }}
                />
              </div>
              <Press
                onClick={onGuest}
                className="!min-h-[52px] flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold text-white"
                style={{
                  backgroundColor: "rgba(255,255,255,0.06)",
                  border: "1.5px solid rgba(255,255,255,0.25)",
                  backdropFilter: "blur(14px)",
                  WebkitBackdropFilter: "blur(14px)",
                }}
              >
                <User size={16} strokeWidth={2} />
                {t("auth.welcome.continueAsGuest")}
              </Press>
            </>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}
