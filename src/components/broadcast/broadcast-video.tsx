import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import { Camera, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Press } from "@/components/press";
import { useAppActive } from "@/lib/app-state";
import { ensureCameraMicAccess } from "@/lib/media-permissions";
import {
  Room,
  RoomEvent,
  Track,
  createLocalVideoTrack,
  facingModeFromLocalTrack,
  connectRoom,
  getToken,
  disconnectRoom,
  switchHostCameraFacing,
  syncFrontCameraMirror,
  type LocalVideoTrack,
  type CameraFacing,
} from "@/lib/livekit";

/**
 * Video layer for the broadcaster (host) side.
 *
 * Two modes:
 *   - Preview mode (no `livekit` prop): plain getUserMedia self-preview,
 *     used in BroadcastSetup before going live.
 *   - LiveKit host mode (`livekit` prop given): connects to the LiveKit
 *     room, publishes camera + mic, and shows the local video track.
 *
 * Front-camera publishes are horizontally mirrored (selfie-style) so viewers
 * see the same left/right as the host preview. Rear camera stays unmirrored.
 */

export type BroadcastVideoLK = {
  room: string;
  identity: string;
  name?: string;
};

export type BroadcastVideoProps = {
  facing: CameraFacing;
  enabled: boolean;
  fallbackImage?: string | null;
  /** When set, use LiveKit host publishing instead of local preview. */
  livekit?: BroadcastVideoLK;
  micEnabled?: boolean;
  /** Bump this to force a fresh token + reconnect (host retry). */
  retryKey?: number;
  onStatus?: (s: BroadcastStatus) => void;
  /** Reports whether the current device has more than one camera. */
  onCanFlipChange?: (canFlip: boolean) => void;
  /** Called when the user taps "Retry" on the error overlay (preview mode). */
  onRequestRetry?: () => void;
  /** Reports back if a flip attempt failed and facing had to revert. */
  onFlipRevert?: (facing: CameraFacing) => void;
  /** True while a camera flip is in progress (disable the flip button). */
  onFlipBusyChange?: (busy: boolean) => void;
  /** Called after a successful live flip with the actual facing applied. */
  onFacingApplied?: (facing: CameraFacing) => void;
};

export type BroadcastStatus =
  | "idle"
  | "connecting"
  | "reconnecting"
  | "granted"
  | "denied"
  | "config_missing"
  | "unavailable"
  | "unsupported"
  | "token_failed"
  | "connect_failed"
  | "error";

export type BroadcastVideoHandle = {
  /**
   * Switch front/back during live. Pass a target, or omit to flip opposite
   * of the *actual* hardware camera (recommended after leave/return).
   */
  switchCamera: (facing?: CameraFacing) => Promise<CameraFacing>;
};

export const BroadcastVideo = forwardRef<BroadcastVideoHandle, BroadcastVideoProps>(
  function BroadcastVideo(
    { facing, enabled, fallbackImage, livekit, micEnabled = true, retryKey = 0, onStatus, onCanFlipChange, onRequestRetry, onFlipRevert, onFlipBusyChange, onFacingApplied },
    ref,
  ) {
    const { t } = useTranslation();
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const roomRef = useRef<Room | null>(null);
    const localVideoTrackRef = useRef<LocalVideoTrack | null>(null);
    const [state, setState] = useState<BroadcastStatus>("idle");
    const appActive = useAppActive();

    // Preview: pause capture when cam off / backgrounded.
    // LiveKit room must stay connected when the host only toggles the camera —
    // tying room lifecycle to `enabled` caused a full reconnect (30–40s).
    const previewShouldRun = enabled && appActive;
    const roomShouldRun = appActive;

    // Report status upward.
    useEffect(() => {
      onStatus?.(state);
    }, [state, onStatus]);

    // Probe device count to decide whether the flip button should show.
    // Re-probes on state changes because iOS/Android only expose the full
    // camera list AFTER camera permission is granted — before that,
    // enumerateDevices() often returns a single unlabelled device and the
    // flip button would stay hidden forever.
    useEffect(() => {
      if (!onCanFlipChange) return;
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
        onCanFlipChange(false);
        return;
      }
      // Optimistic default on touch devices: assume front+back exist so the
      // button appears immediately. The flip handler already reverts + toasts
      // if the target camera doesn't actually exist.
      const isTouch = typeof window !== "undefined"
        && (("ontouchstart" in window) || ((navigator as Navigator).maxTouchPoints ?? 0) > 0);
      if (isTouch) onCanFlipChange(true);
      let cancelled = false;
      void navigator.mediaDevices.enumerateDevices().then((devices) => {
        if (cancelled) return;
        const cams = devices.filter((d) => d.kind === "videoinput").length;
        if (cams > 1) onCanFlipChange(true);
        else if (!isTouch) onCanFlipChange(false);
      }).catch(() => {
        if (!cancelled && !isTouch) onCanFlipChange(false);
      });
      return () => { cancelled = true; };
    }, [onCanFlipChange, state]);

    // Camera flip bookkeeping — must be declared before useImperativeHandle.
    const flipInFlightRef = useRef(false);
    const lastAppliedFacingRef = useRef<CameraFacing | null>(null);
    const facingRef = useRef(facing);
    facingRef.current = facing;
    const onFacingAppliedRef = useRef(onFacingApplied);
    onFacingAppliedRef.current = onFacingApplied;

    const syncFacingFromTrack = (track: LocalVideoTrack, fallback: CameraFacing) => {
      const detected =
        facingModeFromLocalTrack(track, { defaultFacingMode: fallback }).facingMode;
      const applied: CameraFacing =
        detected === "environment" || detected === "user" ? detected : fallback;
      lastAppliedFacingRef.current = applied;
      onFacingAppliedRef.current?.(applied);
      return applied;
    };

    useImperativeHandle(ref, () => ({
      switchCamera: async (target?: CameraFacing) => {
        const room = roomRef.current;
        let track = localVideoTrackRef.current;
        if (!livekit || !room) {
          throw new Error("camera_not_ready");
        }
        // After leave/return, the publication may have a newer track instance.
        if (!track) {
          const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
          if (pub?.track) {
            track = pub.track as LocalVideoTrack;
            localVideoTrackRef.current = track;
          }
        }
        if (!track) {
          throw new Error("camera_not_ready");
        }
        if (!enabled) {
          throw new Error("camera_off");
        }
        if (flipInFlightRef.current) {
          throw new Error("flip_busy");
        }

        flipInFlightRef.current = true;
        onFlipBusyChange?.(true);
        const previous = lastAppliedFacingRef.current ?? facing;
        try {
          const applied = await switchHostCameraFacing({ room, track, target });
          // Publication may replace the track object — refresh the ref.
          const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
          if (pub?.track) {
            localVideoTrackRef.current = pub.track as LocalVideoTrack;
            track = pub.track as LocalVideoTrack;
          }
          await syncFrontCameraMirror(track, applied);
          const videoEl = videoRef.current;
          if (videoEl) {
            try {
              track.attach(videoEl);
              videoEl.muted = true;
              videoEl.playsInline = true;
              await videoEl.play().catch(() => {});
            } catch { /* ignore */ }
          }
          lastAppliedFacingRef.current = applied;
          onFacingApplied?.(applied);
          console.log("[flip] ok", { target, applied });
          return applied;
        } catch (err) {
          console.warn("[flip] failed", err);
          const videoEl = videoRef.current;
          if (videoEl && track) {
            try { track.attach(videoEl); videoEl.play().catch(() => {}); } catch {}
          }
          toast.error(t("live.flipFailed", "Impossible de changer de caméra"));
          onFlipRevert?.(previous);
          throw err;
        } finally {
          flipInFlightRef.current = false;
          onFlipBusyChange?.(false);
        }
      },
    }), [livekit, enabled, facing, onFlipBusyChange, onFacingApplied, onFlipRevert, t]);

    // --- Preview mode (getUserMedia) --------------------------------------
    useEffect(() => {
      if (livekit) return; // handled by LK effect below
      let cancelled = false;

      async function acquire() {
        if (!previewShouldRun) return teardown();
        teardown();
        const res = await ensureCameraMicAccess({
          video: { facingMode: facing },
          audio: false,
        });
        if (cancelled) {
          if (res.status === "granted") res.stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (res.status === "granted") {
          streamRef.current = res.stream;
          if (videoRef.current) {
            videoRef.current.srcObject = res.stream;
            videoRef.current.play().catch(() => {});
          }
          setState("granted");
          return;
        }
        if (res.status === "denied_by_user") setState("denied");
        else if (res.status === "config_missing") setState("config_missing");
        else if (res.status === "no_device") setState("unavailable");
        else if (res.status === "unsupported") setState("unsupported");
        else setState("error");
      }

      function teardown() {
        const s = streamRef.current;
        if (s) {
          s.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        if (videoRef.current) videoRef.current.srcObject = null;
      }

      void acquire();
      return () => {
        cancelled = true;
        teardown();
      };
    }, [facing, previewShouldRun, livekit]);

    // --- LiveKit host mode ------------------------------------------------
    useEffect(() => {
      if (!livekit) return;
      let cancelled = false;

      async function start() {
        if (!roomShouldRun) return teardown();
        setState("connecting");

        const preflight = await ensureCameraMicAccess({
          video: { facingMode: facingRef.current },
          audio: micEnabled,
        });
        if (cancelled) {
          if (preflight.status === "granted") preflight.stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (preflight.status !== "granted") {
          if (preflight.status === "denied_by_user") setState("denied");
          else if (preflight.status === "config_missing") setState("config_missing");
          else if (preflight.status === "no_device") setState("unavailable");
          else if (preflight.status === "unsupported") setState("unsupported");
          else setState("error");
          return;
        }
        preflight.stream.getTracks().forEach((t) => t.stop());

        let phase: "token" | "connect" | "camera" = "token";
        try {
          const { token, url } = await getToken(
            livekit!.room,
            livekit!.identity,
            livekit!.name,
            "host",
          );
          if (cancelled) return;
          phase = "connect";
          const room = await connectRoom(url, token);
          if (cancelled) {
            await disconnectRoom(room);
            return;
          }
          roomRef.current = room;

          room.on(RoomEvent.Reconnecting, () => {
            if (!cancelled) setState("reconnecting");
          });
          room.on(RoomEvent.Reconnected, () => {
            if (cancelled) return;
            setState("granted");
            // After network reconnect LiveKit may replace the camera track —
            // refresh the ref and resync facing so flip stays accurate.
            const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
            const t = pub?.track as LocalVideoTrack | undefined;
            if (t) {
              localVideoTrackRef.current = t;
              void (async () => {
                const applied = syncFacingFromTrack(t, facingRef.current);
                await syncFrontCameraMirror(t, applied ?? facingRef.current);
                if (videoRef.current) {
                  t.attach(videoRef.current);
                  videoRef.current.play().catch(() => {});
                }
              })();
            }
          });
          room.on(RoomEvent.Disconnected, () => {
            if (!cancelled) setState("connect_failed");
          });

          phase = "camera";
          await room.localParticipant.setMicrophoneEnabled(micEnabled);
          // Prefer remembered facing after leave/return (not a stale closure).
          const desiredFacing = facingRef.current;
          // If the host already toggled cam off before connect finished, stay muted.
          if (!enabled) {
            await room.localParticipant.setCameraEnabled(false);
            localVideoTrackRef.current = null;
            setState("granted");
            return;
          }
          const track = await createLocalVideoTrack({
            facingMode: desiredFacing,
            resolution: { width: 1280, height: 720, frameRate: 30 },
          });
          if (cancelled) {
            track.stop();
            await disconnectRoom(room);
            return;
          }
          await room.localParticipant.publishTrack(track, {
            simulcast: true,
            videoEncoding: { maxBitrate: 1_800_000, maxFramerate: 30 },
          });
          localVideoTrackRef.current = track;
          // Hardware may ignore facingMode (esp. after background) — sync UI
          // to what actually opened so the first flip works.
          const appliedFacing = syncFacingFromTrack(track, desiredFacing);
          await syncFrontCameraMirror(track, appliedFacing ?? desiredFacing);
          if (videoRef.current) {
            track.attach(videoRef.current);
            videoRef.current.play().catch(() => {});
          }
          setState("granted");
        } catch (err) {
          console.error("[livekit host] failed", { phase, err });
          if (!cancelled) {
            const msg = String(err ?? "").toLowerCase();
            const isPermission =
              msg.includes("permission") ||
              msg.includes("denied") ||
              msg.includes("notallowed");
            if (phase === "camera" && isPermission) setState("denied");
            else if (phase === "token") setState("token_failed");
            else if (phase === "connect") setState("connect_failed");
            else if (phase === "camera") setState("error");
            else setState("error");
            await teardown();
          }
        }
      }

      async function teardown() {
        const t = localVideoTrackRef.current;
        if (t) {
          try {
            t.detach();
            t.stop();
          } catch {}
          localVideoTrackRef.current = null;
        }
        await disconnectRoom(roomRef.current);
        roomRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
      }

      void start();
      return () => {
        cancelled = true;
        void teardown();
      };
    }, [livekit?.room, livekit?.identity, roomShouldRun, retryKey]);

    // Toggle camera without reconnecting. When turning back ON, re-apply the
    // remembered facingMode — otherwise LiveKit defaults to front camera and
    // the flip button appears "broken" until the user flips twice.
    // Only run on real cam toggles — never right after the initial publish
    // (that path already created the track with the correct facing).
    const camToggleReadyRef = useRef(false);
    const prevEnabledRef = useRef(enabled);
    useEffect(() => {
      // Mark ready once host video is live; clear when we leave that state.
      if (state === "granted") camToggleReadyRef.current = true;
      else if (state === "connecting" || state === "idle") camToggleReadyRef.current = false;
    }, [state]);
    useEffect(() => {
      if (!livekit || !roomShouldRun || !camToggleReadyRef.current) {
        prevEnabledRef.current = enabled;
        return;
      }
      const room = roomRef.current;
      if (!room) {
        prevEnabledRef.current = enabled;
        return;
      }
      if (prevEnabledRef.current === enabled) return;
      prevEnabledRef.current = enabled;
      void (async () => {
        try {
          if (!enabled) {
            try {
              await localVideoTrackRef.current?.stopProcessor();
            } catch {
              /* ignore */
            }
            await room.localParticipant.setCameraEnabled(false);
            return;
          }
          // Re-enable: prefer setCameraEnabled, fall back to a fresh publish
          // if it stalls (common on iOS after mute).
          const desiredFacing = facingRef.current;
          let track: LocalVideoTrack | undefined;
          try {
            const pub = await Promise.race([
              room.localParticipant.setCameraEnabled(true, {
                facingMode: desiredFacing,
                resolution: { width: 1280, height: 720, frameRate: 30 },
              }),
              new Promise<undefined>((resolve) =>
                setTimeout(() => resolve(undefined), 6000),
              ),
            ]);
            track =
              (pub?.track as LocalVideoTrack | undefined) ??
              (room.localParticipant.getTrackPublication(Track.Source.Camera)
                ?.track as LocalVideoTrack | undefined);
          } catch (e) {
            console.warn("[camera] setCameraEnabled(true) failed, republish", e);
          }
          if (!track || track.isMuted) {
            if (track) {
              try {
                await room.localParticipant.unpublishTrack(track, true);
              } catch {
                /* ignore */
              }
            }
            track = await createLocalVideoTrack({
              facingMode: desiredFacing,
              resolution: { width: 1280, height: 720, frameRate: 30 },
            });
            await room.localParticipant.publishTrack(track, {
              simulcast: true,
              videoEncoding: { maxBitrate: 1_800_000, maxFramerate: 30 },
              source: Track.Source.Camera,
            });
          }
          localVideoTrackRef.current = track;
          const appliedFacing = syncFacingFromTrack(track, desiredFacing);
          await syncFrontCameraMirror(track, appliedFacing ?? desiredFacing);
          if (videoRef.current) {
            track.attach(videoRef.current);
            videoRef.current.muted = true;
            videoRef.current.playsInline = true;
            await videoRef.current.play().catch(() => {});
          }
        } catch (e) {
          console.warn("[camera] setCameraEnabled failed", e);
          toast.error(t("live.cameraOnFailed", "Impossible de réactiver la caméra"));
        }
      })();
    }, [enabled, livekit, roomShouldRun, t]);

    // Toggle mic without reconnecting.
    useEffect(() => {
      if (!livekit) return;
      const room = roomRef.current;
      if (!room) return;
      void room.localParticipant.setMicrophoneEnabled(micEnabled);
    }, [micEnabled, livekit]);

    const showVideo = roomShouldRun && state === "granted" && enabled;
    // Preview-only CSS mirror. LiveKit mode uses MirrorVideoProcessor on the
    // published track (and shows it locally) so we must not double-flip.
    const mirrored = !livekit && facing === "user";

    return (
      <div className="absolute inset-0 overflow-hidden bg-neutral-900">
        {fallbackImage && !showVideo && (
          <img
            src={fallbackImage}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-70"
            style={{ filter: "blur(4px) brightness(0.55)" }}
          />
        )}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="absolute inset-0 h-full w-full object-cover"
          style={{
            transform: mirrored ? "scaleX(-1)" : undefined,
            willChange: "transform",
            display: showVideo ? "block" : "none",
          }}
        />
        {!showVideo && (
          <div className="absolute inset-0 grid place-items-center">
            <div
              className="flex flex-col items-center gap-2 rounded-2xl px-5 py-4 text-white/90"
              style={{
                backgroundColor: "rgba(0,0,0,0.35)",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
              }}
            >
              <Camera size={28} />
              <p className="max-w-[260px] text-center text-[13px] font-semibold">
                {state === "connecting"
                  ? t("broadcast.camera.connecting", "Connexion au live…")
                  : state === "denied"
                    ? t(
                        "broadcast.camera.denied",
                        "Autorise la caméra dans Réglages > KiDi+",
                      )
                    : state === "config_missing"
                      ? t(
                          "broadcast.camera.configMissing",
                          "Configuration requise : permissions caméra manquantes dans le build",
                        )
                    : state === "unavailable"
                      ? t("broadcast.camera.unavailable", "Caméra indisponible")
                      : state === "unsupported"
                        ? t("broadcast.camera.unsupported", "Caméra non supportée")
                        : state === "error" ||
                            state === "token_failed" ||
                            state === "connect_failed"
                          ? t("broadcast.camera.connectFailed", "Connexion impossible")
                          : t("broadcast.camera.preview", "Aperçu caméra")}
              </p>
              {onRequestRetry &&
                (state === "denied" ||
                  state === "config_missing" ||
                  state === "unavailable" ||
                  state === "unsupported" ||
                  state === "error") && (
                  <Press
                    onClick={onRequestRetry}
                    className="!min-h-9 mt-1 inline-flex items-center gap-1.5 rounded-full px-3.5 text-[12px] font-semibold text-black"
                    style={{ backgroundColor: "white" }}
                  >
                    <RefreshCw size={14} />
                    {t("broadcast.camera.retry", "Réessayer")}
                  </Press>
                )}
            </div>
          </div>
        )}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)",
          }}
        />
      </div>
    );
  },
);

// Re-export event type consumers may need.
export { RoomEvent, Track };
