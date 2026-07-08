import { useContext, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Radio, Calendar as CalendarIcon, Loader2, Play, Pencil, Trash2 } from "lucide-react";
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
  resolveLiveImage,
  type ScheduledLiveRow,
} from "@/lib/lives-db";
import { notifyLiveReminders } from "@/lib/live-reminders-db";

const GOLD = "oklch(0.82 0.14 85)";
const GOLD_DIM = "oklch(0.82 0.14 85 / 0.42)";
const NAVY_A = "oklch(0.19 0.05 260)";
const NAVY_B = "oklch(0.11 0.03 260)";

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

  useEffect(() => {
    if (!user) return;
    let alive = true;
    void (async () => {
      setLoadingList(true);
      const rows = await fetchMyScheduledLives(user.id);
      if (!alive) return;
      setScheduled(rows);
      setLoadingList(false);
      const entries = await Promise.all(
        rows
          .filter((r) => r.cover_url)
          .map(async (r) => [r.id, (await resolveLiveImage("live-covers", r.cover_url)) ?? ""] as const),
      );
      if (alive) setCovers(Object.fromEntries(entries));
    })();
    return () => {
      alive = false;
    };
  }, [user]);

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
        b.addProduct({
          name: p.name,
          image: img,
          mode: p.mode,
          startPrice: Number(p.start_price),
          price: Number(p.price),
          stock: Number(p.stock),
          timerSec: Number(p.timer_seconds),
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
        b.addProduct({
          name: p.name,
          image: img,
          mode: p.mode,
          startPrice: Number(p.start_price),
          price: Number(p.price),
          stock: Number(p.stock),
          timerSec: Number(p.timer_seconds),
        });
      }
      b.setProductDbIds(res.productIds ?? []);
      b.setRoomName(res.roomName ?? null);
      b.setLiveId(row.id);
      // Fire-and-forget reminder notifications
      void notifyLiveReminders(row.id);
      haptic.success();
      onStartScheduled();
    } catch (e) {
      haptic.error();
      toast.error(String(e));
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
          paddingTop: "calc(env(safe-area-inset-top) + 8px)",
          paddingBottom: 8,
          background: "linear-gradient(to bottom, rgba(0,0,0,0.35), rgba(0,0,0,0))",
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
        <div className="flex-1 grid place-items-center">
          <div className="relative">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10"
              style={{
                filter: "blur(28px)",
                background: "radial-gradient(70% 80% at 50% 55%, rgba(255,205,110,0.65), transparent 70%)",
              }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10"
              style={{
                filter: "blur(12px)",
                background: "radial-gradient(50% 50% at 50% 55%, rgba(255,255,255,0.25), transparent 70%)",
              }}
            />
            <div className="relative" style={{ filter: "drop-shadow(0 4px 20px rgba(255,205,110,0.35))" }}>
              <Logo size={100} />
            </div>
            <div
              aria-hidden
              className="mx-auto mt-2 h-px w-28"
              style={{ background: `linear-gradient(to right, transparent, ${GOLD}, transparent)` }}
            />
          </div>
        </div>
        <div className="h-11 w-11" />
      </div>

      <div className="px-5 pt-6 text-center">
        <h1 className="text-[30px] font-black text-white" style={{ letterSpacing: "-0.02em" }}>
          {t("golive.entry.title", "Passe en direct")}
        </h1>
        <p className="mt-2 text-[14px] leading-snug text-white/70">
          {t("golive.entry.subtitle", "Commence maintenant ou programme un live pour ta communauté.")}
        </p>
      </div>

      {/* Choice cards */}
      <div className="grid grid-cols-2 gap-3 px-5 pt-6">
        <ChoiceCard
          icon={<Radio size={38} color={GOLD} />}
          title={t("golive.entry.startNow", "Commencer\nun live")}
          subtitle={t("golive.entry.startNowSub", "Passe en direct maintenant")}
          onPress={() => {
            haptic.medium();
            b.setMode("now");
            b.setEditingLiveId(null);
            b.setScheduledAt(null);
            onStartNow();
          }}
        />
        <ChoiceCard
          icon={<CalendarIcon size={38} color={GOLD} />}
          title={t("golive.entry.schedule", "Programmer\nun live")}
          subtitle={t("golive.entry.scheduleSub", "Annonce ton live à l'avance et prépare tes articles")}
          onPress={() => {
            haptic.medium();
            b.setMode("schedule");
            b.setEditingLiveId(null);
            b.setScheduledAt(null);
            onSchedule();
          }}
        />
      </div>

      {/* Scheduled list */}
      <div className="px-5 pt-8" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 40px)" }}>
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-white">
            {t("golive.entry.myScheduled", "Mes lives programmés")}
          </h2>
          {loadingList && <Loader2 size={16} className="animate-spin text-white/60" />}
        </div>
        {!loadingList && scheduled.length === 0 && (
          <div
            className="mt-3 grid place-items-center rounded-2xl px-6 py-10 text-center"
            style={{
              border: `1.5px dashed ${GOLD_DIM}`,
              backgroundColor: "rgba(255,255,255,0.02)",
            }}
          >
            <div className="mb-3">
              <CalendarIcon size={54} color={GOLD} strokeWidth={1.5} style={{ opacity: 0.55 }} />
            </div>
            <p className="text-[13px] text-white/55">
              {t("golive.entry.emptyScheduled", "Aucun live programmé pour le moment.")}
            </p>
          </div>
        )}
        <motion.ul variants={listContainer} initial="hidden" animate="show" className="mt-3 flex flex-col gap-2">
          {scheduled.map((row) => {
            const isTime = row.scheduled_at && new Date(row.scheduled_at).getTime() <= Date.now() + 60_000;
            return (
              <motion.li
                key={row.id}
                variants={listItem}
                className="flex items-center gap-3 rounded-2xl p-2.5"
                style={{
                  backgroundColor: "rgba(255,255,255,0.06)",
                  border: `1px solid ${isTime ? GOLD_DIM : "rgba(255,255,255,0.08)"}`,
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
                    {row.scheduled_at ? formatDateChip(row.scheduled_at, i18n.language) : ""}
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
                      <Press
                        onClick={() => startNow(row)}
                        disabled={busyId === row.id}
                        aria-label={t("golive.entry.startNowShort", "Démarrer")}
                        className="!min-h-9 !min-w-9 h-9 w-9 rounded-full text-black"
                        style={{ backgroundColor: GOLD }}
                      >
                        <Play size={14} fill="currentColor" />
                      </Press>
                      <Press
                        onClick={() => loadIntoForm(row)}
                        disabled={busyId === row.id}
                        aria-label={t("common.edit")}
                        className="!min-h-9 !min-w-9 h-9 w-9 rounded-full text-white"
                        style={{ backgroundColor: "rgba(255,255,255,0.14)" }}
                      >
                        <Pencil size={14} />
                      </Press>
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
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Press
      onClick={onPress}
      className="flex h-full min-h-[280px] w-full flex-col items-center justify-start gap-4 rounded-3xl p-5 text-center"
      style={{
        backgroundColor: "rgba(255,255,255,0.04)",
        border: `1px solid ${GOLD_DIM}`,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 12px 32px rgba(0,0,0,0.4)",
      }}
    >
        <div className="mt-2">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 rounded-full"
            style={{
              filter: "blur(16px)",
              background: "radial-gradient(circle, rgba(255,205,110,0.45), transparent 70%)",
            }}
          />
          <div
            className="grid h-[92px] w-[92px] shrink-0 place-items-center rounded-full"
            style={{
              background: "radial-gradient(circle at 50% 40%, rgba(255,215,140,0.22), rgba(255,215,140,0.04) 70%)",
              border: `1px solid ${GOLD_DIM}`,
              boxShadow: `inset 0 0 0 1px rgba(255,215,140,0.08), 0 0 22px rgba(255,205,110,0.18)`,
            }}
          >
            {icon}
          </div>
        </div>
        <div className="min-w-0">
          <div
            className="whitespace-pre-line text-[19px] font-black leading-[1.15] text-white"
            style={{ letterSpacing: "-0.01em" }}
          >
            {title}
          </div>
        </div>
        <div className="flex items-center">
          <div
            className="h-px w-20"
            style={{ background: `linear-gradient(to right, transparent, ${GOLD}, transparent)` }}
          />
        </div>
        <div className="text-[12.5px] leading-snug text-white/60">{subtitle}</div>
    </Press>
  );
}
