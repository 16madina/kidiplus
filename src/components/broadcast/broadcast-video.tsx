import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { useAppActive } from "@/lib/app-state";

/**
 * Single swappable video layer for the broadcast experience.
 *
 * TODO(LiveKit): This component is the ONLY place that should talk to the
 * video pipeline. When wiring LiveKit, replace the getUserMedia block with:
 *
 *   const room = new Room();
 *   await room.connect(LK_URL, accessToken);
 *   const track = await createLocalVideoTrack({ facingMode: facing });
 *   await room.localParticipant.publishTrack(track);
 *
 * The exported imperative hooks below (startBroadcast / stopBroadcast /
 * publishCamera / switchCamera) are the integration surface — keep their
 * signatures stable so the UI never needs to change.
 */

export type BroadcastVideoProps = {
  /** "user" = front camera (mirrored), "environment" = back camera. */
  facing: "user" | "environment";
  /** When false, tear down the camera and show the placeholder. */
  enabled: boolean;
  /** Optional cover image shown behind the video (during setup / fallback). */
  fallbackImage?: string | null;
};

// --- LiveKit integration stubs -------------------------------------------
// TODO(LiveKit): implement these against @livekit/client. The UI already
// calls them via imperative refs — see BroadcastLive / BroadcastSetup.

export async function startBroadcast(_opts: {
  roomName: string;
  token: string;
}): Promise<void> {
  // TODO(LiveKit): room.connect(...)
}

export async function stopBroadcast(): Promise<void> {
  // TODO(LiveKit): room.disconnect()
}

export async function publishCamera(_facing: "user" | "environment"): Promise<void> {
  // TODO(LiveKit): create + publish LocalVideoTrack
}

export async function switchCamera(_facing: "user" | "environment"): Promise<void> {
  // TODO(LiveKit): replaceTrack with new facingMode
}
// -------------------------------------------------------------------------

export function BroadcastVideo({
  facing,
  enabled,
  fallbackImage,
}: BroadcastVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<"idle" | "granted" | "denied" | "unsupported">(
    "idle",
  );

  useEffect(() => {
    let cancelled = false;

    async function acquire() {
      if (!enabled) {
        teardown();
        return;
      }
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices?.getUserMedia
      ) {
        setState("unsupported");
        return;
      }
      teardown();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        setState("granted");
      } catch {
        if (!cancelled) setState("denied");
      }
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
  }, [facing, enabled]);

  const showVideo = enabled && state === "granted";
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
      {showVideo && (
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="absolute inset-0 h-full w-full object-cover"
          style={{
            transform: mirrored ? "scaleX(-1)" : undefined,
            willChange: "transform",
          }}
        />
      )}
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
            <p className="text-[13px] font-semibold">
              {state === "denied"
                ? "Autorise la caméra"
                : state === "unsupported"
                  ? "Caméra indisponible"
                  : "Aperçu caméra"}
            </p>
          </div>
        </div>
      )}
      {/* Soft top & bottom vignette for legibility of overlays */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)",
        }}
      />
    </div>
  );
}
