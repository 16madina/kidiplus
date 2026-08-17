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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

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
  const getSourceRef = useRef(opts.getSourceTrack);
  getSourceRef.current = opts.getSourceTrack;

  useEffect(() => {
    if (!opts.enabled || !opts.userId || !opts.remoteRoomName) {
      setRemoteStatus("idle");
      return;
    }
    let cancelled = false;
    const roomName = opts.remoteRoomName;
    const identity = battleGuestIdentity(opts.userId);

    async function waitForSource(): Promise<LocalVideoTrack | null> {
      for (let i = 0; i < 24 && !cancelled; i++) {
        const track = getSourceRef.current();
        if (track?.mediaStreamTrack && track.mediaStreamTrack.readyState === "live") {
          return track;
        }
        await sleep(250);
      }
      return getSourceRef.current();
    }

    async function start() {
      setRemoteStatus("connecting");
      try {
        const source = await waitForSource();
        const media = source?.mediaStreamTrack;
        if (cancelled) return;
        if (!media || media.readyState !== "live") {
          console.warn("[battle] guest publish: camera not ready");
          setRemoteStatus("error");
          return;
        }

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
  }, [opts.enabled, opts.userId, opts.displayName, opts.remoteRoomName, opts.facingKey]);

  return remoteStatus;
}
