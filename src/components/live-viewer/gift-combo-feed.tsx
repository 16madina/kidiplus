// TikTok-style gift combo feed: stacked chips showing sender + gift + xN.
// Same sender+gift within a short window increments the combo.
// Placed mid-screen (above the gift tray) so the sender always sees it.
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { giftByKey } from "@/lib/gifts";
import { EASE_IOS } from "@/lib/motion";
import type { GiftEvt } from "@/lib/live-room";

type ComboRow = {
  rowId: string;
  senderId: string;
  senderName: string;
  giftKey: string;
  count: number;
  bump: number;
};

const COMBO_WINDOW_MS = 4_000;
const ROW_TTL_MS = 5_500;
const MAX_ROWS = 3;

export function GiftComboFeed({
  trigger,
}: {
  trigger: GiftEvt | null;
}) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ComboRow[]>([]);
  const lastKeyRef = useRef<string | null>(null);
  const lastAtRef = useRef(0);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) clearTimeout(timer);
      timersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!trigger?.id) return;

    const comboKey = `${trigger.senderId}:${trigger.giftKey}`;
    const now = Date.now();
    const canCombo =
      lastKeyRef.current === comboKey && now - lastAtRef.current < COMBO_WINDOW_MS;
    lastKeyRef.current = comboKey;
    lastAtRef.current = now;

    setRows((prev) => {
      let next = [...prev];
      const existingIdx = canCombo
        ? next.findIndex(
            (r) => r.senderId === trigger.senderId && r.giftKey === trigger.giftKey,
          )
        : -1;

      let rowId: string;
      if (existingIdx >= 0) {
        const cur = next[existingIdx];
        rowId = cur.rowId;
        next[existingIdx] = {
          ...cur,
          senderName: trigger.senderName || cur.senderName,
          count: cur.count + 1,
          bump: cur.bump + 1,
        };
        const [row] = next.splice(existingIdx, 1);
        next = [row, ...next];
      } else {
        rowId = trigger.id;
        next = [
          {
            rowId,
            senderId: trigger.senderId,
            senderName: trigger.senderName || "invité",
            giftKey: trigger.giftKey,
            count: 1,
            bump: 0,
          },
          ...next,
        ].slice(0, MAX_ROWS);
      }

      const prevTimer = timersRef.current.get(rowId);
      if (prevTimer) clearTimeout(prevTimer);
      timersRef.current.set(
        rowId,
        setTimeout(() => {
          timersRef.current.delete(rowId);
          setRows((cur) => cur.filter((r) => r.rowId !== rowId));
        }, ROW_TTL_MS),
      );

      return next;
    });
  }, [trigger?.id]);

  return (
    <div
      className="pointer-events-none absolute left-3 z-[85] flex w-[min(72%,280px)] -translate-y-1/2 flex-col gap-1.5"
      style={{ top: "42%" }}
      aria-hidden
    >
      <AnimatePresence initial={false}>
        {rows.map((row) => {
          const g = giftByKey(row.giftKey);
          const emoji = g?.emoji ?? "🎁";
          const giftName = g
            ? t(g.nameKey, { defaultValue: g.key })
            : t("gifts.title", "Cadeau");
          return (
            <motion.div
              key={row.rowId}
              layout
              initial={{ opacity: 0, x: -48, scale: 0.92 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -32, scale: 0.95, transition: { duration: 0.25 } }}
              transition={{ duration: 0.28, ease: EASE_IOS }}
              className="flex items-center gap-2 self-start rounded-full py-1 pl-1.5 pr-2.5"
              style={{
                background:
                  "linear-gradient(90deg, rgba(0,0,0,0.72), rgba(0,0,0,0.45))",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                border: "1px solid rgba(255,255,255,0.14)",
                boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
              }}
            >
              <span
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[18px] leading-none"
                style={{
                  background:
                    "linear-gradient(145deg, oklch(0.78 0.14 85 / 0.35), oklch(0.55 0.12 320 / 0.4))",
                }}
              >
                {emoji}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-bold leading-tight text-white">
                  {row.senderName}
                </div>
                <div className="truncate text-[10px] font-medium leading-tight text-white/70">
                  {giftName}
                </div>
              </div>
              <motion.span
                key={row.bump}
                initial={{ scale: 1.45, opacity: 0.6 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.22, ease: EASE_IOS }}
                className="shrink-0 text-[16px] font-black tabular-nums text-white"
                style={{
                  textShadow: "0 1px 4px rgba(0,0,0,0.55)",
                  color: row.count > 1 ? "oklch(0.9 0.18 85)" : "white",
                }}
              >
                x{row.count}
              </motion.span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
