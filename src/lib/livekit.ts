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
): Promise<Room> {
  const room = new Room({
    adaptiveStream: true,
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
 */
export async function switchHostCameraFacing(args: {
  room: Room;
  track: LocalVideoTrack;
  target: CameraFacing;
}): Promise<CameraFacing> {
  const { room, track, target } = args;
  const settings = track.mediaStreamTrack?.getSettings?.() ?? {};
  const currentId =
    typeof settings.deviceId === "string" ? settings.deviceId : null;

  const deviceId = await findCameraDeviceId(target, currentId);

  if (deviceId) {
    try {
      await room.switchActiveDevice("videoinput", deviceId, true);
    } catch (e) {
      console.warn("[flip] switchActiveDevice failed, try restartTrack(deviceId)", e);
      await track.restartTrack({
        deviceId,
        resolution: { width: 1280, height: 720, frameRate: 30 },
      });
    }
  } else {
    await track.restartTrack({
      facingMode: target,
      resolution: { width: 1280, height: 720, frameRate: 30 },
    });
  }

  const detected = asFacing(
    facingModeFromLocalTrack(track, { defaultFacingMode: target }).facingMode,
  );
  return detected ?? target;
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
