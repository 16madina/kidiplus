// Client helpers for TikTok manual RTMP restream (KiDi+ Web Egress → TikTok).

import { supabase } from "@/integrations/supabase/client";

export type TiktokRestreamStart = {
  egressId: string;
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

export async function startTiktokRestream(opts: {
  liveId: string;
  serverUrl: string;
  streamKey: string;
}): Promise<TiktokRestreamStart> {
  const res = await fetch("/api/tiktok/restream", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({
      action: "start",
      liveId: opts.liveId,
      serverUrl: opts.serverUrl,
      streamKey: opts.streamKey,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
    egressId?: string;
  };
  if (!res.ok) {
    throw new Error(
      body.message || body.error || `TikTok restream start failed (${res.status})`,
    );
  }
  if (!body.egressId) throw new Error("Restream response incomplete");
  return { egressId: body.egressId };
}

export async function stopTiktokRestream(liveId: string): Promise<void> {
  const res = await fetch("/api/tiktok/restream", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ action: "stop", liveId }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
    };
    throw new Error(
      body.message || body.error || `TikTok restream stop failed (${res.status})`,
    );
  }
}
