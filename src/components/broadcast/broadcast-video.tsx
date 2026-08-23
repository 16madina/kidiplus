import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import { useFilter } from "@/lib/filters/filter-context";
import { Camera, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";
import { Press } from "@/components/press";
import { useAppActive } from "@/lib/app-state";
import {
  ensureCameraMicAccess,
  ensureCameraMicPermission,
} from "@/lib/media-permissions";
import {
  applyBridgeLens,
  disableNativeCameraKit,
  errMsg,
  getNativeCameraKitHealth,
  isCameraKitSupported,
  isNativeCameraKitAvailable,
  setNativePreview,
  setNativePublishEnabled,
  waitForNativeCameraKit,
  warmupNativeCameraKit,
} from "@/lib/filters/native-camera-kit-bridge";
import { CameraKitVideoProcessor } from "@/lib/filters/camera-kit-processor";
import { CameraKitPreview } from "@/components/broadcast/camera-kit-preview";
import { LiveEffectsPreview } from "@/components/broadcast/live-effects-preview";
import { PosterGestureLayer } from "@/components/broadcast/poster-gesture-layer";
import { useLiveEffects } from "@/lib/filters/live-effects-context";
import { LiveEffectsVideoProcessor } from "@/lib/filters/live-effects-processor";
import type { Lens } from "@/lib/filters/lenses-catalog";
import {
  Room,
  RoomEvent,
  Track,
  createHostLocalVideoTrack,
  facingModeFromLocalTrack,
  connectRoom,
  getToken,
  disconnectRoom,
  switchHostCameraFacing,
  syncFrontCameraMirror,
  type LocalAudioTrack,
  type LocalVideoTrack,
  type RemoteTrack,
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
  /**
   * camera (default): publish local webcam.
   * rtmp: host joins without camera; subscribe to Ingress participant video.
   */
  videoSource?: "camera" | "rtmp";
  /** LiveKit identity of the RTMP Ingress publisher (rtmp-host-…). */
  ingressIdentity?: string;
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
  /** Sync parent mic UI when LiveKit mute/unmute fails or disagrees. */
  onMicSync?: (enabled: boolean) => void;
  onRemoteVideosChange?: (tracks: { identity: string; track: RemoteTrack }[]) => void;
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
  getCameraTrack: () => LocalVideoTrack | null;
  getMicrophoneTrack: () => LocalAudioTrack | null;
};

export const BroadcastVideo = forwardRef<BroadcastVideoHandle, BroadcastVideoProps>(
  function BroadcastVideo(
    {
      facing,
      enabled,
      fallbackImage,
      livekit,
      micEnabled = true,
      videoSource = "camera",
      ingressIdentity,
      retryKey = 0,
      onStatus,
      onCanFlipChange,
      onRequestRetry,
      onFlipRevert,
      onFlipBusyChange,
      onFacingApplied,
      onMicSync,
      onRemoteVideosChange,
    },
    ref,
  ) {
    const { t } = useTranslation();
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const roomRef = useRef<Room | null>(null);
    const localVideoTrackRef = useRef<LocalVideoTrack | null>(null);
    const [state, setState] = useState<BroadcastStatus>("idle");
    const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
    const appActive = useAppActive();
    const { activeLens, clearLens } = useFilter();
    const effects = useLiveEffects();
    const activeLensRef = useRef<Lens>(activeLens);
    activeLensRef.current = activeLens;
    const clearLensRef = useRef(clearLens);
    clearLensRef.current = clearLens;
    const effectsRef = useRef(effects);
    effectsRef.current = effects;
    const nativeVideoActiveRef = useRef(false);
    const nativeLensSequenceRef = useRef(0);
    const nativeLensQueueRef = useRef<Promise<void>>(Promise.resolve());
    const [nativeFallbackRevision, setNativeFallbackRevision] = useState(0);

    // Clé du dernier pipeline appliqué (lens + facing) — évite de
    // stopper/recréer le processeur quand rien n'a changé : chaque
    // remplacement de processeur fait "cligner" la vidéo publiée.
    const lastPipelineKeyRef = useRef<string>("");

    // Applique le bon pipeline vidéo sur la piste publiée :
    // - lens Snap active → processeur Camera Kit (filtre AR + miroir selfie)
    // - sinon → miroir simple (caméra avant) / rien (caméra arrière)
    // Idempotent : ne touche à la piste que si l'état souhaité diffère de
    // l'état actuel du processeur.
    const applyHostPipeline = async (track: LocalVideoTrack, facing: CameraFacing) => {
      const lens = activeLensRef.current;
      const fx = effectsRef.current;
      const wantEffects = fx.hasEffects;
      const wantSnap = !wantEffects && lens.isSnapLens === true && isCameraKitSupported();
      lastPipelineKeyRef.current = wantEffects
        ? `fx:${fx.backgroundMode}:${fx.backgroundUrl ?? ""}:${fx.posterUrl ?? ""}:${fx.posterMode}:${facing}`
        : `${wantSnap ? lens.lensId : "none"}:${facing}`;
      try {
        const current = track.getProcessor();
        const isCameraKit = current instanceof CameraKitVideoProcessor;
        const isEffects = current instanceof LiveEffectsVideoProcessor;

        if (wantEffects) {
          const cfg = {
            backgroundUrl: fx.backgroundUrl,
            backgroundMode: fx.backgroundMode,
            onUnavailable: () => {
              toast.error(
                t(
                  "broadcast.effects.unavailable",
                  "Arrière-plan indisponible sur cet appareil",
                ),
                { id: "bg-unavailable" },
              );
              effectsRef.current.markBackgroundUnavailable();
            },
            posterUrl: fx.posterUrl,
            posterMode: fx.posterMode,
            posterX: fx.posterTransform.x,
            posterY: fx.posterTransform.y,
            posterScale: fx.posterTransform.scale,
            mirror: facing === "user",
          };
          if (isEffects) {
            await (current as LiveEffectsVideoProcessor).setConfig(cfg);
            return;
          }
          if (current) {
            try { await track.stopProcessor(); } catch { /* none */ }
          }
          await track.setProcessor(new LiveEffectsVideoProcessor(cfg), true);
          return;
        }

        if (wantSnap) {
          // iOS/Android : SDK Snap natif (GPU) — pas de TrackProcessor WASM.
          if (isNativeCameraKitAvailable() || (await waitForNativeCameraKit())) {
            if (isCameraKit || isEffects) {
              try { await track.stopProcessor(); } catch { /* none */ }
            }
            void applyBridgeLens(lens).catch((e) => {
              console.warn("[native-camera-kit] applyBridgeLens failed", errMsg(e));
            });
            return;
          }

          if (isCameraKit) {
            // Session AR déjà en place : on change juste la lens (aucun blink).
            await (current as CameraKitVideoProcessor).setLens(lens.lensId, lens.groupId);
            return;
          }
          if (current) {
            try { await track.stopProcessor(); } catch { /* none */ }
          }
          await track.setProcessor(
            new CameraKitVideoProcessor({
              lensId: lens.lensId,
              groupId: lens.groupId,
              mirror: facing === "user",
              onFatalStall: () => {
                // Le rendu AR est resté figé malgré les reprises (WebView
                // Android saturée / WebGL perdu) : on retire le processeur
                // pour repasser sur la caméra brute plutôt que de publier
                // une image gelée aux viewers.
                console.warn("[camera-kit] fatal stall — repli caméra brute");
                void track
                  .stopProcessor()
                  .then(() => syncFrontCameraMirror(track, facing))
                  .catch(() => {});
                clearLensRef.current();
                toast.error(
                  t(
                    "broadcast.filters.unstable",
                    "Filtre désactivé : instable sur cet appareil",
                  ),
                  { id: "lens-stalled" },
                );
              },
            }),
            true,
          );
          return;
        }

        // Pas de lens AR / effets souhaités.
        if (facing === "user") {
          if (isEffects || isCameraKit) {
            try { await track.stopProcessor(); } catch { /* none */ }
          } else if (current) {
            return;
          }
          await syncFrontCameraMirror(track, facing);
          return;
        }
        // Caméra arrière : aucun processeur nécessaire.
        if (current) {
          try { await track.stopProcessor(); } catch { /* none */ }
        }
      } catch (e) {
        console.warn("[camera-kit] host pipeline failed", e);
        try { await syncFrontCameraMirror(track, facing); } catch { /* ignore */ }
      }
    };

    // Preview: pause capture when cam off / backgrounded.
    // LiveKit room must stay connected when the host only toggles the camera —
    // tying room lifecycle to `enabled` caused a full reconnect (30–40s).
    const previewShouldRun = enabled && appActive;
    const roomShouldRun = appActive;

    // Warm up the native Snap session as soon as the broadcast screen mounts.
    // Waiting for the filter carousel meant `initialize()` was never called on
    // iOS/Android, so the first lens tap or go-live had to pay the full SDK
    // boot cost (and any failure surfaced only as a frozen camera).
    useEffect(() => {
      if (!isNativeCameraKitAvailable()) return;
      void warmupNativeCameraKit().catch((e) => {
        console.warn("[native-camera-kit] warmup failed", errMsg(e));
      });
    }, []);

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
      getCameraTrack: () => {
        const room = roomRef.current;
        let track = localVideoTrackRef.current;
        if (!track && room) {
          const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
          if (pub?.track) track = pub.track as LocalVideoTrack;
        }
        return track ?? null;
      },
      getMicrophoneTrack: () => {
        const room = roomRef.current;
        const pub = room?.localParticipant.getTrackPublication(Track.Source.Microphone);
        return (pub?.track as LocalAudioTrack | undefined) ?? null;
      },
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
          await applyHostPipeline(track, applied);
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
      let useNativePreview =
        activeLensRef.current.isSnapLens === true && isNativeCameraKitAvailable();

      async function acquire() {
        if (!previewShouldRun) return teardown();
        teardown();

        useNativePreview =
          activeLensRef.current.isSnapLens === true &&
          (await waitForNativeCameraKit());
        if (cancelled) return;

        // Native Camera Kit owns the camera. Opening getUserMedia here
        // locks AVCaptureSession and makes startPreview hang → JS fallback.
        if (useNativePreview) {
          const preflight = await ensureCameraMicPermission({
            video: { facingMode: facing },
            audio: false,
          });
          if (cancelled) return;
          if (preflight.status !== "granted") {
            if (preflight.status === "denied_by_user") setState("denied");
            else if (preflight.status === "config_missing") setState("config_missing");
            else if (preflight.status === "no_device") setState("unavailable");
            else if (preflight.status === "unsupported") setState("unsupported");
            else setState("error");
            return;
          }
          try {
            await setNativePreview({
              active: true,
              mirrored: facing === "user",
              facing,
            });
            if (!cancelled) setState("granted");
            return;
          } catch (e) {
            console.warn("[native-camera-kit] preview start failed — web fallback", e);
            disableNativeCameraKit(e);
            useNativePreview = false;
          }
        }

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
          setPreviewStream(res.stream);
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
        setPreviewStream(null);
        if (videoRef.current) videoRef.current.srcObject = null;
        if (useNativePreview) {
          void setNativePreview({ active: false });
        }
      }

      void acquire();
      return () => {
        cancelled = true;
        teardown();
      };
    }, [facing, previewShouldRun, livekit, activeLens.isSnapLens]);

    // --- LiveKit host mode ------------------------------------------------
    useEffect(() => {
      if (!livekit) return;
      let cancelled = false;
      const isRtmp = videoSource === "rtmp";

      function attachIngressVideo(room: Room) {
        const wantId = ingressIdentity;
        const tryAttach = (identity: string, track: RemoteTrack | undefined) => {
          if (!track || track.kind !== Track.Kind.Video) return false;
          if (wantId && identity !== wantId && !identity.startsWith("rtmp-host-")) {
            return false;
          }
          if (!wantId && !identity.startsWith("rtmp-host-")) return false;
          if (videoRef.current) {
            track.attach(videoRef.current);
            videoRef.current.play().catch(() => {});
          }
          if (!cancelled) setState("granted");
          return true;
        };
        for (const p of room.remoteParticipants.values()) {
          for (const pub of p.trackPublications.values()) {
            if (tryAttach(p.identity, pub.track as RemoteTrack | undefined)) return true;
          }
        }
        return false;
      }

      async function start() {
        if (!roomShouldRun) return teardown();
        setState("connecting");

        if (!isRtmp) {
          // Permission only — do not open video here. Opening then stopping the
          // camera before LiveKit createLocalVideoTrack causes NotReadableError
          // on many Android OEMs (camera still busy).
          const preflight = await ensureCameraMicPermission({
            video: { facingMode: facingRef.current },
            audio: micEnabled,
          });
          if (cancelled) return;
          if (preflight.status !== "granted") {
            if (preflight.status === "denied_by_user") setState("denied");
            else if (preflight.status === "config_missing") setState("config_missing");
            else if (preflight.status === "no_device") setState("unavailable");
            else if (preflight.status === "unsupported") setState("unsupported");
            else setState("error");
            return;
          }
        }

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

          // Native Snap Camera Kit: initialize + preview first so frames flow,
          // then publish to LiveKit. On failure, fall back to WebRTC.
          // Keep the proven raw LiveKit camera path unless a Snap lens is
          // actually selected. Android switches to native Camera Kit only for
          // AR, then returns to raw LiveKit when the lens is removed.
          let useNativeVideo =
            !isRtmp &&
            activeLensRef.current.isSnapLens === true &&
            (await waitForNativeCameraKit());
          if (useNativeVideo) {
            phase = "camera";
            const withTimeout = <T,>(p: Promise<T>, ms = 12000) =>
              Promise.race([
                p,
                new Promise<never>((_, rej) =>
                  setTimeout(() => rej(new Error("native camera kit timeout")), ms),
                ),
              ]);
            try {
              await withTimeout(
                setNativePreview({
                  active: true,
                  mirrored: facingRef.current === "user",
                  facing: facingRef.current,
                }),
              );
              if (cancelled) {
                await setNativePreview({ active: false }).catch(() => {});
                return;
              }
              // Show the native preview immediately. LiveKit publish can
              // finish after the host already sees the camera.
              setState("granted");
              await withTimeout(
                setNativePublishEnabled({ enabled: true, roomUrl: url, token }),
              );
              const initialLens = activeLensRef.current;
              if (initialLens.isSnapLens) {
                await withTimeout(applyBridgeLens(initialLens), 5000);
              }
              if (cancelled) {
                await setNativePublishEnabled({ enabled: false }).catch(() => {});
                await setNativePreview({ active: false }).catch(() => {});
                return;
              }
            } catch (e) {
              console.warn("[native-camera-kit] fallback to web pipeline:", errMsg(e));
              await setNativePublishEnabled({ enabled: false }).catch(() => {});
              await setNativePreview({ active: false }).catch(() => {});
              disableNativeCameraKit(e);
              // Give iOS a beat to release the camera before getUserMedia.
              await new Promise((r) => setTimeout(r, 350));
              useNativeVideo = false;
            }
          }
          if (useNativeVideo) {
            localVideoTrackRef.current = null;
            roomRef.current = null;
            nativeVideoActiveRef.current = true;
            setState("granted");
            return;
          }
          nativeVideoActiveRef.current = false;
          phase = "connect";


          const room = await connectRoom(url, token);
          if (cancelled) {
            await disconnectRoom(room);
            return;
          }
          roomRef.current = room;

          const emitRemotes = () => {
            if (cancelled || !onRemoteVideosChange) return;
            const list: { identity: string; track: RemoteTrack }[] = [];
            for (const p of room.remoteParticipants.values()) {
              for (const pub of p.trackPublications.values()) {
                if (
                  (pub.kind === Track.Kind.Video || pub.kind === Track.Kind.Audio) &&
                  !pub.isSubscribed
                ) {
                  try {
                    pub.setSubscribed(true);
                  } catch {
                    /* ignore */
                  }
                }
                if (
                  pub.track &&
                  (pub.track.kind === Track.Kind.Video || pub.track.kind === Track.Kind.Audio)
                ) {
                  list.push({ identity: p.identity, track: pub.track as RemoteTrack });
                }
              }
            }
            onRemoteVideosChange(list);
          };
          room.on(RoomEvent.TrackSubscribed, emitRemotes);
          room.on(RoomEvent.TrackUnsubscribed, emitRemotes);
          room.on(RoomEvent.TrackPublished, emitRemotes);
          room.on(RoomEvent.ParticipantConnected, emitRemotes);
          emitRemotes();

          room.on(RoomEvent.Reconnecting, () => {
            if (!cancelled) setState("reconnecting");
          });
          room.on(RoomEvent.Reconnected, () => {
            if (cancelled) return;
            if (isRtmp) {
              if (!attachIngressVideo(room)) setState("connecting");
              return;
            }
            setState("granted");
            // After network reconnect LiveKit may replace the camera track —
            // refresh the ref and resync facing so flip stays accurate.
            const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
            const t = pub?.track as LocalVideoTrack | undefined;
            if (t) {
              localVideoTrackRef.current = t;
              void (async () => {
                const applied = syncFacingFromTrack(t, facingRef.current);
                await applyHostPipeline(t, applied ?? facingRef.current);
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

          if (isRtmp) {
            await room.localParticipant.setMicrophoneEnabled(false);
            await room.localParticipant.setCameraEnabled(false);
            localVideoTrackRef.current = null;
            room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
              if (cancelled) return;
              if (track.kind !== Track.Kind.Video) return;
              const id = participant.identity;
              if (
                ingressIdentity
                  ? id === ingressIdentity || id.startsWith("rtmp-host-")
                  : id.startsWith("rtmp-host-")
              ) {
                if (videoRef.current) {
                  track.attach(videoRef.current);
                  videoRef.current.play().catch(() => {});
                }
                setState("granted");
              }
            });
            room.on(RoomEvent.TrackUnsubscribed, (track) => {
              if (track.kind === Track.Kind.Video && videoRef.current) {
                try {
                  track.detach(videoRef.current);
                } catch {
                  /* ignore */
                }
                if (!cancelled) setState("connecting");
              }
            });
            if (!attachIngressVideo(room) && !cancelled) {
              setState("connecting");
            }
            return;
          }

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
          // 720p first; createHostLocalVideoTrack steps down only on failure.
          const track = await createHostLocalVideoTrack({
            facingMode: desiredFacing,
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
          await applyHostPipeline(track, appliedFacing ?? desiredFacing);
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
            const isBusy =
              msg.includes("notreadable") ||
              msg.includes("could not start") ||
              msg.includes("device in use");
            if (phase === "camera" && isPermission) setState("denied");
            else if (phase === "token") setState("token_failed");
            else if (phase === "connect") setState("connect_failed");
            else if (phase === "camera" && isBusy) setState("unavailable");
            else if (phase === "camera") setState("error");
            else setState("error");
            await teardown();
          }
        }
      }

      async function teardown() {
        nativeVideoActiveRef.current = false;
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
        void setNativePublishEnabled({ enabled: false });
        void setNativePreview({ active: false });
      }

      void start();
      return () => {
        cancelled = true;
        void teardown();
      };
    }, [
      livekit?.room,
      livekit?.identity,
      roomShouldRun,
      retryKey,
      activeLens.isSnapLens,
      nativeFallbackRevision,
      videoSource,
      ingressIdentity,
    ]);

    // Native Android lens changes are applied outside the Web LiveKit track
    // pipeline. The native plugin resolves only after a post-lens frame exists.
    useEffect(() => {
      if (!livekit || !nativeVideoActiveRef.current || state !== "granted") return;
      if (!activeLens.isSnapLens) return;
      let cancelled = false;
      const sequence = ++nativeLensSequenceRef.current;
      const lens = activeLens;
      nativeLensQueueRef.current = nativeLensQueueRef.current
        .catch(() => {})
        .then(async () => {
          if (cancelled || sequence !== nativeLensSequenceRef.current) return;
          await applyBridgeLens(lens);
        })
        .catch((e) => {
          if (cancelled || sequence !== nativeLensSequenceRef.current) return;
          console.error("[native-camera-kit] lens produced no frame", errMsg(e));
          disableNativeCameraKit(e);
          clearLensRef.current();
          toast.error(
            t(
              "broadcast.filters.unstable",
              "Filtre désactivé : instable sur cet appareil",
            ),
            { id: "lens-stalled" },
          );
          setNativeFallbackRevision((value) => value + 1);
        });
      return () => {
        cancelled = true;
      };
    }, [activeLens.lensId, activeLens.groupId, activeLens.isSnapLens, livekit, state, t]);

    // Continuous native health check: if Camera Kit stops producing frames
    // after initially succeeding, restart this host effect on the raw camera.
    useEffect(() => {
      if (!livekit || state !== "granted") return;
      let cancelled = false;
      let checking = false;
      const check = async () => {
        if (cancelled || checking || !nativeVideoActiveRef.current) return;
        checking = true;
        try {
          const health = await getNativeCameraKitHealth();
          if (
            !cancelled &&
            health?.publishing &&
            health.frameCount > 0 &&
            health.lastFrameAgeMs > 3000
          ) {
            throw new Error(`native Camera Kit stalled for ${health.lastFrameAgeMs}ms`);
          }
        } catch (e) {
          if (!cancelled && nativeVideoActiveRef.current) {
            console.error("[native-camera-kit] health check failed", errMsg(e));
            disableNativeCameraKit(e);
            clearLensRef.current();
            toast.error(
              t(
                "broadcast.filters.unstable",
                "Filtre désactivé : instable sur cet appareil",
              ),
              { id: "lens-stalled" },
            );
            setNativeFallbackRevision((value) => value + 1);
          }
        } finally {
          checking = false;
        }
      };
      const timer = window.setInterval(() => void check(), 1000);
      void check();
      return () => {
        cancelled = true;
        window.clearInterval(timer);
      };
    }, [livekit, state, t]);

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
      if (videoSource === "rtmp") return;
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
            track = await createHostLocalVideoTrack({
              facingMode: desiredFacing,
            });
            await room.localParticipant.publishTrack(track, {
              simulcast: true,
              videoEncoding: { maxBitrate: 1_800_000, maxFramerate: 30 },
              source: Track.Source.Camera,
            });
          }
          localVideoTrackRef.current = track;
          const appliedFacing = syncFacingFromTrack(track, desiredFacing);
          await applyHostPipeline(track, appliedFacing ?? desiredFacing);
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

    // Toggle mic without reconnecting — surface failures so UI matches reality.
    useEffect(() => {
      if (!livekit || videoSource === "rtmp") return;
      const room = roomRef.current;
      if (!room) return;
      let cancelled = false;
      void (async () => {
        try {
          await room.localParticipant.setMicrophoneEnabled(micEnabled);
          if (cancelled) return;
          const pub = room.localParticipant.getTrackPublication(
            Track.Source.Microphone,
          );
          const actuallyOn = !!pub && !pub.isMuted;
          if (actuallyOn !== micEnabled) {
            toast.error(
              micEnabled
                ? t("live.micOnFailed", "Impossible d'activer le micro")
                : t("live.micOffFailed", "Impossible de couper le micro"),
            );
            onMicSync?.(actuallyOn);
          }
        } catch (e) {
          console.warn("[mic] setMicrophoneEnabled failed", e);
          if (cancelled) return;
          toast.error(
            micEnabled
              ? t("live.micOnFailed", "Impossible d'activer le micro")
              : t("live.micOffFailed", "Impossible de couper le micro"),
          );
          onMicSync?.(!micEnabled);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [micEnabled, livekit, videoSource, onMicSync, t]);

    // Changement de filtre pendant le live : mettre à jour le pipeline de la
    // piste publiée (les viewers voient la nouvelle lens instantanément).
    // Ne réagit QU'AUX vrais changements de lens — les transitions d'état
    // (connexion, toggle caméra, flip) appliquent déjà le pipeline dans leur
    // propre chemin ; re-appliquer ici ferait cligner la vidéo.
    useEffect(() => {
      if (!livekit) return;
      const track = localVideoTrackRef.current;
      if (!track || state !== "granted" || !enabled) return;
      const facing = lastAppliedFacingRef.current ?? facingRef.current;
      const wantEffects = effects.hasEffects;
      const wantSnap = !wantEffects && activeLens.isSnapLens === true && isCameraKitSupported();
      const key = wantEffects
        ? `fx:${effects.backgroundMode}:${effects.backgroundUrl ?? ""}:${effects.posterUrl ?? ""}:${effects.posterMode}:${facing}`
        : `${wantSnap ? activeLens.lensId : "none"}:${facing}`;
      if (key === lastPipelineKeyRef.current) return;
      void applyHostPipeline(track, facing);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      activeLens.lensId,
      activeLens.isSnapLens,
      effects.hasEffects,
      effects.backgroundMode,
      effects.backgroundUrl,
      effects.posterUrl,
      effects.posterMode,
      livekit,
      state,
      enabled,
    ]);

    // Drag / pinch must not rebuild the LiveKit processor (that would blink).
    useEffect(() => {
      if (!livekit) return;
      const track = localVideoTrackRef.current;
      const current = track?.getProcessor();
      if (current instanceof LiveEffectsVideoProcessor) {
        current.setTransform(
          effects.posterTransform.x,
          effects.posterTransform.y,
          effects.posterTransform.scale,
        );
      }
    }, [effects.posterTransform, livekit]);

    const showVideo =
      roomShouldRun &&
      state === "granted" &&
      (videoSource === "rtmp" || enabled);
    // Preview-only CSS mirror. LiveKit mode uses MirrorVideoProcessor on the
    // published track (and shows it locally) so we must not double-flip.
    const mirrored = facing === "user" && (!livekit || Capacitor.isNativePlatform());
    // En live, le processeur Camera Kit miroire déjà la piste publiée
    // (Transform2D.MirrorX) et LiveKit l'affiche localement telle quelle :
    // un flip CSS en plus inverserait l'image une seconde fois (main à gauche
    // au lieu de droite).
    const snapProcessorMirrors =
      !!livekit && activeLens.isSnapLens === true && isCameraKitSupported();
    const nativeCam = isNativeCameraKitAvailable();

    return (
      <div
        data-kp-native-cam={nativeCam ? "" : undefined}
        className={
          nativeCam
            ? "kp-native-cam-root absolute inset-0 overflow-hidden bg-transparent"
            : "absolute inset-0 overflow-hidden bg-neutral-900"
        }
      >
        {fallbackImage && !showVideo && (
          <img
            src={fallbackImage}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-70"
            style={{ filter: "blur(4px) brightness(0.55)" }}
          />
        )}
        <VideoWithFilter
          videoRef={videoRef}
          // Effects canvas is already composed (camera selfie-flipped,
          // images not). Never CSS-flip that result or viewers/host diverge.
          // Same for the Camera Kit processor: its output is already mirrored.
          mirrored={mirrored && !effects.hasEffects && !snapProcessorMirrors}
          showVideo={showVideo && !nativeCam}
        />
        {/* Aperçu AR (setup uniquement) : le canvas Camera Kit recouvre le
            <video> brut quand une vraie lens Snap est sélectionnée. En live,
            le filtre passe par le TrackProcessor — pas besoin d'overlay. */}
        {!livekit && showVideo && !effects.hasEffects && (
          <CameraKitPreview
            stream={previewStream}
            lens={activeLens}
            mirrored={mirrored}
          />
        )}
        {!livekit && showVideo && (
          <LiveEffectsPreview stream={previewStream} mirrored={mirrored} />
        )}
        {showVideo && <PosterGestureLayer />}
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
                  ? videoSource === "rtmp"
                    ? t(
                        "broadcast.rtmp.waiting",
                        "En attente du flux Restream / OBS…",
                      )
                    : t("broadcast.camera.connecting", "Connexion au live…")
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

// Small wrapper: reads the currently-selected lens from FilterContext and
// applies its `webPreview` string as a CSS `filter:` on the local <video>.
// Sur natif (Capacitor + Snap Camera Kit), le plugin remplace la piste
// MediaStreamTrack en amont, donc ce CSS n'a plus d'effet visible — c'est
// juste un mode démo pour le web en attendant l'app mobile.
function VideoWithFilter({
  videoRef,
  mirrored,
  showVideo,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  mirrored: boolean;
  showVideo: boolean;
}) {
  const { cssFilter } = useFilter();
  return (
    <video
      ref={videoRef}
      playsInline
      muted
      autoPlay
      className="absolute inset-0 h-full w-full object-cover"
      style={{
        transform: mirrored ? "scaleX(-1)" : undefined,
        filter: cssFilter,
        willChange: "transform, filter",
        display: showVideo ? "block" : "none",
        transition: "filter 0.25s ease",
      }}
    />
  );
}
