// Viewer-side LiveKit video layer. Subscribes to the host's camera + mic
// and renders them full-bleed. Falls back to a placeholder image while the
// host is not connected yet, or after they leave.
import { useEffect, useRef, useState } from "react";
import {
  RoomEvent,
  Track,
  connectRoom,
  disconnectRoom,
  getToken,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RemoteParticipant,
} from "@/lib/livekit";
import { useAppActive } from "@/lib/app-state";
import { Room } from "livekit-client";

export type ViewerLiveVideoProps = {
  room: string;
  identity: string;
  name?: string;
  posterImage?: string | null;
  onStatus?: (s: ViewerStatus) => void;
};

export type ViewerStatus =
  | "connecting"
  | "waiting"   // connected but no host publishing yet
  | "live"      // remote video attached
  | "ended"    // host disconnected after having been live
  | "error";

export function ViewerLiveVideo({
  room,
  identity,
  name,
  posterImage,
  onStatus,
}: ViewerLiveVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const roomRef = useRef<Room | null>(null);
  const [status, setStatus] = useState<ViewerStatus>("connecting");
  const appActive = useAppActive();

  useEffect(() => {
    onStatus?.(status);
  }, [status, onStatus]);

  useEffect(() => {
    if (!appActive) return;
    let cancelled = false;
    let hadVideo = false;

    async function start() {
      setStatus("connecting");
      try {
        const { token, url } = await getToken(room, identity, name, "viewer");
        if (cancelled) return;
        const r = await connectRoom(url, token);
        if (cancelled) {
          await disconnectRoom(r);
          return;
        }
        roomRef.current = r;

        const attachTrack = (track: RemoteTrack) => {
          if (track.kind === Track.Kind.Video && videoRef.current) {
            track.attach(videoRef.current);
            hadVideo = true;
            setStatus("live");
          } else if (track.kind === Track.Kind.Audio && audioRef.current) {
            track.attach(audioRef.current);
          }
        };

        r.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
          attachTrack(track);
        });

        r.on(
          RoomEvent.TrackUnsubscribed,
          (track: RemoteTrack, _pub: RemoteTrackPublication) => {
            try {
              track.detach();
            } catch {}
            if (track.kind === Track.Kind.Video) {
              setStatus(hadVideo ? "ended" : "waiting");
            }
          },
        );

        r.on(RoomEvent.ParticipantDisconnected, (_p: RemoteParticipant) => {
          const anyoneLeft = r.remoteParticipants.size > 0;
          if (!anyoneLeft && hadVideo) setStatus("ended");
        });

        r.on(RoomEvent.Disconnected, () => {
          setStatus(hadVideo ? "ended" : "error");
        });

        // Attach any tracks already subscribed at connect time.
        r.remoteParticipants.forEach((p) => {
          p.trackPublications.forEach((pub) => {
            if (pub.track) attachTrack(pub.track);
          });
        });

        if (r.remoteParticipants.size === 0) setStatus("waiting");
      } catch (err) {
        console.error("[livekit viewer] failed", err);
        if (!cancelled) setStatus("error");
      }
    }

    void start();
    return () => {
      cancelled = true;
      const r = roomRef.current;
      roomRef.current = null;
      void disconnectRoom(r);
      if (videoRef.current) videoRef.current.srcObject = null;
      if (audioRef.current) audioRef.current.srcObject = null;
    };
  }, [room, identity, name, appActive]);

  const showPoster = status !== "live";

  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      {posterImage && showPoster && (
        <img
          src={posterImage}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          style={{ filter: "blur(2px) brightness(0.6)" }}
          draggable={false}
        />
      )}
      <video
        ref={videoRef}
        playsInline
        autoPlay
        className="absolute inset-0 h-full w-full object-cover"
        style={{ display: status === "live" ? "block" : "none" }}
      />
      <audio ref={audioRef} autoPlay />
      {showPoster && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div
            className="rounded-2xl px-4 py-2 text-[13px] font-semibold text-white/90"
            style={{
              backgroundColor: "rgba(0,0,0,0.4)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
            }}
          >
            {status === "connecting"
              ? "Connexion au live…"
              : status === "waiting"
                ? "Le live va commencer…"
                : status === "ended"
                  ? "Live terminé"
                  : "Connexion impossible"}
          </div>
        </div>
      )}
    </div>
  );
}
