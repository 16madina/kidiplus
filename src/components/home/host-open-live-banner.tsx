import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Radio } from "lucide-react";
import { Press } from "@/components/press";
import { useAuth } from "@/lib/auth-context";
import { useAppActive } from "@/lib/app-state";
import { navigateTab } from "@/lib/push-router";
import type { OpenLiveRow } from "@/lib/lives-db";

export const RESUME_HOST_LIVE_EVENT = "kidi:resume-host-live";
/** Fired after a host properly ends a live — banners must hide immediately. */
export const HOST_LIVE_ENDED_EVENT = "kidi:host-live-ended";

export function requestResumeHostLive(liveId?: string | null) {
  if (typeof window === "undefined") return;
  navigateTab("live");
  window.setTimeout(() => {
    try {
      window.dispatchEvent(
        new CustomEvent(RESUME_HOST_LIVE_EVENT, {
          detail: { live_id: liveId ?? null },
        }),
      );
    } catch {
      /* ignore */
    }
  }, 80);
}

export function notifyHostLiveEnded(liveId?: string | null) {
  if (typeof window === "undefined" || !liveId) return;
  try {
    window.dispatchEvent(
      new CustomEvent(HOST_LIVE_ENDED_EVENT, {
        detail: { live_id: liveId },
      }),
    );
  } catch {
    /* ignore */
  }
}

/** Banner shown on Home (and reusable elsewhere) when the seller still has an open live. */
export function HostOpenLiveBanner({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const appActive = useAppActive();
  const [open, setOpen] = useState<OpenLiveRow | null>(null);
  const [minutesLeft, setMinutesLeft] = useState<number | null>(null);
  const lastHousekeepRef = useRef(0);

  const refresh = useCallback(async (opts?: { housekeep?: boolean }) => {
    if (!user) {
      setOpen(null);
      return;
    }
    const {
      expireAbandonedLivesInDb,
      findOpenLives,
      notifyAbsentHostLivesInDb,
    } = await import("@/lib/lives-db");
    // Expire/notify are heavier — run on mount and at most every 2 min.
    const now = Date.now();
    const shouldHousekeep =
      opts?.housekeep === true || now - lastHousekeepRef.current > 120_000;
    if (shouldHousekeep) {
      lastHousekeepRef.current = now;
      await notifyAbsentHostLivesInDb(2, 5).catch(() => 0);
      await expireAbandonedLivesInDb(user.id, 5).catch(() => 0);
    }
    const rows = await findOpenLives(user.id);
    const row = rows[0] ?? null;
    setOpen(row);
    if (row) {
      const last = new Date(row.host_last_seen_at || row.started_at).getTime();
      const closesAt = last + 5 * 60_000;
      setMinutesLeft(Math.max(1, Math.ceil((closesAt - Date.now()) / 60_000)));
    } else {
      setMinutesLeft(null);
    }
  }, [user]);

  useEffect(() => {
    if (!appActive) return;
    void refresh({ housekeep: true });
    const iv = window.setInterval(() => { void refresh(); }, 30_000);
    return () => window.clearInterval(iv);
  }, [refresh, appActive]);

  useEffect(() => {
    const onEnded = (e: Event) => {
      const id = (e as CustomEvent<{ live_id?: string | null }>).detail?.live_id;
      setOpen((prev) => {
        if (!prev) return null;
        if (id && prev.id !== id) return prev;
        return null;
      });
      setMinutesLeft(null);
    };
    window.addEventListener(HOST_LIVE_ENDED_EVENT, onEnded as EventListener);
    return () => window.removeEventListener(HOST_LIVE_ENDED_EVENT, onEnded as EventListener);
  }, []);

  if (!open) return null;

  return (
    <div
      className={className}
      style={{
        borderRadius: 16,
        padding: "10px 12px",
        color: "white",
        backgroundColor: "rgba(220, 30, 40, 0.92)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
      }}
    >
      <div className="flex items-start gap-2">
        <Radio size={16} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold leading-tight">
            {t("live.homeOpenTitle", "Ton live est encore ouvert")}
          </p>
          <p className="mt-0.5 text-[11px] leading-tight opacity-90">
            {t("live.homeOpenBody", {
              title: open.title,
              minutes: minutesLeft ?? 5,
              defaultValue:
                "« {{title}} » — reprends-le avant fermeture (~{{minutes}} min).",
            })}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Press
              onClick={() => requestResumeHostLive(open.id)}
              className="!min-h-8 h-8 rounded-full bg-white px-3 text-[12px] font-bold text-red-600"
            >
              {t("live.danglingReconnect", "Reprendre le live")}
            </Press>
            <Press
              onClick={async () => {
                const { endLiveInDb } = await import("@/lib/lives-db");
                const { stopLiveReplay } = await import("@/lib/live-replay-client");
                const { toast } = await import("sonner");
                const liveId = open.id;
                const res = await endLiveInDb(liveId);
                if (!res.ok) {
                  toast.error(
                    t("live.endFailed", "Impossible de terminer le live — réessaie"),
                  );
                  return;
                }
                notifyHostLiveEnded(liveId);
                setOpen(null);
                await stopLiveReplay(liveId).catch(() => {});
                toast.success(t("live.danglingEnded", "Lives précédents terminés"));
              }}
              className="!min-h-8 h-8 rounded-full px-3 text-[12px] font-bold text-white"
              style={{
                backgroundColor: "rgba(0,0,0,0.25)",
                border: "1px solid rgba(255,255,255,0.45)",
              }}
            >
              {t("live.danglingEndAll", "Tout terminer")}
            </Press>
          </div>
        </div>
      </div>
    </div>
  );
}
