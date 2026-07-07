// Blocked users list — Settings entry. Loads via list_my_blocks RPC.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { PushScreen } from "@/components/push-screen";
import { Press } from "@/components/press";
import { listMyBlocks, unblockUser, refreshBlockedIds, type BlockedRow } from "@/lib/moderation-db";
import { haptic } from "@/lib/haptics";

export function BlockedUsersScreen({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState<BlockedRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void listMyBlocks().then((r) => { if (alive) setRows(r); });
    return () => { alive = false; };
  }, [open]);

  const unblock = async (id: string) => {
    setBusy(id); haptic.medium();
    const r = await unblockUser(id);
    setBusy(null);
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
                  onClick={() => unblock(u.blocked_id)}
                  className="rounded-full border border-border px-3 py-1.5 text-[12px] font-semibold"
                >
                  {busy === u.blocked_id ? <Loader2 size={12} className="animate-spin" /> : t("block.unblock")}
                </Press>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PushScreen>
  );
}
