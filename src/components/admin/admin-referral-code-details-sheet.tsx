// Drill-down sheet: paid orders + earnings breakdown for one promo code.
import { useEffect, useState } from "react";
import { Loader2, X, ArrowUpRight } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Press } from "@/components/press";
import { formatMoney, normalizeCurrency } from "@/lib/money";
import {
  fetchAdminReferralCodeDetails,
  type AdminReconOrderRow,
  type AdminReconEarning,
} from "@/lib/referrals-db";

type StatusKey = AdminReconEarning["status"];
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

export function AdminReferralCodeDetailsSheet({
  promoCodeId,
  code,
  onClose,
}: {
  promoCodeId: string | null;
  code: string | null;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<AdminReconOrderRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const open = Boolean(promoCodeId);

  useEffect(() => {
    if (!promoCodeId) { setRows(null); return; }
    let cancelled = false;
    setLoading(true);
    fetchAdminReferralCodeDetails(promoCodeId)
      .then((r) => { if (!cancelled) setRows(r); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [promoCodeId]);

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl p-4">
        <SheetHeader className="mb-3 flex-row items-center justify-between space-y-0">
          <SheetTitle className="text-[15px]">
            Détails · <span className="font-mono">{code ?? ""}</span>
          </SheetTitle>
          <Press onClick={onClose} className="!min-h-8 rounded-full border border-border p-1.5">
            <X size={14} />
          </Press>
        </SheetHeader>

        {loading || rows === null ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <p className="mt-8 text-center text-[13px] text-muted-foreground">
            Aucune commande payée pour l'instant.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {rows.length} commande{rows.length > 1 ? "s" : ""} payée{rows.length > 1 ? "s" : ""}
            </div>
            {rows.map((o) => <OrderCard key={o.order_id} order={o} />)}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function OrderCard({ order }: { order: AdminReconOrderRow }) {
  const cur = normalizeCurrency(order.currency);
  const who =
    order.referred_role === "buyer"
      ? `Acheteur · ${order.buyer_name ?? "—"} · @${order.buyer_handle ?? "—"}`
      : order.referred_role === "seller"
        ? `Vendeur · ${order.seller_name ?? "—"} · @${order.seller_handle ?? "—"}`
        : "—";
  const roleBadge = order.referred_role === "buyer" ? "Filleul acheteur" : order.referred_role === "seller" ? "Filleul vendeur" : "—";
  const date = order.paid_at ?? order.created_at;

  return (
    <div className="rounded-2xl border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold">
              {roleBadge}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {new Date(date).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
            </span>
          </div>
          <div className="mt-1 truncate text-[13px] font-semibold">{order.item_name ?? "Article"}</div>
          <div className="truncate text-[11px] text-muted-foreground">{who}</div>
        </div>
        <div className="text-right">
          <div className="text-[13px] font-bold tabular-nums">{formatMoney(Number(order.total), cur)}</div>
          <div className="text-[10px] text-muted-foreground">
            Fee: {formatMoney(Number(order.platform_fee ?? 0), cur)}
          </div>
        </div>
      </div>

      {order.earnings.length === 0 ? (
        <div className="mt-2 rounded-lg border border-dashed border-border/70 p-2 text-center text-[11px] text-muted-foreground">
          Aucun gain enregistré pour cette commande
        </div>
      ) : (
        <div className="mt-2 space-y-1">
          {order.earnings.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/30 px-2 py-1.5 text-[12px]">
              <div className="flex items-center gap-1.5">
                <ArrowUpRight size={12} className="text-muted-foreground" />
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[e.status]}`}>
                  {STATUS_LABEL[e.status]}
                </span>
                {!e.owner_id && (
                  <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-800">
                    non attribué
                  </span>
                )}
              </div>
              <span className="font-semibold tabular-nums">
                {formatMoney(Number(e.amount), normalizeCurrency(e.currency))}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
