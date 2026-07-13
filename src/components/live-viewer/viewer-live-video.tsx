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


/** Re-bind remote tracks and kick playback (WKWebView often needs explicit play). */
function reattachRemoteMedia(
  room: Room,
  video: HTMLVideoElement | null,
  audio: HTMLAudioElement | null,
): boolean {
  let gotVideo = false;
  room.remoteParticipants.forEach((p) => {
    p.trackPublications.forEach((pub) => {
      const track = pub.track;
      if (!track) return;
      try {
        if (track.kind === Track.Kind.Video && video) {
          track.attach(video);
          gotVideo = true;
        } else if (track.kind === Track.Kind.Audio && audio) {
          track.attach(audio);
        }
      } catch {
        /* ignore */
      }
    });
  });
  void video?.play()?.catch(() => {});
  void audio?.play()?.catch(() => {});
  return gotVideo;
}

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
            const el = videoRef.current;
            track.attach(el);
            // Explicit play is required on Capacitor WKWebView / Chrome —
            // autoPlay alone often leaves the first connection on a frozen
            // frame until the user re-enters or backgrounds the app.
            void el.play().catch(() => {});
            hadVideo = true;
            clearEndTimer();
            setStatus("live");
          } else if (track.kind === Track.Kind.Audio && audioRef.current) {
            const el = audioRef.current;
            track.attach(el);
            void el.play().catch(() => {});
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
          const gotVideo = reattachRemoteMedia(
            r,
            videoRef.current,
            audioRef.current,
          );
          if (gotVideo) hadVideo = true;
          setStatus(gotVideo || hadVideo ? "live" : "waiting");
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
    const r = roomRef.current;
    if (!r) return;
    if (reattachRemoteMedia(r, videoRef.current, audioRef.current)) {
      setStatus("live");
    }
  }, [appActive]);

  // First paint as "live" can still leave WKWebView paused (attach happened
  // before layout settled). Kick immediately + short retries.
  useEffect(() => {
    if (status !== "live") return;
    const kick = () => {
      const r = roomRef.current;
      if (r) {
        reattachRemoteMedia(r, videoRef.current, audioRef.current);
        return;
      }
      void videoRef.current?.play()?.catch(() => {});
      void audioRef.current?.play()?.catch(() => {});
    };
    kick();
    const t1 = window.setTimeout(kick, 150);
    const t2 = window.setTimeout(kick, 600);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [status]);

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
      {/* Keep <video> always opaque so decoding / adaptiveStream keep running
          under the poster; only the poster overlay flips visibility. */}
      <video
        ref={videoRef}
        playsInline
        autoPlay
        muted
        className="absolute inset-0 h-full w-full object-cover"
      />
      <audio ref={audioRef} autoPlay playsInline />
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
            pointerEvents: "none",
          }}
          draggable={false}
        />
      )}
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
