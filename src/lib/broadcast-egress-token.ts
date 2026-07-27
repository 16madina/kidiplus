/**
 * Short-lived signed tickets for LiveKit Web Egress broadcast pages.
 * Ticket is embedded in /broadcast/$liveId?k=... so Chrome egress can load
 * the KiDi+ shopping UI without a user session.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export type BroadcastEgressTicket = {
  liveId: string;
  roomName: string;
  exp: number;
};

function ticketSecret(): string | null {
  const s =
    (process.env.BROADCAST_EGRESS_SECRET ?? "").trim() ||
    (process.env.LIVEKIT_API_SECRET ?? "").trim() ||
    (process.env.GOOGLE_YOUTUBE_CLIENT_SECRET ?? "").trim();
  return s || null;
}

export function signBroadcastEgressTicket(
  payload: Omit<BroadcastEgressTicket, "exp"> & { ttlSec?: number },
): string | null {
  const secret = ticketSecret();
  if (!secret) return null;
  const body: BroadcastEgressTicket = {
    liveId: payload.liveId,
    roomName: payload.roomName,
    exp: Date.now() + (payload.ttlSec ?? 4 * 3600) * 1000,
  };
  const raw = Buffer.from(JSON.stringify(body), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(raw).digest("base64url");
  return `${raw}.${sig}`;
}

export function verifyBroadcastEgressTicket(
  ticket: string,
): BroadcastEgressTicket | null {
  const secret = ticketSecret();
  if (!secret) return null;
  const parts = ticket.split(".");
  if (parts.length !== 2) return null;
  const [raw, sig] = parts;
  if (!raw || !sig) return null;
  const expected = createHmac("sha256", secret).update(raw).digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8"),
    ) as BroadcastEgressTicket;
    if (!parsed?.liveId || !parsed?.roomName || typeof parsed.exp !== "number") {
      return null;
    }
    if (Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}
