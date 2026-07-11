// AdminDashboardScreen — Step 1: read-only overview + users + payments + lives.
// All data comes from admin-only RPCs (SECURITY DEFINER, is_admin-guarded).
// Moderation actions (block / warn / message) land in Step 2.

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Copy, Check, X, Loader2, LayoutDashboard, Users as UsersIcon,
  CreditCard, Radio, Search, ChevronRight, Upload, ImageIcon,
  Flag, MessageSquare, ShieldAlert, AlertTriangle, BadgeCheck, Bell,
} from "lucide-react";
import { AdminPushPanel } from "./admin-push-panel";
import { PushScreen } from "@/components/push-screen";
import { Press } from "@/components/press";
import { formatMoney, normalizeCurrency } from "@/lib/money";
import { haptic } from "@/lib/haptics";
import {
  fetchOverviewStats, fetchAdminUsers, fetchAdminUserDetail,
  fetchAdminPayouts, fetchAdminOrders, fetchAdminLives,
  approxEurTotal,
  type OverviewStats, type AdminUserRow, type AdminPayoutRow,
  type AdminOrderRow, type AdminLiveRow, type CurrencyMap,
} from "@/lib/admin-db";
import {
  adminProcessPayout, subscribeAllPayouts,
  uploadPayoutProof, signPayoutProofUrl,
} from "@/lib/earnings-db";
import { useAuth } from "@/lib/auth-context";
import { fetchAdminReports } from "@/lib/moderation-admin";
import {
  ReportsTab, ComposeMessageSheet, UserSanctionsHistory, EndLiveButton,
} from "./moderation-pieces";
import { SanctionSheet } from "./sanction-sheet";
import { AdminDemoVideoCard } from "./admin-demo-video";


type Tab = "overview" | "users" | "payments" | "lives" | "reports" | "verify";

export function AdminDashboardScreen({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");
  const isAdmin = profile?.is_admin === true;

  return (
    <PushScreen open={open} onClose={onClose} title={t("admin.title")} zIndex={65}>
      {!isAdmin ? (
        <p className="p-8 text-center text-[13px] text-muted-foreground">{t("admin.onlyAdmins")}</p>
      ) : (
        <>
          <TabBar tab={tab} onTab={setTab} />
          <div className="px-4 py-4 pb-24">
            {tab === "overview" && open && <OverviewTab onGoTab={setTab} />}
            {tab === "users" && open && <UsersTab />}
            {tab === "payments" && open && <PaymentsTab />}
            {tab === "lives" && open && <LivesTab />}
            {tab === "reports" && open && <ReportsTab />}
            {tab === "verify" && open && <VerificationsTab />}
          </div>
        </>
      )}
    </PushScreen>
  );
}

// Back-compat alias so existing imports keep working.
export { AdminDashboardScreen as AdminPayoutsScreen };

// ---------- TabBar ----------

function TabBar({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  const { t } = useTranslation();
  const tabs: Array<{ id: Tab; icon: React.ReactNode; label: string }> = [
    { id: "overview", icon: <LayoutDashboard size={14} />, label: t("admin.tabs.overview") },
    { id: "users",    icon: <UsersIcon size={14} />,       label: t("admin.tabs.users") },
    { id: "reports",  icon: <Flag size={14} />,            label: t("admin.tabs.reports") },
    { id: "verify",   icon: <BadgeCheck size={14} />,      label: t("admin.tabs.verify", "Certifs") },
    { id: "payments", icon: <CreditCard size={14} />,      label: t("admin.tabs.payments") },
    { id: "lives",    icon: <Radio size={14} />,           label: t("admin.tabs.lives") },
  ];
  return (
    <div className="sticky top-0 z-10 flex gap-1 overflow-x-auto border-b border-border bg-background/90 px-2 py-2 backdrop-blur">
      {tabs.map((x) => {
        const active = x.id === tab;
        return (
          <Press
            key={x.id}
            onClick={() => { haptic.selection(); onTab(x.id); }}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold ${
              active ? "bg-foreground text-background" : "bg-muted text-foreground"
            }`}
          >
            {x.icon}{x.label}
          </Press>
        );
      })}
    </div>
  );
}

// ---------- Overview ----------

function OverviewTab({ onGoTab }: { onGoTab: (t: Tab) => void }) {
  const { t, i18n } = useTranslation();
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [openReports, setOpenReports] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      // Opportunistic cleanup so the admin sees fresh cancellations.
      await import("@/lib/lives-db").then((m) => m.expireOverdueOrders()).catch(() => 0);
      const [s, reports] = await Promise.all([fetchOverviewStats(), fetchAdminReports("open")]);
      if (!alive) return;
      setStats(s); setOpenReports(reports.length); setLoading(false);
    };
    void load();
    const id = window.setInterval(() => void load(), 60_000);
    return () => { alive = false; window.clearInterval(id); };
  }, []);

  if (loading) return <Skeleton />;
  if (!stats) return <p className="py-16 text-center text-[13px] text-muted-foreground">{t("admin.empty")}</p>;

  const c = stats.counts;
  return (
    <div className="space-y-4">
      {/* À traiter */}
      <Section title={t("admin.toDo.title")}>
        <div className="grid grid-cols-2 gap-2">
          <Press onClick={() => onGoTab("reports")}
            className="flex items-center justify-between rounded-2xl border p-3 text-left"
            style={{ borderColor: openReports > 0 ? "oklch(0.55 0.2 27 / 0.5)" : "var(--border)" }}>
            <div>
              <p className="text-[22px] font-bold tabular-nums" style={{ color: openReports > 0 ? "oklch(0.55 0.2 27)" : undefined }}>
                {fmtInt(openReports, i18n.language)}
              </p>
              <p className="text-[11px] text-muted-foreground">{t("admin.toDo.reports")}</p>
            </div>
            <Flag size={16} className="text-muted-foreground" />
          </Press>
          <Press onClick={() => onGoTab("payments")}
            className="flex items-center justify-between rounded-2xl border p-3 text-left"
            style={{ borderColor: stats.pending_payouts.count > 0 ? "oklch(0.62 0.18 60 / 0.5)" : "var(--border)" }}>
            <div>
              <p className="text-[22px] font-bold tabular-nums" style={{ color: stats.pending_payouts.count > 0 ? "oklch(0.55 0.16 60)" : undefined }}>
                {fmtInt(stats.pending_payouts.count, i18n.language)}
              </p>
              <p className="text-[11px] text-muted-foreground">{t("admin.toDo.payouts")}</p>
            </div>
            <CreditCard size={16} className="text-muted-foreground" />
          </Press>
        </div>
      </Section>

      <Section title={t("admin.kpi.gmv")}>
        <MoneyByCurrency map={stats.gmv} approx />
      </Section>
      <Section title={t("admin.kpi.gmvMonth")}>
        <MoneyByCurrency map={stats.gmv_month} approx />
      </Section>
      <Section title={t("admin.kpi.revenue")}>
        <MoneyByCurrency map={stats.revenue} approx />
      </Section>
      <Section title={t("admin.kpi.revenueMonth")}>
        <MoneyByCurrency map={stats.revenue_month} approx />
      </Section>

      <div className="grid grid-cols-2 gap-2">
        <StatTile label={t("admin.kpi.users")} value={fmtInt(c.users_total, i18n.language)} />
        <StatTile label={t("admin.kpi.sellers")} value={fmtInt(c.sellers, i18n.language)} />
        <StatTile label={t("admin.kpi.newUsersWeek")} value={fmtInt(c.new_this_week, i18n.language)} />
        <StatTile label={t("admin.kpi.ordersPaid")} value={fmtInt(c.orders_paid, i18n.language)} />
        <StatTile label={t("admin.kpi.livesLive")} value={fmtInt(c.lives_live, i18n.language)} />
        <StatTile label={t("admin.kpi.livesTotal")} value={fmtInt(c.lives_total, i18n.language)} />
      </div>

      <Section title={t("admin.kpi.walletFloat")}>
        <MoneyByCurrency map={stats.wallet_float} />
      </Section>
      <Section title={t("admin.kpi.sellerLiability")}>
        <MoneyByCurrency map={stats.seller_liability} />
      </Section>

      <Section title={t("admin.kpi.pendingPayouts")}>
        <div className="flex items-center justify-between rounded-2xl border border-border p-3">
          <span className="text-[22px] font-bold tabular-nums">{stats.pending_payouts.count}</span>
          <MoneyByCurrency map={stats.pending_payouts.by_currency} inline />
        </div>
      </Section>

      <Section title={t("admin.kpi.orders14d")}>
        <DailyChart data={stats.orders_daily} />
      </Section>

      <Section title="Contenu">
        <AdminDemoVideoCard />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {children}
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border p-3">
      <p className="text-[22px] font-bold tabular-nums">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function MoneyByCurrency({ map, approx = false, inline = false }: { map: CurrencyMap; approx?: boolean; inline?: boolean }) {
  const { t, i18n } = useTranslation();
  const entries = Object.entries(map ?? {}).filter(([, v]) => Number(v) !== 0);
  if (entries.length === 0) {
    return <p className={inline ? "text-[13px] text-muted-foreground" : "rounded-2xl border border-border p-3 text-[13px] text-muted-foreground"}>—</p>;
  }
  const eurApprox = approx && entries.length > 1 ? approxEurTotal(map) : null;
  const body = (
    <div className={inline ? "flex flex-wrap items-baseline justify-end gap-x-3" : "flex flex-wrap items-baseline gap-x-4 gap-y-1"}>
      {entries.map(([cur, amt]) => (
        <span key={cur} className="text-[16px] font-bold tabular-nums">
          {formatMoney(Number(amt), normalizeCurrency(cur), i18n.language)}
        </span>
      ))}
      {eurApprox !== null && (
        <span className="text-[11px] text-muted-foreground">
          {t("admin.approxEurTotal")}: {formatMoney(eurApprox, "EUR", i18n.language)}
        </span>
      )}
    </div>
  );
  return inline ? body : <div className="rounded-2xl border border-border p-3">{body}</div>;
}

function DailyChart({ data }: { data: Array<{ day: string; orders: number; gmv: number }> }) {
  const max = Math.max(1, ...data.map((d) => d.orders));
  return (
    <div className="rounded-2xl border border-border p-3">
      <div className="flex h-24 items-end gap-1">
        {data.map((d) => {
          const h = Math.max(2, Math.round((d.orders / max) * 100));
          return (
            <div key={d.day} className="flex-1" title={`${d.day}: ${d.orders} orders`}>
              <div className="w-full rounded-t bg-foreground/80" style={{ height: `${h}%` }} />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[9px] text-muted-foreground">
        <span>{data[0]?.day.slice(5)}</span>
        <span>{data[data.length - 1]?.day.slice(5)}</span>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted" />
      ))}
    </div>
  );
}

function fmtInt(n: number, lang: string) {
  try { return new Intl.NumberFormat(lang).format(n); } catch { return String(n); }
}

// ---------- Users ----------

function UsersTab() {
  const { t, i18n } = useTranslation();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<AdminUserRow | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const h = window.setTimeout(async () => {
      const r = await fetchAdminUsers(q.trim() || null, 50, 0);
      if (!alive) return;
      setRows(r.rows); setLoading(false);
    }, 250);
    return () => { alive = false; window.clearTimeout(h); };
  }, [q]);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 rounded-2xl border border-border px-3 py-2">
        <Search size={14} className="text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("admin.users.searchPh")}
          className="min-w-0 flex-1 bg-transparent text-[14px] outline-none"
        />
      </div>
      {loading ? <Skeleton /> : rows.length === 0 ? (
        <p className="py-16 text-center text-[13px] text-muted-foreground">{t("admin.users.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((u) => (
            <motion.li
              key={u.id}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="rounded-2xl border border-border p-3"
            >
              <button className="flex w-full items-center gap-3 text-left" onClick={() => setDetail(u)}>
                <Avatar url={u.avatar_url} name={u.display_name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold">{u.display_name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">@{u.handle} · {u.email}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {u.is_seller ? "SELLER · " : ""}{u.is_admin ? "ADMIN · " : ""}
                    {u.country ?? "—"} · {u.currency}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[12px] tabular-nums">{formatMoney(Number(u.wallet_balance), normalizeCurrency(u.wallet_currency), i18n.language)}</p>
                  <p className="text-[10px] text-muted-foreground">{u.orders_count} / {u.sales_count}</p>
                </div>
                <ChevronRight size={14} className="text-muted-foreground" />
              </button>
            </motion.li>
          ))}
        </ul>
      )}
      <UserDetailSheet user={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

function Avatar({ url, name }: { url: string | null; name: string }) {
  if (url) return <img src={url} alt="" className="h-10 w-10 rounded-full object-cover" />;
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-[13px] font-bold">
      {(name || "?").slice(0, 1).toUpperCase()}
    </div>
  );
}

function UserDetailSheet({ user, onClose }: { user: AdminUserRow | null; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<any | null>(null);
  const [sanctionOpen, setSanctionOpen] = useState<{ type: "warning" | "suspension" | "ban" } | null>(null);
  const [msgOpen, setMsgOpen] = useState(false);
  const [sanctionsReload, setSanctionsReload] = useState(0);
  const modStatus = (data?.profile?.moderation_status ?? "active") as "active" | "suspended" | "banned";

  useEffect(() => {
    if (!user) { setData(null); return; }
    void fetchAdminUserDetail(user.id).then(setData);
  }, [user, sanctionsReload]);

  return (
    <PushScreen open={!!user} onClose={onClose} title={t("admin.users.detail")} zIndex={80}>
      {user && (
        <div className="space-y-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <Avatar url={user.avatar_url} name={user.display_name} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[16px] font-bold">{user.display_name}</p>
              <p className="truncate text-[12px] text-muted-foreground">@{user.handle} · {user.email}</p>
            </div>
            <ModStatusBadge status={modStatus} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <StatTile label={t("admin.users.wallet")} value={formatMoney(Number(user.wallet_balance), normalizeCurrency(user.wallet_currency), i18n.language)} />
            <StatTile label={t("admin.users.sellerBal")} value={formatMoney(Number(user.seller_balance), normalizeCurrency(user.seller_currency), i18n.language)} />
            <StatTile label={t("admin.users.purchases")} value={String(user.orders_count)} />
            <StatTile label={t("admin.users.sales")} value={String(user.sales_count)} />
            {typeof data?.unpaid_timeouts === "number" && data.unpaid_timeouts > 0 && (
              <StatTile
                label={t("admin.users.unpaidTimeouts")}
                value={String(data.unpaid_timeouts)}
              />
            )}
          </div>

          {/* Moderation actions */}
          <div className="grid grid-cols-4 gap-2">
            <Press onClick={() => setMsgOpen(true)}
              className="flex flex-col items-center gap-1 rounded-2xl border p-2.5 text-[10px] font-semibold">
              <MessageSquare size={14} />{t("moderation.userDetail.sendMessage")}
            </Press>
            <Press onClick={() => setSanctionOpen({ type: "warning" })}
              className="flex flex-col items-center gap-1 rounded-2xl border p-2.5 text-[10px] font-semibold"
              style={{ borderColor: "oklch(0.7 0.16 90 / 0.4)", color: "oklch(0.6 0.16 90)" }}>
              <AlertTriangle size={14} />{t("moderation.userDetail.warn")}
            </Press>
            <Press onClick={() => setSanctionOpen({ type: "suspension" })}
              className="flex flex-col items-center gap-1 rounded-2xl border p-2.5 text-[10px] font-semibold"
              style={{ borderColor: "oklch(0.62 0.18 60 / 0.4)", color: "oklch(0.55 0.16 60)" }}>
              <ShieldAlert size={14} />{t("moderation.userDetail.suspend")}
            </Press>
            <Press onClick={() => setSanctionOpen({ type: "ban" })}
              className="flex flex-col items-center gap-1 rounded-2xl border p-2.5 text-[10px] font-semibold"
              style={{ borderColor: "oklch(0.55 0.2 27 / 0.4)", color: "oklch(0.55 0.2 27)" }}>
              <X size={14} />{t("moderation.userDetail.ban")}
            </Press>
          </div>

          <Section title={t("moderation.userDetail.sanctionsTitle")}>
            <UserSanctionsHistory userId={user.id} reloadKey={sanctionsReload} />
          </Section>

          {data && (
            <>
              <Section title={t("admin.users.recentOrders")}>
                <MiniList
                  items={(data.orders ?? []).slice(0, 10).map((o: any) => ({
                    key: o.id, left: o.item_name,
                    sub: `${o.status} · ${new Date(o.created_at).toLocaleDateString(i18n.language)}`,
                    right: formatMoney(Number(o.total), normalizeCurrency(o.currency), i18n.language),
                  }))}
                />
              </Section>
              <Section title={t("admin.users.recentLives")}>
                <MiniList
                  items={(data.lives ?? []).slice(0, 10).map((l: any) => ({
                    key: l.id, left: l.title,
                    sub: `${l.status} · ${new Date(l.started_at).toLocaleDateString(i18n.language)}`,
                    right: `${l.viewer_count} 👀`,
                  }))}
                />
              </Section>
              <Section title={t("admin.users.walletTx")}>
                <MiniList
                  items={(data.wallet_transactions ?? []).slice(0, 10).map((tx: any) => ({
                    key: tx.id, left: tx.type,
                    sub: new Date(tx.created_at).toLocaleString(i18n.language),
                    right: formatMoney(Number(tx.amount), normalizeCurrency(user.wallet_currency), i18n.language),
                  }))}
                />
              </Section>
              <Section title={t("admin.users.earnings")}>
                <MiniList
                  items={(data.earnings ?? []).slice(0, 10).map((e: any) => ({
                    key: e.id, left: e.order_id.slice(0, 8),
                    sub: new Date(e.created_at).toLocaleString(i18n.language),
                    right: formatMoney(Number(e.amount), normalizeCurrency(user.seller_currency), i18n.language),
                  }))}
                />
              </Section>
            </>
          )}
        </div>
      )}
      <SanctionSheet
        open={!!sanctionOpen}
        onClose={() => setSanctionOpen(null)}
        targetUserId={user?.id ?? null}
        targetHandle={user?.handle ?? null}
        onDone={() => { setSanctionOpen(null); setSanctionsReload((n) => n + 1); }}
      />
      <ComposeMessageSheet
        open={msgOpen}
        onClose={() => setMsgOpen(false)}
        targetUserId={user?.id ?? null}
        targetHandle={user?.handle ?? null}
      />
    </PushScreen>
  );
}

function ModStatusBadge({ status }: { status: "active" | "suspended" | "banned" }) {
  const { t } = useTranslation();
  const map = {
    active: { color: "oklch(0.62 0.16 155)", label: "Actif" },
    suspended: { color: "oklch(0.62 0.18 60)", label: t("moderation.types.suspension") },
    banned: { color: "oklch(0.55 0.2 27)", label: t("moderation.types.ban") },
  } as const;
  const m = map[status];
  return (
    <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
      style={{ backgroundColor: `color-mix(in oklch, ${m.color} 18%, transparent)`, color: m.color }}>
      {m.label}
    </span>
  );
}


function MiniList({ items }: { items: Array<{ key: string; left: string; sub: string; right: string }> }) {
  if (items.length === 0) return <p className="rounded-2xl border border-border p-3 text-[12px] text-muted-foreground">—</p>;
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
      {items.map((it) => (
        <li key={it.key} className="flex items-center justify-between gap-2 p-2.5">
          <div className="min-w-0">
            <p className="truncate text-[13px]">{it.left}</p>
            <p className="truncate text-[10px] text-muted-foreground">{it.sub}</p>
          </div>
          <p className="shrink-0 text-[12px] font-semibold tabular-nums">{it.right}</p>
        </li>
      ))}
    </ul>
  );
}

// ---------- Payments (payouts + orders) ----------

function PaymentsTab() {
  const { t, i18n } = useTranslation();
  const [payouts, setPayouts] = useState<AdminPayoutRow[]>([]);
  const [orders, setOrders] = useState<AdminOrderRow[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [payTab, setPayTab] = useState<"requested" | "paid" | "rejected">("requested");
  const [sheetTarget, setSheetTarget] = useState<{ row: AdminPayoutRow; action: "paid" | "rejected" } | null>(null);

  const loadPayouts = async () => setPayouts(await fetchAdminPayouts());
  const loadOrders  = async () => setOrders((await fetchAdminOrders(status, 50, 0)).rows);

  useEffect(() => { void loadPayouts(); const un = subscribeAllPayouts(() => void loadPayouts()); return () => un(); }, []);
  useEffect(() => { void loadOrders(); }, [status]);

  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); toast.success(t("common.copied")); } catch { /* ignore */ } };

  const buckets = useMemo(() => {
    const requested = payouts.filter((p) => p.status === "requested" || p.status === "processing");
    const paid      = payouts.filter((p) => p.status === "paid")
      .sort((a, b) => new Date(b.processed_at ?? b.requested_at).getTime() - new Date(a.processed_at ?? a.requested_at).getTime());
    const rejected  = payouts.filter((p) => p.status === "rejected")
      .sort((a, b) => new Date(b.processed_at ?? b.requested_at).getTime() - new Date(a.processed_at ?? a.requested_at).getTime());
    return { requested, paid, rejected };
  }, [payouts]);

  const list = payTab === "requested" ? buckets.requested : payTab === "paid" ? buckets.paid : buckets.rejected;

  const statusOptions: Array<string | null> = [null, "pending", "paid", "failed", "cancelled"];

  return (
    <div className="space-y-6">
      <Section title={t("admin.tabs.payments")}>
        <div className="mb-2 flex gap-1 rounded-full border border-border p-1">
          {(["requested","paid","rejected"] as const).map((k) => {
            const count = k === "requested" ? buckets.requested.length : k === "paid" ? buckets.paid.length : buckets.rejected.length;
            const active = payTab === k;
            return (
              <button key={k} type="button" onClick={() => { haptic.selection(); setPayTab(k); }}
                className="flex-1 rounded-full py-1.5 text-[12px] font-semibold transition-colors"
                style={{ backgroundColor: active ? "var(--foreground)" : "transparent", color: active ? "var(--background)" : "var(--muted-foreground)" }}>
                {t(`admin.payouts.tab.${k}`)} ({count})
              </button>
            );
          })}
        </div>

        {list.length === 0 ? (
          <p className="rounded-2xl border border-border p-4 text-center text-[12px] text-muted-foreground">{t("admin.empty")}</p>
        ) : (
          <ul className="space-y-2">
            {list.map((p) => {
              const isActionable = p.status === "requested" || p.status === "processing";
              const destText = Object.entries(p.destination ?? {}).map(([k, v]) => `${k}: ${v}`).join("\n");
              return (
                <li key={p.id} className="rounded-2xl border border-border p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[14px] font-semibold">@{p.seller_handle ?? p.seller_id.slice(0, 8)}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {t("admin.payouts.requestedAt")}: {new Date(p.requested_at).toLocaleString(i18n.language)}
                      </p>
                      {p.processed_at && (
                        <p className="text-[11px] text-muted-foreground">
                          {t("admin.payouts.processedAt")}: {new Date(p.processed_at).toLocaleString(i18n.language)}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-[15px] font-bold tabular-nums">{formatMoney(Number(p.amount), normalizeCurrency(p.currency), i18n.language)}</p>
                      <p className="text-[11px] text-muted-foreground">{t(`payout.method.${p.method}`)}</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => copy(destText)}
                    className="mt-2 flex w-full items-start justify-between gap-2 rounded-xl bg-muted p-2 text-left">
                    <pre className="whitespace-pre-wrap break-all text-[11px] text-muted-foreground">{destText}</pre>
                    <Copy size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
                  </button>

                  {p.status === "paid" && p.proof_url && (
                    <ProofThumbnail path={p.proof_url} />
                  )}
                  {p.admin_note && (
                    <p className="mt-2 rounded-xl bg-muted p-2 text-[12px] leading-relaxed">
                      <span className="font-semibold">{t("admin.payouts.adminNote")}: </span>
                      {p.admin_note}
                    </p>
                  )}

                  {isActionable ? (
                    <div className="mt-2 flex gap-2">
                      <Press onClick={() => { haptic.medium(); setSheetTarget({ row: p, action: "paid" }); }}
                        className="flex-1 rounded-xl py-2 text-[13px] font-bold text-white"
                        style={{ backgroundColor: "oklch(0.62 0.16 155)" }}>
                        <span className="inline-flex items-center gap-1"><Check size={14} />{t("admin.markPaid")}</span>
                      </Press>
                      <Press onClick={() => { haptic.medium(); setSheetTarget({ row: p, action: "rejected" }); }}
                        className="flex-1 rounded-xl border py-2 text-[13px] font-bold">
                        <span className="inline-flex items-center gap-1"><X size={14} />{t("admin.reject")}</span>
                      </Press>
                    </div>
                  ) : (
                    <p className="mt-2 text-right text-[11px] font-semibold uppercase text-muted-foreground">{t(`payout.status.${p.status}`)}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title={t("admin.orders.title")}>
        <div className="mb-2 flex flex-wrap gap-1">
          {statusOptions.map((s) => (
            <Press key={s ?? "all"} onClick={() => setStatus(s)}
              className={`rounded-full px-3 py-1 text-[11px] font-semibold ${status === s ? "bg-foreground text-background" : "bg-muted"}`}>
              {s === null ? t("admin.orders.filterAll") : t(`orders.status.${s}`)}
            </Press>
          ))}
        </div>
        {orders.length === 0 ? (
          <p className="rounded-2xl border border-border p-4 text-center text-[12px] text-muted-foreground">{t("admin.orders.empty")}</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
            {orders.map((o) => (
              <li key={o.id} className="flex items-center gap-2 p-2.5">
                {o.item_image
                  ? <img src={o.item_image} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
                  : <div className="h-9 w-9 shrink-0 rounded-lg bg-muted" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold">{o.item_name}</p>
                  <p className="truncate text-[10px] text-muted-foreground">@{o.buyer_handle ?? "?"} → @{o.seller_handle ?? "?"} · {o.status === "cancelled" && o.cancelled_reason === "payment_timeout" ? t("orders.status.paymentTimeout") : t(`orders.status.${o.status}`, o.status)} · {o.payment_method}</p>
                </div>
                <div className="text-right">
                  <p className="text-[13px] font-bold tabular-nums">{formatMoney(Number(o.total), normalizeCurrency(o.currency), i18n.language)}</p>
                  <p className="text-[10px] text-muted-foreground">{new Date(o.created_at).toLocaleDateString(i18n.language)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <ProcessPayoutSheet
        target={sheetTarget}
        onClose={() => setSheetTarget(null)}
        onDone={() => { setSheetTarget(null); void loadPayouts(); }}
      />
    </div>
  );
}

// ---------- Process payout sheet (mark paid / reject with proof + note) ----------

function ProcessPayoutSheet({
  target,
  onClose,
  onDone,
}: {
  target: { row: AdminPayoutRow; action: "paid" | "rejected" } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setFile(null); setPreview(null); setNote("");
  }, [target?.row.id, target?.action]);

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (!target) return null;
  const { row, action } = target;
  const destText = Object.entries(row.destination ?? {}).map(([k, v]) => `${k}: ${v}`).join("\n");

  const submit = async () => {
    setBusy(true);
    let proofPath: string | null = null;
    if (action === "paid" && file) {
      const up = await uploadPayoutProof(row.id, file);
      if (!up.ok) { setBusy(false); haptic.warning(); toast.error(up.error); return; }
      proofPath = up.path;
    }
    const r = await adminProcessPayout(row.id, action, {
      proofUrl: proofPath,
      adminNote: note.trim() || null,
    });
    setBusy(false);
    if (r.ok) {
      haptic.success();
      toast.success(t(action === "paid" ? "admin.markedPaid" : "admin.markedRejected"));
      onDone();
    } else {
      haptic.warning();
      toast.error(r.error);
    }
  };

  return (
    <PushScreen
      open={!!target}
      onClose={onClose}
      title={t(action === "paid" ? "admin.payouts.confirmPaidTitle" : "admin.payouts.confirmRejectTitle")}
      zIndex={85}
    >
      <div className="space-y-4 px-4 py-4">
        <div className="rounded-2xl border border-border p-3">
          <div className="flex items-center justify-between">
            <p className="text-[14px] font-semibold">@{row.seller_handle ?? row.seller_id.slice(0, 8)}</p>
            <p className="text-[16px] font-bold tabular-nums">{formatMoney(Number(row.amount), normalizeCurrency(row.currency), i18n.language)}</p>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">{t(`payout.method.${row.method}`)}</p>
          <pre className="mt-2 whitespace-pre-wrap break-all rounded-xl bg-muted p-2 text-[11px] text-muted-foreground">{destText}</pre>
        </div>

        {action === "paid" && (
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold">{t("admin.payouts.proofLabel")}</label>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-border p-4 text-[13px] text-muted-foreground">
              {preview ? (
                <img src={preview} alt="" className="max-h-48 rounded-lg object-contain" />
              ) : (
                <span className="inline-flex items-center gap-2"><Upload size={16} />{t("admin.payouts.proofChoose")}</span>
              )}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <p className="mt-1 text-[10px] text-muted-foreground">{t("admin.payouts.proofHint")}</p>
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-[12px] font-semibold">
            {action === "paid" ? t("admin.payouts.noteLabel") : t("admin.payouts.rejectNoteLabel")}
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder={action === "paid" ? t("admin.payouts.notePh") : t("admin.payouts.rejectNotePh")}
            className="w-full resize-none rounded-2xl border border-border bg-background p-3 text-[13px] outline-none"
          />
        </div>

        <Press
          onClick={submit}
          className="w-full rounded-2xl py-3 text-[15px] font-bold text-white"
          style={{ backgroundColor: action === "paid" ? "oklch(0.62 0.16 155)" : "oklch(0.55 0.2 27)" }}
        >
          {busy ? <Loader2 className="mx-auto animate-spin" size={16} /> : t(action === "paid" ? "admin.payouts.confirmPaidCta" : "admin.payouts.confirmRejectCta")}
        </Press>
      </div>
    </PushScreen>
  );
}

function ProofThumbnail({ path }: { path: string }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { let alive = true; void signPayoutProofUrl(path).then((u) => { if (alive) setUrl(u); }); return () => { alive = false; }; }, [path]);
  if (!url) return (
    <div className="mt-2 flex items-center gap-2 rounded-xl bg-muted p-2 text-[11px] text-muted-foreground">
      <ImageIcon size={14} /> {t("admin.payouts.proofLoading")}
    </div>
  );
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="mt-2 block">
      <img src={url} alt={t("admin.payouts.proofAlt")} className="max-h-40 w-auto rounded-xl border border-border object-contain" />
    </a>
  );
}


// ---------- Lives ----------

function LivesTab() {
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState<AdminLiveRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => { setRows(await fetchAdminLives()); setLoading(false); };
  useEffect(() => { void load(); }, []);

  if (loading) return <Skeleton />;
  if (rows.length === 0) return <p className="py-16 text-center text-[13px] text-muted-foreground">{t("admin.lives.empty")}</p>;

  return (
    <ul className="space-y-2">
      {rows.map((l) => (
        <li key={l.id} className="rounded-2xl border border-border p-3">
          <div className="flex items-start gap-3">
            {l.cover_url
              ? <img src={l.cover_url} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
              : <div className="h-14 w-14 shrink-0 rounded-lg bg-muted" />}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                {l.status === "live" && (
                  <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-bold text-white">{t("admin.lives.live")}</span>
                )}
                <p className="truncate text-[14px] font-semibold">{l.title}</p>
              </div>
              <p className="truncate text-[11px] text-muted-foreground">@{l.seller_handle ?? "?"} · {new Date(l.started_at).toLocaleString(i18n.language)}</p>
              <div className="mt-1 flex gap-3 text-[11px] text-muted-foreground">
                <span>{t("admin.lives.viewers")}: <b className="text-foreground tabular-nums">{l.viewer_count}</b></span>
                <span>{t("admin.lives.gmv")}: <b className="text-foreground tabular-nums">{formatMoney(Number(l.gmv), normalizeCurrency(l.currency), i18n.language)}</b></span>
                <span>#{l.orders_count}</span>
              </div>
              {l.status === "live" && (
                <EndLiveButton liveId={l.id} onEnded={() => void load()} />
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---------- Verifications ----------

function VerificationsTab() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof import("@/lib/verification-db").fetchPendingRequests>>>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const mod = await import("@/lib/verification-db");
    setRows(await mod.fetchPendingRequests());
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  async function act(id: string, approve: boolean) {
    setBusy(id);
    const mod = await import("@/lib/verification-db");
    const note = approve ? undefined : window.prompt(t("verify.rejectNote", "Motif du refus (optionnel)")) || undefined;
    const res = await mod.reviewRequest(id, approve, note);
    setBusy(null);
    if (!res.ok) { toast.error(res.error ?? "Erreur"); return; }
    toast.success(approve ? t("verify.approved", "Approuvé ✓") : t("verify.rejected", "Refusé"));
    await load();
  }

  if (loading) return <div className="py-8 text-center text-sm text-muted-foreground">…</div>;
  if (rows.length === 0) return <div className="py-8 text-center text-sm text-muted-foreground">{t("verify.noPending", "Aucune demande en attente")}</div>;

  return (
    <ul className="space-y-2">
      {rows.map((r) => {
        const e = r.eligibility;
        return (
          <li key={r.id} className="rounded-2xl border border-border bg-card p-3">
            <div className="flex items-center gap-3">
              <img src={r.profile?.avatar_url || "/placeholder.svg"} alt="" className="h-10 w-10 rounded-full object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold">{r.profile?.display_name}</p>
                <p className="truncate text-[11px] text-muted-foreground">@{r.profile?.handle}</p>
              </div>
            </div>
            {e && (
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
                <div>Ventes: <span className="text-foreground">{e.sales_count}</span> {e.sales_ok ? "✓" : "✗"}</div>
                <div>Note: <span className="text-foreground">{e.rating_avg} ★ / {e.review_count}</span> {e.rating_ok ? "✓" : "✗"}</div>
                <div>Ancienneté: <span className="text-foreground">{e.age_days}j</span> {e.age_ok ? "✓" : "✗"}</div>
                <div>Sanctions: {e.no_sanction ? "aucune ✓" : "actives ✗"}</div>
              </div>
            )}
            {r.message && <p className="mt-2 rounded-lg bg-muted/40 p-2 text-[12px] italic">"{r.message}"</p>}
            <div className="mt-3 flex gap-2">
              <Press
                onClick={() => void act(r.id, true)}
                disabled={busy === r.id}
                className="flex-1 rounded-full py-2 text-[13px] font-semibold text-white"
                style={{ backgroundColor: "oklch(0.6 0.17 155)" }}
              >
                <Check size={14} className="inline" /> {t("verify.approve", "Approuver")}
              </Press>
              <Press
                onClick={() => void act(r.id, false)}
                disabled={busy === r.id}
                className="flex-1 rounded-full py-2 text-[13px] font-semibold text-white"
                style={{ backgroundColor: "oklch(0.55 0.16 25)" }}
              >
                <X size={14} className="inline" /> {t("verify.reject", "Rejeter")}
              </Press>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

