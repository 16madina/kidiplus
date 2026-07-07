// Moderation client layer: reports + blocks.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type AnySb = { rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }> };
const sb = supabase as unknown as AnySb;

export type ReportTargetType = "live" | "message" | "user";
export type ReportReason = "inappropriate" | "fraud" | "counterfeit" | "harassment" | "other";

export async function submitReport(target_type: ReportTargetType, target_id: string, reason: ReportReason, note?: string) {
  const { data, error } = await sb.rpc("submit_report", {
    _target_type: target_type, _target_id: target_id, _reason: reason, _note: note ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return (data ?? { ok: false, error: "unknown" }) as { ok: boolean; id?: string; error?: string };
}

export async function blockUser(blocked_id: string) {
  const { data, error } = await sb.rpc("block_user", { _blocked_id: blocked_id });
  if (error) return { ok: false, error: error.message };
  return data as { ok: boolean; error?: string };
}

export async function unblockUser(blocked_id: string) {
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

export async function listMyBlocks(): Promise<BlockedRow[]> {
  const { data, error } = await sb.rpc("list_my_blocks");
  if (error || !data) return [];
  return (data.rows ?? []) as BlockedRow[];
}

// Lightweight hook: loads block set for the current user, cached in-memory.
// Used to filter chat messages and feed cards.
let blockedIdsCache: Set<string> | null = null;
const listeners = new Set<() => void>();

export async function refreshBlockedIds() {
  const rows = await listMyBlocks();
  blockedIdsCache = new Set(rows.map((r) => r.blocked_id));
  listeners.forEach((l) => l());
}

export function useBlockedIds(): Set<string> {
  const [, force] = useState(0);
  useEffect(() => {
    const cb = () => force((n) => n + 1);
    listeners.add(cb);
    if (blockedIdsCache === null) void refreshBlockedIds();
    return () => { listeners.delete(cb); };
  }, []);
  return blockedIdsCache ?? new Set();
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
