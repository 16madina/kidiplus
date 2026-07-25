import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar as CalendarIcon, Bell, BellOff, X, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Press } from "@/components/press";
import { EASE_IOS, listContainer, listItem } from "@/lib/motion";
import { haptic } from "@/lib/haptics";
import {
  fetchUpcomingScheduledLives,
  type ScheduledLiveWithSeller,
} from "@/lib/lives-db";
import {
  addLiveReminder,
  hasLiveReminder,
  removeLiveReminder,
} from "@/lib/live-reminders-db";
import { useAuth } from "@/lib/auth-context";
import { useAppActive } from "@/lib/app-state";

const GOLD = "oklch(0.82 0.14 85)";
const FALLBACK_COVER =
  "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&q=70";

function formatDateChip(iso: string, lang: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const hh = d.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" });
  if (sameDay) {
    return d.getHours() >= 18
      ? (lang.startsWith("fr") ? "Ce soir " : "Tonight ") + hh
      : (lang.startsWith("fr") ? "Aujourd'hui " : "Today ") + hh;
  }
  if (isTomorrow) return (lang.startsWith("fr") ? "Demain " : "Tomorrow ") + hh;
  return d.toLocaleDateString(lang, { weekday: "short", day: "numeric", month: "short" }) + " " + hh;
}

export function UpcomingLivesRow() {
  const { t, i18n } = useTranslation();
  const appActive = useAppActive();
  const [rows, setRows] = useState<ScheduledLiveWithSeller[]>([]);
  const [open, setOpen] = useState<ScheduledLiveWithSeller | null>(null);

  useEffect(() => {
    if (!appActive) return;
    let alive = true;
    void (async () => {
      const data = await fetchUpcomingScheduledLives(20);
      if (alive) setRows(data);
    })();
    const int = setInterval(async () => {
      if (document.visibilityState === "hidden") return;
      const data = await fetchUpcomingScheduledLives(20);
      if (alive) setRows(data);
    }, 60_000);
    return () => {
      alive = false;
      clearInterval(int);
    };
  }, [appActive]);

  if (rows.length === 0) return null;

  return (
    <>
      <div className="pt-5">
        <div className="flex items-center gap-2 px-4 pb-2">
          <CalendarIcon size={16} color={GOLD} />
          <h2
            className="text-[16px] font-bold"
            style={{ letterSpacing: "-0.01em", color: "var(--foreground)" }}
          >
            {t("schedule.upcomingTitle", "À venir 📅")}
          </h2>
        </div>
        <motion.div
          variants={listContainer}
          initial="hidden"
          animate="show"
          className="flex gap-3 overflow-x-auto px-4 pb-2"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {rows.map((r) => {
            const sellerName =
              r.seller?.display_name?.trim() || r.seller?.handle || "Vendeur";
            return (
              <motion.div key={r.id} variants={listItem} className="shrink-0">
                <Press
                  onClick={() => {
                    haptic.selection();
                    setOpen(r);
                  }}
                  className="!min-h-24 flex w-40 flex-col overflow-hidden rounded-2xl p-0 text-left"
                  style={{
                    backgroundColor: "var(--card)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div className="relative h-24 w-full overflow-hidden">
                    <img
                      src={r.cover_url || FALLBACK_COVER}
                      alt=""
                      className="h-full w-full object-cover"
                      onLoad={(e) => e.currentTarget.setAttribute("data-loaded", "true")}
                    />
                    <div
                      className="absolute bottom-1.5 left-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold text-black"
                      style={{ backgroundColor: GOLD }}
                    >
                      {r.scheduled_at ? formatDateChip(r.scheduled_at, i18n.language) : ""}
                    </div>
                  </div>
                  <div className="flex flex-col gap-0.5 px-2 py-2">
                    <div
                      className="line-clamp-2 text-[12px] font-semibold leading-tight"
                      style={{ color: "var(--foreground)" }}
                    >
                      {r.title}
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      @{r.seller?.handle || sellerName}
                    </div>
                  </div>
                </Press>
              </motion.div>
            );
          })}
        </motion.div>
      </div>

      <ScheduledLivePreview open={open} onClose={() => setOpen(null)} />
    </>
  );
}

function ScheduledLivePreview({
  open,
  onClose,
}: {
  open: ScheduledLiveWithSeller | null;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [reminded, setReminded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !user) {
      setReminded(false);
      return;
    }
    let alive = true;
    setLoading(true);
    void hasLiveReminder(user.id, open.id).then((v) => {
      if (alive) {
        setReminded(v);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [open, user]);

  const toggle = async () => {
    if (!user || !open) {
      toast.error(t("auth.errors.notSignedIn", "Sign in to be reminded"));
      return;
    }
    setBusy(true);
    try {
      if (reminded) {
        await removeLiveReminder(user.id, open.id);
        setReminded(false);
        haptic.selection();
      } else {
        await addLiveReminder(user.id, open.id);
        setReminded(true);
        haptic.success();
        toast.success(t("schedule.reminderSet", "Rappel activé 🔔"));
      }
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-end justify-center"
          initial={{ backgroundColor: "rgba(0,0,0,0)" }}
          animate={{ backgroundColor: "rgba(0,0,0,0.6)" }}
          exit={{ backgroundColor: "rgba(0,0,0,0)" }}
          onClick={onClose}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE_IOS }}
            className="w-full max-w-md overflow-hidden rounded-t-3xl"
            style={{
              backgroundColor: "var(--card)",
              paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)",
            }}
          >
            <div className="relative h-56 w-full">
              <img
                src={open.cover_url || FALLBACK_COVER}
                alt=""
                className="h-full w-full object-cover"
                onLoad={(e) => e.currentTarget.setAttribute("data-loaded", "true")}
              />
              <Press
                onClick={onClose}
                aria-label={t("common.close")}
                className="!min-h-9 !min-w-9 absolute right-3 top-3 h-9 w-9 rounded-full text-white"
                style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
              >
                <X size={18} />
              </Press>
              <div
                className="absolute bottom-3 left-3 rounded-full px-3 py-1 text-[12px] font-bold text-black"
                style={{ backgroundColor: GOLD }}
              >
                {open.scheduled_at ? formatDateChip(open.scheduled_at, i18n.language) : ""}
              </div>
            </div>
            <div className="px-5 pt-4">
              <h3
                className="text-[18px] font-bold"
                style={{ color: "var(--foreground)", letterSpacing: "-0.01em" }}
              >
                {open.title}
              </h3>
              <div className="mt-1 flex items-center gap-2 text-[13px] text-muted-foreground">
                <span>@{open.seller?.handle || open.seller?.display_name || "vendeur"}</span>
                <span>·</span>
                <span>
                  {t("units.products", { count: open.product_count, defaultValue: `${open.product_count} produits` })}
                </span>
              </div>
              <Press
                onClick={toggle}
                disabled={busy || loading}
                className="!min-h-14 mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-bold"
                style={{
                  backgroundColor: reminded ? "rgba(255,255,255,0.10)" : GOLD,
                  color: reminded ? "var(--foreground)" : "black",
                  border: reminded ? "1px solid var(--border)" : "none",
                }}
              >
                {busy || loading ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : reminded ? (
                  <>
                    <BellOff size={18} />
                    {t("schedule.reminderOn", "Rappel activé — retirer")}
                  </>
                ) : (
                  <>
                    <Bell size={18} />
                    {t("schedule.remindMe", "Me rappeler 🔔")}
                  </>
                )}
              </Press>
              <p className="mt-2 text-center text-[11.5px] text-muted-foreground">
                {t("schedule.reminderHint", "On te préviendra dès que le live commence.")}
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
