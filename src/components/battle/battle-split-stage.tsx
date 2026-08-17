import { useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import type { RemoteTrack } from "livekit-client";
import { formatMoney } from "@/lib/money";
import type { BattleFighter, BattleSession } from "@/lib/battle-context";

function PaneChip({
  fighter,
  currency,
  leading,
}: {
  fighter: BattleFighter;
  currency: string;
  leading: boolean;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith("en") ? "en" : "fr";
  return (
    <div className="pointer-events-none absolute left-2 top-2 z-10 max-w-[70%]">
      <div
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2.5 text-white"
        style={{
          backgroundColor: "rgba(0,0,0,0.42)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          boxShadow: leading ? "0 0 0 1.5px oklch(0.85 0.18 90)" : "0 0 0 1px rgba(255,255,255,0.12)",
        }}
      >
        {fighter.avatarUrl ? (
          <img src={fighter.avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
        ) : (
          <div className="grid h-6 w-6 place-items-center rounded-full bg-white/15 text-[10px] font-black">
            {(fighter.displayName.trim()[0] ?? "?").toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold leading-none">{fighter.displayName}</p>
          <p className="text-[10px] font-bold tabular-nums text-white/80">
            {formatMoney(fighter.scoreAmountLive, currency, locale)}
          </p>
        </div>
        {leading && <span className="text-[10px]">{t("battle.hud.crown")}</span>}
      </div>
    </div>
  );
}

export function BattleRemoteVideo({ track }: { track: RemoteTrack | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !track) return;
    track.attach(el);
    void el.play().catch(() => {});
    return () => {
      try {
        track.detach(el);
      } catch {
        /* ignore */
      }
    };
  }, [track]);
  return (
    <video
      ref={ref}
      playsInline
      autoPlay
      muted
      className="absolute inset-0 h-full w-full object-cover"
    />
  );
}

function GuestPlaceholder({
  fighter,
  status,
}: {
  fighter: BattleFighter;
  status?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="absolute inset-0 grid place-items-center bg-[#0c0c10]">
      {fighter.avatarUrl ? (
        <img
          src={fighter.avatarUrl}
          alt=""
          className="h-20 w-20 rounded-full object-cover ring-1 ring-white/20"
        />
      ) : (
        <div className="grid h-20 w-20 place-items-center rounded-full bg-white/10 text-[28px] font-black text-white">
          {(fighter.displayName.trim()[0] ?? "?").toUpperCase()}
        </div>
      )}
      <p className="absolute bottom-10 left-0 right-0 text-center text-[11px] font-medium text-white/50">
        {status === "reconnecting" || status === "connecting"
          ? t("battle.split.reconnecting")
          : t("battle.split.remotePlaceholder")}
      </p>
    </div>
  );
}

export function BattleSplitStage({
  active,
  session,
  hostVideo,
  guestTrack = null,
  guestStatus,
}: {
  active: boolean;
  session: BattleSession | null;
  hostVideo: ReactNode;
  guestTrack?: RemoteTrack | null;
  guestStatus?: string;
}) {
  const { t } = useTranslation();
  const running = active && !!session;
  const aLeads = !!session && session.sideA.scoreAmountLive > session.sideB.scoreAmountLive;
  const bLeads = !!session && session.sideB.scoreAmountLive > session.sideA.scoreAmountLive;

  return (
    <div className={running ? "absolute inset-0 flex flex-col overflow-hidden bg-black" : "contents"}>
      <div className={running ? "relative min-h-0 flex-1 overflow-hidden" : "contents"}>
        {hostVideo}
        {running && session && (
          <PaneChip fighter={session.sideA} currency={session.currency} leading={aLeads} />
        )}
      </div>

      {running && session && (
        <>
          <div className="relative z-20 h-0">
            <motion.div
              className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-full px-3 py-1 text-[11px] font-black tracking-[0.28em] text-[#10162B]"
              style={{
                background: "linear-gradient(135deg, oklch(0.93 0.12 90), oklch(0.8 0.15 75))",
              }}
              animate={{ scale: [1, 1.04, 1] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            >
              {t("battle.split.vs")}
            </motion.div>
            <div
              className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2"
              style={{ background: "linear-gradient(90deg, transparent, rgba(255,210,80,0.7), transparent)" }}
            />
          </div>

          <div className="relative min-h-0 flex-1 overflow-hidden">
            {guestTrack ? (
              <BattleRemoteVideo track={guestTrack} />
            ) : (
              <GuestPlaceholder fighter={session.sideB} status={guestStatus} />
            )}
            <PaneChip fighter={session.sideB} currency={session.currency} leading={bLeads} />
          </div>
        </>
      )}
    </div>
  );
}
