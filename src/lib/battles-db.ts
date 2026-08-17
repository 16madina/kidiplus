import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { resolveAvatarUrl } from "@/lib/avatar-url";
import { fetchLiveProducts, type LiveProductRow } from "@/lib/lives-db";

export type BattleRpcOk = { ok: true } & Record<string, unknown>;
export type BattleRpcErr = { ok: false; error: string };
export type BattleRpc = BattleRpcOk | BattleRpcErr;

export type BattleLiveRow = {
  battle_id: string;
  live_id: string;
  seller_id: string;
  side: "a" | "b";
  active: boolean;
  room_name: string | null;
  display_name: string;
  handle: string | null;
  avatar_url: string | null;
};

export type BattleParticipantRow = {
  battle_id: string;
  seller_id: string;
  display_name: string | null;
  side: "a" | "b";
  score_amount_live: number;
  score_amount_confirmed: number;
  score_items: number;
  last_seen_at: string;
  left_at: string | null;
};

export type BattleSessionRow = {
  id: string;
  status: "pending" | "running" | "sudden_death" | "ended" | "cancelled";
  duration_sec: number;
  started_at: string | null;
  ends_at: string | null;
  ended_at: string | null;
  currency: string;
  live_winner_seller_id: string | null;
  winner_seller_id: string | null;
  end_reason: "timeout" | "forfeit" | "sudden_death" | "cancelled" | "disconnected" | null;
  sudden_death: boolean;
  rematch_of_battle_id: string | null;
  turn_side: "a" | "b" | null;
  turn_until: string | null;
  last_sale_text: string | null;
  last_sale_at: string | null;
  sudden_death_at: string | null;
};

export type BattleInviteRow = {
  id: string;
  from_live_id: string;
  from_seller_id: string;
  to_seller_id: string;
  to_live_id: string | null;
  duration_sec: number;
  status: string;
  expires_at: string;
  battle_id: string | null;
  from_name: string;
  from_handle: string | null;
  from_avatar_url: string | null;
};

export type HydratedBattle = {
  session: BattleSessionRow;
  lives: BattleLiveRow[];
  participants: BattleParticipantRow[];
};

function asRpc(data: unknown): BattleRpc {
  if (data && typeof data === "object" && "ok" in data) {
    return data as BattleRpc;
  }
  return { ok: false, error: "invalid_response" };
}

export function battleGuestIdentity(sellerId: string): string {
  return `battle_${sellerId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 100)}`;
}

export function isBattleGuestIdentity(identity: string): boolean {
  return identity.startsWith("battle_");
}

export async function battleInvite(args: {
  fromLiveId: string;
  toSellerId: string;
  durationSec: number;
  rematchOf?: string | null;
}): Promise<BattleRpc> {
  const payload = {
    _from_live_id: args.fromLiveId,
    _to_seller_id: args.toSellerId,
    _duration_sec: args.durationSec,
    _rematch_of: args.rematchOf ?? null,
  };
  let { data, error } = await supabase.rpc("battle_invite", payload as never);
  if (error && args.rematchOf) {
    ({ data, error } = await supabase.rpc("battle_invite", {
      _from_live_id: args.fromLiveId,
      _to_seller_id: args.toSellerId,
      _duration_sec: args.durationSec,
    } as never));
  }
  if (error) return { ok: false, error: error.message };
  return asRpc(data);
}

export async function battleAccept(
  inviteId: string,
  durationSec?: number,
): Promise<BattleRpc> {
  const { data, error } = await supabase.rpc("battle_accept", {
    _invite_id: inviteId,
    _duration_sec: durationSec ?? null,
  } as never);
  if (error) return { ok: false, error: error.message };
  return asRpc(data);
}

export async function battleDecline(inviteId: string): Promise<BattleRpc> {
  const { data, error } = await supabase.rpc("battle_decline", {
    _invite_id: inviteId,
  } as never);
  if (error) return { ok: false, error: error.message };
  return asRpc(data);
}

export async function battleHeartbeat(battleId: string): Promise<BattleRpc> {
  const { data, error } = await supabase.rpc("battle_heartbeat", {
    _battle_id: battleId,
  } as never);
  if (error) return { ok: false, error: error.message };
  return asRpc(data);
}

export async function battleEnterSuddenDeath(battleId: string): Promise<BattleRpc> {
  const { data, error } = await supabase.rpc("battle_enter_sudden_death", {
    _battle_id: battleId,
  } as never);
  if (error) return { ok: false, error: error.message };
  return asRpc(data);
}

export async function battleEnd(
  battleId: string,
  reason: "timeout" | "forfeit" | "cancelled" | "sudden_death" | "disconnected",
  forfeitSellerId?: string | null,
): Promise<BattleRpc> {
  const { data, error } = await supabase.rpc("battle_end", {
    _battle_id: battleId,
    _reason: reason,
    _forfeit_seller_id: forfeitSellerId ?? null,
  } as never);
  if (error) return { ok: false, error: error.message };
  return asRpc(data);
}

export async function battleOpponentHasActiveAuction(liveId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("battle_opponent_has_active_auction", {
    _live_id: liveId,
  } as never);
  if (error) return false;
  return data === true;
}

async function hydrateLives(
  battleId: string,
  raw: Array<{ live_id: string; seller_id: string; side: "a" | "b"; active: boolean }>,
): Promise<BattleLiveRow[]> {
  if (raw.length === 0) return [];
  const liveIds = raw.map((r) => r.live_id);
  const sellerIds = raw.map((r) => r.seller_id);
  const [{ data: lives }, { data: profiles }] = await Promise.all([
    supabase.from("lives").select("id, room_name").in("id", liveIds),
    supabase
      .from("profiles")
      .select("id, display_name, handle, avatar_url")
      .in("id", sellerIds),
  ]);
  const liveById = new Map((lives ?? []).map((l) => [l.id, l]));
  const profById = new Map((profiles ?? []).map((p) => [p.id, p]));
  return Promise.all(
    raw.map(async (r) => {
      const p = profById.get(r.seller_id);
      const avatar = p?.avatar_url
        ? ((await resolveAvatarUrl(p.avatar_url)) ?? p.avatar_url)
        : null;
      return {
        battle_id: battleId,
        live_id: r.live_id,
        seller_id: r.seller_id,
        side: r.side,
        active: r.active,
        room_name: (liveById.get(r.live_id)?.room_name as string | null) ?? null,
        display_name: p?.display_name || p?.handle || "Boutique",
        handle: p?.handle ?? null,
        avatar_url: avatar,
      };
    }),
  );
}

export async function fetchBattleForLive(liveId: string | null): Promise<HydratedBattle | null> {
  if (!liveId) return null;
  const { data: link } = await supabase
    .from("battle_lives" as never)
    .select("battle_id")
    .eq("live_id", liveId)
    .eq("active", true)
    .maybeSingle();
  const battleId = (link as { battle_id?: string } | null)?.battle_id;
  if (battleId) return fetchBattleById(battleId);

  const { data: recent } = await supabase
    .from("battle_lives" as never)
    .select("battle_id")
    .eq("live_id", liveId)
    .limit(4);
  const ids = [...new Set(((recent ?? []) as Array<{ battle_id: string }>).map((r) => r.battle_id))];
  if (ids.length === 0) return null;
  const { data: sessions } = await supabase
    .from("battle_sessions" as never)
    .select("id, ended_at, status")
    .in("id", ids)
    .in("status", ["ended", "cancelled"])
    .order("ended_at", { ascending: false })
    .limit(1);
  const last = (sessions as Array<{ id: string; ended_at: string | null }> | null)?.[0];
  if (!last?.ended_at) return null;
  if (Date.now() - Date.parse(last.ended_at) > 3 * 60 * 1000) return null;
  return fetchBattleById(last.id);
}

export async function fetchBattleById(battleId: string): Promise<HydratedBattle | null> {
  const { data: session } = await supabase
    .from("battle_sessions" as never)
    .select("*")
    .eq("id", battleId)
    .maybeSingle();
  if (!session) return null;
  const [{ data: lives }, { data: parts }] = await Promise.all([
    supabase
      .from("battle_lives" as never)
      .select("live_id, seller_id, side, active")
      .eq("battle_id", battleId),
    supabase
      .from("battle_participants" as never)
      .select(
        "battle_id, seller_id, display_name, side, score_amount_live, score_items, score_amount_confirmed, last_seen_at, left_at",
      )
      .eq("battle_id", battleId),
  ]);
  const hydratedLives = await hydrateLives(
    battleId,
    (lives ?? []) as Array<{
      live_id: string;
      seller_id: string;
      side: "a" | "b";
      active: boolean;
    }>,
  );
  return {
    session: session as unknown as BattleSessionRow,
    lives: hydratedLives,
    participants: (parts ?? []) as unknown as BattleParticipantRow[],
  };
}

export async function fetchPendingIncomingInvite(
  userId: string,
): Promise<BattleInviteRow | null> {
  const { data } = await supabase
    .from("battle_invites" as never)
    .select(
      "id, from_live_id, from_seller_id, to_seller_id, to_live_id, duration_sec, status, expires_at, battle_id",
    )
    .eq("to_seller_id", userId)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const row = data as Omit<BattleInviteRow, "from_name" | "from_handle" | "from_avatar_url">;
  const { data: p } = await supabase
    .from("profiles")
    .select("display_name, handle, avatar_url")
    .eq("id", row.from_seller_id)
    .maybeSingle();
  const avatar = p?.avatar_url
    ? ((await resolveAvatarUrl(p.avatar_url)) ?? p.avatar_url)
    : null;
  return {
    ...row,
    from_name: p?.display_name || p?.handle || "Boutique",
    from_handle: p?.handle ?? null,
    from_avatar_url: avatar,
  };
}

export function useBattleForLive(liveId: string | null) {
  const [battle, setBattle] = useState<HydratedBattle | null>(null);

  useEffect(() => {
    if (!liveId) {
      setBattle(null);
      return;
    }
    let cancelled = false;
    const load = () => {
      void fetchBattleForLive(liveId).then((b) => {
        if (!cancelled) setBattle(b);
      });
    };
    load();
    const ch = supabase
      .channel(`battle-live:${liveId}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "battle_lives", filter: `live_id=eq.${liveId}` },
        load,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "battle_sessions" },
        load,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "battle_participants" },
        load,
      )
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(ch);
    };
  }, [liveId]);

  return battle;
}

export function usePendingBattleInvite(userId: string | null) {
  const [invite, setInvite] = useState<BattleInviteRow | null>(null);

  useEffect(() => {
    if (!userId) {
      setInvite(null);
      return;
    }
    let cancelled = false;
    const load = () => {
      void fetchPendingIncomingInvite(userId).then((row) => {
        if (!cancelled) setInvite(row);
      });
    };
    load();
    const ch = supabase
      .channel(`battle-invites:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "battle_invites",
          filter: `to_seller_id=eq.${userId}`,
        },
        load,
      )
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(ch);
    };
  }, [userId]);

  return invite;
}

export function useOpponentBattleProducts(
  opponentLiveId: string | null,
  active: boolean,
): LiveProductRow[] {
  const [rows, setRows] = useState<LiveProductRow[]>([]);

  useEffect(() => {
    if (!opponentLiveId || !active) {
      setRows([]);
      return;
    }
    let cancelled = false;
    const load = () => {
      void fetchLiveProducts(opponentLiveId).then((next) => {
        if (!cancelled) setRows(next);
      });
    };
    load();
    const id = window.setInterval(load, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [opponentLiveId, active]);

  return rows;
}
