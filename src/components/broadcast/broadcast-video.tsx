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
  connectRoom,
  getToken,
  disconnectRoom,
  type LocalVideoTrack,
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
 * The published track is always the RAW camera track (no canvas / WebGL
 * pipeline). Camera flip creates a brand new LocalVideoTrack pinned to
 * `facingMode: { exact: 'environment' | 'user' }`, replaces the published
 * track, reattaches the local <video> preview, awaits play(), and only
 * stops the previous track AFTER the new one renders its first frame.
 */

export type BroadcastVideoLK = {
  room: string;
  identity: string;
  name?: string;
};

export type BroadcastVideoProps = {
  facing: "user" | "environment";
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
  onFlipRevert?: (facing: "user" | "environment") => void;
  /** True while a camera flip is in progress (disable the flip button). */
  onFlipBusyChange?: (busy: boolean) => void;
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
  switchCamera: (facing: "user" | "environment") => Promise<void>;
};

export const BroadcastVideo = forwardRef<BroadcastVideoHandle, BroadcastVideoProps>(
  function BroadcastVideo(
    { facing, enabled, fallbackImage, livekit, micEnabled = true, retryKey = 0, onStatus, onCanFlipChange, onRequestRetry, onFlipRevert, onFlipBusyChange },
    ref,
  ) {
    const { t } = useTranslation();
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const roomRef = useRef<Room | null>(null);
    const localVideoTrackRef = useRef<LocalVideoTrack | null>(null);
    const [state, setState] = useState<BroadcastStatus>("idle");
    const appActive = useAppActive();

    const shouldRun = enabled && appActive;

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

    useImperativeHandle(ref, () => ({
      switchCamera: async () => {
        // No-op: facing prop change drives the flip effect below.
      },
    }));

    // --- Preview mode (getUserMedia) --------------------------------------
    useEffect(() => {
      if (livekit) return; // handled by LK effect below
      let cancelled = false;

      async function acquire() {
        if (!shouldRun) return teardown();
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
    }, [facing, shouldRun, livekit]);

    // --- LiveKit host mode ------------------------------------------------
    useEffect(() => {
      if (!livekit) return;
      let cancelled = false;

      async function start() {
        if (!shouldRun) return teardown();
        setState("connecting");

        const preflight = await ensureCameraMicAccess({
          video: { facingMode: facing },
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
            if (!cancelled) setState("granted");
          });
          room.on(RoomEvent.Disconnected, () => {
            if (!cancelled) setState("connect_failed");
          });

          phase = "camera";
          await room.localParticipant.setMicrophoneEnabled(micEnabled);
          const track = await createLocalVideoTrack({
            facingMode: livekit ? facing : "user",
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
    }, [livekit?.room, livekit?.identity, shouldRun, retryKey]);

    // Toggle camera (published track) without reconnecting.
    useEffect(() => {
      if (!livekit) return;
      const room = roomRef.current;
      if (!room) return;
      void room.localParticipant.setCameraEnabled(enabled);
    }, [enabled, livekit]);

    // Toggle mic without reconnecting.
    useEffect(() => {
      if (!livekit) return;
      const room = roomRef.current;
      if (!room) return;
      void room.localParticipant.setMicrophoneEnabled(micEnabled);
    }, [micEnabled, livekit]);

    // --- Camera flip (prefer in-place restartTrack; fallback to replace) ---
    const flipInFlightRef = useRef(false);
    const lastAppliedFacingRef = useRef<"user" | "environment" | null>(null);
    useEffect(() => {
      if (!livekit) return;
      const room = roomRef.current;
      if (!room) return;
      const oldTrack = localVideoTrackRef.current;
      if (!oldTrack) return;

      if (lastAppliedFacingRef.current === null) {
        lastAppliedFacingRef.current = facing;
        return;
      }
      if (lastAppliedFacingRef.current === facing) return;
      if (flipInFlightRef.current) return;

      // Wait until the camera is on before swapping hardware.
      if (!enabled) return;

      const target = facing;
      const previous = lastAppliedFacingRef.current;
      flipInFlightRef.current = true;
      onFlipBusyChange?.(true);
      let cancelled = false;

      (async () => {
        console.log("[flip] start", { from: previous, to: target });
        try {
          const restart = (oldTrack as LocalVideoTrack & {
            restartTrack?: (opts?: Record<string, unknown>) => Promise<void>;
          }).restartTrack;
          if (typeof restart === "function") {
            try {
              await restart.call(oldTrack, {
                facingMode: { exact: target },
                resolution: { width: 1280, height: 720, frameRate: 30 },
              });
            } catch {
              await restart.call(oldTrack, {
                facingMode: target,
                resolution: { width: 1280, height: 720, frameRate: 30 },
              });
            }
            const videoEl = videoRef.current;
            if (videoEl) {
              try {
                oldTrack.attach(videoEl);
                videoEl.muted = true;
                videoEl.playsInline = true;
                await videoEl.play().catch(() => {});
              } catch { /* ignore */ }
            }
            lastAppliedFacingRef.current = target;
            console.log("[flip] restartTrack ok", target);
            return;
          }

          let newTrack: LocalVideoTrack | null = null;
          const captureOpts = {
            resolution: { width: 1280, height: 720, frameRate: 30 },
          };
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            newTrack = await createLocalVideoTrack({ facingMode: { exact: target } as any, ...captureOpts });
          } catch {
            newTrack = await createLocalVideoTrack({ facingMode: target, ...captureOpts });
          }
          if (cancelled) { try { newTrack.stop(); } catch {} return; }

          await room.localParticipant.publishTrack(newTrack, {
            simulcast: true,
            videoEncoding: { maxBitrate: 1_800_000, maxFramerate: 30 },
          });

          const videoEl = videoRef.current;
          if (videoEl) {
            try { oldTrack.detach(videoEl); } catch {}
            newTrack.attach(videoEl);
            videoEl.muted = true;
            videoEl.playsInline = true;
            await videoEl.play().catch(() => {});
          }

          await new Promise<void>((resolve) => {
            const t = setTimeout(() => resolve(), 1200);
            const el = videoRef.current;
            el?.addEventListener("loadeddata", () => { clearTimeout(t); resolve(); }, { once: true });
            if (el && el.readyState >= 2) { clearTimeout(t); resolve(); }
          });

          if (cancelled) { try { newTrack.stop(); } catch {} return; }

          try {
            await room.localParticipant.unpublishTrack(oldTrack, false);
            oldTrack.stop();
          } catch { /* ignore */ }
          localVideoTrackRef.current = newTrack;
          lastAppliedFacingRef.current = target;
          console.log("[flip] replace ok", target);
        } catch (err) {
          console.warn("[flip] failed, reverting", err);
          const videoEl = videoRef.current;
          if (videoEl) {
            try { oldTrack.attach(videoEl); videoEl.play().catch(() => {}); } catch {}
          }
          toast.error(t("live.flipFailed", "Impossible de changer de caméra"));
          onFlipRevert?.(previous);
        } finally {
          flipInFlightRef.current = false;
          onFlipBusyChange?.(false);
        }
      })();

      return () => { cancelled = true; };
    }, [facing, livekit, enabled, t, onFlipRevert, onFlipBusyChange]);

    const showVideo = shouldRun && state === "granted";
    const mirrored = facing === "user";

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
