// LiveKit client helpers. Isolated so components stay UI-focused.
import {
  Room,
  RoomEvent,
  Track,
  createLocalVideoTrack,
  facingModeFromDeviceLabel,
  facingModeFromLocalTrack,
  type LocalVideoTrack,
  type LocalAudioTrack,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RemoteParticipant,
} from "livekit-client";
import { supabase } from "@/integrations/supabase/client";

export type Role = "host" | "viewer";
export type CameraFacing = "user" | "environment";

export type TokenResponse = { token: string; url: string };

export async function getToken(
  room: string,
  identity: string,
  name: string | undefined,
  role: Role,
): Promise<TokenResponse> {
  // Attach the Supabase bearer token when we have one so the server can
  // identify the caller and authorize host (publish) grants. Viewer tokens
  // are allowed anonymously — the server issues a strictly view-only guest
  // token (canPublish=false, canPublishData=false). Hosting still requires
  // a session and is rejected server-side without a Bearer.
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken && role === "host") {
    throw new Error("You must be signed in to host a live");
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch("/api/livekit-token", {
    method: "POST",
    headers,
    body: JSON.stringify({ room, identity, name, role }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Token request failed (${res.status}): ${text}`);
  }
  return (await res.json()) as TokenResponse;
}



export async function connectRoom(
  url: string,
  token: string,
  opts?: { adaptiveStream?: boolean },
): Promise<Room> {
  const room = new Room({
    // Full-screen viewer: adaptiveStream often leaves the first open on a
    // frozen frame in WKWebView (IntersectionObserver / layer pause). Host
    // publish can keep the default.
    adaptiveStream: opts?.adaptiveStream ?? true,
    dynacast: true,
  });
  await room.connect(url, token);
  return room;
}

export async function disconnectRoom(room: Room | null): Promise<void> {
  if (!room) return;
  try {
    await room.disconnect(true);
  } catch {
    /* ignore */
  }
}

// Build a unique room name for a live session.
export function makeRoomName(sellerId: string): string {
  const clean = sellerId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || "seller";
  return `live_${clean}_${Date.now().toString(36)}`;
}

function asFacing(value: string | undefined | null): CameraFacing | null {
  if (value === "user" || value === "environment") return value;
  return null;
}

/** Resolve which videoinput deviceId matches front/back. */
export async function findCameraDeviceId(
  target: CameraFacing,
  currentDeviceId?: string | null,
): Promise<string | null> {
  const devices = await Room.getLocalDevices("videoinput", true);
  if (devices.length === 0) return null;

  const scored = devices.map((d) => {
    const fromLabel = facingModeFromDeviceLabel(d.label)?.facingMode;
    return { device: d, facing: asFacing(fromLabel ?? null) };
  });

  const matches = scored.filter((s) => s.facing === target);
  const preferred =
    matches.find((s) => s.device.deviceId && s.device.deviceId !== currentDeviceId) ??
    matches[0];
  if (preferred?.device.deviceId) return preferred.device.deviceId;

  // Fallback: any other camera than the current one (typical phone front/back).
  const other = devices.find(
    (d) => d.deviceId && d.deviceId !== (currentDeviceId ?? ""),
  );
  return other?.deviceId ?? null;
}

/**
 * Switch the published host camera front ↔ back without leaving the room.
 * Prefers LiveKit switchActiveDevice / restartTrack(deviceId).
 * If `target` is omitted, flips to the opposite of the *actual* current camera
 * (avoids desync after leave/return when React state still says "environment"
 * but the hardware restarted on "user").
 */
export async function switchHostCameraFacing(args: {
  room: Room;
  track: LocalVideoTrack;
  target?: CameraFacing;
}): Promise<CameraFacing> {
  const { room, track } = args;
  // Processors block clean device switches on iOS — drop mirror first.
  try {
    await track.stopProcessor();
  } catch {
    /* none */
  }

  const settings = track.mediaStreamTrack?.getSettings?.() ?? {};
  const currentId =
    typeof settings.deviceId === "string" ? settings.deviceId : null;
  const actual =
    asFacing(
      facingModeFromLocalTrack(track, {
        defaultFacingMode: args.target ?? "user",
      }).facingMode,
    ) ??
    args.target ??
    "user";
  const target = args.target ?? (actual === "user" ? "environment" : "user");

  // Always pick a different device than the one currently open when possible.
  const deviceId = await findCameraDeviceId(target, currentId);

  let switched = false;
  if (deviceId && deviceId !== currentId) {
    try {
      await room.switchActiveDevice("videoinput", deviceId, true);
      switched = true;
    } catch (e) {
      console.warn("[flip] switchActiveDevice failed, try restartTrack(deviceId)", e);
    }
  }

  if (!switched) {
    // restartTrack is the most reliable path on Capacitor WKWebView / Chrome.
    await track.restartTrack(
      deviceId
        ? {
            deviceId,
            facingMode: target,
            resolution: { width: 1280, height: 720, frameRate: 30 },
          }
        : {
            facingMode: target,
            resolution: { width: 1280, height: 720, frameRate: 30 },
          },
    );
  }

  // Give the hardware a beat to settle before reading facingMode.
  await new Promise((r) => setTimeout(r, 80));

  const detected = asFacing(
    facingModeFromLocalTrack(track, { defaultFacingMode: target }).facingMode,
  );
  return detected ?? target;
}

/** Front camera: mirror the published track so viewers match the host selfie preview. */
export async function syncFrontCameraMirror(
  track: LocalVideoTrack,
  facing: CameraFacing,
): Promise<void> {
  try {
    await track.stopProcessor();
  } catch {
    /* no processor yet */
  }
  if (facing !== "user") return;
  try {
    const { MirrorVideoProcessor } = await import("@/lib/mirror-video-processor");
    // Don't block the host UI for more than a couple seconds if canvas init stalls.
    await Promise.race([
      track.setProcessor(new MirrorVideoProcessor(), true),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("mirror_timeout")), 2500),
      ),
    ]);
  } catch (e) {
    console.warn("[camera] mirror processor failed", e);
  }
}

export {
  Room,
  RoomEvent,
  Track,
  createLocalVideoTrack,
  facingModeFromLocalTrack,
  facingModeFromDeviceLabel,
};
export type {
  LocalVideoTrack,
  LocalAudioTrack,
  RemoteTrack,
  RemoteTrackPublication,
  RemoteParticipant,
};
