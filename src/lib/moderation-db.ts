// Moderation client layer: reports + blocks.
//
// Real users: blocks go to `public.blocks` (UUID FK).
// Fictitious App Review sellers (`fictitious:…`): localStorage blocks so the
// feed hides them instantly without a profile row.
// Blocking always opens a report so the developer is notified (Guideline 1.2).

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isFictitiousSellerId } from "@/lib/live-mock";

type AnySb = { rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }> };
const sb = supabase as unknown as AnySb;

export type ReportTargetType = "live" | "message" | "user";
export type ReportReason = "inappropriate" | "fraud" | "counterfeit" | "harassment" | "other";

export async function submitReport(
  target_type: ReportTargetType,
  target_id: string,
  reason: ReportReason,
  note?: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const cleanedId = target_id.trim();
  if (!cleanedId) return { ok: false, error: "missing_target" };

  // Prefer typed RPC — jsonb comes back as a parsed object.
  const { data, error } = await supabase.rpc("submit_report", {
    _target_type: target_type,
    _target_id: cleanedId,
    _reason: reason,
    _note: note || undefined,
  });

  const parsed = parseReportRpcPayload(data);
  if (!error && parsed?.ok) {
    return { ok: true, id: typeof parsed.id === "string" ? parsed.id : undefined };
  }
  if (!error && parsed && parsed.ok === false) {
    // RPC ran but rejected (unauthorized / invalid_input) — don't mask with insert.
    return { ok: false, error: parsed.error || "rejected" };
  }

  // Fallback if the RPC is missing after a dump restore.
  const uid = (await supabase.auth.getUser()).data.user?.id;
  if (!uid) {
    return { ok: false, error: error?.message || "unauthorized" };
  }
  const { data: row, error: ins } = await supabase
    .from("reports")
    .insert({
      reporter_id: uid,
      target_type,
      target_id: cleanedId,
      reason,
      note: note?.trim() || null,
    })
    .select("id")
    .maybeSingle();
  if (ins || !row) {
    console.warn("[report] submit failed", error?.message, ins?.message);
    return {
      ok: false,
      error: ins?.message || error?.message || "unknown",
    };
  }
  return { ok: true, id: row.id };
}

function parseReportRpcPayload(
  data: unknown,
): { ok?: boolean; id?: string; error?: string } | null {
  if (data == null) return null;
  if (typeof data === "string") {
    try {
      return parseReportRpcPayload(JSON.parse(data));
    } catch {
      return null;
    }
  }
  if (typeof data === "object" && !Array.isArray(data)) {
    return data as { ok?: boolean; id?: string; error?: string };
  }
  return null;
}

export async function blockUser(blocked_id: string) {
  const { data, error } = await sb.rpc("block_user", { _blocked_id: blocked_id });
  if (error) return { ok: false, error: error.message };
  return data as { ok: boolean; error?: string };
}

export async function unblockUser(blocked_id: string) {
  if (isFictitiousSellerId(blocked_id)) {
    removeLocalBlock(blocked_id);
    notifyBlockedListeners();
    return { ok: true };
  }
  const { data, error } = await sb.rpc("unblock_user", { _blocked_id: blocked_id });
  if (error) return { ok: false, error: error.message };
  return data as { ok: boolean; error?: string };
}

export type BlockedRow = {
  blocked_id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
};

const LOCAL_BLOCKS_KEY = "kidi:local-blocks";

type LocalBlock = {
  blocked_id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
};

function readLocalBlocks(): LocalBlock[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_BLOCKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LocalBlock[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalBlocks(rows: LocalBlock[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_BLOCKS_KEY, JSON.stringify(rows));
  } catch {
    /* ignore quota */
  }
}

function addLocalBlock(row: LocalBlock) {
  const prev = readLocalBlocks().filter((r) => r.blocked_id !== row.blocked_id);
  writeLocalBlocks([row, ...prev]);
}

function removeLocalBlock(blocked_id: string) {
  writeLocalBlocks(readLocalBlocks().filter((r) => r.blocked_id !== blocked_id));
}

/**
 * Block a user and notify the developer via a moderation report (Guideline 1.2).
 * Fictitious review sellers are stored locally and still create a report when logged in.
 */
export async function blockUserAndNotify(
  blocked_id: string,
  meta?: { handle?: string; displayName?: string; avatarUrl?: string | null; liveId?: string },
): Promise<{ ok: boolean; error?: string }> {
  const label = meta?.displayName || meta?.handle || blocked_id;
  const note = [
    "User blocked from KiDi+.",
    `Target: ${label}`,
    meta?.liveId ? `Live: ${meta.liveId}` : null,
    isFictitiousSellerId(blocked_id) ? "Fictitious review seller." : null,
  ]
    .filter(Boolean)
    .join(" ");

  if (isFictitiousSellerId(blocked_id)) {
    addLocalBlock({
      blocked_id,
      handle: meta?.handle || label,
      display_name: meta?.displayName || label,
      avatar_url: meta?.avatarUrl ?? null,
      created_at: new Date().toISOString(),
    });
    // Best-effort notify — guests can't write reports; UI still blocks locally.
    await submitReport("user", blocked_id, "harassment", note).catch(() => null);
    await refreshBlockedIds();
    return { ok: true };
  }

  const r = await blockUser(blocked_id);
  if (!r.ok) return r;
  await submitReport("user", blocked_id, "harassment", note).catch(() => null);
  await refreshBlockedIds();
  return { ok: true };
}

export async function listMyBlocks(): Promise<BlockedRow[]> {
  const local = readLocalBlocks().map((r) => ({
    blocked_id: r.blocked_id,
    handle: r.handle,
    display_name: r.display_name,
    avatar_url: r.avatar_url,
    created_at: r.created_at,
  }));
  const { data, error } = await sb.rpc("list_my_blocks");
  const remote = (!error && data?.rows ? data.rows : []) as BlockedRow[];
  const seen = new Set<string>();
  const merged: BlockedRow[] = [];
  for (const row of [...local, ...remote]) {
    if (seen.has(row.blocked_id)) continue;
    seen.add(row.blocked_id);
    merged.push(row);
  }
  return merged;
}

// Lightweight hook: loads block set for the current user, cached in-memory.
// Used to filter chat messages and feed cards.
let blockedIdsCache: Set<string> | null = null;
const listeners = new Set<() => void>();

function notifyBlockedListeners() {
  listeners.forEach((l) => l());
}

export async function refreshBlockedIds() {
  const rows = await listMyBlocks();
  blockedIdsCache = new Set(rows.map((r) => r.blocked_id));
  // Always include local fictive blocks even if RPC failed / guest.
  for (const row of readLocalBlocks()) blockedIdsCache.add(row.blocked_id);
  notifyBlockedListeners();
}

export function useBlockedIds(): Set<string> {
  const [, force] = useState(0);
  useEffect(() => {
    const cb = () => force((n) => n + 1);
    listeners.add(cb);
    if (blockedIdsCache === null) void refreshBlockedIds();
    return () => { listeners.delete(cb); };
  }, []);
  if (blockedIdsCache) return blockedIdsCache;
  // Sync snapshot for first paint (local fictive blocks).
  return new Set(readLocalBlocks().map((r) => r.blocked_id));
}

// Account deletion pre-check
export type AccountDeletionCheck = {
  ok: true;
  wallet_balance: number;
  pending_payouts: number;
  pending_orders: number;
  live_now: number;
  has_blockers: boolean;
} | { ok: false; error: string };

export async function accountDeletionCheck(): Promise<AccountDeletionCheck> {
  const { data, error } = await sb.rpc("account_deletion_check");
  if (error) return { ok: false, error: error.message };
  return (data ?? { ok: false, error: "unknown" }) as AccountDeletionCheck;
}
