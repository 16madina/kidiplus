import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { BATTLE_COUNTDOWN_SEC, BATTLE_SUDDEN_DEATH_SEC } from "@/lib/battle-constants";
import {
  battleAccept,
  battleDecline,
  battleEnd,
  battleEnterSuddenDeath,
  battleHeartbeat,
  battleInvite,
  useBattleForLive,
  usePendingBattleInvite,
  type HydratedBattle,
} from "@/lib/battles-db";

export type BattleSide = "a" | "b";
export type BattleEndReason = "timeout" | "forfeit" | "cancelled" | "sudden_death" | "disconnected";

export type BattleFighter = {
  sellerId: string;
  liveId: string | null;
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
  isLive: boolean;
  roomName: string | null;
  scoreAmountLive: number;
  scoreItems: number;
};

export type BattleSession = {
  id: string;
  status: "running" | "ended";
  durationSec: number;
  startedAt: number;
  endsAt: number;
  currency: string;
  sideA: BattleFighter;
  sideB: BattleFighter;
  endReason: BattleEndReason | null;
  liveWinnerSide: BattleSide | "tie" | null;
  forfeitSellerId: string | null;
  suddenDeath: boolean;
  suddenDeathAt: number | null;
  turnSide: BattleSide | null;
  turnUntil: number | null;
  lastSaleText: string | null;
  lastSaleAt: number | null;
  rematchOf: string | null;
  prototype: boolean;
};

export type BattleInviteDraft = {
  toSellerId: string;
  toLiveId: string | null;
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
  isLive: boolean;
};

export type IncomingBattleInvite = {
  id: string;
  fromSellerId: string;
  fromLiveId: string | null;
  fromName: string;
  fromHandle: string | null;
  fromAvatarUrl: string | null;
  durationSec: number;
  expiresAt: number;
  prototypePreview: boolean;
};

type BattleContextValue = {
  session: BattleSession | null;
  remainingMs: number;
  countdownMs: number;
  turnRemainingMs: number;
  mySide: BattleSide | null;
  isMyTurn: boolean;
  lastSaleText: string | null;
  inviteOpen: boolean;
  incoming: IncomingBattleInvite | null;
  resultOpen: boolean;
  isRunning: boolean;
  sending: boolean;
  openInvite: () => void;
  closeInvite: () => void;
  sendInvite: (
    draft: BattleInviteDraft,
    durationSec: number,
    rematchOf?: string | null,
  ) => Promise<{ ok: boolean; error?: string }>;
  acceptIncoming: () => Promise<{ ok: boolean; error?: string }>;
  declineIncoming: () => Promise<void>;
  endBattle: (reason: BattleEndReason, forfeitSellerId?: string | null) => Promise<void>;
  dismissResult: () => void;
  requestRematch: () => Promise<{ ok: boolean; error?: string }>;
};

const BattleContext = createContext<BattleContextValue | null>(null);

function toFighter(
  battle: HydratedBattle,
  side: BattleSide,
): BattleFighter {
  const live = battle.lives.find((l) => l.side === side);
  const part = battle.participants.find((p) => p.side === side);
  return {
    sellerId: live?.seller_id ?? part?.seller_id ?? "",
    liveId: live?.live_id ?? null,
    displayName: live?.display_name || part?.display_name || "Boutique",
    handle: live?.handle ?? null,
    avatarUrl: live?.avatar_url ?? null,
    isLive: true,
    roomName: live?.room_name ?? null,
    scoreAmountLive: Number(part?.score_amount_live ?? 0),
    scoreItems: Number(part?.score_items ?? 0),
  };
}

function toSession(battle: HydratedBattle): BattleSession | null {
  const s = battle.session;
  if (
    s.status !== "running" &&
    s.status !== "sudden_death" &&
    s.status !== "ended" &&
    s.status !== "cancelled"
  ) {
    return null;
  }
  const sideA = toFighter(battle, "a");
  const sideB = toFighter(battle, "b");
  const winnerId = s.live_winner_seller_id;
  const remaining =
    winnerId === sideA.sellerId ? sideA : winnerId === sideB.sellerId ? sideB : null;
  const remainingHasSales =
    !!remaining && (remaining.scoreAmountLive > 0 || remaining.scoreItems > 0);
  const leftMidFight =
    s.end_reason === "forfeit" ||
    s.end_reason === "disconnected" ||
    s.end_reason === "cancelled";
  // Opponent left but remaining seller already sold → scored win, not forfeit.
  const abandon = leftMidFight && !remainingHasSales;
  let liveWinnerSide: BattleSide | "tie" | null = null;
  if (s.status === "ended" || s.status === "cancelled") {
    if (winnerId && winnerId === sideA.sellerId) liveWinnerSide = "a";
    else if (winnerId && winnerId === sideB.sellerId) liveWinnerSide = "b";
    else if (abandon) liveWinnerSide = null;
    else liveWinnerSide = "tie";
  }
  const forfeitSellerId =
    abandon && winnerId === sideA.sellerId
      ? sideB.sellerId
      : abandon && winnerId === sideB.sellerId
        ? sideA.sellerId
        : null;
  const startedAt = s.started_at ? Date.parse(s.started_at) : Date.now();
  const endsAt = s.ends_at ? Date.parse(s.ends_at) : startedAt + s.duration_sec * 1000;
  return {
    id: s.id,
    status: s.status === "ended" || s.status === "cancelled" ? "ended" : "running",
    durationSec: s.duration_sec,
    startedAt,
    endsAt,
    currency: s.currency,
    sideA,
    sideB,
    endReason: s.end_reason,
    liveWinnerSide,
    forfeitSellerId,
    suddenDeath: s.status === "sudden_death" || !!s.sudden_death,
    suddenDeathAt: s.sudden_death_at ? Date.parse(s.sudden_death_at) : null,
    turnSide: s.turn_side,
    turnUntil: s.turn_until ? Date.parse(s.turn_until) : null,
    lastSaleText: s.last_sale_text,
    lastSaleAt: s.last_sale_at ? Date.parse(s.last_sale_at) : null,
    rematchOf: s.rematch_of_battle_id,
    prototype: false,
  };
}

export function BattleProvider({
  liveId,
  userId,
  children,
}: {
  liveId: string | null;
  userId: string | null;
  children: ReactNode;
}) {
  const hydrated = useBattleForLive(liveId);
  const pendingInvite = usePendingBattleInvite(userId);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const session = useMemo(() => {
    if (!hydrated) return null;
    const mapped = toSession(hydrated);
    if (!mapped) return null;
    if (mapped.status === "ended" && mapped.id === dismissedId) return null;
    return mapped;
  }, [hydrated, dismissedId]);

  const countdownMs = useMemo(() => {
    if (!session || session.status !== "running" || session.suddenDeath) return 0;
    return Math.max(0, session.startedAt + BATTLE_COUNTDOWN_SEC * 1000 - now);
  }, [session, now]);

  const remainingMs = useMemo(() => {
    if (!session || session.status !== "running") return 0;
    if (session.suddenDeath) {
      const start = session.suddenDeathAt ?? session.endsAt;
      return Math.max(0, start + BATTLE_SUDDEN_DEATH_SEC * 1000 - now);
    }
    // HUD stays frozen on the full duration until the intro overlay hits 0.
    if (countdownMs > 0) return session.durationSec * 1000;
    return Math.max(0, session.endsAt - now);
  }, [session, now, countdownMs]);

  const mySide = useMemo<BattleSide | null>(() => {
    if (!session || !userId) return null;
    if (session.sideA.sellerId === userId) return "a";
    if (session.sideB.sellerId === userId) return "b";
    return null;
  }, [session, userId]);

  const turnRemainingMs = useMemo(() => {
    if (!session || session.status !== "running" || session.suddenDeath || !session.turnUntil) {
      return 0;
    }
    return Math.max(0, session.turnUntil - now);
  }, [session, now]);

  const isMyTurn = !!session && !session.suddenDeath && (
    !session.turnSide || !mySide || session.turnSide === mySide
  );

  useEffect(() => {
    if (!session || session.status !== "running") return;
    let timeout = 0;
    const loop = () => {
      const t = Date.now();
      setNow(t);
      const introEnd = session.startedAt + BATTLE_COUNTDOWN_SEC * 1000;
      timeout = window.setTimeout(loop, t < introEnd ? 50 : 1_000);
    };
    loop();
    return () => window.clearTimeout(timeout);
  }, [session?.id, session?.status, session?.startedAt]);

  useEffect(() => {
    if (session?.status === "ended" && session.id !== dismissedId) {
      setResultOpen(true);
      setInviteOpen(false);
    }
  }, [session?.status, session?.id, dismissedId]);

  useEffect(() => {
    if (!session || session.status !== "running" || !mySide) return;
    const beat = () => {
      void battleHeartbeat(session.id);
    };
    beat();
    const expired = remainingMs <= 0;
    const id = window.setInterval(beat, expired ? 2_000 : 10_000);
    return () => window.clearInterval(id);
  }, [session?.id, session?.status, mySide, remainingMs <= 0]);

  useEffect(() => {
    if (!session || session.status !== "running" || !mySide) return;
    if (remainingMs > 0) return;
    void battleHeartbeat(session.id);
    const fallback = window.setTimeout(() => {
      if (session.suddenDeath) {
        void battleEnd(session.id, "sudden_death");
        return;
      }
      void battleHeartbeat(session.id);
      void battleEnterSuddenDeath(session.id);
    }, 4_000);
    return () => window.clearTimeout(fallback);
  }, [remainingMs, session?.id, session?.status, session?.suddenDeath, mySide]);

  const incoming: IncomingBattleInvite | null = pendingInvite
    ? {
        id: pendingInvite.id,
        fromSellerId: pendingInvite.from_seller_id,
        fromLiveId: pendingInvite.from_live_id,
        fromName: pendingInvite.from_name,
        fromHandle: pendingInvite.from_handle,
        fromAvatarUrl: pendingInvite.from_avatar_url,
        durationSec: pendingInvite.duration_sec,
        expiresAt: Date.parse(pendingInvite.expires_at),
        prototypePreview: false,
      }
    : null;

  const sendInvite = useCallback(
    async (draft: BattleInviteDraft, durationSec: number, rematchOf?: string | null) => {
      if (!liveId) return { ok: false, error: "no_live" };
      setSending(true);
      try {
        if (session?.status === "running" && remainingMs <= 0) {
          await battleHeartbeat(session.id);
          await battleEnd(
            session.id,
            session.suddenDeath ? "sudden_death" : "timeout",
          );
        }
        const res = await battleInvite({
          fromLiveId: liveId,
          toSellerId: draft.toSellerId,
          durationSec,
          rematchOf,
        });
        if (res.ok) setInviteOpen(false);
        return res.ok ? { ok: true } : { ok: false, error: res.error };
      } finally {
        setSending(false);
      }
    },
    [liveId, session, remainingMs],
  );

  const acceptIncoming = useCallback(async () => {
    if (!pendingInvite) return { ok: false, error: "no_invite" };
    const res = await battleAccept(pendingInvite.id);
    return res.ok ? { ok: true } : { ok: false, error: res.error };
  }, [pendingInvite]);

  const declineIncoming = useCallback(async () => {
    if (!pendingInvite) return;
    await battleDecline(pendingInvite.id);
  }, [pendingInvite]);

  const endBattleFn = useCallback(
    async (reason: BattleEndReason, forfeitSellerId?: string | null) => {
      if (!session) return;
      await battleEnd(session.id, reason, forfeitSellerId);
    },
    [session],
  );

  const dismissResult = useCallback(() => {
    if (session) setDismissedId(session.id);
    setResultOpen(false);
  }, [session]);

  const requestRematch = useCallback(async () => {
    if (!session || !userId) return { ok: false, error: "no_session" };
    const other = session.sideA.sellerId === userId ? session.sideB : session.sideA;
    const durationSec = session.durationSec;
    setDismissedId(session.id);
    setResultOpen(false);
    return sendInvite(
      {
        toSellerId: other.sellerId,
        toLiveId: other.liveId,
        displayName: other.displayName,
        handle: other.handle,
        avatarUrl: other.avatarUrl,
        isLive: other.isLive,
      },
      durationSec,
      session.id,
    );
  }, [session, userId, sendInvite]);

  const value = useMemo<BattleContextValue>(
    () => ({
      session,
      remainingMs,
      countdownMs,
      turnRemainingMs,
      mySide,
      isMyTurn,
      lastSaleText: session?.lastSaleText ?? null,
      inviteOpen,
      incoming,
      resultOpen,
      isRunning: session?.status === "running",
      sending,
      openInvite: () => setInviteOpen(true),
      closeInvite: () => setInviteOpen(false),
      sendInvite,
      acceptIncoming,
      declineIncoming,
      endBattle: endBattleFn,
      dismissResult,
      requestRematch,
    }),
    [
      session,
      remainingMs,
      countdownMs,
      turnRemainingMs,
      mySide,
      isMyTurn,
      inviteOpen,
      incoming,
      resultOpen,
      sending,
      sendInvite,
      acceptIncoming,
      declineIncoming,
      endBattleFn,
      dismissResult,
      requestRematch,
    ],
  );

  return <BattleContext.Provider value={value}>{children}</BattleContext.Provider>;
}

export function useBattle(): BattleContextValue {
  const ctx = useContext(BattleContext);
  if (!ctx) throw new Error("useBattle must be used inside BattleProvider");
  return ctx;
}

export function useBattleOptional(): BattleContextValue | null {
  return useContext(BattleContext);
}

export { BATTLE_SUDDEN_DEATH_SEC };
