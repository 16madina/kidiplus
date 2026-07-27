// Risk decision-support card shown next to every pending payout.
// Fetches signals + optional seller order history, and exposes
// Freeze / Unfreeze actions so admins can pause a suspicious account
// without banning it.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AlertTriangle, ShieldAlert, ShieldCheck, ChevronDown, Snowflake, Loader2 } from "lucide-react";
import { Press } from "@/components/press";
import { formatMoney, normalizeCurrency } from "@/lib/money";
import {
  fetchPayoutRisk, fetchSellerRecentOrders,
  adminFreezeUser, adminUnfreezeUser,
  type PayoutRisk, type SellerRecentOrder,
} from "@/lib/moderation-admin";

const LEVEL_STYLE: Record<PayoutRisk["level"], { bg: string; fg: string; Icon: typeof ShieldCheck }> = {
  green:  { bg: "oklch(0.62 0.16 155 / 0.12)", fg: "oklch(0.42 0.18 155)", Icon: ShieldCheck },
  yellow: { bg: "oklch(0.62 0.18 60 / 0.15)",  fg: "oklch(0.4 0.16 60)",   Icon: AlertTriangle },
  red:    { bg: "oklch(0.55 0.2 27 / 0.15)",   fg: "oklch(0.5 0.2 27)",    Icon: ShieldAlert },
};

export function PayoutRiskBadge({ payoutId, sellerId, sellerHandle }: {
  payoutId: string;
  sellerId: string;
  sellerHandle: string | null;
}) {
  const { t, i18n } = useTranslation();
  const [risk, setRisk] = useState<PayoutRisk | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [history, setHistory] = useState<SellerRecentOrder[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => setRisk(await fetchPayoutRisk(payoutId));
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [payoutId]);

  const toggleExpand = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && history === null) setHistory(await fetchSellerRecentOrders(sellerId, 20));
  };

  const onFreeze = async () => {
    const reason = window.prompt(t("admin.risk.freezePrompt", "Motif du gel du compte ?"), "");
    if (reason === null) return;
    setBusy(true);
    const r = await adminFreezeUser(sellerId, reason);
    setBusy(false);
    if (!r.ok) { toast.error(r.error ?? "Erreur"); return; }
    toast.success(t("admin.risk.freezeDone", "Compte gelé"));
    void load();
  };

  const onUnfreeze = async () => {
    if (!window.confirm(t("admin.risk.unfreezeConfirm", "Dégeler ce compte ?"))) return;
    setBusy(true);
    const r = await adminUnfreezeUser(sellerId);
    setBusy(false);
    if (!r.ok) { toast.error(r.error ?? "Erreur"); return; }
    toast.success(t("admin.risk.unfreezeDone", "Compte réactivé"));
    void load();
  };

  if (!risk) return null;
  const s = LEVEL_STYLE[risk.level];
  const Icon = s.Icon;

  return (
    <div className="mt-2 rounded-xl border p-2" style={{ borderColor: s.fg + "55", background: s.bg }}>
      <button
        type="button"
        onClick={toggleExpand}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="inline-flex items-center gap-2 text-[12px] font-semibold" style={{ color: s.fg }}>
          <Icon size={14} />
          {t(`admin.risk.level.${risk.level}`, risk.level.toUpperCase())}
          {risk.signals.length > 0 && (
            <span className="rounded-full bg-white/60 px-1.5 py-0.5 text-[10px] font-bold" style={{ color: s.fg }}>
              {risk.signals.length}
            </span>
          )}
          {risk.is_frozen && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/60 px-1.5 py-0.5 text-[10px] font-bold" style={{ color: s.fg }}>
              <Snowflake size={10} /> {t("admin.risk.frozen", "Gelé")}
            </span>
          )}
        </span>
        <ChevronDown size={14} style={{ color: s.fg, transform: expanded ? "rotate(180deg)" : undefined, transition: "transform .15s" }} />
      </button>

      {expanded && (
        <div className="mt-2 space-y-2 text-[12px]">
          {risk.signals.length === 0 ? (
            <p className="text-muted-foreground">{t("admin.risk.noSignals", "Aucun signal détecté.")}</p>
          ) : (
            <ul className="space-y-1">
              {risk.signals.map((sig) => (
                <li key={sig.code} className="flex items-start gap-1.5">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: s.fg }} />
                  <span>{sig.label}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-white/50 p-2 text-[11px] text-muted-foreground">
            <span>{t("admin.risk.age", "Âge compte")}: <b className="text-foreground">{risk.seller_age_days != null ? `${Math.round(risk.seller_age_days)} j` : "—"}</b></span>
            <span>{t("admin.risk.totalSales", "Ventes")}: <b className="text-foreground">{risk.total_sales}</b></span>
            <span>{t("admin.risk.prevPayouts", "Retraits précédents")}: <b className="text-foreground">{risk.prev_payouts}</b></span>
            <span>{t("admin.risk.disputes", "Litiges")}: <b className="text-foreground">{risk.disputes}</b></span>
          </div>

          <div className="flex flex-wrap gap-2">
            {risk.is_frozen ? (
              <Press onClick={onUnfreeze} disabled={busy}
                className="rounded-xl border px-3 py-1.5 text-[12px] font-semibold">
                {busy ? <Loader2 className="animate-spin" size={12} /> : t("admin.risk.unfreeze", "Dégeler le compte")}
              </Press>
            ) : (
              <Press onClick={onFreeze} disabled={busy}
                className="rounded-xl px-3 py-1.5 text-[12px] font-bold text-white"
                style={{ background: "oklch(0.55 0.2 27)" }}>
                <span className="inline-flex items-center gap-1">
                  {busy ? <Loader2 className="animate-spin" size={12} /> : <Snowflake size={12} />}
                  {t("admin.risk.freeze", "Geler le compte")}
                </span>
              </Press>
            )}
          </div>

          {history && history.length > 0 && (
            <div className="mt-2">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: s.fg }}>
                {t("admin.risk.recentOrders", "Commandes récentes de @")}{sellerHandle ?? sellerId.slice(0, 6)}
              </p>
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-background">
                {history.slice(0, 8).map((o) => (
                  <li key={o.id} className="flex items-center gap-2 p-1.5 text-[11px]">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{o.item_name ?? "—"}</p>
                      <p className="truncate text-muted-foreground">@{o.buyer_handle ?? o.buyer_id.slice(0, 6)} · {new Date(o.created_at).toLocaleDateString(i18n.language)} · {o.status}</p>
                    </div>
                    <p className="tabular-nums font-semibold">{formatMoney(Number(o.total), normalizeCurrency(o.currency), i18n.language)}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
