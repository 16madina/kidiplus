import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { RemoteTrack } from "livekit-client";
import type { BattleFighter, BattleSession, BattleSide } from "@/lib/battle-context";
import {
  BattleSplitDivider,
  BATTLE_VIDEO_DOCK_STYLE,
} from "@/components/battle/battle-split-chrome";

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
          className="h-16 w-16 rounded-full object-cover ring-1 ring-white/20"
        />
      ) : (
        <div className="grid h-16 w-16 place-items-center rounded-full bg-white/10 text-[22px] font-black text-white">
          {(fighter.displayName.trim()[0] ?? "?").toUpperCase()}
        </div>
      )}
      <p className="absolute bottom-8 left-0 right-0 text-center text-[11px] font-medium text-white/50">
        {status === "reconnecting" || status === "connecting"
          ? t("battle.split.reconnecting")
          : t("battle.split.remotePlaceholder")}
      </p>
    </div>
  );
}

function PaneName({ name }: { name: string }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/60 to-transparent px-2 pb-1.5 pt-7">
      <p className="truncate text-[11px] font-bold text-white">{name}</p>
    </div>
  );
}

function paneStyle(side: "left" | "right"): CSSProperties {
  return {
    ...BATTLE_VIDEO_DOCK_STYLE,
    left: side === "left" ? 4 : "calc(50% + 2px)",
    width: "calc(50% - 6px)",
  };
}

export function BattleSplitStage({
  active,
  session,
  hostVideo,
  guestTrack = null,
  guestStatus,
  selfSide = "a",
}: {
  active: boolean;
  session: BattleSession | null;
  hostVideo: ReactNode;
  guestTrack?: RemoteTrack | null;
  guestStatus?: string;
  selfSide?: BattleSide;
}) {
  const running = active && !!session;
  const hostFighter = session
    ? selfSide === "b"
      ? session.sideB
      : session.sideA
    : null;
  const guestFighter = session
    ? hostFighter?.sellerId === session.sideA.sellerId
      ? session.sideB
      : session.sideA
    : null;

  return (
    <>
      <div
        className={
          running
            ? "absolute z-[12] overflow-hidden rounded-[18px] bg-black"
            : "absolute inset-0 overflow-hidden bg-black"
        }
        style={running ? paneStyle("left") : undefined}
      >
        {hostVideo}
        {running && hostFighter && <PaneName name={hostFighter.displayName} />}
      </div>

      {running && session && guestFighter && (
        <div
          className="absolute z-[12] overflow-hidden rounded-[18px] bg-[#0c0c10]"
          style={paneStyle("right")}
        >
          {guestTrack ? (
            <BattleRemoteVideo track={guestTrack} />
          ) : (
            <GuestPlaceholder fighter={guestFighter} status={guestStatus} />
          )}
          <PaneName name={guestFighter.displayName} />
        </div>
      )}

      {running && (
        <div
          className="pointer-events-none absolute inset-x-0 z-[20]"
          style={BATTLE_VIDEO_DOCK_STYLE}
        >
          <BattleSplitDivider />
        </div>
      )}
    </>
  );
}
