/**
 * LiveKit RoomComposite recording template.
 * Loaded by LiveKit Cloud headless Chrome with ?url=&token=&layout=
 * Burns a large KiDi+ watermark into every replay MP4.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type RemoteTrackPublication,
} from "livekit-client";

export const Route = createFileRoute("/egress-template")({
  ssr: false,
  component: EgressTemplatePage,
  head: () => ({
    meta: [
      { title: "KiDi+ recording" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
});

function EgressTemplatePage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const roomRef = useRef<Room | null>(null);
  const startedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const url = params.get("url") ?? "";
    const token = params.get("token") ?? "";
    if (!url || !token) {
      setError("missing url/token");
      return;
    }

    const room = new Room({
      adaptiveStream: false,
      dynacast: false,
    });
    roomRef.current = room;

    const tryStart = () => {
      if (startedRef.current) return;
      startedRef.current = true;
      // LiveKit egress listens for this console signal.
      // eslint-disable-next-line no-console
      console.log("START_RECORDING");
    };

    const attachMedia = () => {
      const el = videoRef.current;
      if (!el) return;
      let best: RemoteTrackPublication | null = null;
      for (const p of room.remoteParticipants.values()) {
        for (const pub of p.trackPublications.values()) {
          if (!pub.track || !pub.isSubscribed) continue;
          // Attach every remote audio track (creates hidden <audio>).
          if (pub.kind === Track.Kind.Audio) {
            pub.track.attach();
            continue;
          }
          if (pub.kind !== Track.Kind.Video) continue;
          // Prefer host camera; fall back to screen share.
          if (
            !best ||
            pub.source === Track.Source.Camera ||
            (pub.source === Track.Source.ScreenShare &&
              best.source !== Track.Source.Camera)
          ) {
            best = pub;
          }
        }
      }
      if (best?.track) {
        best.track.attach(el);
        void el.play().catch(() => {});
        // Small delay so first frames can decode before capture.
        window.setTimeout(tryStart, 600);
      }
    };

    const onDisconnected = () => {
      // eslint-disable-next-line no-console
      console.log("END_RECORDING");
    };

    room.on(RoomEvent.TrackSubscribed, attachMedia);
    room.on(RoomEvent.TrackUnsubscribed, attachMedia);
    room.on(RoomEvent.ParticipantConnected, attachMedia);
    room.on(RoomEvent.Disconnected, onDisconnected);

    let fallbackTimer: number | undefined;
    void (async () => {
      try {
        await room.connect(url, token);
        attachMedia();
        // If no video arrives quickly, still start (audio-only / delayed publish).
        fallbackTimer = window.setTimeout(() => {
          if (room.state === ConnectionState.Connected) tryStart();
        }, 4_500);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      if (fallbackTimer) window.clearTimeout(fallbackTimer);
      room.removeAllListeners();
      void room.disconnect();
      roomRef.current = null;
    };
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        margin: 0,
        background: "#000",
        overflow: "hidden",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={false}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          background: "#000",
        }}
      />

      {/* Large, hard-to-crop brand mark — top-right, ~32% of frame width */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: "3.5%",
          right: "3.5%",
          width: "34%",
          maxWidth: 420,
          zIndex: 20,
          pointerEvents: "none",
          filter: "drop-shadow(0 4px 18px rgba(0,0,0,0.55))",
        }}
      >
        <img
          src="/kidiplus-watermark.png"
          alt=""
          draggable={false}
          style={{
            display: "block",
            width: "100%",
            height: "auto",
          }}
        />
      </div>

      {error ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            color: "#fff",
            background: "#10162B",
            padding: 24,
            textAlign: "center",
          }}
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}
