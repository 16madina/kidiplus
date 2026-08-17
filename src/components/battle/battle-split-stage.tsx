import { useEffect, useRef, type ReactNode } from "react";
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

function GuestPane({
  fighter,
  guestTrack,
  guestStatus,
}: {
  fighter: BattleFighter;
  guestTrack: RemoteTrack | null;
  guestStatus?: string;
}) {
  return (
    <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-[18px] bg-[#0c0c10]">
      {guestTrack ? (
        <BattleRemoteVideo track={guestTrack} />
      ) : (
        <GuestPlaceholder fighter={fighter} status={guestStatus} />
      )}
      <PaneName name={fighter.displayName} />
    </div>
  );
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
  const hostOnLeft = selfSide !== "b";
  const hostFighter = session
    ? hostOnLeft
      ? session.sideA
      : session.sideB
    : null;

  if (!running || !session) {
    return <div className="contents">{hostVideo}</div>;
  }

  return (
    <div
      className="absolute inset-x-1 z-[12] flex flex-row gap-1 overflow-visible"
      style={BATTLE_VIDEO_DOCK_STYLE}
    >
      {!hostOnLeft && (
        <GuestPane
          fighter={session.sideA}
          guestTrack={guestTrack}
          guestStatus={guestStatus}
        />
      )}

      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-[18px] bg-black">
        {hostVideo}
        {hostFighter && <PaneName name={hostFighter.displayName} />}
      </div>

      {hostOnLeft && (
        <GuestPane
          fighter={session.sideB}
          guestTrack={guestTrack}
          guestStatus={guestStatus}
        />
      )}

      <BattleSplitDivider />
    </div>
  );
}
