// Client helpers to start/stop LiveKit room replay recording during a host live.

import { supabase } from "@/integrations/supabase/client";

export type LiveReplayStatus =
  | "recording"
  | "processing"
  | "ready"
  | "failed"
  | "expired"
  | null;

export type LiveReplayMeta = {
  replay_status: LiveReplayStatus;
  replay_url: string | null;
  replay_expires_at: string | null;
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

/** Fire-and-forget friendly: returns ok=false without throwing on soft failures. */
export async function startLiveReplay(
  liveId: string,
): Promise<{ ok: boolean; egressId?: string; error?: string }> {
  try {
    const res = await fetch("/api/live-replay/start", {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({ liveId }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
      egressId?: string;
      already?: boolean;
    };
    if (!res.ok) {
      return {
        ok: false,
        error: body.message || body.error || `start failed (${res.status})`,
      };
    }
    return { ok: true, egressId: body.egressId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function stopLiveReplay(
  liveId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/live-replay/stop", {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({ liveId }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        error: body.message || body.error || `stop failed (${res.status})`,
      };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function fetchLiveReplayMeta(
  liveId: string,
): Promise<LiveReplayMeta | null> {
  const { data, error } = await supabase
    .from("lives")
    .select("replay_status, replay_url, replay_expires_at")
    .eq("id", liveId)
    .maybeSingle();
  if (error || !data) return null;
  const status = (data.replay_status ?? null) as LiveReplayStatus;
  const expires = data.replay_expires_at;
  if (
    status === "ready" &&
    expires &&
    new Date(expires).getTime() <= Date.now()
  ) {
    return {
      replay_status: "expired",
      replay_url: null,
      replay_expires_at: expires,
    };
  }
  return {
    replay_status: status,
    replay_url: data.replay_url,
    replay_expires_at: expires,
  };
}

export function isReplayPlayable(meta: LiveReplayMeta | null | undefined): boolean {
  if (!meta?.replay_url) return false;
  if (meta.replay_status !== "ready") return false;
  if (
    meta.replay_expires_at &&
    new Date(meta.replay_expires_at).getTime() <= Date.now()
  ) {
    return false;
  }
  return true;
}

/** Whole days remaining until expiry (ceil), min 0. */
export function replayDaysLeft(expiresAt: string | null | undefined): number | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}
