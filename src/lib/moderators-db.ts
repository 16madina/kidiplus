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

  const rows: ModeratorCandidate[] = [];
  for (const p of data ?? []) {
    if (exclude.has(p.id)) continue;
    rows.push({
      id: p.id,
      displayName: p.display_name ?? null,
      handle: p.handle ?? null,
      avatarUrl: p.avatar_url
        ? (await resolveAvatarUrl(p.avatar_url)) ?? null
        : null,
    });
    if (rows.length >= limit) break;
  }
  return rows;
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
