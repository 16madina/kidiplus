import { useEffect, useRef, useState } from "react";
import {
  RoomEvent,
  Track,
  type LocalAudioTrack,
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

async function unpublishSource(room: Room, source: Track.Source) {
  for (const pub of room.localParticipant.trackPublications.values()) {
    if (pub.source !== source || !pub.track) continue;
    try {
      await room.localParticipant.unpublishTrack(pub.track);
    } catch {
      /* ignore */
    }
  }
}

async function publishVideoClone(room: Room, media: MediaStreamTrack) {
  await unpublishSource(room, Track.Source.Camera);
  const clone = media.clone();
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
  return clone;
}

async function publishAudioClone(room: Room, media: MediaStreamTrack) {
  await unpublishSource(room, Track.Source.Microphone);
  const clone = media.clone();
  clone.enabled = media.enabled;
  await room.localParticipant.publishTrack(clone, {
    name: "battle-guest-audio",
    source: Track.Source.Microphone,
  });
  return clone;
}

/**
 * During a battle, publish a reduced clone of the host camera + mic into the
 * opponent's LiveKit room so they (and their audience) see and hear the split
 * without leaving their own live.
 */
export function useBattleGuestPublish(opts: {
  enabled: boolean;
  userId: string | null;
  displayName: string;
  remoteRoomName: string | null;
  getSourceTrack: () => LocalVideoTrack | null;
  getSourceAudioTrack?: () => LocalAudioTrack | null;
}) {
  const [remoteStatus, setRemoteStatus] = useState<
    "idle" | "connecting" | "live" | "reconnecting" | "error"
  >("idle");
  const roomRef = useRef<Room | null>(null);
  const videoCloneRef = useRef<MediaStreamTrack | null>(null);
  const audioCloneRef = useRef<MediaStreamTrack | null>(null);
  const getSourceRef = useRef(opts.getSourceTrack);
  getSourceRef.current = opts.getSourceTrack;
  const getAudioRef = useRef(opts.getSourceAudioTrack);
  getAudioRef.current = opts.getSourceAudioTrack;

  useEffect(() => {
    if (!opts.enabled || !opts.userId || !opts.remoteRoomName) {
      setRemoteStatus("idle");
      return;
    }
    let cancelled = false;
    const roomName = opts.remoteRoomName;
    const identity = battleGuestIdentity(opts.userId);
    let lastVideoId: string | null = null;
    let lastAudioId: string | null = null;
    let forceRepublish = false;

    const stopClone = (ref: { current: MediaStreamTrack | null }) => {
      const track = ref.current;
      ref.current = null;
      if (!track) return;
      try {
        track.stop();
      } catch {
        /* ignore */
      }
    };

    async function waitForVideo(): Promise<MediaStreamTrack | null> {
      for (let i = 0; i < 40 && !cancelled; i++) {
        const media = getSourceRef.current()?.mediaStreamTrack;
        if (media && media.readyState === "live") return media;
        await sleep(250);
      }
      const media = getSourceRef.current()?.mediaStreamTrack;
      return media?.readyState === "live" ? media : null;
    }

    async function syncTracks(room: Room) {
      const video = getSourceRef.current()?.mediaStreamTrack ?? null;
      const audio = getAudioRef.current?.()?.mediaStreamTrack ?? null;

      if (video && video.readyState === "live") {
        if (forceRepublish || video.id !== lastVideoId || !videoCloneRef.current) {
          stopClone(videoCloneRef);
          videoCloneRef.current = await publishVideoClone(room, video);
          lastVideoId = video.id;
        } else {
          videoCloneRef.current.enabled = video.enabled;
        }
      }

      if (audio && audio.readyState === "live") {
        if (forceRepublish || audio.id !== lastAudioId || !audioCloneRef.current) {
          stopClone(audioCloneRef);
          audioCloneRef.current = await publishAudioClone(room, audio);
          lastAudioId = audio.id;
        } else {
          audioCloneRef.current.enabled = audio.enabled;
        }
      } else if (audioCloneRef.current) {
        await unpublishSource(room, Track.Source.Microphone);
        stopClone(audioCloneRef);
        lastAudioId = null;
      }

      forceRepublish = false;
    }

    async function run() {
      setRemoteStatus("connecting");
      while (!cancelled) {
        try {
          const video = await waitForVideo();
          if (cancelled) return;
          if (!video) {
            console.warn("[battle] guest publish: camera not ready");
            setRemoteStatus("error");
            await sleep(2000);
            continue;
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
            forceRepublish = true;
            lastVideoId = null;
            lastAudioId = null;
            if (!cancelled) setRemoteStatus("live");
          });
          room.on(RoomEvent.Disconnected, () => {
            if (roomRef.current === room) roomRef.current = null;
            if (!cancelled) setRemoteStatus("error");
          });

          await syncTracks(room);
          if (cancelled) return;
          setRemoteStatus("live");

          while (!cancelled && roomRef.current === room) {
            try {
              await syncTracks(room);
              if (room.state === "connected" && !cancelled) {
                setRemoteStatus("live");
              }
            } catch (e) {
              console.warn("[battle] guest republish failed", e);
            }
            await sleep(1000);
          }
          stopClone(videoCloneRef);
          stopClone(audioCloneRef);
          lastVideoId = null;
          lastAudioId = null;
          if (roomRef.current === room) roomRef.current = null;
          void disconnectRoom(room);
          if (cancelled) return;
        } catch (e) {
          console.warn("[battle] guest publish failed", e);
          if (!cancelled) setRemoteStatus("error");
          const room = roomRef.current;
          roomRef.current = null;
          stopClone(videoCloneRef);
          stopClone(audioCloneRef);
          lastVideoId = null;
          lastAudioId = null;
          void disconnectRoom(room);
          await sleep(2000);
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
      stopClone(videoCloneRef);
      stopClone(audioCloneRef);
      const room = roomRef.current;
      roomRef.current = null;
      void disconnectRoom(room);
    };
  }, [opts.enabled, opts.userId, opts.displayName, opts.remoteRoomName]);

  return remoteStatus;
}
