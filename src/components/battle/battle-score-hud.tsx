import { useTranslation } from "react-i18next";
import { Press } from "@/components/press";
import { formatMoney } from "@/lib/money";
import type { BattleSession } from "@/lib/battle-context";
import { haptic } from "@/lib/haptics";

function formatRemain(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function BattleScoreHud({
  session,
  remainingMs,
  turnRemainingMs = 0,
  turnName,
  onForfeit,
}: {
  session: BattleSession;
  remainingMs: number;
  turnRemainingMs?: number;
  turnName?: string | null;
  onForfeit?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith("en") ? "en" : "fr";
  const a = session.sideA;
  const b = session.sideB;
  const aLeads = a.scoreAmountLive > b.scoreAmountLive;
  const bLeads = b.scoreAmountLive > a.scoreAmountLive;

  return (
    <div className="pointer-events-none px-3">
      <div
        className="overflow-hidden rounded-[20px] text-white"
        style={{
          backgroundColor: "rgba(8,8,12,0.48)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-1 px-3 pt-2">
          <HudCol
            name={a.displayName}
            amount={formatMoney(a.scoreAmountLive, session.currency, locale)}
            items={a.scoreItems}
            crown={aLeads}
            align="left"
          />
          <div className="flex min-w-[7.5rem] flex-col items-center px-1 pt-0.5">
            <p className="text-center text-[9px] font-black leading-tight tracking-[0.12em] text-[oklch(0.85_0.18_90)]">
              {t("battle.hud.banner")}
            </p>
            <span className="mt-1 text-[18px] font-black tabular-nums leading-none">
              {session.suddenDeath ? t("battle.sudden.clock") : formatRemain(remainingMs)}
            </span>
          </div>
          <HudCol
            name={b.displayName}
            amount={formatMoney(b.scoreAmountLive, session.currency, locale)}
            items={b.scoreItems}
            crown={bLeads}
            align="right"
          />
        </div>
        <div className="flex items-center justify-center gap-2 px-3 pb-1.5 pt-1 text-[10px] text-white/55">
          {session.suddenDeath ? (
            <span className="font-bold text-[oklch(0.85_0.18_90)]">{t("battle.sudden.hint")}</span>
          ) : turnName ? (
            <span>
              {t("battle.turn.now", { name: turnName, time: formatRemain(turnRemainingMs) })}
            </span>
          ) : null}
          <span>·</span>
          <span>{t("battle.hud.provisional")}</span>
          {onForfeit && (
            <Press
              onClick={() => {
                haptic.warning();
                onForfeit();
              }}
              className="pointer-events-auto !min-h-0 ml-1 text-[10px] font-semibold text-white/45 underline-offset-2"
            >
              {t("battle.hud.leave")}
            </Press>
          )}
        </div>
      </div>
    </div>
  );
}

function HudCol({
  name,
  amount,
  items,
  crown,
  align,
}: {
  name: string;
  amount: string;
  items: number;
  crown: boolean;
  align: "left" | "right";
}) {
  const { t } = useTranslation();
  return (
    <div className={align === "right" ? "text-right" : "text-left"}>
      <p className="truncate text-[11px] font-black uppercase tracking-wide text-white">
        {crown ? `${t("battle.hud.crown")} ` : ""}
        {name}
      </p>
      <p className="text-[10px] text-white/55">{t("battle.hud.items", { count: items })}</p>
      <p
        className="text-[15px] font-black tabular-nums leading-tight"
        style={{ color: crown ? "oklch(0.88 0.16 90)" : "white" }}
      >
        {amount}
      </p>
    </div>
  );
}
