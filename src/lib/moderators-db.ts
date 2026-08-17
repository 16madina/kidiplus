// Live moderators — CRUD helpers + realtime hooks.
//
// A moderator must follow the host. Max 3 moderators per live.
// They get product-management privileges + live chat mute rights,
// but cannot end the live or finalize auctions.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { resolveAvatarUrl } from "@/lib/avatar-url";

export const MAX_LIVE_MODERATORS = 3;

export type ModeratorRow = {
  liveId: string;
  userId: string;
  displayName: string | null;
  handle: string | null;
  avatarUrl: string | null;
  addedBy: string;
  createdAt: string;
};

export async function fetchModerators(liveId: string): Promise<ModeratorRow[]> {
  const { data, error } = await supabase
    .from("live_moderators")
    .select("live_id, user_id, added_by, created_at, profiles:profiles!live_moderators_user_id_fkey(display_name, handle, avatar_url)")
    .eq("live_id", liveId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  const rows: ModeratorRow[] = [];
  for (const r of data as unknown as Array<{
    live_id: string;
    user_id: string;
    added_by: string;
    created_at: string;
    profiles: { display_name: string | null; handle: string | null; avatar_url: string | null } | null;
  }>) {
    rows.push({
      liveId: r.live_id,
      userId: r.user_id,
      addedBy: r.added_by,
      createdAt: r.created_at,
      displayName: r.profiles?.display_name ?? null,
      handle: r.profiles?.handle ?? null,
      avatarUrl: r.profiles?.avatar_url
        ? (await resolveAvatarUrl(r.profiles.avatar_url)) ?? null
        : null,
    });
  }
  return rows;
}

/** True when `userId` follows `hostId`. */
export async function isFollowerOf(
  hostId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("follows")
    .select("follower_id")
    .eq("followed_id", hostId)
    .eq("follower_id", userId)
    .maybeSingle();
  return !!data;
}

export async function addModerator(
  liveId: string,
  userId: string,
  addedBy: string,
): Promise<{ ok: boolean; error?: string; code?: string }> {
  // Client-side guards (server trigger is the source of truth).
  const existing = await fetchModerators(liveId);
  if (existing.length >= MAX_LIVE_MODERATORS) {
    return { ok: false, code: "moderator_limit_reached", error: "limit" };
  }
  if (existing.some((m) => m.userId === userId)) {
    return { ok: false, code: "already_mod", error: "already" };
  }
  const follows = await isFollowerOf(addedBy, userId);
  if (!follows) {
    return { ok: false, code: "moderator_not_follower", error: "not_follower" };
  }

  const { error } = await supabase
    .from("live_moderators")
    .insert({ live_id: liveId, user_id: userId, added_by: addedBy });
  if (error) {
    const msg = error.message || "";
    if (/moderator_limit_reached/i.test(msg)) {
      return { ok: false, code: "moderator_limit_reached", error: msg };
    }
    if (/moderator_not_follower/i.test(msg)) {
      return { ok: false, code: "moderator_not_follower", error: msg };
    }
    return { ok: false, error: msg };
  }
  return { ok: true };
}

export async function removeModerator(
  liveId: string,
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("live_moderators")
    .delete()
    .eq("live_id", liveId)
    .eq("user_id", userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export type ModeratorCandidate = {
  id: string;
  displayName: string | null;
  handle: string | null;
  avatarUrl: string | null;
  /** Raw profiles.avatar_url (path or URL) — UI can re-resolve if signed URL fails. */
  avatarPath?: string | null;
};

/** Escape `%` / `_` for ILIKE and strip commas (PostgREST `.or()` separators). */
function sanitizeIlikeQuery(raw: string): string {
  return raw
    .trim()
    .replace(/^@+/, "")
    .replace(/,/g, " ")
    .replace(/"/g, "")
    .replace(/[%_]/g, (c) => `\\${c}`);
}

async function hydrateCandidates(
  rows: Array<{
    id: string;
    display_name: string | null;
    handle: string | null;
    avatar_url: string | null;
  }>,
): Promise<ModeratorCandidate[]> {
  return Promise.all(
    rows.map(async (p) => ({
      id: p.id,
      displayName: p.display_name ?? null,
      handle: p.handle ?? null,
      avatarUrl: p.avatar_url ? await resolveAvatarUrl(p.avatar_url) : null,
      avatarPath: p.avatar_url,
    })),
  );
}

/** Follower ids of a host (people subscribed to them). */
export async function fetchFollowerIds(
  hostId: string,
  limit = 200,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("follows")
    .select("follower_id")
    .eq("followed_id", hostId)
    .limit(limit);
  if (error || !data) return [];
  return data.map((r) => r.follower_id as string).filter(Boolean);
}

/**
 * Typeahead among the host's followers only (handle OR display_name).
 */
export async function searchModeratorCandidates(
  query: string,
  opts: { hostId: string; excludeIds?: Iterable<string>; limit?: number },
): Promise<ModeratorCandidate[]> {
  const cleaned = sanitizeIlikeQuery(query);
  if (cleaned.length < 1) return [];
  const limit = opts.limit ?? 8;
  const exclude = new Set(opts.excludeIds ?? []);
  exclude.add(opts.hostId);
  const pattern = `%${cleaned}%`;

  const followerIds = await fetchFollowerIds(opts.hostId);
  const allowed = followerIds.filter((id) => !exclude.has(id));
  if (allowed.length === 0) return [];

  // PostgREST `.in` has practical size limits — chunk if needed.
  const chunk = allowed.slice(0, 150);
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, handle, avatar_url")
    .in("id", chunk)
    .or(`display_name.ilike."${pattern}",handle.ilike."${pattern}"`)
    .order("handle", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[searchModeratorCandidates]", error);
    return [];
  }
  return hydrateCandidates(data ?? []);
}

/** Load profiles by ids, restricted to host followers. */
export async function fetchModeratorCandidatesByIds(
  ids: string[],
  opts: { hostId: string; excludeIds?: Iterable<string>; limit?: number },
): Promise<ModeratorCandidate[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return [];
  const exclude = new Set(opts.excludeIds ?? []);
  exclude.add(opts.hostId);
  const limit = opts.limit ?? 20;

  const followerIds = new Set(await fetchFollowerIds(opts.hostId));
  const wanted = unique
    .filter((id) => followerIds.has(id) && !exclude.has(id))
    .slice(0, limit);
  if (wanted.length === 0) return [];

  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, handle, avatar_url")
    .in("id", wanted);
  if (error) {
    console.error("[fetchModeratorCandidatesByIds]", error);
    return [];
  }
  const byId = new Map((data ?? []).map((p) => [p.id, p]));
  const ordered = wanted.map((id) => byId.get(id)).filter(Boolean) as Array<{
    id: string;
    display_name: string | null;
    handle: string | null;
    avatar_url: string | null;
  }>;
  return hydrateCandidates(ordered);
}

/** Quick-pick list: host's followers (people subscribed to them). */
export async function fetchFollowerModeratorCandidates(
  hostId: string,
  opts?: { excludeIds?: Iterable<string>; limit?: number },
): Promise<ModeratorCandidate[]> {
  const exclude = new Set(opts?.excludeIds ?? []);
  exclude.add(hostId);
  const limit = opts?.limit ?? 24;
  const ids = (await fetchFollowerIds(hostId)).filter((id) => !exclude.has(id));
  return fetchModeratorCandidatesByIds(ids, { hostId, excludeIds: exclude, limit });
}

/** Resolve a typed value to a follower profile id only. */
export async function resolveModeratorCandidateId(
  rawInput: string,
  hostId: string,
): Promise<string | null> {
  const raw = rawInput.trim().replace(/^@+/, "");
  if (!raw) return null;

  let userId: string | null = null;

  if (/^[0-9a-f-]{36}$/i.test(raw)) {
    const { data } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", raw)
      .maybeSingle();
    if (data?.id) userId = data.id;
  }

  if (!userId) {
    const lower = raw.toLowerCase();
    const byHandle = await supabase
      .from("profiles")
      .select("id")
      .ilike("handle", lower)
      .limit(2);
    if (byHandle.data?.length === 1) userId = byHandle.data[0]!.id;
  }

  if (!userId) {
    const byName = await supabase
      .from("profiles")
      .select("id")
      .ilike("display_name", raw)
      .limit(2);
    if (byName.data?.length === 1) userId = byName.data[0]!.id;
  }

  if (!userId) return null;
  if (!(await isFollowerOf(hostId, userId))) return null;
  return userId;
}

/** Realtime hook — is `userId` currently a moderator of `liveId`? */
export function useIsModerator(
  liveId: string | null | undefined,
  userId: string | null | undefined,
): boolean {
  const [isMod, setIsMod] = useState(false);
  useEffect(() => {
    if (!liveId || !userId) { setIsMod(false); return; }
    let alive = true;

    void (async () => {
      const { data } = await supabase
        .from("live_moderators")
        .select("user_id")
        .eq("live_id", liveId)
        .eq("user_id", userId)
        .maybeSingle();
      if (alive) setIsMod(!!data);
    })();

    const ch = supabase
      .channel(`mods:${liveId}:${userId}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "live_moderators", filter: `live_id=eq.${liveId}` },
        (payload) => {
          const row = payload.new as { user_id: string };
          if (row.user_id === userId) setIsMod(true);
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "live_moderators", filter: `live_id=eq.${liveId}` },
        (payload) => {
          const row = payload.old as { user_id: string };
          if (row.user_id === userId) setIsMod(false);
        },
      )
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(ch);
    };
  }, [liveId, userId]);
  return isMod;
}

/** Realtime hook — full moderator list for a live (host-side view). */
export function useModerators(liveId: string | null | undefined): {
  moderators: ModeratorRow[];
  reload: () => void;
} {
  const [moderators, setModerators] = useState<ModeratorRow[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!liveId) { setModerators([]); return; }
    let alive = true;
    void fetchModerators(liveId).then((r) => { if (alive) setModerators(r); });

    const ch = supabase
      .channel(`mods-list:${liveId}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_moderators", filter: `live_id=eq.${liveId}` },
        () => {
          void fetchModerators(liveId).then((r) => { if (alive) setModerators(r); });
        },
      )
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(ch);
    };
  }, [liveId, tick]);

  return { moderators, reload: () => setTick((n) => n + 1) };
}

// ─── Live chat mutes ───────────────────────────────────────────────────────

export async function fetchLiveChatMutes(liveId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("live_chat_mutes")
    .select("user_id")
    .eq("live_id", liveId);
  if (error || !data) return new Set();
  return new Set(data.map((r) => r.user_id as string));
}

export async function muteLiveChatUser(
  liveId: string,
  userId: string,
  mutedBy: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("live_chat_mutes").insert({
    live_id: liveId,
    user_id: userId,
    muted_by: mutedBy,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function unmuteLiveChatUser(
  liveId: string,
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("live_chat_mutes")
    .delete()
    .eq("live_id", liveId)
    .eq("user_id", userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export function useLiveChatMutes(liveId: string | null | undefined): Set<string> {
  const [muted, setMuted] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!liveId) { setMuted(new Set()); return; }
    let alive = true;
    void fetchLiveChatMutes(liveId).then((s) => { if (alive) setMuted(s); });
    const ch = supabase
      .channel(`chat-mutes:${liveId}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_chat_mutes", filter: `live_id=eq.${liveId}` },
        () => {
          void fetchLiveChatMutes(liveId).then((s) => { if (alive) setMuted(s); });
        },
      )
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(ch);
    };
  }, [liveId]);
  return muted;
}
