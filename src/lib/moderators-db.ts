// Live moderators — CRUD helpers + realtime hooks.
//
// A moderator is a viewer promoted by the host during a live. They get
// product-management privileges (add / feature / start auction / put on sale)
// but cannot end the live or finalize auctions.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { resolveAvatarUrl } from "@/lib/avatar-url";

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

export async function addModerator(
  liveId: string,
  userId: string,
  addedBy: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("live_moderators")
    .insert({ live_id: liveId, user_id: userId, added_by: addedBy });
  if (error) return { ok: false, error: error.message };
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

/**
 * Typeahead for promoting moderators — matches handle OR display_name (ilike).
 * Not limited to sellers. Host can promote any KiDi+ account.
 */
export async function searchModeratorCandidates(
  query: string,
  opts?: { excludeIds?: Iterable<string>; limit?: number },
): Promise<ModeratorCandidate[]> {
  const cleaned = sanitizeIlikeQuery(query);
  if (cleaned.length < 1) return [];
  const limit = opts?.limit ?? 8;
  const exclude = new Set(opts?.excludeIds ?? []);
  const pattern = `%${cleaned}%`;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, handle, avatar_url")
    .or(`display_name.ilike."${pattern}",handle.ilike."${pattern}"`)
    .order("handle", { ascending: true })
    .limit(Math.max(limit + exclude.size, limit));

  if (error) {
    console.error("[searchModeratorCandidates]", error);
    return [];
  }

  const filtered = (data ?? []).filter((p) => !exclude.has(p.id)).slice(0, limit);
  return hydrateCandidates(filtered);
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

/** Load profiles by ids (presence / follow quick-picks). */
export async function fetchModeratorCandidatesByIds(
  ids: string[],
  opts?: { excludeIds?: Iterable<string>; limit?: number },
): Promise<ModeratorCandidate[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return [];
  const exclude = new Set(opts?.excludeIds ?? []);
  const limit = opts?.limit ?? 20;
  const wanted = unique.filter((id) => !exclude.has(id)).slice(0, limit);
  if (wanted.length === 0) return [];

  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, handle, avatar_url")
    .in("id", wanted);
  if (error) {
    console.error("[fetchModeratorCandidatesByIds]", error);
    return [];
  }
  // Preserve input order when possible
  const byId = new Map((data ?? []).map((p) => [p.id, p]));
  const ordered = wanted.map((id) => byId.get(id)).filter(Boolean) as Array<{
    id: string;
    display_name: string | null;
    handle: string | null;
    avatar_url: string | null;
  }>;
  return hydrateCandidates(ordered);
}

/**
 * Follow graph around the host: people who follow them + people they follow.
 */
export async function fetchFollowModeratorCandidates(
  hostId: string,
  opts?: { excludeIds?: Iterable<string>; limit?: number },
): Promise<ModeratorCandidate[]> {
  const exclude = new Set(opts?.excludeIds ?? []);
  exclude.add(hostId);
  const limit = opts?.limit ?? 24;

  const [followersRes, followingRes] = await Promise.all([
    supabase
      .from("follows")
      .select("follower_id")
      .eq("followed_id", hostId)
      .limit(40),
    supabase
      .from("follows")
      .select("followed_id")
      .eq("follower_id", hostId)
      .limit(40),
  ]);

  const ids: string[] = [];
  const seen = new Set<string>();
  for (const row of followersRes.data ?? []) {
    const id = row.follower_id as string;
    if (!id || exclude.has(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  for (const row of followingRes.data ?? []) {
    const id = row.followed_id as string;
    if (!id || exclude.has(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return fetchModeratorCandidatesByIds(ids, { excludeIds: exclude, limit });
}

/** Resolve a typed value to a single profile id (handle / display_name / uuid). */
export async function resolveModeratorCandidateId(
  rawInput: string,
): Promise<string | null> {
  const raw = rawInput.trim().replace(/^@+/, "");
  if (!raw) return null;

  // UUID paste
  if (/^[0-9a-f-]{36}$/i.test(raw)) {
    const { data } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", raw)
      .maybeSingle();
    if (data?.id) return data.id;
  }

  const lower = raw.toLowerCase();
  // Exact handle (case-insensitive)
  const byHandle = await supabase
    .from("profiles")
    .select("id")
    .ilike("handle", lower)
    .limit(2);
  if (byHandle.data?.length === 1) return byHandle.data[0]!.id;

  // Exact display_name (case-insensitive) — only if unique
  const byName = await supabase
    .from("profiles")
    .select("id")
    .ilike("display_name", raw)
    .limit(2);
  if (byName.data?.length === 1) return byName.data[0]!.id;

  // Ambiguous / not found — let the host pick from suggestions
  return null;
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
      .channel(`mods:${liveId}:${userId}`)
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
      .channel(`mods-list:${liveId}`)
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
