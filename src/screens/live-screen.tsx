import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Store } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Press } from "@/components/press";
import { BroadcastProvider, useBroadcast } from "@/lib/broadcast-context";
import { BroadcastSetup } from "@/components/broadcast/broadcast-setup";
import { BroadcastLive } from "@/components/broadcast/broadcast-live";
import { BroadcastSummary } from "@/components/broadcast/broadcast-summary";
import { GoLiveEntryScreen } from "@/screens/golive-entry-screen";
import { useAuth, frenchAuthError } from "@/lib/auth-context";
import { EASE_IOS } from "@/lib/motion";
import { haptic } from "@/lib/haptics";
import { useState } from "react";
import { ErrorBoundary } from "@/components/error-boundary";
import { GuestEmptyState } from "@/components/guest-empty-state";



export function LiveScreen() {
  const { t } = useTranslation();
  const { guestMode } = useAuth();
  if (guestMode) {
    return (
      <GuestEmptyState
        icon={<Store size={40} className="text-accent" />}
        title={t("guest.live.title", { defaultValue: "Crée un compte pour vendre en live" })}
        subtitle={t("guest.live.subtitle", { defaultValue: "Lance ton live shopping en quelques secondes et vends à ta communauté." })}
      />
    );
  }
  return <LiveScreenAuthed />;
}

function LiveScreenAuthed() {
  const { t } = useTranslation();
  const { profile, loading, becomeSeller } = useAuth();
  const [flipping, setFlipping] = useState(false);

  if (loading || !profile) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="animate-spin text-muted-foreground" size={22} />
      </div>
    );
  }



  if (!profile.is_seller) {
    return (
      <motion.div
        key="become-seller"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: EASE_IOS }}
        className="flex h-full flex-col items-center justify-center px-6 pt-safe text-center"
        style={{
          paddingBottom: "calc(3.5rem + env(safe-area-inset-bottom))",
        }}
      >
        <div
          className="mb-4 grid h-16 w-16 place-items-center rounded-2xl"
          style={{
            background:
              "linear-gradient(135deg, oklch(0.7 0.26 15), oklch(0.62 0.24 20))",
          }}
        >
          <Store size={30} color="white" />
        </div>
        <h1 className="text-[24px] font-bold">{t("broadcast.becomeSellerTitle")} ✨</h1>
        <p className="mt-2 max-w-xs text-[14px] leading-snug text-muted-foreground">
          {t("broadcast.becomeSellerBody")}
        </p>
        <Press
          onClick={async () => {
            setFlipping(true);
            try {
              await becomeSeller();
              haptic.success();
              toast.success(t("broadcast.becomeSellerCta") + " 🎉");
            } catch (e) {
              haptic.error();
              toast.error(frenchAuthError(e));
            } finally {
              setFlipping(false);
            }
          }}
          disabled={flipping}
          className="!min-h-12 mt-8 h-12 w-full max-w-xs rounded-2xl text-[15px] font-bold text-white"
          style={{
            background:
              "linear-gradient(135deg, oklch(0.7 0.26 15), oklch(0.62 0.24 20))",
            opacity: flipping ? 0.7 : 1,
          }}
        >
          {flipping ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 size={16} className="animate-spin" /> {t("common.loading")}
            </span>
          ) : (
            t("broadcast.becomeSellerCta")
          )}
        </Press>
      </motion.div>
    );
  }

  return (
    <BroadcastProvider>
      <BroadcastFlow />
    </BroadcastProvider>
  );
}

function BroadcastFlow() {
  const { t } = useTranslation();
  const { stage, goEntry, goSetup, goLive, goSummary, reset, setHost, setCurrency } = useBroadcast();
  const { profile, user } = useAuth();
  const [dangling, setDangling] = useState<Array<{ id: string; title: string }>>([]);
  const [endingAll, setEndingAll] = useState(false);

  useEffect(() => {
    if (user && profile) {
      setHost(user.id, profile.display_name || profile.handle);
      if (profile.currency) setCurrency(profile.currency);
    }
  }, [user, profile, setHost, setCurrency]);

  useEffect(() => {
    if (!user || stage !== "entry") return;
    let alive = true;
    void import("@/lib/lives-db").then(({ findDanglingLives }) =>
      findDanglingLives(user.id).then((rows) => {
        if (alive) setDangling(rows.map((r) => ({ id: r.id, title: r.title })));
      }),
    );
    return () => { alive = false; };
  }, [user, stage]);

  const endAllDangling = async () => {
    setEndingAll(true);
    const { endLiveInDb } = await import("@/lib/lives-db");
    await Promise.all(dangling.map((d) => endLiveInDb(d.id).catch(() => {})));
    setDangling([]);
    setEndingAll(false);
    toast.success(t("live.danglingEnded", "Lives précédents terminés"));
  };

  const closeToHome = () => {
    reset();
    window.dispatchEvent(new CustomEvent("kidi:navigate-tab", { detail: "home" }));
  };

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Entry stays mounted while setup is open so scroll and list state
          are preserved when the user comes back. */}
      {(stage === "entry" || stage === "setup") && (
        <div
          className="absolute inset-0"
          style={{ visibility: stage === "entry" ? "visible" : "hidden" }}
          aria-hidden={stage !== "entry"}
        >
          <GoLiveEntryScreen
            onClose={closeToHome}
            onStartNow={() => goSetup()}
            onSchedule={() => goSetup()}
            onEdit={() => goSetup()}
            onStartScheduled={() => goLive()}
          />
        </div>
      )}
      <AnimatePresence mode="wait">
        {stage === "setup" && (
          <BroadcastSetup
            key="setup"
            onExit={() => goEntry()}
          />
        )}
        {stage === "live" && (
          <ErrorBoundary key="live" boundary="broadcast_live" onReset={() => goSummary()}>
            <BroadcastLive onEnd={() => goSummary()} />
          </ErrorBoundary>
        )}

        {stage === "summary" && (
          <BroadcastSummary key="summary" onDone={() => goEntry()} />
        )}
      </AnimatePresence>
      {stage === "entry" && dangling.length > 0 && (

        <div
          className="absolute inset-x-3 z-40 rounded-2xl px-3 py-2.5 text-white shadow-lg"
          style={{
            top: "calc(env(safe-area-inset-top) + 62px)",
            backgroundColor: "rgba(220, 30, 40, 0.92)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
          }}
        >
          <p className="text-[12px] font-semibold leading-tight">
            {t("live.danglingTitle", { count: dangling.length, defaultValue: "{{count}} live(s) toujours ouvert(s)" })}
          </p>
          <p className="mt-0.5 text-[11px] opacity-90 leading-tight">
            {t("live.danglingBody", "Termine les avant d'en lancer un nouveau.")}
          </p>
          <Press
            onClick={endAllDangling}
            disabled={endingAll}
            className="!min-h-8 mt-2 h-8 rounded-full bg-white px-3 text-[12px] font-bold text-red-600"
          >
            {endingAll ? t("common.loading") : t("live.danglingEndAll", "Terminer tout")}
          </Press>
        </div>
      )}
    </div>
  );
}

