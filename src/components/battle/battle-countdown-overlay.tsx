import { DefiPlusIntroOverlay } from "@/components/defi-plus/defi-plus-intro-overlay";
import { isDefiPlusIntroActive } from "@/lib/defi-plus";

/** Transparent Défi Plus intro on the split live — clock is `startedAt` from the battle. */
export function BattleCountdownOverlay({ startsAt }: { startsAt: number | null | undefined }) {
  const active = isDefiPlusIntroActive(startsAt);
  if (!active || startsAt == null) return null;
  return <DefiPlusIntroOverlay active startsAt={startsAt} />;
}
