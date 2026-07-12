// Admin: manage influencer promo codes.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2, Plus, RefreshCw, Search, Power, Users, Package } from "lucide-react";
import { Press } from "@/components/press";
import { formatMoney, normalizeCurrency } from "@/lib/money";
import { useLanguage } from "@/i18n/language-context";
import { haptic } from "@/lib/haptics";
import {
  fetchAdminPromoCodes, adminCreatePromoCode, adminSetPromoActive,
  adminRenewPromoCredits, adminSearchUsersByHandle,
  type AdminPromoCodeRow, type UserSearchRow,
} from "@/lib/referrals-db";

export function AdminReferralPanel() {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const [rows, setRows] = useState<AdminPromoCodeRow[] | null>(null);
  const [creating, setCreating] = useState(false);

  const reload = async () => setRows(await fetchAdminPromoCodes());
  useEffect(() => { void reload(); }, []);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[16px] font-bold">{t("referral.admin.title", "Parrainage")}</h2>
        <Press
          onClick={() => { haptic.light(); setCreating(true); }}
          className="!min-h-9 inline-flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-[12px] font-semibold text-background"
        >
          <Plus size={14} /> {t("referral.admin.create", "Nouveau code")}
        </Press>
      </div>

      {rows === null ? (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          <Loader2 size={18} className="animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-8 text-center text-[13px] text-muted-foreground">
          {t("referral.admin.empty", "Aucun code promo pour l'instant.")}
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <CodeRow key={r.id} row={r} lang={lang} onChange={reload} />
          ))}
        </div>
      )}

      {creating && <CreateSheet onClose={() => setCreating(false)} onCreated={() => { void reload(); setCreating(false); }} />}
    </div>
  );
}

function CodeRow({
  row, lang, onChange,
}: { row: AdminPromoCodeRow; lang: "fr" | "en"; onChange: () => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<null | "toggle" | "renew">(null);

  const toggle = async () => {
    setBusy("toggle");
    try { await adminSetPromoActive(row.id, !row.active); haptic.success(); onChange(); }
    catch (e) { toast.error(String(e)); }
    finally { setBusy(null); }
  };

  const renew = async () => {
    const amt = Number(window.prompt(t("referral.admin.renewPrompt", "Ajouter combien de crédits à chaque parrainage ?"), "14"));
    if (!Number.isFinite(amt) || amt <= 0) return;
    setBusy("renew");
    try {
      const n = await adminRenewPromoCredits(row.id, Math.round(amt));
      haptic.success();
      toast.success(t("referral.admin.renewed", "{{n}} parrainage(s) crédité(s)", { n }));
      onChange();
    } catch (e) { toast.error(String(e)); }
    finally { setBusy(null); }
  };

  return (
    <div className="rounded-2xl border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[18px] font-black tracking-wide">{row.code}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${row.active ? "bg-green-500/15 text-green-700 dark:text-green-400" : "bg-muted text-muted-foreground"}`}>
              {row.active ? t("common.active", "Actif") : t("common.inactive", "Inactif")}
            </span>
          </div>
          <div className="mt-0.5 truncate text-[12px] text-muted-foreground">
            @{row.owner_handle ?? "—"} · {row.owner_name ?? ""}
          </div>
        </div>
        <div className="text-right text-[11px] text-muted-foreground">
          {t("referral.quota", "Quota")}: <span className="font-bold text-foreground">{row.reward_quota}</span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
        <span className="inline-flex items-center gap-1"><Users size={12} /> {row.signups} {t("referral.signups", "Inscrits").toLowerCase()}</span>
        <span className="inline-flex items-center gap-1"><Package size={12} /> {row.orders_credited} {t("referral.ordersCredited", "Commandes").toLowerCase()}</span>
        <span className="font-semibold">
          {Object.keys(row.totals).length === 0
            ? "—"
            : Object.entries(row.totals)
                .map(([cur, amt]) => formatMoney(Number(amt), normalizeCurrency(cur), lang))
                .join(" · ")}
        </span>
      </div>

      <div className="mt-3 flex gap-2">
        <Press
          disabled={busy !== null}
          onClick={toggle}
          className="!min-h-9 inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-muted py-2 text-[12px] font-semibold"
        >
          <Power size={12} /> {row.active ? t("referral.admin.deactivate", "Désactiver") : t("referral.admin.activate", "Activer")}
        </Press>
        <Press
          disabled={busy !== null}
          onClick={renew}
          className="!min-h-9 inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-foreground py-2 text-[12px] font-semibold text-background"
        >
          <RefreshCw size={12} /> {t("referral.admin.renew", "Renouveler")}
        </Press>
      </div>
    </div>
  );
}

function CreateSheet({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { t } = useTranslation();
  const [code, setCode] = useState("");
  const [quota, setQuota] = useState(14);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<UserSearchRow[]>([]);
  const [owner, setOwner] = useState<UserSearchRow | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    const id = setTimeout(async () => { setResults(await adminSearchUsersByHandle(q, 8)); }, 200);
    return () => clearTimeout(id);
  }, [q]);

  const submit = async () => {
    if (!owner) { toast.error(t("referral.admin.pickOwner", "Choisis l'influenceur")); return; }
    if (!/^[A-Za-z0-9_-]{4,20}$/.test(code.trim())) { toast.error(t("referral.admin.badFormat", "Code: 4–20 caractères A-Z, 0-9, _ ou -")); return; }
    setBusy(true);
    const res = await adminCreatePromoCode(code.trim().toUpperCase(), owner.id, quota);
    setBusy(false);
    if (!res.ok) { toast.error(res.error); return; }
    toast.success(t("referral.admin.created", "Code créé"));
    onCreated();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end bg-black/60" onClick={onClose}>
      <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-background p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-muted" />
        <h3 className="text-[16px] font-bold">{t("referral.admin.create", "Nouveau code")}</h3>

        <label className="mt-3 block text-[12px] font-semibold text-muted-foreground">
          {t("referral.admin.codeLabel", "Code (4–20 caractères)")}
        </label>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="INFLU2026"
          className="mt-1 w-full rounded-xl border border-border bg-transparent px-3 py-2 text-[15px] font-bold tracking-wide"
        />

        <label className="mt-3 block text-[12px] font-semibold text-muted-foreground">
          {t("referral.admin.quotaLabel", "Quota par inscrit")}
        </label>
        <input
          type="number" min={1} max={999}
          value={quota}
          onChange={(e) => setQuota(Math.max(1, Number(e.target.value) || 14))}
          className="mt-1 w-full rounded-xl border border-border bg-transparent px-3 py-2 text-[15px]"
        />

        <label className="mt-3 block text-[12px] font-semibold text-muted-foreground">
          {t("referral.admin.ownerLabel", "Influenceur (handle)")}
        </label>
        <div className="mt-1 flex items-center gap-2 rounded-xl border border-border px-3">
          <Search size={14} className="text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setOwner(null); }}
            placeholder="@handle"
            className="w-full bg-transparent py-2 text-[14px] outline-none"
          />
        </div>
        {owner ? (
          <div className="mt-2 rounded-xl bg-muted px-3 py-2 text-[12px]">
            {t("referral.admin.selected", "Sélectionné")}: <b>@{owner.handle}</b>
          </div>
        ) : results.length > 0 ? (
          <div className="mt-2 max-h-52 overflow-y-auto rounded-xl border border-border">
            {results.map((r) => (
              <button key={r.id} type="button" onClick={() => { setOwner(r); setQ(r.handle ?? ""); }}
                className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-muted">
                <span className="text-[13px] font-semibold">@{r.handle ?? "—"}</span>
                <span className="text-[11px] text-muted-foreground">{r.display_name}</span>
              </button>
            ))}
          </div>
        ) : null}

        <Press
          disabled={busy}
          onClick={submit}
          className="!min-h-11 mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-foreground py-3 text-[14px] font-bold text-background disabled:opacity-50"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : t("referral.admin.createBtn", "Créer le code")}
        </Press>
      </div>
    </div>
  );
}
