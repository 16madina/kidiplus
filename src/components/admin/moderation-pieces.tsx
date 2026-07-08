// Admin Reports tab + Compose message + Sanctions history + Lives end control.
// Modular pieces plugged into AdminDashboardScreen.

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AlertTriangle, Ban, CheckCircle, Clock, Loader2, MessageSquare, Send, ShieldOff, X } from "lucide-react";
import { PushScreen } from "@/components/push-screen";
import { Press } from "@/components/press";
import { haptic } from "@/lib/haptics";
import {
  adminEndLive,
  adminResolveReport,
  adminRevokeSanction,
  adminSendMessage,
  fetchAdminReports,
  fetchUserSanctions,
  type ReportRow,
  type SanctionRow,
} from "@/lib/moderation-admin";
import { adminReleaseEscrow, adminRefundOrder, releaseOverdueEscrow } from "@/lib/escrow-db";
import { SanctionSheet } from "./sanction-sheet";

// -------- Reports Tab --------

export function ReportsTab({
  onOpenUser,
}: {
  onOpenUser?: (userId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState<string | null>("open");
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sanctionTarget, setSanctionTarget] = useState<{ userId: string; handle: string | null; reportId: string } | null>(null);
  const [rejectReport, setRejectReport] = useState<ReportRow | null>(null);

  const load = async () => {
    setLoading(true);
    await releaseOverdueEscrow().catch(() => null);
    setRows(await fetchAdminReports(status));
    setLoading(false);
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [status]);

  const filters: Array<{ v: string | null; k: string }> = [
    { v: "open", k: "moderation.reports.filter.open" },
    { v: "actioned", k: "moderation.reports.filter.actioned" },
    { v: "dismissed", k: "moderation.reports.filter.dismissed" },
    { v: null, k: "moderation.reports.filter.all" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {filters.map((f) => (
          <Press key={f.v ?? "all"} onClick={() => setStatus(f.v)}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold ${status === f.v ? "bg-foreground text-background" : "bg-muted"}`}>
            {t(f.k)}
          </Press>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />)}</div>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-border p-8 text-center text-[13px] text-muted-foreground">{t("moderation.reports.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded-2xl border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px]">
                    <span className="font-semibold">@{r.reporter_handle ?? "?"}</span>{" "}
                    <span className="text-muted-foreground">{t("moderation.reports.reported")}</span>{" "}
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase">{t(`moderation.targetType.${r.target_type}`)}</span>
                  </p>
                  {r.target_label && (
                    <p className="mt-1 truncate text-[12px] font-semibold">
                      {r.target_type === "user" ? "@" : ""}{r.target_label}
                    </p>
                  )}
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {t(`report.reasons.${r.reason}`, { defaultValue: r.reason })}
                    {r.note && ` — ${r.note}`}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleString(i18n.language)}</p>
                </div>
                <StatusPill status={r.status} />
              </div>

              {r.status === "open" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {r.target_type === "order" && (
                    <>
                      <Press
                        onClick={async () => {
                          haptic.medium();
                          const rr = await adminReleaseEscrow(r.target_id);
                          if (!rr.ok) { toast.error(rr.error); return; }
                          toast.success(t("dispute.released"));
                          await load();
                        }}
                        className="rounded-xl px-3 py-1.5 text-[12px] font-bold text-white"
                        style={{ backgroundColor: "oklch(0.55 0.18 155)" }}
                      >
                        {t("dispute.release")}
                      </Press>
                      <Press
                        onClick={async () => {
                          haptic.medium();
                          const rr = await adminRefundOrder(r.target_id);
                          if (!rr.ok) { toast.error(rr.error); return; }
                          toast.success(
                            rr.refund_status === "refunded_wallet"
                              ? t("dispute.refundedWallet")
                              : t("dispute.refunded") + " — " + t("dispute.refundManualNote"),
                          );
                          await load();
                        }}
                        className="rounded-xl px-3 py-1.5 text-[12px] font-bold text-white"
                        style={{ backgroundColor: "oklch(0.55 0.2 27)" }}
                      >
                        {t("dispute.refund")}
                      </Press>
                    </>
                  )}
                  {r.target_type !== "order" && r.target_user_id && onOpenUser && (
                    <Press onClick={() => onOpenUser(r.target_user_id!)}
                      className="rounded-xl border px-3 py-1.5 text-[12px] font-semibold">
                      {t("moderation.reports.viewTarget")}
                    </Press>
                  )}
                  {r.target_type !== "order" && r.target_user_id && (
                    <Press onClick={() => { haptic.medium(); setSanctionTarget({ userId: r.target_user_id!, handle: r.target_label ?? null, reportId: r.id }); }}
                      className="rounded-xl px-3 py-1.5 text-[12px] font-bold text-white"
                      style={{ backgroundColor: "oklch(0.55 0.2 27)" }}>
                      {t("moderation.reports.action")}
                    </Press>
                  )}
                  <Press onClick={() => { haptic.selection(); setRejectReport(r); }}
                    className="rounded-xl border px-3 py-1.5 text-[12px] font-semibold">
                    {t("moderation.reports.dismiss")}
                  </Press>
                </div>
              )}
              {r.resolution_note && (
                <p className="mt-2 rounded-xl bg-muted p-2 text-[11px]">
                  <b>{t("moderation.reports.resolution")}: </b>{r.resolution_note}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <SanctionSheet
        open={!!sanctionTarget}
        onClose={() => setSanctionTarget(null)}
        targetUserId={sanctionTarget?.userId ?? null}
        targetHandle={sanctionTarget?.handle ?? null}
        onDone={async () => {
          if (sanctionTarget) {
            await adminResolveReport(sanctionTarget.reportId, "actioned", null);
          }
          setSanctionTarget(null);
          await load();
        }}
      />

      <DismissReportSheet
        report={rejectReport}
        onClose={() => setRejectReport(null)}
        onDone={async () => { setRejectReport(null); await load(); }}
      />
    </div>
  );
}

function StatusPill({ status }: { status: ReportRow["status"] }) {
  const { t } = useTranslation();
  const color = status === "open" ? "oklch(0.62 0.18 60)"
    : status === "actioned" ? "oklch(0.55 0.2 27)"
    : status === "dismissed" ? "var(--muted-foreground)"
    : "oklch(0.5 0.15 260)";
  return (
    <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
      style={{ backgroundColor: `color-mix(in oklch, ${color} 20%, transparent)`, color }}>
      {t(`moderation.reports.status.${status}`)}
    </span>
  );
}

function DismissReportSheet({ report, onClose, onDone }: {
  report: ReportRow | null; onClose: () => void; onDone: () => void;
}) {
  const { t } = useTranslation();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setNote(""); }, [report?.id]);
  if (!report) return null;
  return (
    <PushScreen open={!!report} onClose={onClose} title={t("moderation.reports.dismissTitle")} zIndex={90}>
      <div className="space-y-3 px-4 py-4">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
          placeholder={t("moderation.reports.dismissNotePh")}
          className="w-full resize-none rounded-2xl border border-border bg-background p-3 text-[13px] outline-none" />
        <Press onClick={async () => {
          setBusy(true);
          const r = await adminResolveReport(report.id, "dismissed", note.trim() || null);
          setBusy(false);
          if (r.ok) { toast.success(t("moderation.reports.dismissed")); onDone(); }
          else toast.error(r.error);
        }} className="w-full rounded-2xl border py-3 text-[14px] font-bold">
          {busy ? <Loader2 className="mx-auto animate-spin" size={16} /> : t("moderation.reports.dismissConfirm")}
        </Press>
      </div>
    </PushScreen>
  );
}

// -------- Compose Message Sheet --------

export function ComposeMessageSheet({ open, onClose, targetUserId, targetHandle }: {
  open: boolean; onClose: () => void; targetUserId: string | null; targetHandle?: string | null;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setTitle(""); setBody(""); } }, [open]);
  return (
    <PushScreen open={open} onClose={onClose} title={t("adminMsg.compose.title")} zIndex={90}>
      <div className="space-y-3 px-4 py-4">
        {targetHandle && <p className="text-[12px] text-muted-foreground">{t("adminMsg.compose.for")} <b>@{targetHandle}</b></p>}
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120}
          placeholder={t("adminMsg.compose.titlePh")}
          className="w-full rounded-2xl border border-border bg-background p-3 text-[14px] font-semibold outline-none" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} maxLength={2000}
          placeholder={t("adminMsg.compose.bodyPh")}
          className="w-full resize-none rounded-2xl border border-border bg-background p-3 text-[13px] outline-none" />
        <Press
          disabled={!targetUserId || !title.trim() || !body.trim() || busy}
          onClick={async () => {
            if (!targetUserId) return;
            setBusy(true);
            const r = await adminSendMessage(targetUserId, title.trim(), body.trim());
            setBusy(false);
            if (r.ok) { haptic.success(); toast.success(t("adminMsg.compose.sent")); onClose(); }
            else { haptic.warning(); toast.error(r.error ?? t("adminMsg.compose.failed")); }
          }}
          className="w-full rounded-2xl py-3 text-[15px] font-bold text-white disabled:opacity-40"
          style={{ backgroundColor: "oklch(0.5 0.15 260)" }}>
          {busy ? <Loader2 className="mx-auto animate-spin" size={16} /> : <><Send size={14} className="mr-1 inline" />{t("adminMsg.compose.send")}</>}
        </Press>
      </div>
    </PushScreen>
  );
}

// -------- Sanctions history (for user detail drawer) --------

export function UserSanctionsHistory({ userId, reloadKey }: { userId: string; reloadKey?: number }) {
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState<SanctionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setRows(await fetchUserSanctions(userId));
    setLoading(false);
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [userId, reloadKey]);

  if (loading) return <div className="h-16 animate-pulse rounded-2xl bg-muted" />;
  if (rows.length === 0) return <p className="rounded-2xl border border-border p-3 text-center text-[12px] text-muted-foreground">{t("moderation.sanctions.empty")}</p>;

  return (
    <ul className="space-y-2">
      {rows.map((s) => {
        const active = !s.revoked_at && (s.type === "ban" || (s.type === "suspension" && (!s.expires_at || new Date(s.expires_at) > new Date())));
        const icon = s.type === "ban" ? <Ban size={14} /> : s.type === "suspension" ? <Clock size={14} /> : <AlertTriangle size={14} />;
        const color = s.type === "ban" ? "oklch(0.55 0.2 27)" : s.type === "suspension" ? "oklch(0.62 0.18 60)" : "oklch(0.7 0.16 90)";
        return (
          <li key={s.id} className="rounded-2xl border border-border p-3 text-[12px]">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color }}>
                {icon} {t(`moderation.types.${s.type}`)}
              </span>
              {active ? (
                <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-bold text-white">{t("moderation.sanctions.active")}</span>
              ) : s.revoked_at ? (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase text-muted-foreground">{t("moderation.sanctions.revoked")}</span>
              ) : (
                <span className="text-[10px] text-muted-foreground">{t("moderation.sanctions.expired")}</span>
              )}
            </div>
            <p className="mt-1">{s.reason}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {new Date(s.created_at).toLocaleString(i18n.language)}
              {s.expires_at && ` → ${new Date(s.expires_at).toLocaleString(i18n.language)}`}
            </p>
            {s.admin_note && <p className="mt-1 rounded-lg bg-muted p-1.5 text-[11px]">{s.admin_note}</p>}
            {active && (
              <Press
                disabled={revoking === s.id}
                onClick={async () => {
                  setRevoking(s.id);
                  const r = await adminRevokeSanction(s.id);
                  setRevoking(null);
                  if (r.ok) { haptic.success(); toast.success(t("moderation.sanctions.revokedOk")); await load(); }
                  else toast.error(r.error);
                }}
                className="mt-2 inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 text-[11px] font-semibold">
                {revoking === s.id ? <Loader2 size={12} className="animate-spin" /> : <ShieldOff size={12} />}
                {t("moderation.sanctions.revoke")}
              </Press>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// -------- End Live confirm button --------

export function EndLiveButton({ liveId, onEnded }: { liveId: string; onEnded: () => void }) {
  const { t } = useTranslation();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!confirm) {
    return (
      <Press onClick={() => setConfirm(true)}
        className="mt-2 inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 text-[11px] font-bold"
        style={{ borderColor: "oklch(0.55 0.2 27 / 0.4)", color: "oklch(0.55 0.2 27)" }}>
        <X size={12} /> {t("moderation.lives.endBtn")}
      </Press>
    );
  }
  return (
    <div className="mt-2 flex items-center gap-2">
      <Press disabled={busy} onClick={async () => {
        setBusy(true);
        const r = await adminEndLive(liveId);
        setBusy(false); setConfirm(false);
        if (r.ok) { toast.success(t("moderation.lives.ended")); onEnded(); }
        else toast.error(r.error);
      }} className="rounded-xl px-3 py-1.5 text-[11px] font-bold text-white" style={{ backgroundColor: "oklch(0.55 0.2 27)" }}>
        {busy ? <Loader2 size={12} className="animate-spin" /> : t("moderation.lives.endConfirm")}
      </Press>
      <Press onClick={() => setConfirm(false)} className="rounded-xl border px-3 py-1.5 text-[11px] font-semibold">
        {t("common.cancel", { defaultValue: "Annuler" })}
      </Press>
    </div>
  );
}

// tiny icon export to reuse
export const _MSG_ICON = MessageSquare;
export const _OK_ICON = CheckCircle;
