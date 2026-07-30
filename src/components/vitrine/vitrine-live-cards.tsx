import { useEffect, useState } from "react";
import { Bell, BellOff, Radio, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Press } from "@/components/press";
import { haptic } from "@/lib/haptics";
import { useAuth } from "@/lib/auth-context";
import { useAuthPrompt } from "@/lib/auth-prompt-context";
import { useLiveViewer } from "@/lib/live-viewer-context";
import type { LiveStream } from "@/lib/live-mock";
import type { ScheduledLiveWithSeller } from "@/lib/lives-db";
import {
  addLiveReminder,
  hasLiveReminder,
  removeLiveReminder,
} from "@/lib/live-reminders-db";

import vitrineFallback from "@/assets/vitrine/vitrine-2.jpg";

const GOLD = "#E8B93B";
const FALLBACK = vitrineFallback;

export function VitrineLiveCard({
  stream,
  list,
  index,
}: {
  stream: LiveStream;
  list: LiveStream[];
  index: number;
}) {
  const { t } = useTranslation();
  const { openList } = useLiveViewer();

  const join = () => {
    haptic.medium();
    openList(list, index);
  };

  return (
    <div className="relative h-full w-full bg-black">
      <img
        src={stream.thumbnail || FALLBACK}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
        style={{ pointerEvents: "none" }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0"
        style={{
          height: "45%",
          backgroundImage: "linear-gradient(to top, rgba(0,0,0,0.8), transparent)",
        }}
      />
      <div className="absolute left-3 top-[calc(env(safe-area-inset-top)+3.75rem)] z-10 flex items-center gap-2">
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white"
          style={{ background: "oklch(0.55 0.22 25)" }}
        >
          LIVE
        </span>
        <span className="flex items-center gap-1 rounded-full bg-black/45 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
          <Users size={12} />
          {stream.viewers}
        </span>
      </div>
      <div
        className="absolute inset-x-0 bottom-0 z-10 px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
        onPointerDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <p className="text-[15px] font-bold text-white">{stream.seller}</p>
        <p className="mt-0.5 line-clamp-2 text-[13px] text-white/90">{stream.title}</p>
        <Press
          onClick={join}
          className="mt-3 !min-h-11 flex h-11 w-full items-center justify-center gap-2 rounded-full text-[15px] font-bold text-[#10162B]"
          style={{ background: GOLD }}
        >
          <Radio size={16} />
          {t("vitrine.cta.join")}
        </Press>
      </div>
    </div>
  );
}

export function VitrineSoonCard({ live }: { live: ScheduledLiveWithSeller }) {
  const { t, i18n } = useTranslation();
  const { user, guestMode } = useAuth();
  const { openAuth } = useAuthPrompt();
  const { open: openLive } = useLiveViewer();
  const [reminded, setReminded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) { setReminded(false); return; }
    let alive = true;
    void hasLiveReminder(user.id, live.id).then((v) => {
      if (alive) setReminded(v);
    });
    return () => { alive = false; };
  }, [user, live.id]);

  const when = live.scheduled_at
    ? new Date(live.scheduled_at).toLocaleString(i18n.language, {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  const sellerName =
    live.seller?.display_name?.trim() || live.seller?.handle || "…";

  const toggleRemind = async () => {
    if (guestMode || !user) {
      openAuth();
      return;
    }
    setBusy(true);
    haptic.light();
    try {
      if (reminded) {
        await removeLiveReminder(user.id, live.id);
        setReminded(false);
        toast(t("vitrine.cta.remind"));
      } else {
        await addLiveReminder(user.id, live.id);
        setReminded(true);
        toast.success(t("vitrine.cta.reminded"));
      }
    } catch {
      toast.error("Erreur");
    } finally {
      setBusy(false);
    }
  };

  // If the scheduled live somehow went live, join.
  const onPrimary = () => {
    if (live.status === "live") {
      // Rare race: treat as live id open via fetch would be better; openList needs LiveStream.
      void import("@/lib/lives-db").then(async (m) => {
        const s = await m.fetchLiveById(live.id).catch(() => null);
        if (s) openLive(s);
      });
      return;
    }
    void toggleRemind();
  };

  return (
    <div className="relative h-full w-full bg-black">
      <img
        src={live.cover_url || FALLBACK}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0"
        style={{
          height: "45%",
          backgroundImage: "linear-gradient(to top, rgba(0,0,0,0.8), transparent)",
        }}
      />
      <div className="absolute left-3 top-[calc(env(safe-area-inset-top)+3.75rem)] z-10">
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-bold text-[#10162B]"
          style={{ background: GOLD }}
        >
          {when}
        </span>
      </div>
      <div
        className="absolute inset-x-0 bottom-0 z-10 px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
        onPointerDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <p className="text-[15px] font-bold text-white">{sellerName}</p>
        <p className="mt-0.5 line-clamp-2 text-[13px] text-white/90">{live.title}</p>
        <Press
          onClick={onPrimary}
          disabled={busy}
          className="mt-3 !min-h-10 flex h-10 items-center justify-center gap-2 rounded-full text-[14px] font-bold text-[#10162B]"
          style={{ background: GOLD }}
        >
          {reminded ? <BellOff size={16} /> : <Bell size={16} />}
          {reminded ? t("vitrine.cta.reminded") : t("vitrine.cta.remind")}
        </Press>
      </div>
    </div>
  );
}
