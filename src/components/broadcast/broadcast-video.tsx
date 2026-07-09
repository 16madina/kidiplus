import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import { Camera, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
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
import {
  createFilterPipeline,
  isFilterPipelineSupported,
  type FilterKey,
  type FilterPipeline,
} from "@/lib/camera-filter-pipeline";

/**
 * Video layer for the broadcaster (host) side.
 *
 * Two modes:
 *   - Preview mode (no `livekit` prop): plain getUserMedia self-preview,
 *     used in BroadcastSetup before going live.
 *   - LiveKit host mode (`livekit` prop given): connects to the LiveKit
 *     room, publishes camera + mic, and shows the local video track.
 *
 * The imperative handle exposes switchCamera / setFilter so the live UI can
 * wire toggles without touching the room directly.
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
  /** Apply a camera filter (LiveKit host mode only). Returns whether the
   *  filter was successfully installed. */
  setFilter: (k: FilterKey) => Promise<{ ok: boolean; reason?: string }>;
};

export const BroadcastVideo = forwardRef<BroadcastVideoHandle, BroadcastVideoProps>(
  function BroadcastVideo(
    { facing, enabled, fallbackImage, livekit, micEnabled = true, retryKey = 0, onStatus, onCanFlipChange, onRequestRetry },
    ref,
  ) {
    const { t } = useTranslation();
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const roomRef = useRef<Room | null>(null);
    const localVideoTrackRef = useRef<LocalVideoTrack | null>(null);
    const filterPipelineRef = useRef<FilterPipeline | null>(null);
    const currentFilterRef = useRef<FilterKey>("none");
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

    // Imperative API for the live UI (filter installation).
    useImperativeHandle(ref, () => ({
      switchCamera: async () => {
        // Kept for API compatibility; the LK effect below already reacts to
        // `facing` prop changes, so callers just update the facing state.
      },
      setFilter: async (k) => {
        const room = roomRef.current;
        if (!room) return { ok: false, reason: "no_room" };
        currentFilterRef.current = k;
        // "none" → republish raw source track (drop filter pipeline).
        if (k === "none") {
          if (filterPipelineRef.current) {
            try { filterPipelineRef.current.stop(); } catch {}
            filterPipelineRef.current = null;
          }
          const oldTrack = localVideoTrackRef.current;
          try {
            const raw = await createLocalVideoTrack({ facingMode: facing });
            if (oldTrack) await room.localParticipant.unpublishTrack(oldTrack, true);
            await room.localParticipant.publishTrack(raw);
            localVideoTrackRef.current = raw;
            if (videoRef.current) raw.attach(videoRef.current);
            return { ok: true };
          } catch (e) {
            return { ok: false, reason: e instanceof Error ? e.message : "reset_failed" };
          }
        }
        return applyFilterToPublishedTrack(k);
      },
    }));

    // Helper closes over refs. Installs a canvas filter pipeline on the
    // currently-published camera track and republishes the canvas stream.
    async function applyFilterToPublishedTrack(k: FilterKey): Promise<{ ok: boolean; reason?: string }> {
      const room = roomRef.current;
      if (!room) return { ok: false, reason: "no_room" };
      if (!isFilterPipelineSupported()) return { ok: false, reason: "unsupported" };
      const cur = localVideoTrackRef.current;
      if (!cur?.mediaStreamTrack) return { ok: false, reason: "no_track" };
      // Tear down any previous pipeline.
      if (filterPipelineRef.current) {
        try { filterPipelineRef.current.stop(); } catch {}
        filterPipelineRef.current = null;
      }
      // Acquire a fresh raw track so the pipeline reads from an untouched
      // source (the currently-published track may itself be a canvas output
      // from a prior filter).
      let sourceTrack: MediaStreamTrack;
      try {
        const raw = await createLocalVideoTrack({ facingMode: facing });
        sourceTrack = raw.mediaStreamTrack;
        // Publish the raw track first so we can then swap in the filtered
        // canvas track; we keep `raw` referenced via the pipeline so it isn't
        // GC'd. Actually simpler: build pipeline off `sourceTrack`, publish
        // the filtered output as a fresh custom track.
      } catch (e) {
        return { ok: false, reason: e instanceof Error ? e.message : "acquire_failed" };
      }
      const pipe = createFilterPipeline(sourceTrack, k);
      const readiness = await pipe.ready;
      if (!readiness.ok) {
        try { pipe.stop(); } catch {}
        try { sourceTrack.stop(); } catch {}
        currentFilterRef.current = "none";
        return { ok: false, reason: readiness.reason };
      }
      // Unpublish current, publish the pipeline's output as a native
      // MediaStreamTrack. LiveKit's publishTrack accepts MediaStreamTracks.
      try {
        if (cur) await room.localParticipant.unpublishTrack(cur, true);
        const pub = await room.localParticipant.publishTrack(pipe.outputTrack);
        // The LocalTrack instance is on `pub.track`.
        const newLocal = pub?.track as LocalVideoTrack | undefined;
        if (newLocal) {
          localVideoTrackRef.current = newLocal;
          if (videoRef.current) newLocal.attach(videoRef.current);
        }
        filterPipelineRef.current = pipe;
        return { ok: true };
      } catch (e) {
        try { pipe.stop(); } catch {}
        try { sourceTrack.stop(); } catch {}
        return { ok: false, reason: e instanceof Error ? e.message : "publish_failed" };
      }
    }



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

        // Step 0: on native, force the OS permission prompt BEFORE we hit
        // LiveKit's track factory (which just calls getUserMedia and would
        // fail silently if Info.plist / manifest entries are missing).
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
        // Release the pre-flight stream — LiveKit will re-acquire under its
        // own tracks (permission is now cached by the OS so no re-prompt).
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

          // Publish camera + mic.
          phase = "camera";
          await room.localParticipant.setMicrophoneEnabled(micEnabled);
          const track = await createLocalVideoTrack({
            facingMode: livekit ? facing : "user",
          });
          if (cancelled) {
            track.stop();
            await disconnectRoom(room);
            return;
          }
          await room.localParticipant.publishTrack(track);
          localVideoTrackRef.current = track;
          if (videoRef.current) track.attach(videoRef.current);
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
      // Intentionally depend on room identity + gate; facing is applied via switchCamera.
       
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

    // Apply facing change in LK mode by swapping the published track.
    useEffect(() => {
      if (!livekit) return;
      const room = roomRef.current;
      if (!room || !localVideoTrackRef.current) return;
      let cancelled = false;
      (async () => {
        try {
          // Tear down any active filter pipeline; we'll reinstall against
          // the new camera below.
          const activeFilter = currentFilterRef.current;
          if (filterPipelineRef.current) {
            try { filterPipelineRef.current.stop(); } catch {}
            filterPipelineRef.current = null;
          }
          const newTrack = await createLocalVideoTrack({ facingMode: facing });
          if (cancelled) {
            newTrack.stop();
            return;
          }
          const old = localVideoTrackRef.current;
          if (old) await room.localParticipant.unpublishTrack(old, true);
          await room.localParticipant.publishTrack(newTrack);
          localVideoTrackRef.current = newTrack;
          if (videoRef.current) newTrack.attach(videoRef.current);
          if (activeFilter !== "none") {
            await applyFilterToPublishedTrack(activeFilter);
          }
        } catch {}
      })();
      return () => {
        cancelled = true;
      };
       
    }, [facing]);

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
