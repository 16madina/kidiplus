// Blocked users list — Settings entry. Loads via list_my_blocks RPC.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { PushScreen } from "@/components/push-screen";
import { Press } from "@/components/press";
import { listMyBlocks, unblockUser, refreshBlockedIds, type BlockedRow } from "@/lib/moderation-db";
import { haptic } from "@/lib/haptics";

export function BlockedUsersScreen({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState<BlockedRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<BlockedRow | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void listMyBlocks().then((r) => { if (alive) setRows(r); });
    return () => { alive = false; };
  }, [open]);

  const doUnblock = async (id: string) => {
    setBusy(id); haptic.medium();
    const r = await unblockUser(id);
    setBusy(null);
    setConfirming(null);
    if (r.ok) {
      setRows((prev) => (prev ?? []).filter((x) => x.blocked_id !== id));
      void refreshBlockedIds();
      haptic.success();
      toast.success(t("block.unblocked"));
    } else {
      haptic.warning();
      toast.error(t("block.failed"));
    }
  };

  return (
    <PushScreen open={open} onClose={onClose} title={t("block.listTitle")} zIndex={75}>
      <div className="mx-auto max-w-lg px-4 py-4">
        {rows === null ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <p className="py-16 text-center text-[13px] text-muted-foreground">{t("block.empty")}</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((u) => (
              <li key={u.blocked_id} className="flex items-center gap-3 rounded-2xl border border-border p-3">
                {u.avatar_url
                  ? <img src={u.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                  : <div className="grid h-10 w-10 place-items-center rounded-full bg-muted text-[13px] font-bold">{u.display_name.slice(0,1).toUpperCase()}</div>}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold">{u.display_name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">@{u.handle} · {new Date(u.created_at).toLocaleDateString(i18n.language)}</p>
                </div>
                <Press
                  onClick={() => { haptic.selection(); setConfirming(u); }}
                  disabled={busy === u.blocked_id}
                  className="rounded-full border border-border px-3 py-1.5 text-[12px] font-semibold"
                >
                  {busy === u.blocked_id ? <Loader2 size={12} className="animate-spin" /> : t("block.unblock")}
                </Press>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Confirm sheet */}
      <AnimatePresence>
        {confirming && (
          <motion.div
            className="fixed inset-0 z-[95] flex items-end justify-center bg-black/50"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => busy ? null : setConfirming(null)}
          >
            <motion.div
              className="mx-auto w-full max-w-lg rounded-t-3xl bg-background p-4 pb-safe"
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-muted" />
              <div className="mb-3 flex items-center gap-3">
                {confirming.avatar_url
                  ? <img src={confirming.avatar_url} alt="" className="h-12 w-12 rounded-full object-cover" />
                  : <div className="grid h-12 w-12 place-items-center rounded-full bg-muted text-[15px] font-bold">{confirming.display_name.slice(0,1).toUpperCase()}</div>}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-bold">{confirming.display_name}</p>
                  <p className="truncate text-[12px] text-muted-foreground">@{confirming.handle}</p>
                </div>
              </div>
              <h2 className="text-[17px] font-bold">{t("block.unblockConfirmTitle")}</h2>
              <p className="mt-1 text-[13px] text-muted-foreground">{t("block.unblockConfirmBody")}</p>

              <div className="mt-4 flex gap-2">
                <Press
                  onClick={() => setConfirming(null)}
                  disabled={!!busy}
                  className="!min-h-12 h-12 flex-1 rounded-2xl border border-border text-[15px] font-semibold"
                >
                  {t("block.cancel")}
                </Press>
                <Press
                  onClick={() => doUnblock(confirming.blocked_id)}
                  disabled={!!busy}
                  className="!min-h-12 h-12 flex-1 rounded-2xl bg-foreground text-[15px] font-bold text-background"
                >
                  {busy ? <Loader2 size={16} className="mx-auto animate-spin" /> : t("block.unblockConfirmCta")}
                </Press>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </PushScreen>
  );
}
