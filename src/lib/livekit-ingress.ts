// Client helpers for Restream/OBS → LiveKit RTMP Ingress.

import { supabase } from "@/integrations/supabase/client";
export { rtmpHostIdentity } from "@/lib/rtmp-host-identity";

export type RtmpCredentials = {
  url: string;
  streamKey: string;
  ingressId: string;
  /** LiveKit participant identity used by the Ingress publisher. */
  participantIdentity: string;
};

async function authHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("You must be signed in");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

/** Create (or replace) an RTMP ingress for an existing live row. */
export async function createLiveIngress(liveId: string): Promise<RtmpCredentials> {
  const res = await fetch("/api/livekit-ingress", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ action: "create", liveId }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    url?: string;
    streamKey?: string;
    ingressId?: string;
    participantIdentity?: string;
  };
  if (!res.ok) {
    throw new Error(body.error || `Ingress create failed (${res.status})`);
  }
  if (!body.url || !body.streamKey || !body.ingressId || !body.participantIdentity) {
    throw new Error("Ingress response incomplete");
  }
  return {
    url: body.url,
    streamKey: body.streamKey,
    ingressId: body.ingressId,
    participantIdentity: body.participantIdentity,
  };
}

/** Delete ingress for a live (best-effort on end). */
export async function deleteLiveIngress(liveId: string): Promise<void> {
  const res = await fetch("/api/livekit-ingress", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ action: "delete", liveId }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Ingress delete failed (${res.status})`);
  }
}
