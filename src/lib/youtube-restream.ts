// Client helpers for YouTube OAuth connect + restream during a KiDi+ camera live.

import { supabase } from "@/integrations/supabase/client";
import { isNative } from "@/lib/native";

export type YoutubeStatus = {
  connected: boolean;
  channelTitle?: string | null;
  channelId?: string | null;
};

export type YoutubeRestreamStart = {
  egressId: string;
  broadcastId: string;
  watchUrl: string;
  channelTitle?: string | null;
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

export async function fetchYoutubeStatus(): Promise<YoutubeStatus> {
  const res = await fetch("/api/youtube/status", {
    method: "GET",
    headers: await authHeaders(),
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    connected?: boolean;
    channelTitle?: string | null;
    channelId?: string | null;
  };
  if (!res.ok) {
    throw new Error(body.error || `YouTube status failed (${res.status})`);
  }
  return {
    connected: !!body.connected,
    channelTitle: body.channelTitle,
    channelId: body.channelId,
  };
}

/** Open Google OAuth (system browser on native). */
export async function connectYoutube(returnPath = "/"): Promise<void> {
  const res = await fetch("/api/youtube/oauth/start", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({
      native: isNative(),
      returnPath,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
    url?: string;
  };
  if (!res.ok || !body.url) {
    throw new Error(body.message || body.error || `OAuth start failed (${res.status})`);
  }

  if (isNative()) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({
      url: body.url,
      windowName: "_self",
      presentationStyle: "popover",
    });
    return;
  }

  window.location.assign(body.url);
}

export async function disconnectYoutube(): Promise<void> {
  const res = await fetch("/api/youtube/disconnect", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Disconnect failed (${res.status})`);
  }
}

export async function startYoutubeRestream(
  liveId: string,
): Promise<YoutubeRestreamStart> {
  const res = await fetch("/api/youtube/restream", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ action: "start", liveId }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
    egressId?: string;
    broadcastId?: string;
    watchUrl?: string;
    channelTitle?: string | null;
  };
  if (!res.ok) {
    throw new Error(body.message || body.error || `Restream start failed (${res.status})`);
  }
  if (!body.egressId || !body.broadcastId || !body.watchUrl) {
    throw new Error("Restream response incomplete");
  }
  return {
    egressId: body.egressId,
    broadcastId: body.broadcastId,
    watchUrl: body.watchUrl,
    channelTitle: body.channelTitle,
  };
}

export async function stopYoutubeRestream(liveId: string): Promise<void> {
  const res = await fetch("/api/youtube/restream", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ action: "stop", liveId }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
    };
    throw new Error(body.message || body.error || `Restream stop failed (${res.status})`);
  }
}

/**
 * Poll until YouTube leaves "upcoming" / ready and becomes live.
 * Needed because the start handler's background promote is often killed on serverless.
 */
export async function ensureYoutubeBroadcastLive(
  liveId: string,
  opts?: { maxAttempts?: number; intervalMs?: number; signal?: AbortSignal },
): Promise<{ ok: boolean; lifeCycleStatus: string | null }> {
  const maxAttempts = opts?.maxAttempts ?? 24;
  const intervalMs = opts?.intervalMs ?? 5_000;
  let lastStatus: string | null = null;

  for (let i = 0; i < maxAttempts; i++) {
    if (opts?.signal?.aborted) {
      return { ok: false, lifeCycleStatus: lastStatus };
    }
    try {
      const res = await fetch("/api/youtube/restream", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ action: "promote", liveId }),
        signal: opts?.signal,
      });
      const body = (await res.json().catch(() => ({}))) as {
        live?: boolean;
        ok?: boolean;
        lifeCycleStatus?: string | null;
        error?: string;
      };
      lastStatus = body.lifeCycleStatus ?? null;
      if (res.ok && (body.live || body.ok)) {
        return { ok: true, lifeCycleStatus: lastStatus };
      }
    } catch (e) {
      if (opts?.signal?.aborted) {
        return { ok: false, lifeCycleStatus: lastStatus };
      }
      console.warn("[youtube] promote poll failed", e);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  return { ok: false, lifeCycleStatus: lastStatus };
}
