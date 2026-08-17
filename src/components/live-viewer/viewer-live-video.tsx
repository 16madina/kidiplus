// Viewer-side LiveKit video layer. Subscribes to the host's camera + mic
// and renders them full-bleed. Falls back to a placeholder image while the
// host is not connected yet, or after they leave.
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Capacitor } from "@capacitor/core";
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
import {
  getInSystemPip,
  getPipHold,
  useInSystemPip,
  useMediaSessionActive,
  usePipHold,
} from "@/lib/pip-session";
import { Room } from "livekit-client";
import { BattleSplitDivider, BATTLE_VIDEO_DOCK_STYLE } from "@/components/battle/battle-split-chrome";

export type ViewerLiveVideoProps = {
  room: string;
  identity: string;
  name?: string;
  posterImage?: string | null;
  onStatus?: (s: ViewerStatus) => void;
  /** Two host cameras during a Défi Plus. */
  layout?: "single" | "split";
  splitHostName?: string | null;
  splitGuestName?: string | null;
};

export type ViewerStatus =
  | "connecting"
  | "waiting"      // connected but no host publishing yet (before first frame)
  | "host_away"    // host was live, briefly gone — "back soon"
  | "live"         // remote video attached
  | "reconnecting" // livekit transient reconnect in progress
  | "ended"        // host disconnected after having been live
  | "error";


/** Soft kick — play() only. */
function kickPlayback(
  video: HTMLVideoElement | null,
  audio: HTMLAudioElement | null,
) {
  void video?.play()?.catch(() => {});
  void audio?.play()?.catch(() => {});
}

/** Prefer RTMP Ingress publisher (rtmp-host-*) when several remotes publish video. */
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

function pickHostVideos(room: Room): RemoteTrack[] {
  const host: RemoteTrack[] = [];
  const guests: RemoteTrack[] = [];
  for (const p of room.remoteParticipants.values()) {
    for (const pub of p.trackPublications.values()) {
      const track = pub.track;
      if (!track || track.kind !== Track.Kind.Video) continue;
      if (p.identity.startsWith("rtmp-host-")) return [track];
      if (p.identity.startsWith("battle_")) guests.push(track);
      else host.push(track);
    }
  }
  return [...host, ...guests];
}

/** Hard recover — re-bind tracks + nudge WKWebView decoder (same as PiP return). */
function reattachRemoteMedia(
  room: Room,
  video: HTMLVideoElement | null,
  audio: HTMLAudioElement | null,
  hard = true,
): boolean {
  let gotVideo = false;
  room.remoteParticipants.forEach((p) => {
    p.trackPublications.forEach((pub) => {
      try {
        if (!pub.isSubscribed) pub.setSubscribed(true);
      } catch {
        /* ignore */
      }
      const track = pub.track;
      if (!track) return;
      try {
        if (track.kind === Track.Kind.Audio && audio) {
          if (hard) {
            try { track.detach(audio); } catch { /* ignore */ }
          }
          track.attach(audio);
        }
      } catch {
        /* ignore */
      }
    });
  });
  const videoTrack = pickRemoteVideoTrack(room);
  if (videoTrack && video) {
    try {
      if (hard) {
        try { videoTrack.detach(video); } catch { /* ignore */ }
      }
      videoTrack.attach(video);
      gotVideo = true;
    } catch {
      /* ignore */
    }
  }
  if (hard && video?.srcObject) {
    const stream = video.srcObject;
    video.srcObject = null;
    video.srcObject = stream;
  }
  kickPlayback(video, audio);
  return gotVideo;
}

export function ViewerLiveVideo({
  room,
  identity,
  name,
  posterImage,
  onStatus,
  layout = "single",
  splitHostName,
  splitGuestName,
}: ViewerLiveVideoProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const roomRef = useRef<Room | null>(null);
  const hadLiveRef = useRef(false);
  const [status, setStatus] = useState<ViewerStatus>("connecting");
  const appActive = useAppActive();
  // Keep LiveKit connected in Android system PiP even though Capacitor
  // reports the app as inactive while the PiP window is showing.
  const sessionActive = useMediaSessionActive(appActive);
  const inSystemPip = useInSystemPip();
  const pipHold = usePipHold();
  const isIosNative = (() => {
    try {
      return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
    } catch {
      return false;
    }
  })();

  useEffect(() => {
    onStatus?.(status);
  }, [status, onStatus]);

  useEffect(() => {
    if (status === "live") hadLiveRef.current = true;
  }, [status]);

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
        // WKWebView: adaptiveStream often freezes the first open on one frame.
        // Web browsers can keep adaptive bitrate; native Capacitor stays off.
        const r = await connectRoom(url, token, {
          adaptiveStream: !Capacitor.isNativePlatform(),
        });
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
            // Prefer RTMP Ingress publisher over other remote cameras.
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
            const kick = () => kickPlayback(el, audioRef.current);
            el.addEventListener("loadedmetadata", kick, { once: true });
            el.addEventListener("canplay", kick, { once: true });
            kick();
            // Soft recover after layout — hard recover only if still stalled.
            requestAnimationFrame(() => {
              if (cancelled || !roomRef.current) return;
              reattachRemoteMedia(
                roomRef.current,
                videoRef.current,
                audioRef.current,
                false,
              );
            });
            hadVideo = true;
            clearEndTimer();
            setStatus("live");
          } else if (track.kind === Track.Kind.Audio && audioRef.current) {
            const el = audioRef.current;
            track.attach(el);
            void el.play().catch(() => {});
          }
        };

        r.on(
          RoomEvent.TrackSubscribed,
          (track: RemoteTrack, _pub, participant: RemoteParticipant) => {
            if (cancelled) return;
            attachTrack(track, participant);
          },
        );

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

  // iOS system PiP uses a SECOND native LiveKit room. Mute WebView A/V only
  // after native PiP is confirmed (`inSystemPip`) — NOT merely on resignActive.
  // Muting early left a black silent bubble while the native session was still
  // connecting / waiting for its first frame.
  useEffect(() => {
    const audio = audioRef.current;
    const video = videoRef.current;
    const nativeOwnsAv = isIosNative && inSystemPip;
    if (nativeOwnsAv) {
      if (audio) {
        audio.muted = true;
        try { audio.pause(); } catch { /* ignore */ }
      }
      if (video) {
        try { video.pause(); } catch { /* ignore */ }
      }
      return;
    }
    if (audio) audio.muted = false;
    // App backgrounded but native PiP not up yet — keep WebView playing so
    // there's no black gap; iOS may still freeze WKWebView, native takes over.
    const r = roomRef.current;
    if (!r) return;
    if (reattachRemoteMedia(r, video, audio, true) || hadLiveRef.current) {
      setStatus("live");
    }
  }, [isIosNative, inSystemPip, appActive, pipHold]);

  // Android WebView PiP: keep kicking BOTH elements — otherwise the bubble
  // often keeps only one of video/audio after the Activity resize.
  useEffect(() => {
    if (!inSystemPip && !(pipHold && !appActive)) return;
    if (isIosNative) return;
    const kick = () => {
      const r = roomRef.current;
      if (r) reattachRemoteMedia(r, videoRef.current, audioRef.current, false);
      else kickPlayback(videoRef.current, audioRef.current);
    };
    kick();
    const t1 = window.setTimeout(kick, 200);
    const t2 = window.setTimeout(kick, 800);
    const iv = window.setInterval(kick, 1500);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearInterval(iv);
    };
  }, [inSystemPip, pipHold, appActive, isIosNative]);

  // First paint as "live" can still leave WKWebView paused. Soft kicks + stall watchdog.
  useEffect(() => {
    if (status !== "live") return;
    // Don't fight the native PiP session on iOS (only once bubble is confirmed).
    if (isIosNative && inSystemPip) return;
    const soft = () => {
      const r = roomRef.current;
      if (r) {
        reattachRemoteMedia(r, videoRef.current, audioRef.current, false);
        return;
      }
      kickPlayback(videoRef.current, audioRef.current);
    };
    soft();
    const t1 = window.setTimeout(soft, 120);
    const t2 = window.setTimeout(soft, 400);
    const t3 = window.setTimeout(() => {
      const r = roomRef.current;
      if (r) reattachRemoteMedia(r, videoRef.current, audioRef.current, true);
    }, 1000);

    // If currentTime stops advancing while "live", force the same hard recovery
    // that works after returning from PiP.
    let lastTime = -1;
    let stallTicks = 0;
    const watch = window.setInterval(() => {
      if (isIosNative && (getInSystemPip() || (!appActive && getPipHold()))) return;
      const v = videoRef.current;
      const r = roomRef.current;
      if (!v || !r) return;
      if (v.paused) void v.play().catch(() => {});
      const t = v.currentTime;
      if (t <= lastTime + 0.01) {
        stallTicks += 1;
        if (stallTicks >= 2) {
          console.warn("[livekit viewer] frozen frame watchdog — hard reattach");
          reattachRemoteMedia(r, v, audioRef.current, true);
          stallTicks = 0;
        }
      } else {
        stallTicks = 0;
      }
      lastTime = t;
    }, 700);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      window.clearInterval(watch);
    };
  }, [status, isIosNative, inSystemPip, appActive, pipHold]);

  useEffect(() => {
    const r = roomRef.current;
    if (!r || layout !== "split") return;
    const tracks = pickHostVideos(r);
    if (videoRef.current && tracks[0]) {
      try {
        tracks[0].attach(videoRef.current);
      } catch {
        /* ignore */
      }
    }
    if (videoBRef.current && tracks[1]) {
      try {
        tracks[1].attach(videoBRef.current);
        void videoBRef.current.play().catch(() => {});
      } catch {
        /* ignore */
      }
    }
  }, [layout, status]);

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
          {layout === "split" ? (
            <div
              className={`absolute inset-x-1 z-[12] flex gap-1 flex-row`}
              style={BATTLE_VIDEO_DOCK_STYLE}
            >
              <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-[18px] bg-black">
                <video
                  ref={videoRef}
                  playsInline
                  autoPlay
                  muted
                  className="absolute inset-0 h-full w-full object-cover"
                />
                {splitHostName ? (
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/60 to-transparent px-2 pb-1.5 pt-7">
                    <p className="truncate text-[11px] font-bold text-white">{splitHostName}</p>
                  </div>
                ) : null}
              </div>
              <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-[18px] bg-[#0c0c10]">
                <video
                  ref={videoBRef}
                  playsInline
                  autoPlay
                  muted
                  className="absolute inset-0 h-full w-full object-cover"
                />
                {splitGuestName ? (
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/60 to-transparent px-2 pb-1.5 pt-7">
                    <p className="truncate text-[11px] font-bold text-white">{splitGuestName}</p>
                  </div>
                ) : null}
              </div>
              <BattleSplitDivider />
            </div>
          ) : (
        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
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
