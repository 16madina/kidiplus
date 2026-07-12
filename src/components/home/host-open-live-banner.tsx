import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Radio } from "lucide-react";
import { Press } from "@/components/press";
import { useAuth } from "@/lib/auth-context";
import { navigateTab } from "@/lib/push-router";
import type { OpenLiveRow } from "@/lib/lives-db";

export const RESUME_HOST_LIVE_EVENT = "kidi:resume-host-live";

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

/** Banner shown on Home (and reusable elsewhere) when the seller still has an open live. */
export function HostOpenLiveBanner({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState<OpenLiveRow | null>(null);
  const [minutesLeft, setMinutesLeft] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setOpen(null);
      return;
    }
    const {
      expireAbandonedLivesInDb,
      findOpenLives,
      notifyAbsentHostLivesInDb,
    } = await import("@/lib/lives-db");
    await notifyAbsentHostLivesInDb(2, 5).catch(() => 0);
    await expireAbandonedLivesInDb(user.id, 5).catch(() => 0);
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
    void refresh();
    const iv = window.setInterval(() => { void refresh(); }, 30_000);
    return () => window.clearInterval(iv);
  }, [refresh]);

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
                await endLiveInDb(open.id).catch(() => {});
                setOpen(null);
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
