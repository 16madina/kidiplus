// Viewer-side LiveKit video layer. Subscribes to the host's camera + mic
// and renders them full-bleed. Falls back to a placeholder image while the
// host is not connected yet, or after they leave.
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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
import { getInSystemPip, getPipHold, useMediaSessionActive } from "@/lib/pip-session";
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
  | "waiting"      // connected but no host publishing yet (before first frame)
  | "host_away"    // host was live, briefly gone — "back soon"
  | "live"         // remote video attached
  | "reconnecting" // livekit transient reconnect in progress
  | "ended"        // host disconnected after having been live
  | "error";


export function ViewerLiveVideo({
  room,
  identity,
  name,
  posterImage,
  onStatus,
}: ViewerLiveVideoProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const roomRef = useRef<Room | null>(null);
  const [status, setStatus] = useState<ViewerStatus>("connecting");
  const appActive = useAppActive();
  // Keep LiveKit connected in Android system PiP even though Capacitor
  // reports the app as inactive while the PiP window is showing.
  const sessionActive = useMediaSessionActive(appActive);

  useEffect(() => {
    onStatus?.(status);
  }, [status, onStatus]);

  useEffect(() => {
    if (!sessionActive) return;
    let cancelled = false;
    let hadVideo = false;
    // Debounce transitions to "ended". LiveKit routinely fires a brief
    // TrackUnsubscribed / ParticipantDisconnected during host publish
    // renegotiations (e.g. when the host opens a native prompt, switches
    // camera, or briefly loses network). Immediately flashing "Live terminé"
    // on the viewer during those hiccups was the source of the wrongly-ended
    // overlay when the host started an auction. We wait 4s of continued
    // absence before we consider the video actually ended.
    let endTimer: ReturnType<typeof setTimeout> | null = null;
    const clearEndTimer = () => {
      if (endTimer) {
        clearTimeout(endTimer);
        endTimer = null;
      }
    };
    const scheduleEnd = (reason: string) => {
      if (cancelled) return;
      clearEndTimer();
      if (!hadVideo) {
        setStatus("waiting");
        return;
      }
      // Soft "host will be back" while we wait for the host to republish.
      // Stay on this message for the abandon window (~5 min) — don't flash
      // "Live terminé" after a few seconds while the live is still open in DB.
      setStatus("host_away");
      endTimer = setTimeout(() => {
        endTimer = null;
        if (!cancelled) {
          console.warn("[live-end diag] viewer video → 'ended' (5m absence)", { reason });
          setStatus("ended");
        }
      }, 5 * 60_000);
    };

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
          if (cancelled) return;
          if (track.kind === Track.Kind.Video && videoRef.current) {
            track.attach(videoRef.current);
            hadVideo = true;
            clearEndTimer();
            setStatus("live");
          } else if (track.kind === Track.Kind.Audio && audioRef.current) {
            track.attach(audioRef.current);
          }
        };

        r.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
          if (cancelled) return;
          attachTrack(track);
        });

        r.on(
          RoomEvent.TrackUnsubscribed,
          (track: RemoteTrack, _pub: RemoteTrackPublication) => {
            try {
              track.detach();
            } catch {}
            // Ignore unsubscribe events fired during our own teardown —
            // otherwise a stale closure would schedule "ended" while the
            // component is remounting (e.g. after appActive flip / Stripe
            // iframe momentarily hiding the tab).
            if (cancelled) return;
            // While system PiP / background hold is active, WKWebView often
            // briefly drops tracks — treat that as noise, not host leave.
            if (getPipHold() || getInSystemPip()) return;
            if (track.kind === Track.Kind.Video) {
              scheduleEnd("TrackUnsubscribed(video)");
            }
          },
        );

        r.on(RoomEvent.ParticipantDisconnected, (_p: RemoteParticipant) => {
          if (cancelled) return;
          const anyoneLeft = r.remoteParticipants.size > 0;
          if (!anyoneLeft && hadVideo) scheduleEnd("ParticipantDisconnected(last)");
        });

        r.on(RoomEvent.Disconnected, () => {
          if (cancelled) return;
          if (hadVideo) scheduleEnd("RoomDisconnected");
          else setStatus("error");
        });

        // LiveKit auto-reconnects on network drops — surface the transient
        // state so viewers see "Reconnexion…" instead of an ended overlay.
        r.on(RoomEvent.Reconnecting, () => {
          if (cancelled) return;
          clearEndTimer();
          setStatus("reconnecting");
        });
        r.on(RoomEvent.Reconnected, () => {
          if (cancelled) return;
          clearEndTimer();
          setStatus(hadVideo ? "live" : "waiting");
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
      clearEndTimer();
      const r = roomRef.current;
      roomRef.current = null;
      void disconnectRoom(r);
      if (videoRef.current) videoRef.current.srcObject = null;
      if (audioRef.current) audioRef.current.srcObject = null;
    };
  }, [room, identity, name, sessionActive]);

  // After returning from system PiP / background, WKWebView media is often
  // frozen on the last frame (or stuck on the poster). Re-attach + play.
  useEffect(() => {
    if (!appActive) return;
    const video = videoRef.current;
    const audio = audioRef.current;
    const r = roomRef.current;
    if (!r) return;

    let recovered = false;
    r.remoteParticipants.forEach((p) => {
      p.trackPublications.forEach((pub) => {
        const track = pub.track;
        if (!track) return;
        try {
          if (track.kind === Track.Kind.Video && video) {
            track.attach(video);
            recovered = true;
          } else if (track.kind === Track.Kind.Audio && audio) {
            track.attach(audio);
          }
        } catch {
          /* ignore */
        }
      });
    });

    if (recovered) {
      setStatus("live");
    }
    void video?.play()?.catch(() => {});
    void audio?.play()?.catch(() => {});
  }, [appActive]);

  const showPoster = status !== "live";

  const statusLabel =
    status === "connecting"
      ? t("live.viewerConnecting", "Connexion au live…")
      : status === "reconnecting"
        ? t("live.viewerReconnecting", "Reconnexion…")
        : status === "host_away"
          ? t("live.hostBackSoon", "L'hôte revient bientôt…")
          : status === "waiting"
            ? t("live.viewerWaitingStart", "Le live va commencer…")
            : status === "ended"
              ? t("live.ended", "Live terminé")
              : t("live.viewerConnectFailed", "Connexion impossible");

  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      {posterImage && (
        <img
          src={posterImage}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          style={{
            // Poster matches the PeekSlide look so the swap on swipe-commit
            // is visually continuous — no blur/brightness jump.
            opacity: showPoster ? 1 : 0,
            transition: "none",
          }}
          draggable={false}
        />
      )}
      <video
        ref={videoRef}
        playsInline
        autoPlay
        className="absolute inset-0 h-full w-full object-cover"
        // Keep the element mounted; flip visibility via opacity with NO
        // transition so the first painted frame of the live replaces the
        // poster in the same frame as the "live" status flip.
        style={{
          opacity: status === "live" ? 1 : 0,
          transition: "none",
          willChange: "opacity",
        }}
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
            {statusLabel}
          </div>
        </div>
      )}
    </div>
  );
}
