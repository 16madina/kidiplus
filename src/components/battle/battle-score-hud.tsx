import { useTranslation } from "react-i18next";
import { formatMoney } from "@/lib/money";
import type { BattleFighter, BattleSession } from "@/lib/battle-context";

function formatRemain(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function BattleScoreHud({
  session,
  remainingMs,
  left,
  right,
}: {
  session: BattleSession;
  remainingMs: number;
  left: BattleFighter;
  right: BattleFighter;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith("en") ? "en" : "fr";
  const leftLeads = left.scoreAmountLive > right.scoreAmountLive;
  const rightLeads = right.scoreAmountLive > left.scoreAmountLive;

  return (
    <div className="pointer-events-none px-2">
      <div className="flex items-stretch overflow-hidden rounded-[14px] shadow-[0_10px_28px_rgba(0,0,0,0.35)]">
        <HudBanner
          name={left.displayName}
          amount={formatMoney(left.scoreAmountLive, session.currency, locale)}
          items={left.scoreItems}
          crown={leftLeads}
          side="left"
        />
        <div
          className="relative z-10 -mx-1.5 flex min-w-[5.6rem] shrink-0 flex-col items-center justify-center rounded-[12px] px-2 py-1.5"
          style={{
            background: "linear-gradient(180deg, #141a2c 0%, #0b1020 100%)",
            border: "1.5px solid #e8c547",
            boxShadow: "0 0 16px rgba(232,197,71,0.28)",
          }}
        >
          <p className="text-center text-[8px] font-black leading-tight tracking-[0.04em] text-[#f0d36a]">
            {t("battle.headline")}
          </p>
          <span className="mt-0.5 text-[20px] font-black tabular-nums leading-none text-white">
            {formatRemain(remainingMs)}
          </span>
          {session.suddenDeath && (
            <p className="mt-0.5 text-[7px] font-black tracking-[0.12em] text-[#f0d36a]">
              {t("battle.sudden.clock")}
            </p>
          )}
        </div>
        <HudBanner
          name={right.displayName}
          amount={formatMoney(right.scoreAmountLive, session.currency, locale)}
          items={right.scoreItems}
          crown={rightLeads}
          side="right"
        />
      </div>
      <p className="mt-0.5 text-center text-[9px] font-medium text-white/45">
        {session.suddenDeath ? t("battle.sudden.hint") : t("battle.hud.provisional")}
      </p>
    </div>
  );
}

function HudBanner({
  name,
  amount,
  items,
  crown,
  side,
}: {
  name: string;
  amount: string;
  items: number;
  crown: boolean;
  side: "left" | "right";
}) {
  const { t } = useTranslation();
  const isLeft = side === "left";
  return (
    <div
      className={`min-w-0 flex-1 px-2.5 py-1.5 ${isLeft ? "pr-4 text-left" : "pl-4 text-right"}`}
      style={{
        background: isLeft
          ? "linear-gradient(135deg, #1d4ed8 0%, #1e3a8a 100%)"
          : "linear-gradient(135deg, #e8c547 0%, #b8860b 100%)",
        clipPath: isLeft
          ? "polygon(0 0, 100% 0, 86% 100%, 0 100%)"
          : "polygon(14% 0, 100% 0, 100% 100%, 0 100%)",
        color: isLeft ? "white" : "#1a1408",
      }}
    >
      <p className="truncate text-[11px] font-black uppercase tracking-wide">
        {crown ? `${t("battle.hud.crown")} ` : ""}
        {name}
      </p>
      <p className={`text-[10px] font-semibold ${isLeft ? "text-white/70" : "text-black/55"}`}>
        {t("battle.hud.items", { count: items })}
      </p>
      <p
        className="text-[14px] font-black tabular-nums leading-tight"
        style={{ color: isLeft ? "#f6d365" : "#1a1408" }}
      >
        {amount}
      </p>
    </div>
  );
}
