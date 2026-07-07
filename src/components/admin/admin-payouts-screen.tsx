// AdminPayoutsScreen — payout requests management for admins.
// Oldest first. Realtime. Copyable destination. Confirm before rejecting.

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Copy, Check, X, Loader2 } from "lucide-react";
import { PushScreen } from "@/components/push-screen";
import { Press } from "@/components/press";
import { formatMoney } from "@/lib/money";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchAllPayouts,
  subscribeAllPayouts,
  adminProcessPayout,
  type PayoutRow,
} from "@/lib/earnings-db";
import { haptic } from "@/lib/haptics";

type HandleMap = Record<string, string>;

export function AdminPayoutsScreen({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [handles, setHandles] = useState<HandleMap>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const load = async () => {
      const rows = await fetchAllPayouts();
      if (!alive) return;
      setPayouts(rows);
      const ids = Array.from(new Set(rows.map((r) => r.seller_id)));
      if (ids.length > 0) {
        const { data } = await supabase.from("profiles").select("id, handle").in("id", ids);
        const m: HandleMap = {};
        for (const p of data ?? []) m[p.id] = p.handle;
        if (alive) setHandles(m);
      }
    };
    void load();
    const unsub = subscribeAllPayouts(() => void load());
    return () => {
      alive = false;
      unsub();
    };
  }, [open]);

  const pending = useMemo(() => payouts.filter((p) => p.status === "requested" || p.status === "processing"), [payouts]);
  const paidThisMonth = useMemo(() => {
    const now = new Date();
    return payouts.filter(
      (p) =>
        p.status === "paid" &&
        p.processed_at &&
        new Date(p.processed_at).getMonth() === now.getMonth() &&
        new Date(p.processed_at).getFullYear() === now.getFullYear(),
    );
  }, [payouts]);

  const act = async (id: string, action: "paid" | "rejected") => {
    setBusy(id);
    haptic.medium();
    const r = await adminProcessPayout(id, action);
    setBusy(null);
    if (r.ok) {
      haptic.success();
      toast.success(t(action === "paid" ? "admin.markedPaid" : "admin.markedRejected"));
    } else {
      haptic.warning();
      toast.error(r.error);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("common.copied"));
    } catch {
      /* ignore */
    }
  };

  return (
    <PushScreen open={open} onClose={onClose} title={t("admin.title")} zIndex={65}>
      <div className="px-4 py-4">
        <div className="mb-4 grid grid-cols-2 gap-2">
          <Counter label={t("admin.pending")} value={pending.length} />
          <Counter label={t("admin.paidThisMonth")} value={paidThisMonth.length} />
        </div>

        {payouts.length === 0 ? (
          <p className="py-16 text-center text-[13px] text-muted-foreground">{t("admin.empty")}</p>
        ) : (
          <ul className="space-y-2">
            {payouts.map((p) => {
              const isActionable = p.status === "requested" || p.status === "processing";
              const destText = Object.entries(p.destination)
                .map(([k, v]) => `${k}: ${v}`)
                .join("\n");
              return (
                <motion.li
                  key={p.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl border border-border p-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[14px] font-semibold">
                        @{handles[p.seller_id] ?? p.seller_id.slice(0, 8)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(p.requested_at).toLocaleString(i18n.language)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[15px] font-bold tabular-nums">
                        {formatMoney(Number(p.amount), p.currency, i18n.language)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {t(`payout.method.${p.method}`)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => copy(destText)}
                    className="mt-2 flex w-full items-start justify-between gap-2 rounded-xl bg-muted p-2 text-left"
                  >
                    <pre className="whitespace-pre-wrap break-all text-[11px] text-muted-foreground">
                      {destText}
                    </pre>
                    <Copy size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
                  </button>
                  {isActionable ? (
                    <div className="mt-2 flex gap-2">
                      <Press
                        onClick={() => act(p.id, "paid")}
                        className="flex-1 rounded-xl py-2 text-[13px] font-bold text-white"
                        style={{ backgroundColor: "oklch(0.62 0.16 155)" }}
                      >
                        {busy === p.id ? <Loader2 className="mx-auto animate-spin" size={14} /> : (
                          <span className="inline-flex items-center gap-1"><Check size={14} />{t("admin.markPaid")}</span>
                        )}
                      </Press>
                      <Press
                        onClick={() => {
                          if (confirm(t("admin.confirmReject"))) void act(p.id, "rejected");
                        }}
                        className="flex-1 rounded-xl border py-2 text-[13px] font-bold"
                      >
                        <span className="inline-flex items-center gap-1"><X size={14} />{t("admin.reject")}</span>
                      </Press>
                    </div>
                  ) : (
                    <p className="mt-2 text-right text-[11px] font-semibold uppercase text-muted-foreground">
                      {t(`payout.status.${p.status}`)}
                    </p>
                  )}
                </motion.li>
              );
            })}
          </ul>
        )}
      </div>
    </PushScreen>
  );
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border p-3 text-center">
      <p className="text-[22px] font-bold tabular-nums">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
