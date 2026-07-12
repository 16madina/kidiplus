import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, LogIn, Store, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Press } from "@/components/press";
import { BroadcastProvider, useBroadcast } from "@/lib/broadcast-context";
import { BroadcastSetup } from "@/components/broadcast/broadcast-setup";
import { BroadcastLive } from "@/components/broadcast/broadcast-live";
import { BroadcastSummary } from "@/components/broadcast/broadcast-summary";
import { GoLiveEntryScreen } from "@/screens/golive-entry-screen";
import { useAuth, frenchAuthError } from "@/lib/auth-context";
import { useAuthPrompt } from "@/lib/auth-prompt-context";
import { EASE_IOS } from "@/lib/motion";
import { haptic } from "@/lib/haptics";
import { ErrorBoundary } from "@/components/error-boundary";
import { RESUME_HOST_LIVE_EVENT } from "@/components/home/host-open-live-banner";
import guestLiveHero from "@/assets/guest-live-hero.png.asset.json";
import kidiLiveLogo from "@/assets/kidi-live-logo.png.asset.json";
import { Gavel, Radio, Sparkles } from "lucide-react";

const GOLD = "#D4AF37";
const NAVY = "#10162B";

export function LiveScreen() {
  const { t } = useTranslation();
  const { guestMode } = useAuth();
  const { openAuth } = useAuthPrompt();
  if (guestMode) {
    return (
      <div className="relative flex h-full flex-col overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${guestLiveHero.url})`,
            backgroundSize: "cover",
            backgroundPosition: "center top",
            backgroundRepeat: "no-repeat",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(251,246,236,0.96) 0%, rgba(251,246,236,0.45) 35%, rgba(251,246,236,0.35) 60%, rgba(251,246,236,0.92) 100%)",
          }}
        />
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE_IOS }}
          className="relative z-10 flex flex-1 flex-col px-6 pt-safe text-center"
          style={{ paddingBottom: "calc(5rem + env(safe-area-inset-bottom))" }}
        >
          <div className="mt-4">
            <img
              src={kidiLiveLogo.url}
              alt="KiDi+"
              className="mx-auto mb-3 h-20 w-20 object-contain drop-shadow-[0_8px_20px_rgba(16,22,43,0.35)]"
              draggable={false}
            />
            <h2 className="text-[22px] font-black leading-tight" style={{ color: NAVY }}>
              {t("guest.live.title", { defaultValue: "Crée un compte pour vendre en live" })}
            </h2>
            <p className="mx-auto mt-2 max-w-xs text-[14px] leading-snug" style={{ color: `${NAVY}B3` }}>
              {t("guest.live.subtitle", { defaultValue: "Lance ton live shopping en quelques secondes et vends à ta communauté." })}
            </p>
          </div>

          {/* Floating feature pills */}
          <div className="pointer-events-none relative mt-4 flex-1">
            <FloatingPill
              icon={<Radio size={14} />}
              label={t("guest.live.pill1", { defaultValue: "Prêt à démarrer un live ?" })}
              style={{ top: "8%", left: "-2%" }}
              delay={0.15}
            />
            <FloatingPill
              icon={<Gavel size={14} />}
              label={t("guest.live.pill2", { defaultValue: "Vends aux enchères en direct" })}
              style={{ top: "38%", right: "-2%" }}
              delay={0.3}
              tone="gold"
            />
            <FloatingPill
              icon={<Sparkles size={14} />}
              label={t("guest.live.pill3", { defaultValue: "Crée ton compte gratuitement" })}
              style={{ top: "68%", left: "6%" }}
              delay={0.45}
            />
          </div>

          <div className="mt-auto flex w-full flex-col gap-2.5">
            <Press
              onClick={() => { haptic.light(); openAuth(); }}
              className="!min-h-12 flex h-12 items-center justify-center gap-2 rounded-full text-[15px] font-bold text-white"
              style={{ background: GOLD, boxShadow: "0 10px 24px -8px rgba(212,175,55,0.55)" }}
            >
              <UserPlus size={16} />
              {t("auth.prompt.signUp", { defaultValue: "Créer un compte" })}
            </Press>
            <Press
              onClick={() => { haptic.light(); openAuth(); }}
              className="!min-h-12 flex h-12 items-center justify-center gap-2 rounded-full text-[15px] font-bold text-white"
              style={{ background: NAVY, boxShadow: "0 10px 24px -8px rgba(16,22,43,0.35)" }}
            >
              <LogIn size={16} />
              {t("auth.prompt.signIn", { defaultValue: "Se connecter" })}
            </Press>
          </div>
        </motion.div>
      </div>
    );
  }
  return <LiveScreenAuthed />;
}

function FloatingPill({
  icon,
  label,
  style,
  delay = 0,
  tone = "navy",
}: {
  icon: React.ReactNode;
  label: string;
  style?: React.CSSProperties;
  delay?: number;
  tone?: "navy" | "gold";
}) {
  const bg = tone === "gold" ? GOLD : NAVY;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: [0, -6, 0] }}
      transition={{
        opacity: { duration: 0.4, delay, ease: EASE_IOS },
        y: { duration: 3.6, delay, repeat: Infinity, ease: "easeInOut" },
      }}
      className="pointer-events-auto absolute inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold text-white shadow-lg backdrop-blur-md"
      style={{ background: `${bg}E6`, boxShadow: `0 8px 20px -6px ${bg}66`, ...style }}
    >
      {icon}
      {label}
    </motion.div>
  );
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
          paddingBottom: "calc(5.5rem + env(safe-area-inset-bottom))",
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
        <h1 className="text-[24px] font-bold">{t("broadcast.becomeSellerTitle")}</h1>
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
  const {
    stage, goEntry, goSetup, goLive, goSummary, reset,
    setHost, setCurrency, setLiveId, setRoomName, setTitle, setCategory, setCover, setSession,
  } = useBroadcast();
  const { profile, user } = useAuth();
  const [openLives, setOpenLives] = useState<Array<{
    id: string;
    title: string;
    room_name: string;
    cover_url: string | null;
    category: string | null;
    currency: string | null;
  }>>([]);
  const [endingAll, setEndingAll] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const reconnectRef = useRef<(preferredId?: string) => Promise<void>>(async () => {});

  useEffect(() => {
    if (user && profile) {
      setHost(user.id, profile.display_name || profile.handle);
      if (profile.currency) setCurrency(profile.currency);
    }
  }, [user, profile, setHost, setCurrency]);

  const endAllOpen = async () => {
    setEndingAll(true);
    const { endLiveInDb } = await import("@/lib/lives-db");
    await Promise.all(openLives.map((d) => endLiveInDb(d.id).catch(() => {})));
    setOpenLives([]);
    setEndingAll(false);
    toast.success(t("live.danglingEnded", "Lives précédents terminés"));
  };

  const reconnectToLive = async (preferredId?: string) => {
    let list = openLives;
    if (preferredId && list.every((l) => l.id !== preferredId) && user) {
      const { findOpenLives } = await import("@/lib/lives-db");
      const rows = await findOpenLives(user.id);
      list = rows.map((r) => ({
        id: r.id,
        title: r.title,
        room_name: r.room_name,
        cover_url: r.cover_url,
        category: r.category,
        currency: r.currency,
      }));
      setOpenLives(list);
    }
    const target =
      (preferredId ? list.find((l) => l.id === preferredId) : null) ?? list[0];
    if (!target) return;
    setReconnecting(true);
    try {
      const extras = list.filter((l) => l.id !== target.id);
      if (extras.length > 0) {
        const { endLiveInDb } = await import("@/lib/lives-db");
        await Promise.all(extras.map((d) => endLiveInDb(d.id).catch(() => {})));
      }
      const { markLiveActiveInDb, touchLiveHostInDb } = await import("@/lib/lives-db");
      await markLiveActiveInDb(target.id).catch(() => {});
      await touchLiveHostInDb(target.id).catch(() => {});

      setLiveId(target.id);
      setRoomName(target.room_name);
      setTitle(target.title);
      if (target.category) setCategory(target.category);
      if (target.cover_url) setCover(target.cover_url);
      const cur = (target.currency ?? profile?.currency ?? "EUR").toUpperCase();
      if (cur === "XOF" || cur === "EUR" || cur === "CAD") setCurrency(cur);
      setSession({
        title: target.title,
        category: target.category || "Fashion",
        cover: target.cover_url,
        durationSec: 0,
        peakViewers: 0,
        sales: [],
      });
      setOpenLives([]);
      haptic.success();
      goLive();
      toast.success(t("live.danglingReconnected", "Reconnecté au live"));
    } catch (e) {
      haptic.error();
      toast.error(e instanceof Error ? e.message : t("common.error", "Une erreur est survenue"));
    } finally {
      setReconnecting(false);
    }
  };
  reconnectRef.current = reconnectToLive;

  useEffect(() => {
    if (!user || stage !== "entry") return;
    let alive = true;
    void (async () => {
      const {
        expireAbandonedLivesInDb,
        findOpenLives,
        notifyAbsentHostLivesInDb,
      } = await import("@/lib/lives-db");
      await notifyAbsentHostLivesInDb(2, 5).catch(() => 0);
      await expireAbandonedLivesInDb(user.id, 5).catch(() => 0);
      if (!alive) return;
      const rows = await findOpenLives(user.id);
      if (alive) {
        setOpenLives(
          rows.map((r) => ({
            id: r.id,
            title: r.title,
            room_name: r.room_name,
            cover_url: r.cover_url,
            category: r.category,
            currency: r.currency,
          })),
        );
      }
    })();
    return () => { alive = false; };
  }, [user, stage]);

  // Home banner / push deep-link → resume this host live.
  useEffect(() => {
    const onResume = (e: Event) => {
      const liveId = (e as CustomEvent<{ live_id?: string | null }>).detail?.live_id;
      if (stage === "live") return;
      void reconnectRef.current(liveId ?? undefined);
    };
    window.addEventListener(RESUME_HOST_LIVE_EVENT, onResume as EventListener);
    return () => window.removeEventListener(RESUME_HOST_LIVE_EVENT, onResume as EventListener);
  }, [stage]);

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
      {stage === "entry" && openLives.length > 0 && (
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
            {t("live.danglingTitle", { count: openLives.length, defaultValue: "{{count}} live(s) toujours ouvert(s)" })}
          </p>
          <p className="mt-0.5 text-[11px] opacity-90 leading-tight">
            {openLives[0]?.title
              ? t("live.danglingReconnectBody", {
                  title: openLives[0].title,
                  defaultValue: "« {{title}} » — reconnecte-toi ou termine le live. Fermeture auto après 5 min d'absence.",
                })
              : t("live.danglingBody", "Termine-les avant d'en lancer un nouveau.")}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Press
              onClick={() => { void reconnectToLive(); }}
              disabled={reconnecting || endingAll}
              className="!min-h-8 h-8 rounded-full bg-white px-3 text-[12px] font-bold text-red-600"
            >
              {reconnecting
                ? t("common.loading")
                : t("live.danglingReconnect", "Reprendre le live")}
            </Press>
            <Press
              onClick={() => { void endAllOpen(); }}
              disabled={endingAll || reconnecting}
              className="!min-h-8 h-8 rounded-full px-3 text-[12px] font-bold text-white"
              style={{ backgroundColor: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.45)" }}
            >
              {endingAll ? t("common.loading") : t("live.danglingEndAll", "Tout terminer")}
            </Press>
          </div>
        </div>
      )}
    </div>
  );
}

