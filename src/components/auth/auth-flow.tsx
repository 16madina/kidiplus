import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { User } from "lucide-react";
import { Press } from "@/components/press";
import { EASE_IOS } from "@/lib/motion";
import { SignInScreen } from "./sign-in-screen";
import { SignUpScreen } from "./sign-up-screen";
import { ForgotPasswordScreen } from "./forgot-password-screen";
import { useAuth } from "@/lib/auth-context";
import badge from "@/assets/kidi-badge-v2.png.asset.json";
import wordmark from "@/assets/kidi-wordmark.png.asset.json";
import bg1 from "@/assets/welcome-bgs/bg-1.jpg.asset.json";
import bg2 from "@/assets/welcome-bgs/bg-2.jpg.asset.json";
import bg3 from "@/assets/welcome-bgs/bg-3.jpg.asset.json";
import bg4 from "@/assets/welcome-bgs/bg-4.jpg.asset.json";
import bg5 from "@/assets/welcome-bgs/bg-5.jpg.asset.json";
import bg6 from "@/assets/welcome-bgs/bg-6.jpg.asset.json";
import bg7 from "@/assets/welcome-bgs/bg-7.jpg.asset.json";
import bg8 from "@/assets/welcome-bgs/bg-8.jpg.asset.json";
import bg9 from "@/assets/welcome-bgs/bg-9.jpg.asset.json";
import bg10 from "@/assets/welcome-bgs/bg-10.jpg.asset.json";

const WELCOME_BGS = [bg1, bg2, bg3, bg4, bg5, bg6, bg7, bg8, bg9, bg10];



type View = "welcome" | "signin" | "signup" | "forgot";

export function AuthFlow({ allowGuest = true }: { allowGuest?: boolean } = {}) {
  const [view, setView] = useState<View>("welcome");
  const { enterGuestMode } = useAuth();

  return (
    <div
      className="relative mx-auto flex h-[100dvh] w-full max-w-xl flex-col overflow-hidden"
      style={{ isolation: "isolate", backgroundColor: "#0B1436", color: "white" }}
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
  const bg = useMemo(() => WELCOME_BGS[Math.floor(Math.random() * WELCOME_BGS.length)], []);

  return (


    <motion.div
      initial={false}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: EASE_IOS }}
      className="relative flex h-full flex-col"
    >
      {/* Full-bleed background image */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <img
          src={bg.url}
          alt=""
          aria-hidden
          draggable={false}
          onLoad={(e) => e.currentTarget.setAttribute("data-loaded", "true")}
          data-loaded="true"
          className="absolute inset-0 h-full w-full select-none object-cover"
          style={{ objectPosition: "center bottom" }}
        />
        {/* Top fade to hide LIVE badge behind the wordmark */}
        <div
          className="absolute inset-x-0 top-0 h-[38%]"
          style={{
            background:
              "linear-gradient(180deg, #0B1436 0%, rgba(11,20,54,0.85) 45%, rgba(11,20,54,0) 100%)",
          }}
        />
        <div
          className="absolute inset-x-0 bottom-0 h-[26%]"
          style={{
            background:
              "linear-gradient(180deg, rgba(11,20,54,0) 0%, rgba(11,20,54,0.7) 55%, #0B1436 100%)",
          }}
        />
      </div>


      {/* Foreground content */}
      <div
        className="relative flex h-full flex-col items-center px-6"
        style={{
          paddingTop: "calc(env(safe-area-inset-top) + 18px)",
          paddingBottom: "calc(env(safe-area-inset-bottom) + 14px)",
        }}
      >
        <motion.img
          initial={{ scale: 0.85, opacity: 0, y: 8 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE_IOS }}
          src={badge.url}
          alt="KIDI+"
          draggable={false}
          className="select-none"
          style={{
            width: 108,
            height: 108,
            filter: "drop-shadow(0 18px 36px rgba(0,0,0,0.5))",
          }}
        />

        {/* KIDI+ wordmark as crisp white text */}
        <motion.h1
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, ease: EASE_IOS, delay: 0.1 }}
          className="mt-2 text-white"
          style={{
            fontSize: 52,
            fontWeight: 900,
            letterSpacing: "-0.02em",
            lineHeight: 1,
            textShadow: "0 4px 20px rgba(0,0,0,0.55)",
          }}
        >
          KIDI<span style={{ color: GOLD }}>+</span>
        </motion.h1>

        <motion.p
          initial={{ y: 8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, ease: EASE_IOS, delay: 0.18 }}
          className="mt-3 text-center text-white"
          style={{
            fontSize: 15,
            lineHeight: 1.35,
            fontWeight: 500,
            textShadow: "0 2px 12px rgba(0,0,0,0.6)",
            maxWidth: 320,
          }}
        >
          {t("auth.welcome.tagline")}
          <br />
          <span style={{ color: GOLD, fontWeight: 700 }}>
            {t("auth.welcome.taglineAccent")}
          </span>
        </motion.p>

        {/* Spacer: push actions up from the bottom while keeping them visible. */}
        <div className="flex-1" style={{ maxHeight: "28vh", minHeight: 0 }} />

        {/* Actions */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.4, ease: EASE_IOS, delay: 0.25 }}
          className="w-full flex flex-col gap-2"
        >
          <Press
            onClick={onSignUp}
            className="!min-h-[50px] h-[50px] w-full rounded-full text-[15px] font-bold"
            style={{
              background: `linear-gradient(180deg, #F7CE5A 0%, ${GOLD} 55%, #D9A73A 100%)`,
              color: "#151022",
              boxShadow:
                "0 12px 28px rgba(245,195,74,0.35), inset 0 1px 0 rgba(255,255,255,0.45)",
            }}
          >
            {t("auth.welcome.signUp")}
          </Press>

          <Press
            onClick={onSignIn}
            className="!min-h-[48px] h-[48px] w-full rounded-full text-[14px] font-semibold text-white"
            style={{
              backgroundColor: "transparent",
              border: "1.5px solid rgba(255,255,255,0.35)",
            }}
          >
            {t("auth.welcome.signIn")}
          </Press>

          {onGuest && (
            <>
              <div className="flex items-center gap-3">
                <span className="h-px flex-1" style={{ background: "rgba(255,255,255,0.22)" }} />
                <span className="text-[10px] font-semibold tracking-[0.22em] text-white/70">
                  {t("auth.welcome.or")}
                </span>
                <span className="h-px flex-1" style={{ background: "rgba(255,255,255,0.22)" }} />
              </div>
              <Press
                onClick={onGuest}
                className="!min-h-[48px] flex h-[48px] w-full items-center justify-center gap-2 rounded-full text-[14px] font-semibold text-white"
                style={{
                  backgroundColor: "transparent",
                  border: "1.5px solid rgba(255,255,255,0.28)",
                }}
              >
                <User size={16} strokeWidth={2} />
                {t("auth.welcome.continueAsGuest")}
              </Press>
            </>
          )}
        </motion.div>

        <div className="flex-1" style={{ maxHeight: "6vh", minHeight: 0 }} />
      </div>
    </motion.div>
  );
}

