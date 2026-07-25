import { useCallback, useContext, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Radio, Calendar as CalendarIcon, Loader2, Play, Pencil, Trash2, ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Press } from "@/components/press";
import { Logo } from "@/components/brand/logo";
import { useBroadcast } from "@/lib/broadcast-context";
import { useAuth } from "@/lib/auth-context";
import { EASE_IOS, listContainer, listItem } from "@/lib/motion";
import { haptic } from "@/lib/haptics";
import { useImmersiveScope } from "@/lib/immersive-context";
import { TabVisibilityContext } from "@/components/app-shell";
import {
  fetchMyScheduledLives,
  fetchScheduledLiveWithProducts,
  cancelScheduledLiveInDb,
  startScheduledLiveInDb,
  scheduledStartWindow,
  resolveLiveImage,
  type ScheduledLiveRow,
} from "@/lib/lives-db";
import { notifyLiveReminders } from "@/lib/live-reminders-db";
import startBgAsset from "@/assets/golive-start-bg.png.asset.json";
import scheduleBgAsset from "@/assets/golive-schedule-bg.png.asset.json";

const GOLD = "#E4B438";
const GOLD_DIM = "rgba(228,180,56,0.42)";
const NAVY_A = "#0B1938";
const NAVY_B = "#061331";
const LIVE_RED = "#E5393F";


function formatDateChip(iso: string, lang: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const hh = d.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return `${lang.startsWith("fr") ? "Aujourd'hui" : "Today"} · ${hh}`;
  if (isTomorrow) return `${lang.startsWith("fr") ? "Demain" : "Tomorrow"} · ${hh}`;
  return d.toLocaleDateString(lang, { weekday: "short", day: "numeric", month: "short" }) + ` · ${hh}`;
}

export function GoLiveEntryScreen({
  onClose,
  onStartNow,
  onSchedule,
  onEdit,
  onStartScheduled,
}: {
  onClose: () => void;
  onStartNow: () => void;
  onSchedule: () => void;
  onEdit: (row: ScheduledLiveRow) => void;
  onStartScheduled: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const b = useBroadcast();
  const tabVisible = useContext(TabVisibilityContext);
  useImmersiveScope(tabVisible);

  const [scheduled, setScheduled] = useState<ScheduledLiveRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<ScheduledLiveRow | null>(null);
  const [covers, setCovers] = useState<Record<string, string>>({});

  const reload = useCallback(async () => {
    if (!user) return;
    setLoadingList(true);
    const rows = await fetchMyScheduledLives(user.id);
    setScheduled(rows);
    setLoadingList(false);
    const entries = await Promise.all(
      rows
        .filter((r) => r.cover_url)
        .map(async (r) => [r.id, (await resolveLiveImage("live-covers", r.cover_url, "card")) ?? ""] as const),
    );
    setCovers(Object.fromEntries(entries));
  }, [user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const onChanged = () => void reload();
    window.addEventListener("kidi:scheduled-lives-changed", onChanged);
    return () => window.removeEventListener("kidi:scheduled-lives-changed", onChanged);
  }, [reload]);

  const loadIntoForm = async (row: ScheduledLiveRow) => {
    setBusyId(row.id);
    try {
      const full = await fetchScheduledLiveWithProducts(row.id);
      if (!full) throw new Error("not_found");
      b.setEditingLiveId(full.id);
      b.setMode("edit");
      b.setTitle(full.title);
      b.setCategory(full.category ?? "Fashion");
      b.setScheduledAt(full.scheduled_at);
      b.setAllowGifts(full.allow_gifts !== false);
      b.setStreamSource(full.broadcast_mode === "rtmp" ? "rtmp" : "camera");
      b.setRtmpCreds(null);
      b.setCoverFile(null);

      const resolvedCover = full.cover_url
        ? (await resolveLiveImage("live-covers", full.cover_url)) ?? null
        : null;
      b.setCover(resolvedCover);
      b.clearProducts();
      for (const p of full.products) {
        const img = p.image_url
          ? (await resolveLiveImage("live-products", p.image_url)) ?? p.image_url
          : "";
        const extras = await Promise.all(
          (p.extra_images ?? []).map(async (path) =>
            (await resolveLiveImage("live-products", path)) ?? path,
          ),
        );
        b.addProduct({
          name: p.name,
          image: img,
          mode: p.mode,
          startPrice: Number(p.start_price),
          price: Number(p.price),
          stock: Number(p.stock),
          timerSec: Number(p.timer_seconds),
          description: p.description ?? undefined,
          brand: p.brand ?? undefined,
          condition: p.condition ?? null,
          colors: p.colors ?? [],
          sizes: p.sizes ?? [],
          extraImages: extras.length ? extras : undefined,
          bidIncrement: p.bid_increment ?? null,
        });
      }
      onEdit(row);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusyId(null);
    }
  };

  const startNow = async (row: ScheduledLiveRow) => {
    setBusyId(row.id);
    try {
      const res = await startScheduledLiveInDb(row.id);
      if (!res.ok) throw new Error(res.error ?? "start_failed");
      // Load products into context, then jump straight to live stage.
      const full = await fetchScheduledLiveWithProducts(row.id);
      if (!full) throw new Error("not_found");
      b.setTitle(full.title);
      b.setCategory(full.category ?? "Fashion");
      b.setCover(full.cover_url ? await resolveLiveImage("live-covers", full.cover_url) : null);
      b.clearProducts();
      for (const p of full.products) {
        const img = p.image_url
          ? (await resolveLiveImage("live-products", p.image_url)) ?? p.image_url
          : "";
        const extras = await Promise.all(
          (p.extra_images ?? []).map(async (path) =>
            (await resolveLiveImage("live-products", path)) ?? path,
          ),
        );
        b.addProduct({
          name: p.name,
          image: img,
          mode: p.mode,
          startPrice: Number(p.start_price),
          price: Number(p.price),
          stock: Number(p.stock),
          timerSec: Number(p.timer_seconds),
          description: p.description ?? undefined,
          brand: p.brand ?? undefined,
          condition: p.condition ?? null,
          colors: p.colors ?? [],
          sizes: p.sizes ?? [],
          extraImages: extras.length ? extras : undefined,
          bidIncrement: p.bid_increment ?? null,
        });
      }
      b.setProductDbIds(res.productIds ?? []);
      b.setRoomName(res.roomName ?? null);
      b.setLiveId(row.id);
      b.setAllowGifts(full.allow_gifts !== false);
      const useRtmp = full.broadcast_mode === "rtmp";
      b.setStreamSource(useRtmp ? "rtmp" : "camera");
      if (useRtmp) {
        const { createLiveIngress } = await import("@/lib/livekit-ingress");
        try {
          const creds = await createLiveIngress(row.id);
          b.setRtmpCreds(creds);
        } catch (ingressErr) {
          const msg =
            ingressErr instanceof Error ? ingressErr.message : String(ingressErr);
          toast.error(
            t("broadcast.rtmp.createFailed", "Impossible de créer le lien RTMP") +
              ` — ${msg}`,
          );
          return;
        }
      } else {
        b.setRtmpCreds(null);
      }
      // Fire-and-forget reminder notifications
      void notifyLiveReminders(row.id);
      haptic.success();
      onStartScheduled();
    } catch (e) {
      haptic.error();
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("expired")) {
        toast.error(t("golive.entry.expiredToast", "Ce live programmé a expiré"));
        void reload();
      } else if (msg.includes("too_early")) {
        toast.error(t("golive.entry.tooEarlyToast", "Tu pourras démarrer 15 min avant l'heure"));
      } else {
        toast.error(msg);
      }
    } finally {
      setBusyId(null);
    }
  };

  const cancel = async (row: ScheduledLiveRow) => {
    setBusyId(row.id);
    try {
      await cancelScheduledLiveInDb(row.id);
      setScheduled((prev) => prev.filter((r) => r.id !== row.id));
      haptic.success();
      toast.success(t("golive.entry.cancelled", "Live annulé"));
    } catch (e) {
      haptic.error();
      toast.error(String(e));
    } finally {
      setBusyId(null);
      setConfirmCancel(null);
    }
  };

  return (
    <motion.div
      key="entry"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, ease: EASE_IOS }}
      className="relative flex h-full w-full flex-col overflow-hidden"
      style={{
        background: `radial-gradient(120% 80% at 50% 0%, ${NAVY_A} 0%, ${NAVY_B} 60%, #000 100%)`,
      }}
    >
      {/* Top bar — fixed, non-scrolling */}
      <div
        className="relative z-30 flex shrink-0 items-center justify-between px-3"
        style={{
          paddingTop: "calc(env(safe-area-inset-top) + 2px)",
          paddingBottom: 6,
        }}
      >
        <Press
          onClick={onClose}
          aria-label={t("common.close")}
          className="!min-h-11 !min-w-11 rounded-full text-white"
          style={{ backgroundColor: "rgba(255,255,255,0.12)", backdropFilter: "blur(10px)" }}
        >
          <X size={22} />
        </Press>
        <div className="relative flex-1 grid place-items-center">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10"
            style={{
              background:
                "radial-gradient(60% 100% at 50% 55%, rgba(255,205,110,0.45), transparent 70%)",
              filter: "blur(22px)",
            }}
          />
          <div style={{ filter: "drop-shadow(0 2px 10px rgba(255,205,110,0.28))" }}>
            <Logo size={72} />
          </div>
          <div
            aria-hidden
            className="mt-1 h-px w-24"
            style={{
              background: `linear-gradient(to right, transparent, ${GOLD}, transparent)`,
            }}
          />
        </div>
        <div className="h-11 w-11" />
      </div>

      {/* Scrollable content */}
      <div className="min-h-0 flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: "touch" }}>
      <div className="px-5 pt-3 text-center">

        <h1 className="text-[30px] font-black text-white" style={{ letterSpacing: "-0.02em" }}>
          {t("golive.entry.title", "Passe en direct")}
        </h1>
        <p className="mt-2 text-[14px] leading-snug text-white/70">
          {t("golive.entry.subtitle", "Commence maintenant ou programme un live pour ta communauté.")}
        </p>
      </div>

      {/* Choice cards */}
      <div className="grid grid-cols-2 gap-3 px-4 pt-3">
        <ChoiceCard
          image={startBgAsset.url}
          badge={{ label: t("golive.entry.liveBadge", "EN DIRECT"), variant: "live" }}
          icon={<Radio size={22} color={GOLD} strokeWidth={2.4} />}
          title={t("golive.entry.startNow", "Commencer un live")}
          subtitle={t("golive.entry.startNowSub", "Passe en direct maintenant")}
          onPress={() => {
            haptic.medium();
            b.reset();
            b.setMode("now");
            onStartNow();
          }}
        />
        <ChoiceCard
          image={scheduleBgAsset.url}
          badge={{ label: t("golive.entry.planBadge", "PLANIFIER"), variant: "plan" }}
          icon={<CalendarIcon size={22} color={GOLD} strokeWidth={2.4} />}
          title={t("golive.entry.schedule", "Programmer un live")}
          subtitle={t("golive.entry.scheduleSub", "Annonce ton live et prépare tes articles")}
          onPress={() => {
            haptic.medium();
            b.reset();
            b.setMode("schedule");
            onSchedule();
          }}
        />
      </div>

      {/* Scheduled list */}
      <div className="px-5 pt-5" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 40px)" }}>
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-white">
            {t("golive.entry.myScheduled", "Mes lives programmés")}
          </h2>
          {loadingList && <Loader2 size={16} className="animate-spin text-white/60" />}
        </div>
        {!loadingList && scheduled.length === 0 && (
          <div
            className="mt-3 flex items-center gap-3 px-4 py-4"
            style={{
              borderRadius: 22,
              border: `1px solid ${GOLD_DIM}`,
              background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))",
              boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
            }}
          >
            <div
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
              style={{
                background: "rgba(228,180,56,0.10)",
                border: `1px solid ${GOLD_DIM}`,
              }}
            >
              <CalendarIcon size={22} color={GOLD} strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1 text-[13.5px] font-semibold text-white">
              {t("golive.entry.emptyScheduled", "Aucun live programmé")}
            </div>
            <Press
              onClick={() => {
                haptic.medium();
                b.reset();
                b.setMode("schedule");
                onSchedule();
              }}
              className="!min-h-9 h-9 shrink-0 rounded-full px-3 text-[12px] font-bold"
              style={{
                color: GOLD,
                border: `1px solid ${GOLD}`,
                backgroundColor: "rgba(228,180,56,0.06)",
              }}
            >
              {t("golive.entry.emptyScheduledCta", "Programmer")}
            </Press>
          </div>
        )}

        <motion.ul variants={listContainer} initial="hidden" animate="show" className="mt-3 flex flex-col gap-2">
          {scheduled.map((row) => {
            // ready = from 15 min before until 60 min after; expired after that.
            const window = scheduledStartWindow(row.scheduled_at);
            const isTime = window === "ready";
            const isExpired = window === "expired";
            return (
              <motion.li
                key={row.id}
                variants={listItem}
                className="flex items-center gap-3 rounded-2xl p-2.5"
                style={{
                  backgroundColor: "rgba(255,255,255,0.06)",
                  border: `1px solid ${isTime ? GOLD_DIM : isExpired ? "rgba(220,60,70,0.35)" : "rgba(255,255,255,0.08)"}`,
                  opacity: isExpired ? 0.75 : 1,
                }}
              >
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-white/10">
                  {covers[row.id] && (
                    <img
                      src={covers[row.id]}
                      alt=""
                      className="h-full w-full object-cover"
                      onLoad={(e) => e.currentTarget.setAttribute("data-loaded", "true")}
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-white">{row.title}</div>
                  <div className="mt-0.5 truncate text-[11px] text-white/60">
                    {isExpired
                      ? t("golive.entry.expired", "Expiré")
                      : row.scheduled_at
                        ? formatDateChip(row.scheduled_at, i18n.language)
                        : ""}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {isTime ? (
                    <Press
                      onClick={() => startNow(row)}
                      disabled={busyId === row.id}
                      className="!min-h-9 h-9 rounded-full px-3 text-[11.5px] font-bold text-black"
                      style={{
                        backgroundColor: GOLD,
                        animation: "kidiPulse 1.8s ease-in-out infinite",
                        boxShadow: `0 6px 18px ${GOLD_DIM}`,
                      }}
                      aria-label={t("golive.entry.startNowPill", "C'est l'heure ! Démarrer")}
                    >
                      <Play size={12} className="mr-1 inline" fill="currentColor" />
                      {t("golive.entry.startNowPill", "C'est l'heure !")}
                    </Press>
                  ) : (
                    <>
                      {!isExpired && (
                        <Press
                          onClick={() => loadIntoForm(row)}
                          disabled={busyId === row.id}
                          aria-label={t("common.edit")}
                          className="!min-h-9 !min-w-9 h-9 w-9 rounded-full text-white"
                          style={{ backgroundColor: "rgba(255,255,255,0.14)" }}
                        >
                          <Pencil size={14} />
                        </Press>
                      )}
                      <Press
                        onClick={() => setConfirmCancel(row)}
                        disabled={busyId === row.id}
                        aria-label={t("common.cancel")}
                        className="!min-h-9 !min-w-9 h-9 w-9 rounded-full text-white"
                        style={{ backgroundColor: "rgba(220,60,70,0.28)" }}
                      >
                        <Trash2 size={14} />
                      </Press>
                    </>
                  )}
                </div>
              </motion.li>
            );
          })}
        </motion.ul>
      </div>
      </div>

      {/* Confirm cancel */}

      <AnimatePresence>
        {confirmCancel && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center"
            initial={{ backgroundColor: "rgba(0,0,0,0)" }}
            animate={{ backgroundColor: "rgba(0,0,0,0.55)" }}
            exit={{ backgroundColor: "rgba(0,0,0,0)" }}
            onClick={() => setConfirmCancel(null)}
          >
            <motion.div
              onClick={(e) => e.stopPropagation()}
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ duration: 0.2, ease: EASE_IOS }}
              className="w-full max-w-md rounded-t-3xl bg-neutral-900 p-5"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)" }}
            >
              <div className="text-[16px] font-bold text-white">
                {t("golive.entry.confirmCancelTitle", "Annuler ce live programmé ?")}
              </div>
              <div className="mt-1 text-[13px] text-white/60">
                {t("golive.entry.confirmCancelBody", "Ton live et ses articles seront supprimés définitivement.")}
              </div>
              <div className="mt-4 flex gap-2">
                <Press
                  onClick={() => setConfirmCancel(null)}
                  className="!min-h-12 h-12 flex-1 rounded-2xl text-[14px] font-semibold text-white"
                  style={{ backgroundColor: "rgba(255,255,255,0.12)" }}
                >
                  {t("common.cancel")}
                </Press>
                <Press
                  onClick={() => cancel(confirmCancel)}
                  disabled={busyId === confirmCancel.id}
                  className="!min-h-12 h-12 flex-1 rounded-2xl text-[14px] font-bold text-white"
                  style={{
                    background: "linear-gradient(135deg, oklch(0.7 0.26 15), oklch(0.62 0.24 20))",
                  }}
                >
                  {busyId === confirmCancel.id ? t("common.loading") : t("common.confirm")}
                </Press>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes kidiPulse { 0%,100% { box-shadow: 0 6px 18px ${GOLD_DIM}; transform: scale(1); } 50% { box-shadow: 0 10px 28px ${GOLD}; transform: scale(1.03); } }
      `}</style>
    </motion.div>
  );
}

function ChoiceCard({
  image,
  badge,
  icon,
  title,
  subtitle,
  onPress,
}: {
  image: string;
  badge: { label: string; variant: "live" | "plan" };
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  const isLive = badge.variant === "live";
  return (
    <Press
      onClick={onPress}
      className="relative flex h-full w-full flex-col overflow-hidden text-left"
      style={{
        aspectRatio: "9 / 17",
        minHeight: 300,
        borderRadius: 24,
        border: `1px solid ${GOLD_DIM}`,
        boxShadow: `0 0 0 1px rgba(228,180,56,0.10), 0 0 24px rgba(228,180,56,0.14), 0 14px 32px rgba(0,0,0,0.5)`,
        backgroundColor: NAVY_B,
      }}
    >
      {/* Background image */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${image})`,
          backgroundSize: "cover",
          backgroundPosition: "center top",
          backgroundRepeat: "no-repeat",
        }}
      />
      {/* Vertical gradient overlay */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg, rgba(6,19,49,0) 0%, rgba(6,19,49,0.25) 45%, rgba(6,19,49,0.85) 78%, rgba(6,19,49,0.96) 100%)`,
        }}
      />

      {/* Top badge */}
      <div className="relative z-10 flex items-start p-3">
        <span
          className="rounded-full px-2.5 py-1 text-[10px] font-black tracking-wider"
          style={
            isLive
              ? {
                  backgroundColor: LIVE_RED,
                  color: "#FFFFFF",
                  boxShadow: "0 4px 12px rgba(229,57,63,0.4)",
                }
              : {
                  backgroundColor: "rgba(6,19,49,0.7)",
                  color: GOLD,
                  border: `1px solid ${GOLD}`,
                  backdropFilter: "blur(6px)",
                }
          }
        >
          {badge.label}
        </span>
      </div>

      {/* Spacer pushes content to bottom */}
      <div className="flex-1" />

      {/* Bottom content */}
      <div className="relative z-10 flex flex-col gap-1.5 p-3.5 pr-10">
        <div>{icon}</div>
        <div
          className="text-[17px] font-black leading-[1.1] text-white"
          style={{ letterSpacing: "-0.01em" }}
        >
          {title}
        </div>
        <div className="text-[11.5px] leading-snug" style={{ color: "#B7BECE" }}>
          {subtitle}
        </div>
      </div>

      {/* Arrow bottom-right */}
      <div
        aria-hidden
        className="absolute bottom-3 right-3 z-10 grid h-7 w-7 place-items-center rounded-full"
        style={{ backgroundColor: "rgba(228,180,56,0.14)", border: `1px solid ${GOLD_DIM}` }}
      >
        <ArrowRight size={14} color={GOLD} strokeWidth={2.5} />
      </div>
    </Press>
  );
}


