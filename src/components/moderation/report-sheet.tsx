// ReportSheet — reason picker + optional note.
// Bottom sheet, used from live viewer / chat / user profile.

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2, X } from "lucide-react";
import { Press } from "@/components/press";
import { submitReport, type ReportReason, type ReportTargetType } from "@/lib/moderation-db";
import { haptic } from "@/lib/haptics";

const REASONS: ReportReason[] = ["inappropriate", "fraud", "counterfeit", "harassment", "other"];

export function ReportSheet({
  open, onClose, targetType, targetId, defaultReason, defaultNote,
}: {
  open: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  targetId: string;
  defaultReason?: ReportReason;
  defaultNote?: string;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState<ReportReason | null>(defaultReason ?? null);
  const [note, setNote] = useState(defaultNote ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setReason(defaultReason ?? null);
      setNote(defaultNote ?? "");
      setBusy(false);
    }
  }, [open, defaultReason, defaultNote]);

  const submit = async () => {
    if (!reason) return;
    setBusy(true);
    const r = await submitReport(targetType, targetId, reason, note.trim() || undefined);
    setBusy(false);
    if (r.ok) {
      haptic.success();
      toast.success(t("report.sent"));
      setReason(defaultReason ?? null);
      setNote(defaultNote ?? "");
      onClose();
    } else {
      haptic.warning();
      toast.error(t("report.failed"));
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="mx-auto w-full max-w-lg rounded-t-3xl bg-background p-4 pb-safe"
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted" />
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[17px] font-bold">
                {targetType === "live" ? t("report.titleLive") : t("report.title")}
              </h2>
              <Press onClick={onClose} className="h-9 w-9 rounded-full"><X size={18} /></Press>
            </div>
            <p className="mb-3 text-[12px] text-muted-foreground">
              {targetType === "live" ? t("report.subtitlePrefilled") : t("report.subtitle")}
            </p>

            <div className="mb-3 grid grid-cols-2 gap-2">
              {REASONS.map((r) => {
                const active = reason === r;
                return (
                  <Press
                    key={r}
                    onClick={() => { haptic.selection(); setReason(r); }}
                    className={`rounded-2xl border py-3 text-[13px] font-semibold ${
                      active ? "border-foreground bg-foreground text-background" : "border-border"
                    }`}
                  >
                    {t(`report.reasons.${r}`)}
                  </Press>
                );
              })}
            </div>

            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("report.notePh")}
              maxLength={500}
              rows={3}
              className="mb-3 w-full resize-none rounded-2xl border border-border bg-transparent p-3 text-[14px] outline-none focus:border-foreground"
            />

            <Press
              onClick={submit}
              disabled={!reason || busy}
              className="!min-h-12 h-12 w-full rounded-2xl bg-foreground text-[15px] font-bold text-background"
              style={{ opacity: !reason || busy ? 0.5 : 1 }}
            >
              {busy ? <Loader2 className="mx-auto animate-spin" size={16} /> : t("report.submit")}
            </Press>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
