// Admin: reconciliation report for referral codes.
// For each promo code: paid orders from referred users, computed credits
// (held / credited / reversed) broken down by currency, and the owner's
// current referral wallet balance.
import { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Search, HeartHandshake } from "lucide-react";
import { Press } from "@/components/press";
import { haptic } from "@/lib/haptics";
import { formatMoney, normalizeCurrency } from "@/lib/money";
import {
  fetchAdminReferralReconciliation,
  type AdminReconRow,
} from "@/lib/referrals-db";
import { AdminReferralCodeDetailsSheet } from "./admin-referral-code-details-sheet";

type StatusKey = "held" | "credited" | "reversed";
const STATUS_LABEL: Record<StatusKey, string> = {
  held: "En attente",
  credited: "Crédité",
  reversed: "Annulé",
};
const STATUS_STYLE: Record<StatusKey, string> = {
  held: "bg-amber-100 text-amber-800",
  credited: "bg-emerald-100 text-emerald-800",
  reversed: "bg-rose-100 text-rose-800",
};

function fmtTotals(m: Record<string, number> | undefined) {
  if (!m) return "—";
  const entries = Object.entries(m).filter(([, v]) => Number(v) !== 0);
  if (!entries.length) return "—";
  return entries
    .map(([c, v]) => formatMoney(Number(v), normalizeCurrency(c)))
    .join(" · ");
}

export function AdminReferralReconciliation() {
  const [rows, setRows] = useState<AdminReconRow[] | null>(null);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [openRow, setOpenRow] = useState<{ id: string; code: string } | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      setRows(await fetchAdminReferralReconciliation());
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void reload(); }, []);

  const filtered = useMemo(() => {
    if (!rows) return null;
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      r.code.toLowerCase().includes(s) ||
      (r.owner_handle ?? "").toLowerCase().includes(s) ||
      (r.owner_name ?? "").toLowerCase().includes(s),
    );
  }, [rows, q]);

  const totals = useMemo(() => {
    const acc = { orders: 0, earnings: 0, referred: 0 };
    (rows ?? []).forEach((r) => {
      acc.orders += r.paid_orders;
      acc.earnings += r.earning_rows;
      acc.referred += r.referred_count;
    });
    return acc;
  }, [rows]);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-[16px] font-bold">
          <HeartHandshake size={16} /> Réconciliation parrainage
        </h2>
        <Press
          onClick={() => { haptic.light(); void reload(); }}
          className="!min-h-9 inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-[12px] font-semibold"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          Actualiser
        </Press>
      </div>

      {rows && rows.length > 0 && (
        <div className="mb-3 grid grid-cols-3 gap-2 text-center">
          <StatCard label="Codes" value={rows.length} />
          <StatCard label="Filleuls" value={totals.referred} />
          <StatCard label="Commandes payées" value={totals.orders} />
        </div>
      )}

      <div className="relative mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Chercher un code ou un @handle…"
          className="w-full rounded-full border border-border bg-background py-2 pl-9 pr-3 text-[13px] outline-none"
        />
      </div>

      {rows === null ? (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          <Loader2 size={18} className="animate-spin" />
        </div>
      ) : filtered!.length === 0 ? (
        <p className="mt-8 text-center text-[13px] text-muted-foreground">
          Aucun code ne correspond.
        </p>
      ) : (
        <div className="space-y-3">
          {filtered!.map((r) => (
            <ReconRow
              key={r.promo_code_id}
              row={r}
              onOpen={() => { haptic.light(); setOpenRow({ id: r.promo_code_id, code: r.code }); }}
            />
          ))}
        </div>
      )}

      <AdminReferralCodeDetailsSheet
        promoCodeId={openRow?.id ?? null}
        code={openRow?.code ?? null}
        onClose={() => setOpenRow(null)}
      />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-2">
      <div className="text-[18px] font-bold">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function ReconRow({ row }: { row: AdminReconRow }) {
  const wallet =
    row.wallet_available != null && row.wallet_currency
      ? formatMoney(Number(row.wallet_available), normalizeCurrency(row.wallet_currency))
      : "—";
  const statuses: StatusKey[] = ["held", "credited", "reversed"];
  const hasEarnings = row.earning_rows > 0;

  return (
    <div className="rounded-2xl border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-foreground px-2 py-0.5 font-mono text-[12px] font-semibold text-background">
              {row.code}
            </span>
            {!row.active && (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                inactif
              </span>
            )}
            {!row.owner_id && (
              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                non réclamé
              </span>
            )}
          </div>
          <div className="mt-1 truncate text-[12px] text-muted-foreground">
            {row.owner_id
              ? `${row.owner_name ?? "—"} · @${row.owner_handle ?? "—"}`
              : "Aucun propriétaire"}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase text-muted-foreground">Portefeuille</div>
          <div className="text-[14px] font-bold">{wallet}</div>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        <MiniStat label="Filleuls" value={row.referred_count} />
        <MiniStat label="Cmds payées" value={row.paid_orders} />
        <MiniStat label="Gains calculés" value={row.earning_rows} />
      </div>

      {hasEarnings ? (
        <div className="mt-2 space-y-1">
          {statuses.map((s) => {
            const totals = row.credits_by_status?.[s];
            if (!totals || !Object.keys(totals).length) return null;
            return (
              <div key={s} className="flex items-center justify-between gap-2 text-[12px]">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[s]}`}>
                  {STATUS_LABEL[s]}
                </span>
                <span className="font-medium tabular-nums">{fmtTotals(totals)}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-2 text-center text-[11px] text-muted-foreground">
          Aucun gain calculé
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border/70 bg-muted/20 p-1.5">
      <div className="text-[13px] font-semibold tabular-nums">{value}</div>
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
