// Sanction sheet: choose type (warning/suspension/ban) + reason + optional note.
// Used from admin reports tab and from admin user detail drawer.

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AlertTriangle, Ban, Clock, Loader2, ShieldAlert } from "lucide-react";
import { PushScreen } from "@/components/push-screen";
import { Press } from "@/components/press";
import { haptic } from "@/lib/haptics";
import {
  adminIssueSanction,
  SUSPENSION_DURATIONS,
  type SanctionType,
} from "@/lib/moderation-admin";

export function SanctionSheet({
  open,
  onClose,
  onDone,
  targetUserId,
  targetHandle,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  targetUserId: string | null;
  targetHandle?: string | null;
}) {
  const { t } = useTranslation();
  const [type, setType] = useState<SanctionType>("warning");
  const [durationKey, setDurationKey] = useState<string>("24h");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmBan, setConfirmBan] = useState(false);

  useEffect(() => {
    if (!open) return;
    setType("warning"); setDurationKey("24h"); setReason(""); setNote(""); setConfirmBan(false);
  }, [open, targetUserId]);

  const expiresAt = useMemo(() => {
    if (type !== "suspension") return null;
    const d = SUSPENSION_DURATIONS.find((x) => x.key === durationKey);
    if (!d) return null;
    return new Date(Date.now() + d.ms).toISOString();
  }, [type, durationKey]);

  const canSubmit = !!targetUserId && reason.trim().length >= 3 && (type !== "ban" || confirmBan);

  const submit = async () => {
    if (!targetUserId || !canSubmit) return;
    setBusy(true);
    const r = await adminIssueSanction({
      userId: targetUserId, type, reason: reason.trim(),
      note: note.trim() || null, expiresAt,
    });
    setBusy(false);
    if (r.ok) {
      haptic.success();
      toast.success(t("moderation.sanction.done"));
      onDone();
    } else {
      haptic.warning();
      toast.error(r.error ?? t("moderation.sanction.failed"));
    }
  };

  return (
    <PushScreen open={open} onClose={onClose} title={t("moderation.sanction.title")} zIndex={90}>
      <div className="space-y-4 px-4 py-4">
        {targetHandle && (
          <p className="rounded-2xl border border-border p-3 text-[13px]">
            {t("moderation.sanction.for")} <b>@{targetHandle}</b>
          </p>
        )}

        {/* Type */}
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("moderation.sanction.type")}
          </p>
          <div className="grid grid-cols-3 gap-2">
            <TypeTile
              icon={<AlertTriangle size={16} />} label={t("moderation.types.warning")}
              active={type === "warning"} onClick={() => setType("warning")}
              color="oklch(0.7 0.16 90)"
            />
            <TypeTile
              icon={<Clock size={16} />} label={t("moderation.types.suspension")}
              active={type === "suspension"} onClick={() => setType("suspension")}
              color="oklch(0.62 0.18 60)"
            />
            <TypeTile
              icon={<Ban size={16} />} label={t("moderation.types.ban")}
              active={type === "ban"} onClick={() => setType("ban")}
              color="oklch(0.55 0.2 27)"
            />
          </div>
        </div>

        {type === "suspension" && (
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("moderation.sanction.duration")}
            </p>
            <div className="flex gap-2">
              {SUSPENSION_DURATIONS.map((d) => (
                <Press key={d.key} onClick={() => setDurationKey(d.key)}
                  className={`flex-1 rounded-xl border py-2 text-[12px] font-semibold ${durationKey === d.key ? "bg-foreground text-background" : ""}`}>
                  {t(d.labelKey)}
                </Press>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-[12px] font-semibold">
            {t("moderation.sanction.reason")} <span className="text-red-500">*</span>
          </label>
          <textarea
            value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500}
            placeholder={t("moderation.sanction.reasonPh")}
            className="w-full resize-none rounded-2xl border border-border bg-background p-3 text-[13px] outline-none"
          />
          <p className="mt-1 text-[10px] text-muted-foreground">{t("moderation.sanction.reasonHint")}</p>
        </div>

        <div>
          <label className="mb-1.5 block text-[12px] font-semibold">
            {t("moderation.sanction.internalNote")}
          </label>
          <textarea
            value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500}
            placeholder={t("moderation.sanction.internalNotePh")}
            className="w-full resize-none rounded-2xl border border-border bg-background p-3 text-[13px] outline-none"
          />
        </div>

        {/* Recap */}
        <div className="rounded-2xl bg-muted p-3 text-[12px]">
          <p className="font-semibold">{t("moderation.sanction.recap")}</p>
          <p className="mt-1 text-muted-foreground">
            {t(`moderation.types.${type}`)}
            {type === "suspension" && expiresAt && ` — ${t("moderation.sanction.until")} ${new Date(expiresAt).toLocaleString()}`}
          </p>
        </div>

        {type === "ban" && (
          <label className="flex items-start gap-2 rounded-2xl border p-3 text-[12px]"
            style={{ borderColor: "oklch(0.55 0.2 27 / 0.5)", backgroundColor: "oklch(0.55 0.2 27 / 0.08)" }}>
            <input type="checkbox" checked={confirmBan} onChange={(e) => setConfirmBan(e.target.checked)} className="mt-0.5" />
            <span style={{ color: "oklch(0.5 0.2 27)" }} className="font-semibold">
              <ShieldAlert size={14} className="inline mr-1" />
              {t("moderation.sanction.banConfirm")}
            </span>
          </label>
        )}

        <Press
          onClick={submit}
          disabled={!canSubmit || busy}
          className="w-full rounded-2xl py-3 text-[15px] font-bold text-white disabled:opacity-40"
          style={{
            backgroundColor: type === "ban" ? "oklch(0.55 0.2 27)"
              : type === "suspension" ? "oklch(0.62 0.18 60)"
              : "oklch(0.5 0.15 260)",
          }}
        >
          {busy ? <Loader2 className="mx-auto animate-spin" size={16} /> : t("moderation.sanction.apply")}
        </Press>
      </div>
    </PushScreen>
  );
}

function TypeTile({ icon, label, active, onClick, color }: {
  icon: React.ReactNode; label: string; active: boolean; onClick: () => void; color: string;
}) {
  return (
    <Press onClick={onClick}
      className="flex flex-col items-center gap-1 rounded-2xl border p-2.5 text-[11px] font-semibold"
      style={{
        borderColor: active ? color : "var(--border)",
        backgroundColor: active ? `color-mix(in oklch, ${color} 15%, transparent)` : "transparent",
        color: active ? color : undefined,
      }}>
      {icon}<span>{label}</span>
    </Press>
  );
}
