// Admin: manage influencer promo codes (assigned or unassigned).
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2, Plus, RefreshCw, Search, Power, Users, Package, Eye, EyeOff, Copy, UserPlus, KeyRound } from "lucide-react";
import { Press } from "@/components/press";
import { formatMoney, normalizeCurrency } from "@/lib/money";
import { useLanguage } from "@/i18n/language-context";
import { haptic } from "@/lib/haptics";
import {
  fetchAdminPromoCodes, adminCreatePromoCode, adminSetPromoActive,
  adminRenewPromoCredits, adminSearchUsersByHandle, adminAssignPromoCode,
  type AdminPromoCodeRow, type UserSearchRow,
} from "@/lib/referrals-db";

export function AdminReferralPanel() {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const [rows, setRows] = useState<AdminPromoCodeRow[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [createdToken, setCreatedToken] = useState<{ code: string; token: string } | null>(null);

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

      {creating && (
        <CreateSheet
          onClose={() => setCreating(false)}
          onCreated={(code, token) => { void reload(); setCreating(false); setCreatedToken({ code, token }); }}
        />
      )}
      {createdToken && (
        <TokenRevealSheet
          code={createdToken.code}
          token={createdToken.token}
          onClose={() => setCreatedToken(null)}
        />
      )}
    </div>
  );
}

function CodeRow({
  row, lang, onChange,
}: { row: AdminPromoCodeRow; lang: "fr" | "en"; onChange: () => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<null | "toggle" | "renew" | "assign">(null);
  const [showToken, setShowToken] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const claimed = row.owner_id != null;

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

  const copyTok = async () => {
    if (!row.claim_token) return;
    try { await navigator.clipboard.writeText(row.claim_token); haptic.success(); toast.success(t("common.copied", "Copié")); }
    catch { toast.error("Copy failed"); }
  };

  return (
    <div className="rounded-2xl border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[18px] font-black tracking-wide">{row.code}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${row.active ? "bg-green-500/15 text-green-700 dark:text-green-400" : "bg-muted text-muted-foreground"}`}>
              {row.active ? t("common.active", "Actif") : t("common.inactive", "Inactif")}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${claimed ? "bg-blue-500/15 text-blue-700 dark:text-blue-400" : "bg-amber-500/15 text-amber-700 dark:text-amber-400"}`}>
              {claimed ? t("referral.admin.claimed", "Réclamé") : t("referral.admin.unclaimed", "Non réclamé")}
            </span>
          </div>
          <div className="mt-0.5 truncate text-[12px] text-muted-foreground">
            {claimed
              ? `@${row.owner_handle ?? "—"} · ${row.owner_name ?? ""}`
              : t("referral.admin.awaiting", "En attente de réclamation par l'influenceur")}
          </div>
        </div>
        <div className="text-right text-[11px] text-muted-foreground">
          {t("referral.quota", "Quota")}: <span className="font-bold text-foreground">{row.reward_quota}</span>
        </div>
      </div>

      {/* Claim token row */}
      {row.claim_token && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2">
          <KeyRound size={12} className="text-muted-foreground shrink-0" />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {t("referral.admin.claimToken", "Code d'activation")}
          </span>
          <span className="ml-auto font-mono text-[13px] font-bold tracking-wider">
            {showToken ? row.claim_token : "••••-••••"}
          </span>
          <button type="button" onClick={() => setShowToken((s) => !s)}
            className="rounded-md p-1 hover:bg-muted" aria-label="reveal">
            {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
          <button type="button" onClick={copyTok}
            className="rounded-md p-1 hover:bg-muted" aria-label="copy">
            <Copy size={14} />
          </button>
        </div>
      )}

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
        {Object.keys(row.held_totals ?? {}).length > 0 && (
          <span className="font-semibold text-amber-600 dark:text-amber-400">
            ⏳ {t("referral.admin.held", "En attente")}: {Object.entries(row.held_totals)
              .map(([cur, amt]) => formatMoney(Number(amt), normalizeCurrency(cur), lang))
              .join(" · ")}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Press disabled={busy !== null} onClick={toggle}
          className="!min-h-9 inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-muted py-2 text-[12px] font-semibold">
          <Power size={12} /> {row.active ? t("referral.admin.deactivate", "Désactiver") : t("referral.admin.activate", "Activer")}
        </Press>
        <Press disabled={busy !== null} onClick={renew}
          className="!min-h-9 inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-muted py-2 text-[12px] font-semibold">
          <RefreshCw size={12} /> {t("referral.admin.renew", "Renouveler")}
        </Press>
        <Press disabled={busy !== null} onClick={() => setAssigning(true)}
          className="!min-h-9 inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-foreground py-2 text-[12px] font-semibold text-background">
          <UserPlus size={12} /> {claimed ? t("referral.admin.reassign", "Réassigner") : t("referral.admin.assign", "Assigner")}
        </Press>
      </div>

      {assigning && (
        <AssignSheet
          codeLabel={row.code}
          onClose={() => setAssigning(false)}
          onDone={() => { setAssigning(false); onChange(); }}
          submit={async (uid) => { await adminAssignPromoCode(row.id, uid); }}
        />
      )}
    </div>
  );
}

function TokenRevealSheet({ code, token, onClose }: { code: string; token: string; onClose: () => void }) {
  const { t } = useTranslation();
  const copy = async () => {
    try { await navigator.clipboard.writeText(token); haptic.success(); toast.success(t("common.copied", "Copié")); }
    catch { toast.error("Copy failed"); }
  };
  return (
    <div className="fixed inset-0 z-[85] flex items-end bg-black/60" onClick={onClose}>
      <div className="w-full rounded-t-3xl bg-background p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-muted" />
        <h3 className="text-[16px] font-bold">{t("referral.admin.tokenTitle", "Code d'activation — {{code}}", { code })}</h3>
        <p className="mt-1 text-[12px] text-muted-foreground">
          {t("referral.admin.tokenWarning", "⚠️ Copie-le maintenant et transmets-le à l'influenceur. Il pourra le voir de nouveau ici, mais évite de le partager publiquement.")}
        </p>
        <div className="my-4 rounded-2xl border border-border bg-muted/40 px-4 py-4 text-center font-mono text-[22px] font-black tracking-[0.3em]">
          {token}
        </div>
        <Press onClick={copy}
          className="!min-h-11 mt-1 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-foreground py-3 text-[14px] font-bold text-background">
          <Copy size={14} /> {t("common.copy", "Copier")}
        </Press>
      </div>
    </div>
  );
}

function CreateSheet({ onClose, onCreated }: { onClose: () => void; onCreated: (code: string, token: string) => void }) {
  const { t } = useTranslation();
  const [code, setCode] = useState("");
  const [quota, setQuota] = useState(14);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<UserSearchRow[]>([]);
  const [owner, setOwner] = useState<UserSearchRow | null>(null);
  const [assignNow, setAssignNow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!assignNow || !q.trim()) { setResults([]); return; }
    const id = setTimeout(async () => { setResults(await adminSearchUsersByHandle(q, 8)); }, 200);
    return () => clearTimeout(id);
  }, [q, assignNow]);

  const submit = async () => {
    if (!/^[A-Za-z0-9_-]{4,20}$/.test(code.trim())) { toast.error(t("referral.admin.badFormat", "Code: 4–20 caractères A-Z, 0-9, _ ou -")); return; }
    if (assignNow && !owner) { toast.error(t("referral.admin.pickOwner", "Choisis l'influenceur")); return; }
    setBusy(true);
    const res = await adminCreatePromoCode(code.trim().toUpperCase(), assignNow ? owner!.id : null, quota);
    setBusy(false);
    if (!res.ok) { toast.error(res.error); return; }
    toast.success(t("referral.admin.created", "Code créé"));
    onCreated(res.code, res.claim_token);
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

        <div className="mt-4 rounded-2xl border border-border p-3">
          <label className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold">
            <input type="checkbox" checked={assignNow} onChange={(e) => setAssignNow(e.target.checked)} />
            {t("referral.admin.assignNow", "Assigner un influenceur maintenant")}
          </label>
          {!assignNow ? (
            <p className="mt-2 text-[11px] text-muted-foreground">
              {t("referral.admin.assignLater", "Assigner plus tard — l'influenceur réclamera avec le code d'activation.")}
            </p>
          ) : (
            <>
              <div className="mt-2 flex items-center gap-2 rounded-xl border border-border px-3">
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
            </>
          )}
        </div>

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

function AssignSheet({
  codeLabel, onClose, onDone, submit,
}: {
  codeLabel: string; onClose: () => void; onDone: () => void;
  submit: (uid: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<UserSearchRow[]>([]);
  const [owner, setOwner] = useState<UserSearchRow | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    const id = setTimeout(async () => { setResults(await adminSearchUsersByHandle(q, 8)); }, 200);
    return () => clearTimeout(id);
  }, [q]);

  const go = async () => {
    if (!owner) return;
    setBusy(true);
    try { await submit(owner.id); haptic.success(); toast.success(t("referral.admin.assigned", "Assigné à @{{h}}", { h: owner.handle ?? "" })); onDone(); }
    catch (e) { toast.error(String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[82] flex items-end bg-black/60" onClick={onClose}>
      <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-background p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-muted" />
        <h3 className="text-[16px] font-bold">{t("referral.admin.assignTitle", "Assigner « {{code}} »", { code: codeLabel })}</h3>

        <div className="mt-3 flex items-center gap-2 rounded-xl border border-border px-3">
          <Search size={14} className="text-muted-foreground" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setOwner(null); }} placeholder="@handle"
            className="w-full bg-transparent py-2 text-[14px] outline-none" />
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

        <Press disabled={busy || !owner} onClick={go}
          className="!min-h-11 mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-foreground py-3 text-[14px] font-bold text-background disabled:opacity-50">
          {busy ? <Loader2 size={14} className="animate-spin" /> : t("referral.admin.assignBtn", "Confirmer l'assignation")}
        </Press>
      </div>
    </div>
  );
}
