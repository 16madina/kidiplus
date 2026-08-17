import { useEffect, useRef, useState } from "react";
import {
  RoomEvent,
  Track,
  type LocalVideoTrack,
  type Room,
} from "livekit-client";
import {
  BATTLE_GUEST_VIDEO,
  connectRoom,
  disconnectRoom,
  getToken,
} from "@/lib/livekit";
import { battleGuestIdentity } from "@/lib/battles-db";

/**
 * During a battle, publish a reduced clone of the host camera into the
 * opponent's LiveKit room so their audience sees the split without leaving.
 */
export function useBattleGuestPublish(opts: {
  enabled: boolean;
  userId: string | null;
  displayName: string;
  remoteRoomName: string | null;
  getSourceTrack: () => LocalVideoTrack | null;
  facingKey?: string;
}) {
  const [remoteStatus, setRemoteStatus] = useState<
    "idle" | "connecting" | "live" | "reconnecting" | "error"
  >("idle");
  const roomRef = useRef<Room | null>(null);
  const cloneRef = useRef<MediaStreamTrack | null>(null);

  useEffect(() => {
    if (!opts.enabled || !opts.userId || !opts.remoteRoomName) {
      setRemoteStatus("idle");
      return;
    }
    let cancelled = false;
    const roomName = opts.remoteRoomName;
    const identity = battleGuestIdentity(opts.userId);

    async function start() {
      setRemoteStatus("connecting");
      try {
        const { token, url } = await getToken(
          roomName,
          identity,
          opts.displayName,
          "host",
        );
        if (cancelled) return;
        const room = await connectRoom(url, token, {
          adaptiveStream: false,
          autoSubscribe: false,
        });
        if (cancelled) {
          await disconnectRoom(room);
          return;
        }
        roomRef.current = room;
        room.on(RoomEvent.Reconnecting, () => {
          if (!cancelled) setRemoteStatus("reconnecting");
        });
        room.on(RoomEvent.Reconnected, () => {
          if (!cancelled) setRemoteStatus("live");
        });
        room.on(RoomEvent.Disconnected, () => {
          if (!cancelled) setRemoteStatus("error");
        });

        const source = opts.getSourceTrack();
        const media = source?.mediaStreamTrack;
        if (!media) {
          setRemoteStatus("error");
          return;
        }
        const clone = media.clone();
        cloneRef.current = clone;
        try {
          await clone.applyConstraints({
            width: { max: BATTLE_GUEST_VIDEO.width },
            height: { max: BATTLE_GUEST_VIDEO.height },
            frameRate: { max: BATTLE_GUEST_VIDEO.frameRate },
          });
        } catch {
          /* some Android stacks reject extra constraints on clones */
        }
        await room.localParticipant.publishTrack(clone, {
          name: "battle-guest",
          source: Track.Source.Camera,
          simulcast: true,
          videoEncoding: {
            maxBitrate: BATTLE_GUEST_VIDEO.maxBitrate,
            maxFramerate: BATTLE_GUEST_VIDEO.frameRate,
          },
        });
        if (!cancelled) setRemoteStatus("live");
      } catch (e) {
        console.warn("[battle] guest publish failed", e);
        if (!cancelled) setRemoteStatus("error");
      }
    }

    void start();
    return () => {
      cancelled = true;
      const clone = cloneRef.current;
      cloneRef.current = null;
      if (clone) {
        try {
          clone.stop();
        } catch {
          /* ignore */
        }
      }
      const room = roomRef.current;
      roomRef.current = null;
      void disconnectRoom(room);
    };
  }, [
    opts.enabled,
    opts.userId,
    opts.displayName,
    opts.remoteRoomName,
    opts.facingKey,
    opts.getSourceTrack,
  ]);

  return remoteStatus;
}
