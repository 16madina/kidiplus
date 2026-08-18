import { DefiPlusIntroOverlay } from "@/components/defi-plus/defi-plus-intro-overlay";
import { useBattleOptional } from "@/lib/battle-context";
import { isDefiPlusIntroActive } from "@/lib/defi-plus";

/** Transparent Défi Plus intro on the split live — clock is `startedAt` from the battle. */
export function BattleCountdownOverlay({
  startsAt,
  leftName,
  rightName,
}: {
  startsAt: number | null | undefined;
  leftName?: string;
  rightName?: string;
}) {
  const battle = useBattleOptional();
  const active = isDefiPlusIntroActive(startsAt);
  if (!active || startsAt == null) return null;
  return (
    <DefiPlusIntroOverlay
      active
      startsAt={startsAt}
      leftName={leftName || battle?.session?.sideA.displayName}
      rightName={rightName || battle?.session?.sideB.displayName}
    />
  );
}
