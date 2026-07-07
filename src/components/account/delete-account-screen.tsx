// DeleteAccountScreen — 2-step confirmation + call to /api/account/delete.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AlertTriangle, Loader2 } from "lucide-react";
import { PushScreen } from "@/components/push-screen";
import { Press } from "@/components/press";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { accountDeletionCheck } from "@/lib/moderation-db";
import { formatMoney, normalizeCurrency } from "@/lib/money";
import { haptic } from "@/lib/haptics";

export function DeleteAccountScreen({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const { signOut } = useAuth();
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [check, setCheck] = useState<any>(null);
  const [loadingCheck, setLoadingCheck] = useState(true);

  useEffect(() => {
    if (!open) { setConfirmText(""); return; }
    setLoadingCheck(true);
    void accountDeletionCheck().then((r) => { setCheck(r); setLoadingCheck(false); });
  }, [open]);

  const doDelete = async () => {
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { toast.error(t("account.delete.unauthorized")); setBusy(false); return; }
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (body?.error === "has_blockers") {
          toast.error(t("account.delete.hasBlockers"));
        } else {
          toast.error(body?.error ?? t("account.delete.failed"));
        }
        setBusy(false);
        return;
      }
      haptic.success();
      toast.success(t("account.delete.done"));
      await signOut();
    } catch {
      toast.error(t("account.delete.failed"));
      setBusy(false);
    }
  };

  const hasBlockers = check?.ok && check.has_blockers;

  return (
    <PushScreen open={open} onClose={onClose} title={t("account.delete.title")} zIndex={80}>
      <div className="mx-auto max-w-lg space-y-4 px-4 py-4">
        <div className="flex items-start gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-3">
          <AlertTriangle className="mt-0.5 shrink-0 text-destructive" size={18} />
          <div>
            <p className="text-[14px] font-bold text-destructive">{t("account.delete.warnTitle")}</p>
            <p className="mt-1 text-[12.5px] text-foreground/90">{t("account.delete.warnBody")}</p>
          </div>
        </div>

        <ul className="space-y-1.5 rounded-2xl border border-border p-3 text-[12.5px] text-foreground/90">
          <li>• {t("account.delete.effect.profile")}</li>
          <li>• {t("account.delete.effect.lives")}</li>
          <li>• {t("account.delete.effect.messages")}</li>
          <li>• {t("account.delete.effect.wallet")}</li>
          <li>• {t("account.delete.effect.orders")}</li>
        </ul>

        {loadingCheck ? (
          <div className="flex justify-center py-4"><Loader2 className="animate-spin text-muted-foreground" /></div>
        ) : hasBlockers ? (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-3 text-[12.5px]">
            <p className="mb-2 font-bold">{t("account.delete.blockersTitle")}</p>
            <ul className="space-y-1 text-foreground/90">
              {Number(check.wallet_balance) > 0 && (
                <li>• {t("account.delete.blockers.wallet", {
                  amount: formatMoney(Number(check.wallet_balance), normalizeCurrency("EUR"), i18n.language),
                })}</li>
              )}
              {Number(check.pending_payouts) > 0 && <li>• {t("account.delete.blockers.payouts")}</li>}
              {Number(check.pending_orders) > 0 && <li>• {t("account.delete.blockers.orders")}</li>}
              {Number(check.live_now) > 0 && <li>• {t("account.delete.blockers.live")}</li>}
            </ul>
          </div>
        ) : null}

        <div>
          <label className="mb-1.5 block text-[12px] font-semibold text-muted-foreground">
            {t("account.delete.typeConfirmLabel")}
          </label>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE"
            autoCapitalize="characters"
            className="w-full rounded-2xl border border-border bg-transparent p-3 text-[14px] font-mono outline-none focus:border-foreground"
          />
        </div>

        <Press
          onClick={doDelete}
          disabled={busy || confirmText.trim() !== "DELETE" || hasBlockers}
          className="!min-h-12 h-12 w-full rounded-2xl bg-destructive text-[15px] font-bold text-destructive-foreground"
          style={{ opacity: busy || confirmText.trim() !== "DELETE" || hasBlockers ? 0.5 : 1 }}
        >
          {busy ? <Loader2 className="mx-auto animate-spin" size={16} /> : t("account.delete.confirmBtn")}
        </Press>

        <Press onClick={onClose} className="!min-h-11 h-11 w-full rounded-2xl border border-border text-[13px] font-semibold">
          {t("common.cancel")}
        </Press>
      </div>
    </PushScreen>
  );
}
