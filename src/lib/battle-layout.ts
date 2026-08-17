import type { BattleFighter, BattleSession } from "@/lib/battle-context";

/** Local seller (or the live the viewer entered) is always LEFT. */
export function battleLayoutSides(
  session: BattleSession,
  anchor: { sellerId?: string | null; liveId?: string | null; roomName?: string | null },
): { left: BattleFighter; right: BattleFighter } {
  const { sideA, sideB } = session;
  const isLeft = (f: BattleFighter) =>
    (!!anchor.sellerId && f.sellerId === anchor.sellerId) ||
    (!!anchor.liveId && f.liveId === anchor.liveId) ||
    (!!anchor.roomName && f.roomName === anchor.roomName);
  const left = isLeft(sideA) ? sideA : isLeft(sideB) ? sideB : sideA;
  const right = left.sellerId === sideA.sellerId ? sideB : sideA;
  return { left, right };
}
