import { useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { RemoteTrack } from "livekit-client";
import type { BattleFighter, BattleSession, BattleSide } from "@/lib/battle-context";
import { BattleSplitDivider } from "@/components/battle/battle-split-chrome";

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
    <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
      {guestTrack ? (
        <BattleRemoteVideo track={guestTrack} />
      ) : (
        <GuestPlaceholder fighter={fighter} status={guestStatus} />
      )}
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

  return (
    <div className={running ? "absolute inset-0 flex flex-row overflow-hidden bg-black" : "contents"}>
      {running && session && !hostOnLeft && (
        <GuestPane
          fighter={session.sideA}
          guestTrack={guestTrack}
          guestStatus={guestStatus}
        />
      )}

      <div className={running ? "relative min-h-0 min-w-0 flex-1 overflow-hidden" : "contents"}>
        {hostVideo}
      </div>

      {running && session && hostOnLeft && (
        <GuestPane
          fighter={session.sideB}
          guestTrack={guestTrack}
          guestStatus={guestStatus}
        />
      )}

      {running && <BattleSplitDivider />}
    </div>
  );
}
