// LiveKit client helpers. Isolated so components stay UI-focused.
import {
  Room,
  RoomEvent,
  Track,
  createLocalVideoTrack,
  type LocalVideoTrack,
  type LocalAudioTrack,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RemoteParticipant,
} from "livekit-client";
import { supabase } from "@/integrations/supabase/client";

export type Role = "host" | "viewer";

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

export {
  Room,
  RoomEvent,
  Track,
  createLocalVideoTrack,
};
export type {
  LocalVideoTrack,
  LocalAudioTrack,
  RemoteTrack,
  RemoteTrackPublication,
  RemoteParticipant,
};
