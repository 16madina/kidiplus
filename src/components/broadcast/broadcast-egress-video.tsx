// LiveKit video for the /broadcast/$liveId Web Egress composition.
// Uses a pre-issued token (no user session) and signals START_RECORDING
// (Chrome console log) once the host video is attached so RTMP can begin.

import { useEffect, useRef, useState } from "react";
import { Room } from "livekit-client";
import {
  RoomEvent,
  Track,
  connectRoom,
  disconnectRoom,
  type RemoteTrack,
  type RemoteParticipant,
} from "@/lib/livekit";
import {
  signalLivekitEgressEndRecording,
  signalLivekitEgressStartRecording,
} from "@/lib/broadcast-egress-signal";

export type BroadcastEgressVideoStatus =
  | "connecting"
  | "waiting"
  | "live"
  | "error";

function pickRemoteVideoTrack(room: Room): RemoteTrack | null {
  let fallback: RemoteTrack | null = null;
  for (const p of room.remoteParticipants.values()) {
    for (const pub of p.trackPublications.values()) {
      const track = pub.track;
      if (!track || track.kind !== Track.Kind.Video) continue;
      if (p.identity.startsWith("rtmp-host-")) return track;
      if (!fallback) fallback = track;
    }
  }
  return fallback;
}

function kickPlayback(
  video: HTMLVideoElement | null,
  audio: HTMLAudioElement | null,
) {
  void video?.play()?.catch(() => {});
  void audio?.play()?.catch(() => {});
}

export function BroadcastEgressVideo({
  url,
  token,
  posterImage,
  onStatus,
  onReadyToRecord,
  brighten = false,
}: {
  url: string;
  token: string;
  posterImage?: string | null;
  onStatus?: (s: BroadcastEgressVideoStatus) => void;
  /** Fired once when first host video frame is attached (or after timeout). */
  onReadyToRecord?: () => void;
  /** Slight lift for social restream (egress encode often looks darker). */
  brighten?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const roomRef = useRef<Room | null>(null);
  const signaledRef = useRef(false);
  const [status, setStatus] = useState<BroadcastEgressVideoStatus>("connecting");

  useEffect(() => {
    onStatus?.(status);
  }, [status, onStatus]);

  useEffect(() => {
    let cancelled = false;
    let readyTimer: ReturnType<typeof setTimeout> | null = null;

    const signalReady = (reason: string) => {
      if (cancelled || signaledRef.current) return;
      signaledRef.current = true;
      console.info("[broadcast-egress] signaling START_RECORDING", reason);
      onReadyToRecord?.();
      signalLivekitEgressStartRecording();
    };

    // Fallback: never leave egress hanging on awaitStartSignal.
    readyTimer = setTimeout(() => signalReady("timeout_8s"), 8_000);

    async function start() {
      setStatus("connecting");
      try {
        const r = await connectRoom(url, token, { adaptiveStream: false });
        if (cancelled) {
          await disconnectRoom(r);
          return;
        }
        roomRef.current = r;

        const attachTrack = (
          track: RemoteTrack,
          participant?: RemoteParticipant,
        ) => {
          if (cancelled) return;
          if (track.kind === Track.Kind.Video && videoRef.current) {
            if (
              participant &&
              !participant.identity.startsWith("rtmp-host-") &&
              roomRef.current
            ) {
              const preferred = pickRemoteVideoTrack(roomRef.current);
              if (
                preferred &&
                preferred !== track &&
                [...roomRef.current.remoteParticipants.values()].some((p) =>
                  p.identity.startsWith("rtmp-host-"),
                )
              ) {
                return;
              }
            }
            const el = videoRef.current;
            track.attach(el);
            kickPlayback(el, audioRef.current);
            setStatus("live");
            // Give the decoder a beat so the first captured frame isn't black.
            window.setTimeout(() => signalReady("video_attached"), 400);
          } else if (track.kind === Track.Kind.Audio && audioRef.current) {
            track.attach(audioRef.current);
            void audioRef.current.play().catch(() => {});
          }
        };

        r.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
          attachTrack(track, participant);
        });

        r.remoteParticipants.forEach((p) => {
          p.trackPublications.forEach((pub) => {
            try {
              if (!pub.isSubscribed) pub.setSubscribed(true);
            } catch {
              /* ignore */
            }
            if (pub.track) attachTrack(pub.track, p);
          });
        });

        if (r.remoteParticipants.size === 0) setStatus("waiting");
      } catch (err) {
        console.error("[broadcast-egress] connect failed", err);
        if (!cancelled) {
          setStatus("error");
          signalReady("connect_error");
        }
      }
    }

    void start();
    return () => {
      cancelled = true;
      if (readyTimer) clearTimeout(readyTimer);
      signalLivekitEgressEndRecording();
      const r = roomRef.current;
      roomRef.current = null;
      void disconnectRoom(r);
      if (videoRef.current) videoRef.current.srcObject = null;
      if (audioRef.current) audioRef.current.srcObject = null;
    };
  }, [url, token, onReadyToRecord]);

  const showPoster = status !== "live";

  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      <video
        ref={videoRef}
        playsInline
        autoPlay
        muted
        className="absolute inset-0 h-full w-full object-cover"
        style={
          brighten
            ? { filter: "brightness(1.18) contrast(1.06) saturate(1.05)" }
            : undefined
        }
      />
      <audio ref={audioRef} autoPlay playsInline />
      {posterImage && (
        <img
          src={posterImage}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          style={{
            opacity: showPoster ? 1 : 0,
            transition: "opacity 200ms ease",
            pointerEvents: "none",
            ...(brighten && showPoster
              ? { filter: "brightness(1.12)" }
              : null),
          }}
          draggable={false}
        />
      )}
    </div>
  );
}
