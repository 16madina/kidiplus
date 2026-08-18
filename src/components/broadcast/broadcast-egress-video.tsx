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
import {
  BattleSplitDivider,
  BATTLE_VIDEO_DOCK_STYLE_SOCIAL,
} from "@/components/battle/battle-split-chrome";

export type BroadcastEgressVideoStatus =
  | "connecting"
  | "waiting"
  | "live"
  | "error";

type SplitMedia = {
  hostVideo: RemoteTrack | null;
  guestVideo: RemoteTrack | null;
  hostAudio: RemoteTrack | null;
  guestAudio: RemoteTrack | null;
};

function pickRemoteVideoTrack(room: Room): RemoteTrack | null {
  let fallback: RemoteTrack | null = null;
  for (const p of room.remoteParticipants.values()) {
    if (p.identity.startsWith("battle_")) continue;
    for (const pub of p.trackPublications.values()) {
      const track = pub.track;
      if (!track || track.kind !== Track.Kind.Video) continue;
      if (p.identity.startsWith("rtmp-host-")) return track;
      if (!fallback) fallback = track;
    }
  }
  return fallback;
}

function pickBattleMedia(room: Room): SplitMedia {
  const out: SplitMedia = {
    hostVideo: null,
    guestVideo: null,
    hostAudio: null,
    guestAudio: null,
  };
  for (const p of room.remoteParticipants.values()) {
    const battle = p.identity.startsWith("battle_");
    const rtmp = p.identity.startsWith("rtmp-host-");
    for (const pub of p.trackPublications.values()) {
      const track = pub.track;
      if (!track) continue;
      if (track.kind === Track.Kind.Video) {
        if (rtmp) out.hostVideo = track;
        else if (battle) out.guestVideo = track;
        else if (!out.hostVideo) out.hostVideo = track;
      } else if (track.kind === Track.Kind.Audio) {
        if (battle) out.guestAudio = track;
        else if (!out.hostAudio) out.hostAudio = track;
      }
    }
  }
  return out;
}

function attachMedia(track: RemoteTrack | null, el: HTMLMediaElement | null) {
  if (!track || !el) return;
  try {
    track.attach(el);
  } catch {
    /* ignore */
  }
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
  layout = "single",
  splitHostName,
  splitGuestName,
}: {
  url: string;
  token: string;
  posterImage?: string | null;
  onStatus?: (s: BroadcastEgressVideoStatus) => void;
  /** Fired once when first host video frame is attached (or after timeout). */
  onReadyToRecord?: () => void;
  /** Slight lift for social restream (egress encode often looks darker). */
  brighten?: boolean;
  layout?: "single" | "split";
  splitHostName?: string | null;
  splitGuestName?: string | null;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioBRef = useRef<HTMLAudioElement>(null);
  const roomRef = useRef<Room | null>(null);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
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

    readyTimer = setTimeout(() => signalReady("timeout_5s"), 5_000);

    const attachAll = (r: Room) => {
      if (cancelled) return;
      r.remoteParticipants.forEach((p) => {
        p.trackPublications.forEach((pub) => {
          try {
            if (!pub.isSubscribed) pub.setSubscribed(true);
          } catch {
            /* ignore */
          }
        });
      });

      if (layoutRef.current === "split") {
        const media = pickBattleMedia(r);
        attachMedia(media.hostVideo, videoRef.current);
        attachMedia(media.guestVideo, videoBRef.current);
        attachMedia(media.hostAudio, audioRef.current);
        attachMedia(media.guestAudio, audioBRef.current);
        kickPlayback(videoRef.current, audioRef.current);
        kickPlayback(videoBRef.current, audioBRef.current);
        if (media.hostVideo || media.guestVideo) {
          setStatus("live");
          window.setTimeout(() => signalReady("video_attached"), 400);
        }
        return;
      }

      const preferred = pickRemoteVideoTrack(r);
      if (preferred && videoRef.current) {
        preferred.attach(videoRef.current);
        kickPlayback(videoRef.current, audioRef.current);
        setStatus("live");
        window.setTimeout(() => signalReady("video_attached"), 400);
      }
      for (const p of r.remoteParticipants.values()) {
        if (p.identity.startsWith("battle_")) continue;
        for (const pub of p.trackPublications.values()) {
          if (pub.track?.kind === Track.Kind.Audio && audioRef.current) {
            pub.track.attach(audioRef.current);
            void audioRef.current.play().catch(() => {});
          }
        }
      }
    };

    async function start() {
      setStatus("connecting");
      try {
        const r = await connectRoom(url, token, { adaptiveStream: false });
        if (cancelled) {
          await disconnectRoom(r);
          return;
        }
        roomRef.current = r;

        r.on(
          RoomEvent.TrackSubscribed,
          (track: RemoteTrack, _pub, participant: RemoteParticipant) => {
            if (cancelled) return;
            if (layoutRef.current === "split") {
              attachAll(r);
              return;
            }
            if (participant.identity.startsWith("battle_")) return;
            if (track.kind === Track.Kind.Video && videoRef.current) {
              const preferred = pickRemoteVideoTrack(r);
              if (preferred && preferred !== track) {
                const hasRtmp = [...r.remoteParticipants.values()].some((p) =>
                  p.identity.startsWith("rtmp-host-"),
                );
                if (hasRtmp) return;
              }
              track.attach(videoRef.current);
              kickPlayback(videoRef.current, audioRef.current);
              setStatus("live");
              window.setTimeout(() => signalReady("video_attached"), 400);
            } else if (track.kind === Track.Kind.Audio && audioRef.current) {
              track.attach(audioRef.current);
              void audioRef.current.play().catch(() => {});
            }
          },
        );

        attachAll(r);
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
      if (videoBRef.current) videoBRef.current.srcObject = null;
      if (audioRef.current) audioRef.current.srcObject = null;
      if (audioBRef.current) audioBRef.current.srcObject = null;
    };
  }, [url, token, onReadyToRecord]);

  useEffect(() => {
    const r = roomRef.current;
    if (!r) return;
    if (layout === "split") {
      const media = pickBattleMedia(r);
      attachMedia(media.hostVideo, videoRef.current);
      attachMedia(media.guestVideo, videoBRef.current);
      attachMedia(media.hostAudio, audioRef.current);
      attachMedia(media.guestAudio, audioBRef.current);
      kickPlayback(videoRef.current, audioRef.current);
      kickPlayback(videoBRef.current, audioBRef.current);
      if (media.hostVideo || media.guestVideo) setStatus("live");
      return;
    }
    const preferred = pickRemoteVideoTrack(r);
    if (preferred && videoRef.current) {
      preferred.attach(videoRef.current);
      kickPlayback(videoRef.current, audioRef.current);
    }
  }, [layout]);

  const showPoster = status !== "live";
  const videoFilter = brighten
    ? { filter: "brightness(1.18) contrast(1.06) saturate(1.05)" }
    : undefined;

  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      <div
        className={
          layout === "split"
            ? "absolute inset-x-1 z-[12] flex flex-row gap-1"
            : "absolute inset-0"
        }
        style={layout === "split" ? BATTLE_VIDEO_DOCK_STYLE_SOCIAL : undefined}
      >
        <div
          className={
            layout === "split"
              ? "relative min-h-0 min-w-0 flex-1 isolate overflow-hidden rounded-[18px] bg-black"
              : "absolute inset-0 overflow-hidden bg-black"
          }
        >
          <video
            ref={videoRef}
            playsInline
            autoPlay
            muted
            className="absolute inset-0 h-full w-full object-cover"
            style={videoFilter}
          />
          {layout === "split" && splitHostName ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/60 to-transparent px-2 pb-1.5 pt-7">
              <p className="truncate text-[11px] font-bold text-white">{splitHostName}</p>
            </div>
          ) : null}
        </div>
        {layout === "split" ? (
          <div className="relative min-h-0 min-w-0 flex-1 isolate overflow-hidden rounded-[18px] bg-[#0c0c10]">
            <video
              ref={videoBRef}
              playsInline
              autoPlay
              muted
              className="absolute inset-0 h-full w-full object-cover"
              style={videoFilter}
            />
            {splitGuestName ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/60 to-transparent px-2 pb-1.5 pt-7">
                <p className="truncate text-[11px] font-bold text-white">{splitGuestName}</p>
              </div>
            ) : null}
          </div>
        ) : null}
        {layout === "split" ? <BattleSplitDivider /> : null}
      </div>
      <audio ref={audioRef} autoPlay playsInline />
      <audio ref={audioBRef} autoPlay playsInline />
      {posterImage && (
        <img
          src={posterImage}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          style={{
            opacity: showPoster && layout !== "split" ? 1 : 0,
            transition: "opacity 200ms ease",
            pointerEvents: "none",
            ...(brighten && showPoster ? { filter: "brightness(1.12)" } : null),
          }}
          draggable={false}
        />
      )}
    </div>
  );
}
