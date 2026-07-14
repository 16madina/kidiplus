import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Loader2, LogIn, Store, TrendingUp, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Press } from "@/components/press";
import { BroadcastProvider, useBroadcast } from "@/lib/broadcast-context";
import { FilterProvider } from "@/lib/filters/filter-context";
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
import kidiLiveLogo from "@/assets/kidi-live-logo-v3.png.asset.json";
import sellerHero from "@/assets/seller-hero.png.asset.json";
import { Gavel, Radio, Sparkles } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";



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
            <div className="mx-auto mb-3 grid h-20 w-20 place-items-center overflow-hidden rounded-2xl">
              <img
                src={kidiLiveLogo.url}
                alt="KiDi+"
                className="h-16 w-16 object-contain"
                draggable={false}
                data-loaded="true"
                style={{ filter: "drop-shadow(0 2px 3px rgba(16,22,43,0.25))" }}
              />
            </div>
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
  const [confirmOpen, setConfirmOpen] = useState(false);

  const activateSeller = async () => {
    setConfirmOpen(false);
    setFlipping(true);
    try {
      await becomeSeller();
      haptic.success();
      toast.success(t("broadcast.becomeSellerCreated", { defaultValue: "Ta boutique KiDi+ est créée 🎉 Ajoute tes produits pour commencer." }));
      // Redirect to profile → My Shop so the user can set up banner & products
      window.dispatchEvent(new CustomEvent("kidi:navigate-tab", { detail: "profile" }));
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("kidi:open-my-shop"));
      }, 250);
    } catch (e) {
      haptic.error();
      toast.error(frenchAuthError(e));
    } finally {
      setFlipping(false);
    }
  };



  if (loading || !profile) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="animate-spin text-muted-foreground" size={22} />
      </div>
    );
  }



  if (!profile.is_seller) {
    const NAVY_LOCAL = "#10162B";
    const GOLD_LOCAL = "#D4AF37";
    return (
      <motion.div
        key="become-seller"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE_IOS }}
        className="seller-entry-screen relative flex h-full flex-col overflow-y-auto bg-white pt-safe md:px-8 md:pt-10"
        style={{ paddingBottom: "calc(5.5rem + env(safe-area-inset-bottom))" }}
      >
        {/* Hero image — navy bg with product */}
        <div
          className="seller-entry-hero relative w-full overflow-hidden md:mx-auto md:max-w-2xl md:rounded-3xl"
          style={{
            height: "clamp(290px, 46vh, 390px)",
            backgroundColor: NAVY_LOCAL,
            backgroundImage: `url(${sellerHero.url})`,
            backgroundSize: "cover",
            backgroundPosition: "center 42%",
            backgroundRepeat: "no-repeat",
            borderBottomLeftRadius: 28,
            borderBottomRightRadius: 28,
          }}
        >
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-20"
            style={{ background: "linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.78) 100%)" }}
          />
        </div>

        {/* Content */}
        <div className="seller-entry-content relative -mt-4 flex flex-col items-center px-6 text-center">
          <h1 className="text-[26px] font-black leading-tight" style={{ color: NAVY_LOCAL, fontFamily: "'Inter', system-ui, sans-serif" }}>
            {t("broadcast.seller.title", { defaultValue: "Vends en direct sur KiDi+" })}
          </h1>
          <p className="mt-3 max-w-xs text-[14px] leading-snug" style={{ color: `${NAVY_LOCAL}99` }}>
            {t("broadcast.seller.subtitle", { defaultValue: "Crée tes lives, présente tes articles et laisse les acheteurs enchérir en temps réel." })}
          </p>

          {/* 3 features */}
          <div className="mt-6 flex w-full max-w-sm items-start justify-between">
            <FeatureItem
              icon={<Radio size={22} strokeWidth={2.2} />}
              label={t("broadcast.seller.f1", { defaultValue: "Lance ton live" })}
              navy={NAVY_LOCAL}
              gold={GOLD_LOCAL}
            />
            <div className="mx-1 h-12 w-px self-center" style={{ backgroundColor: `${NAVY_LOCAL}22` }} />
            <FeatureItem
              icon={<Gavel size={22} strokeWidth={2.2} />}
              label={t("broadcast.seller.f2", { defaultValue: "Reçois des enchères" })}
              navy={NAVY_LOCAL}
              gold={GOLD_LOCAL}
            />
            <div className="mx-1 h-12 w-px self-center" style={{ backgroundColor: `${NAVY_LOCAL}22` }} />
            <FeatureItem
              icon={<TrendingUp size={22} strokeWidth={2.2} />}
              label={t("broadcast.seller.f3", { defaultValue: "Développe tes ventes" })}
              navy={NAVY_LOCAL}
              gold={GOLD_LOCAL}
            />
          </div>

          {/* Gold CTA */}
          <Press
            onClick={() => { haptic.light(); setConfirmOpen(true); }}
            disabled={flipping}
            className="!min-h-14 mt-7 flex h-14 w-full max-w-sm items-center justify-between rounded-full px-6 text-[16px] font-black"
            style={{
              background: `linear-gradient(180deg, #E8C86A 0%, ${GOLD_LOCAL} 55%, #B8912C 100%)`,
              color: NAVY_LOCAL,
              boxShadow: "0 12px 28px -10px rgba(212,175,55,0.7), inset 0 1px 0 rgba(255,255,255,0.55), inset 0 -2px 0 rgba(120,90,10,0.35)",
              border: "1px solid rgba(184,145,44,0.6)",
              opacity: flipping ? 0.75 : 1,
            }}
          >
            <span className="flex-1 text-center">
              {flipping ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin" /> {t("common.loading")}
                </span>
              ) : (
                t("broadcast.seller.cta", { defaultValue: "Activer mon espace vendeur" })
              )}
            </span>
            {!flipping && <ArrowRight size={20} strokeWidth={2.4} />}
          </Press>

          <p className="mt-3 text-[12px]" style={{ color: `${NAVY_LOCAL}80` }}>
            {t("broadcast.seller.free", { defaultValue: "Activation rapide et gratuite." })}
          </p>
        </div>

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("broadcast.createShopTitle", { defaultValue: "Voulez-vous créer votre boutique KiDi+ ?" })}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("broadcast.createShopBody", { defaultValue: "En confirmant, ta boutique est créée et tu deviens vendeur. Tu pourras ensuite ajouter tes produits et lancer des lives. Sans boutique, tu restes en mode visiteur." })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>
                {t("common.no", { defaultValue: "Non" })}
              </AlertDialogCancel>
              <AlertDialogAction onClick={() => { void activateSeller(); }}>
                {t("broadcast.createShopConfirm", { defaultValue: "Oui, créer ma boutique" })}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </motion.div>
    );
  }



  return (
    <BroadcastProvider>
      <BroadcastFlow />
    </BroadcastProvider>
  );
}

function FeatureItem({
  icon,
  label,
  navy,
  gold,
}: {
  icon: React.ReactNode;
  label: string;
  navy: string;
  gold: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1.5">
      <div style={{ color: gold }}>{icon}</div>
      <span className="text-[11px] font-bold leading-tight" style={{ color: navy }}>
        {label}
      </span>
    </div>
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
    <FilterProvider>
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

