import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Swords } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Press } from "@/components/press";
import { haptic } from "@/lib/haptics";
import { EASE_IOS } from "@/lib/motion";
import { registerOverlay } from "@/components/push-screen";
import {
  BATTLE_BRAND_I18N_KEY,
  BATTLE_DEFAULT_DURATION_SEC,
  BATTLE_DURATIONS_SEC,
  BATTLE_PROTO_DEMO_SEC,
} from "@/lib/battle-constants";
import type { IncomingBattleInvite } from "@/lib/battle-context";

function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${s}s`;
}

export function BattleIncomingInviteSheet({
  invite,
  onAccept,
  onDecline,
}: {
  invite: IncomingBattleInvite | null;
  onAccept: (durationSec: number) => void;
  onDecline: () => void;
}) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  const [durationSec, setDurationSec] = useState<number>(
    invite?.durationSec ?? BATTLE_DEFAULT_DURATION_SEC,
  );

  useEffect(() => {
    setDurationSec(invite?.durationSec ?? BATTLE_DEFAULT_DURATION_SEC);
  }, [invite?.id, invite?.durationSec]);

  useEffect(() => {
    if (!invite) return;
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [invite]);

  useEffect(() => {
    if (!invite) return;
    return registerOverlay(onDecline, 98);
  }, [invite, onDecline]);

  const leftMs = invite ? invite.expiresAt - now : 0;
  const brand = t(BATTLE_BRAND_I18N_KEY);

  const node = (
    <AnimatePresence>
      {invite && (
        <motion.div
          key={invite.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: EASE_IOS }}
          className="fixed inset-0 z-[98] grid place-items-end bg-black/55 px-4"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 18px)" }}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ duration: 0.28, ease: EASE_IOS }}
            className="w-full max-w-lg rounded-[28px] p-5 text-white"
            style={{
              background:
                "linear-gradient(180deg, rgba(28,18,8,0.96) 0%, rgba(10,10,16,0.98) 100%)",
              border: "1px solid rgba(255,210,70,0.28)",
              boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
            }}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Swords size={16} className="text-[oklch(0.85_0.18_90)]" />
                <p className="text-[12px] font-black uppercase tracking-wide text-[oklch(0.85_0.18_90)]">
                  {brand}
                </p>
              </div>
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-[12px] font-bold tabular-nums">
                {formatCountdown(leftMs)}
              </span>
            </div>

            <div className="mb-4 flex items-center gap-3">
              {invite.fromAvatarUrl ? (
                <img
                  src={invite.fromAvatarUrl}
                  alt=""
                  className="h-14 w-14 rounded-full object-cover"
                />
              ) : (
                <div className="grid h-14 w-14 place-items-center rounded-full bg-white/15 text-[18px] font-black">
                  {(invite.fromName.trim()[0] ?? "?").toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-[18px] font-black leading-tight">
                  {t("battle.incoming.title", { name: invite.fromName })}
                </p>
                {invite.fromHandle && (
                  <p className="text-[13px] text-white/50">@{invite.fromHandle}</p>
                )}
                <p className="mt-1 text-[13px] leading-snug text-white/70">
                  {t("battle.incoming.body", {
                    count: Math.max(1, Math.round(durationSec / 60)),
                  })}
                </p>
                <p className="mt-1 text-[13px] font-semibold text-white/85">
                  {t("battle.incoming.ask")}
                </p>
              </div>
            </div>

            {invite.prototypePreview && (
              <p className="mb-3 rounded-xl bg-white/8 px-3 py-2 text-[11px] leading-snug text-white/60">
                {t("battle.incoming.prototypeHint")}
              </p>
            )}

            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/45">
              {t("battle.invite.duration")}
            </p>
            <div className="mb-4 flex flex-wrap gap-1.5">
              <Press
                onClick={() => {
                  haptic.selection();
                  setDurationSec(BATTLE_PROTO_DEMO_SEC);
                }}
                className="!min-h-9 rounded-full px-3 text-[12px] font-bold"
                style={{
                  backgroundColor:
                    durationSec === BATTLE_PROTO_DEMO_SEC
                      ? "oklch(0.85 0.18 90)"
                      : "rgba(255,255,255,0.1)",
                  color: durationSec === BATTLE_PROTO_DEMO_SEC ? "#10162B" : "white",
                }}
              >
                {t("battle.duration.demo")}
              </Press>
              {BATTLE_DURATIONS_SEC.map((sec) => (
                <Press
                  key={sec}
                  onClick={() => {
                    haptic.selection();
                    setDurationSec(sec);
                  }}
                  className="!min-h-9 flex-1 rounded-full text-[12px] font-bold"
                  style={{
                    backgroundColor:
                      durationSec === sec ? "oklch(0.85 0.18 90)" : "rgba(255,255,255,0.1)",
                    color: durationSec === sec ? "#10162B" : "white",
                  }}
                >
                  {t("battle.duration.min", { count: sec / 60 })}
                </Press>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Press
                onClick={() => {
                  haptic.warning();
                  onDecline();
                }}
                className="!min-h-12 rounded-full text-[15px] font-bold"
                style={{ backgroundColor: "rgba(255,255,255,0.1)" }}
              >
                {t("battle.incoming.decline")}
              </Press>
              <Press
                onClick={() => {
                  haptic.success();
                  onAccept(durationSec);
                }}
                className="!min-h-12 rounded-full text-[15px] font-black"
                style={{ backgroundColor: "oklch(0.85 0.18 90)", color: "#10162B" }}
              >
                {t("battle.incoming.accept")}
              </Press>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (typeof document === "undefined") return null;
  return createPortal(node, document.body);
}
