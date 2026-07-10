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
};

export type BroadcastStatus =
  | "idle"
  | "connecting"
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
    { facing, enabled, fallbackImage, livekit, micEnabled = true, retryKey = 0, onStatus, onCanFlipChange, onRequestRetry, onFlipRevert },
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

    // Probe device count once to decide whether the flip button should show.
    useEffect(() => {
      if (!onCanFlipChange) return;
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
        onCanFlipChange(false);
        return;
      }
      let cancelled = false;
      void navigator.mediaDevices.enumerateDevices().then((devices) => {
        if (cancelled) return;
        const cams = devices.filter((d) => d.kind === "videoinput").length;
        onCanFlipChange(cams > 1);
      }).catch(() => {
        if (!cancelled) onCanFlipChange(false);
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

    // --- Camera flip (robust, iOS-Safari safe) ---------------------------
    // Sequence:
    //   1) create a new LocalVideoTrack with facingMode: { exact: target }
    //   2) publish the new track (keeps old one alive)
    //   3) attach to <video>, await play()
    //   4) wait for first frame ('loadeddata' / videoDimensionsChanged) or 3s
    //   5) unpublish + stop the old track
    // On any error OR if no frame arrives within 3s, revert to the previous
    // track and toast "Impossible de changer de caméra".
    const flipInFlightRef = useRef(false);
    const lastAppliedFacingRef = useRef<"user" | "environment" | null>(null);
    useEffect(() => {
      if (!livekit) return;
      const room = roomRef.current;
      if (!room) return;
      const oldTrack = localVideoTrackRef.current;
      if (!oldTrack) return;

      // Skip the initial mount (facing already matches the published track).
      if (lastAppliedFacingRef.current === null) {
        lastAppliedFacingRef.current = facing;
        return;
      }
      if (lastAppliedFacingRef.current === facing) return;
      if (flipInFlightRef.current) return;

      const target = facing;
      const previous = lastAppliedFacingRef.current;
      flipInFlightRef.current = true;
      let cancelled = false;

      (async () => {
        const flipStart = performance.now();
        console.log("[flip] start", { from: previous, to: target });
        let newTrack: LocalVideoTrack | null = null;
        try {
          // 1) Create new track pinned to the requested facing, capped at 720p/30fps
          //    so the back camera doesn't request 4K and starve the encoder.
          console.log("[flip] create newTrack facingMode.exact =", target);
          const t0 = performance.now();
          const captureOpts = {
            resolution: { width: 1280, height: 720, frameRate: 30 },
          };
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            newTrack = await createLocalVideoTrack({ facingMode: { exact: target } as any, ...captureOpts });
          } catch (e) {
            console.warn("[flip] exact facingMode failed, retry loose", e);
            newTrack = await createLocalVideoTrack({ facingMode: target, ...captureOpts });
          }
          console.log(`[flip] createLocalVideoTrack took ${(performance.now() - t0).toFixed(0)}ms`);
          if (cancelled) { try { newTrack.stop(); } catch {} return; }

          // 2) Publish with the same simulcast + capped encoding as the initial track
          //    so viewers keep the same bitrate profile after the swap.
          const t1 = performance.now();
          await room.localParticipant.publishTrack(newTrack, {
            simulcast: true,
            videoEncoding: { maxBitrate: 1_800_000, maxFramerate: 30 },
          });
          console.log(`[flip] publishTrack took ${(performance.now() - t1).toFixed(0)}ms`);

          // 3) Attach to <video> preview + play().
          const videoEl = videoRef.current;
          if (videoEl) {
            try { oldTrack.detach(videoEl); } catch {}
            newTrack.attach(videoEl);
            videoEl.muted = true;
            videoEl.playsInline = true;
            try {
              await videoEl.play();
              console.log("[flip] videoEl.play() ok");
            } catch (e) {
              console.warn("[flip] videoEl.play() rejected", e);
            }
          }

          // 4) Wait for first frame — loadeddata OR videoDimensionsChanged OR timeout.
          const gotFrame = await new Promise<boolean>((resolve) => {
            let done = false;
            const finish = (ok: boolean, why: string) => {
              if (done) return;
              done = true;
              console.log("[flip] first-frame result", { ok, why });
              cleanup();
              resolve(ok);
            };
            const onLoaded = () => finish(true, "loadeddata");
            const onDim = () => finish(true, "videoDimensionsChanged");
            const timer = setTimeout(() => finish(false, "timeout"), 3000);
            const videoEl2 = videoRef.current;
            videoEl2?.addEventListener("loadeddata", onLoaded, { once: true });
            // livekit-client emits VideoDimensionsChanged on the track once decoded.
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (newTrack as any).on?.("videoDimensionsChanged", onDim);
            } catch {}
            // If the <video> is already playing (readyState >= 2), resolve now.
            if (videoEl2 && videoEl2.readyState >= 2) {
              queueMicrotask(() => finish(true, "readyState"));
            }
            function cleanup() {
              clearTimeout(timer);
              videoEl2?.removeEventListener("loadeddata", onLoaded);
              try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (newTrack as any).off?.("videoDimensionsChanged", onDim);
              } catch {}
            }
          });

          if (cancelled) { try { newTrack.stop(); } catch {} return; }

          if (!gotFrame) throw new Error("no_first_frame");

          // 5) Success — unpublish + stop the old track.
          try {
            await room.localParticipant.unpublishTrack(oldTrack, false);
            oldTrack.stop();
          } catch (e) {
            console.warn("[flip] old track cleanup warn", e);
          }
          localVideoTrackRef.current = newTrack;
          lastAppliedFacingRef.current = target;
          console.log(`[flip] done facing=${target} total=${(performance.now() - flipStart).toFixed(0)}ms`);
        } catch (err) {
          console.warn("[flip] failed, reverting", err);
          // Unpublish + stop the new track, keep old one publishing.
          if (newTrack) {
            try { await room.localParticipant.unpublishTrack(newTrack, true); } catch {}
            try { newTrack.stop(); } catch {}
          }
          // Reattach old preview so nothing goes black.
          const videoEl = videoRef.current;
          if (videoEl) {
            try { oldTrack.attach(videoEl); videoEl.play().catch(() => {}); } catch {}
          }
          toast.error(t("live.flipFailed", "Impossible de changer de caméra"));
          // Tell the parent to reset its facing state so the button reflects reality.
          onFlipRevert?.(previous);
        } finally {
          flipInFlightRef.current = false;
        }
      })();

      return () => { cancelled = true; };
    }, [facing, livekit, t, onFlipRevert]);

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
