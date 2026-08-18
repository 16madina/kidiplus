import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Crown } from "lucide-react";
import { Press } from "@/components/press";
import { Confetti } from "@/components/live-viewer/confetti";
import { Logo } from "@/components/brand/logo";
import { formatMoney } from "@/lib/money";
import { EASE_IOS } from "@/lib/motion";
import { BATTLE_BRAND_I18N_KEY } from "@/lib/battle-constants";
import type { BattleFighter, BattleSession } from "@/lib/battle-context";

type Phase = "logo" | "card";

function fighterHasSales(fighter: BattleFighter | null) {
  return !!fighter && (fighter.scoreAmountLive > 0 || fighter.scoreItems > 0);
}

function isLeaveReason(reason: BattleSession["endReason"]) {
  return reason === "forfeit" || reason === "disconnected" || reason === "cancelled";
}

export function BattleResultOverlay({
  open,
  session,
  onDone,
  onRematch,
  selfSellerId,
}: {
  open: boolean;
  session: BattleSession | null;
  onDone: () => void;
  onRematch?: () => void;
  selfSellerId?: string | null;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith("en") ? "en" : "fr";
  const [phase, setPhase] = useState<Phase>("logo");
  const [confetti, setConfetti] = useState(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (!open || !session) {
      setPhase("logo");
      return;
    }
    setPhase("logo");
    const card = window.setTimeout(() => {
      setPhase("card");
      setConfetti((n) => n + 1);
    }, 900);
    return () => window.clearTimeout(card);
  }, [open, session?.id]);

  if (!open || !session) return null;

  const winner: BattleFighter | null =
    session.liveWinnerSide === "a"
      ? session.sideA
      : session.liveWinnerSide === "b"
        ? session.sideB
        : null;
  const leftMidFight = isLeaveReason(session.endReason);
  const abandon = leftMidFight && !fighterHasSales(winner);
  const left: BattleFighter | null = session.forfeitSellerId
    ? session.forfeitSellerId === session.sideA.sellerId
      ? session.sideA
      : session.sideB
    : winner
      ? winner.sellerId === session.sideA.sellerId
        ? session.sideB
        : session.sideA
      : null;
  const leftName = left?.displayName ?? t("battle.result.opponentFallback");
  const youWon = !!winner && !!selfSellerId && winner.sellerId === selfSellerId;
  const showRematch = !!onRematch && !leftMidFight;
  const brand = t(BATTLE_BRAND_I18N_KEY);

  return (
    <AnimatePresence>
      <motion.div
        key={session.id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 z-[70] grid place-items-center bg-black/55 px-5"
      >
        <Confetti trigger={winner ? confetti : 0} />
        <AnimatePresence mode="wait">
          {phase === "logo" ? (
            <motion.div
              key="logo"
              initial={{ opacity: 0, scale: 0.82 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.06 }}
              transition={{ duration: 0.35, ease: EASE_IOS }}
            >
              <Logo size={72} />
            </motion.div>
          ) : (
            <motion.div
              key="card"
              initial={{ opacity: 0, scale: 0.88, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.4, ease: EASE_IOS }}
              className="relative w-full max-w-sm rounded-[28px] px-5 py-6 text-center text-white"
              style={{
                background:
                  "linear-gradient(180deg, oklch(0.28 0.06 85) 0%, #101218 100%)",
                border: "1px solid oklch(0.85 0.18 90 / 0.45)",
                boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
              }}
            >
              <p className="mb-1 text-[11px] font-black uppercase tracking-[0.18em] text-[oklch(0.85_0.18_90)]">
                {t("battle.result.heading")}
              </p>
              <p className="mb-3 text-[12px] font-semibold text-white/55">{brand}</p>
              {abandon ? (
                <>
                  <h3 className="text-[22px] font-black leading-tight">
                    {session.endReason === "forfeit"
                      ? t("battle.result.opponentForfeit", { name: leftName })
                      : t("battle.result.opponentOffline", { name: leftName })}
                  </h3>
                  <p className="mt-2 text-[16px] font-bold text-[oklch(0.85_0.18_90)]">
                    {winner
                      ? youWon
                        ? t("battle.result.forfeitWinYou")
                        : t("battle.result.forfeitWin", { name: winner.displayName })
                      : t("battle.result.challengeOver")}
                  </p>
                </>
              ) : winner ? (
                <>
                  <div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-full bg-[oklch(0.85_0.18_90)] text-[#10162B]">
                    <Crown size={28} />
                  </div>
                  <h3 className="text-[22px] font-black leading-tight">
                    {t("battle.result.win", { name: winner.displayName })}
                  </h3>
                  <p className="mt-2 text-[14px] leading-snug text-white/80">
                    {t("battle.result.scoreline", {
                      winnerAmount: formatMoney(winner.scoreAmountLive, session.currency, locale),
                      loserAmount: formatMoney(
                        (winner.sellerId === session.sideA.sellerId
                          ? session.sideB
                          : session.sideA
                        ).scoreAmountLive,
                        session.currency,
                        locale,
                      ),
                    })}
                  </p>
                  <p className="mt-2 text-[14px] font-bold text-[oklch(0.85_0.18_90)]">
                    {t("battle.result.champion", { name: winner.displayName })}
                  </p>
                </>
              ) : (
                <h3 className="text-[22px] font-black">{t("battle.result.tie")}</h3>
              )}
              {!abandon && (
                <p className="mt-4 text-[12px] leading-snug text-white/60">
                  {t("battle.result.pendingNote")}
                </p>
              )}
              {showRematch && (
                <Press
                  onClick={onRematch}
                  className="!min-h-11 mt-5 w-full rounded-full text-[14px] font-black"
                  style={{ backgroundColor: "oklch(0.85 0.18 90)", color: "#10162B" }}
                >
                  {t("battle.result.rematch")}
                </Press>
              )}
              <Press
                onClick={() => onDoneRef.current()}
                className={`!min-h-11 w-full rounded-full text-[14px] font-black ${showRematch ? "mt-2" : "mt-5"}`}
                style={{
                  backgroundColor: showRematch ? "rgba(255,255,255,0.12)" : "oklch(0.85 0.18 90)",
                  color: showRematch ? "white" : "#10162B",
                }}
              >
                {t("battle.result.continue")}
              </Press>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}
