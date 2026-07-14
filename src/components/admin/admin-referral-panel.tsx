// Admin: manage influencer promo codes.
// Default flow = create an UNASSIGNED code and hand the activation token to the
// influencer. Direct assignment is available behind an "advanced" toggle.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Loader2, Plus, RefreshCw, Search, Power, Users, Package, Eye, EyeOff,
  Copy, UserPlus, KeyRound, MessageCircle, CheckCircle2, Clock, ChevronDown, ChevronUp,
  Trash2,
} from "lucide-react";
import { Press } from "@/components/press";
import { formatMoney, normalizeCurrency } from "@/lib/money";
import { useLanguage } from "@/i18n/language-context";
import { haptic } from "@/lib/haptics";
import {
  fetchAdminPromoCodes, adminCreatePromoCode, adminSetPromoActive,
  adminRenewPromoCredits, adminSearchUsersByHandle, adminAssignPromoCode,
  adminDeletePromoCode,
  buildInfluencerOnboardingMessage,
  fetchAdminPromoCodeRequests, adminReviewPromoCodeRequest,
  type AdminPromoCodeRow, type UserSearchRow, type AdminPromoCodeRequestRow,
} from "@/lib/referrals-db";
import { AdminReferralReconciliation } from "./admin-referral-reconciliation";

export function AdminReferralPanel() {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const [rows, setRows] = useState<AdminPromoCodeRow[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [createdToken, setCreatedToken] = useState<{ code: string; token: string } | null>(null);
  const [subTab, setSubTab] = useState<"manage" | "recon">("manage");

  const reload = async () => setRows(await fetchAdminPromoCodes());
  useEffect(() => { void reload(); }, []);

  return (
    <div>
      <div className="mb-4 flex gap-1 rounded-full border border-border bg-muted/40 p-1">
        <button
          onClick={() => { haptic.light(); setSubTab("manage"); }}
          className={`flex-1 rounded-full px-3 py-1.5 text-[12px] font-semibold ${subTab === "manage" ? "bg-foreground text-background" : "text-muted-foreground"}`}
        >
          {t("referral.admin.subtab.manage", "Gestion")}
        </button>
        <button
          onClick={() => { haptic.light(); setSubTab("recon"); }}
          className={`flex-1 rounded-full px-3 py-1.5 text-[12px] font-semibold ${subTab === "recon" ? "bg-foreground text-background" : "text-muted-foreground"}`}
        >
          {t("referral.admin.subtab.recon", "Réconciliation")}
        </button>
      </div>

      {subTab === "recon" ? <AdminReferralReconciliation /> : (
      <>
      <RequestsSection />

      <div className="mb-4 mt-6 flex items-center justify-between">
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
        <OnboardingSheet
          code={createdToken.code}
          token={createdToken.token}
          lang={lang}
          onClose={() => setCreatedToken(null)}
        />
      )}
      </>
      )}
    </div>
  );
}

// ============================================================================
// Requests section — pending demandes de code de parrainage from users.
// ============================================================================

function RequestsSection() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<AdminPromoCodeRequestRow[] | null>(null);
  const [filter, setFilter] = useState<"pending" | "all">("pending");

  const reload = async () => {
    setRows(await fetchAdminPromoCodeRequests(filter === "pending" ? "pending" : undefined));
  };
  useEffect(() => { void reload(); }, [filter]);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[16px] font-bold">
          {t("referral.admin.requests.title", "Demandes de code")}
        </h2>
        <div className="flex gap-1 rounded-full bg-muted p-1 text-[11px] font-semibold">
          <button type="button" onClick={() => setFilter("pending")}
            className={`rounded-full px-2.5 py-1 ${filter === "pending" ? "bg-background shadow" : "text-muted-foreground"}`}>
            {t("referral.admin.requests.pending", "En attente")}
          </button>
          <button type="button" onClick={() => setFilter("all")}
            className={`rounded-full px-2.5 py-1 ${filter === "all" ? "bg-background shadow" : "text-muted-foreground"}`}>
            {t("referral.admin.requests.all", "Toutes")}
          </button>
        </div>
      </div>

      {rows === null ? (
        <div className="flex h-20 items-center justify-center text-muted-foreground">
          <Loader2 size={16} className="animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-4 text-center text-[12px] text-muted-foreground">
          {t("referral.admin.requests.empty", "Aucune demande pour l'instant.")}
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => <RequestRow key={r.id} row={r} onChange={reload} />)}
        </div>
      )}
    </div>
  );
}

function RequestRow({ row, onChange }: { row: AdminPromoCodeRequestRow; onChange: () => void }) {
  const { t } = useTranslation();
  const [reviewing, setReviewing] = useState<null | "approve" | "reject">(null);

  const pending = row.status === "pending";
  const statusBadge = pending
    ? { txt: t("referral.admin.requests.pending", "En attente"), cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" }
    : row.status === "approved"
      ? { txt: t("referral.admin.requests.approved", "Approuvée"), cls: "bg-green-500/15 text-green-700 dark:text-green-400" }
      : { txt: t("referral.admin.requests.rejected", "Refusée"), cls: "bg-red-500/15 text-red-700 dark:text-red-400" };

  return (
    <div className="rounded-2xl border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-bold">
              {row.user_name ?? row.user_handle ?? "—"}
            </span>
            {row.user_handle && (
              <span className="text-[11px] text-muted-foreground">@{row.user_handle}</span>
            )}
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusBadge.cls}`}>
              {statusBadge.txt}
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground">
            {new Date(row.created_at).toLocaleString()}
          </div>
        </div>
      </div>

      {row.message && (
        <p className="mt-2 whitespace-pre-wrap rounded-xl bg-muted/50 p-3 text-[12px]">
          {row.message}
        </p>
      )}

      {row.admin_note && !pending && (
        <p className="mt-2 text-[11px]">
          <span className="font-semibold">
            {t("referral.claim.request.reason", "Motif :")}
          </span>{" "}
          <span className="text-muted-foreground">{row.admin_note}</span>
        </p>
      )}

      {pending && (
        <div className="mt-3 flex gap-2">
          <Press onClick={() => setReviewing("reject")}
            className="!min-h-9 inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-muted py-2 text-[12px] font-semibold">
            {t("referral.admin.requests.reject", "Refuser")}
          </Press>
          <Press onClick={() => setReviewing("approve")}
            className="!min-h-9 inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-foreground py-2 text-[12px] font-semibold text-background">
            {t("referral.admin.requests.approve", "Approuver")}
          </Press>
        </div>
      )}

      {reviewing && (
        <ReviewSheet
          row={row}
          action={reviewing}
          onClose={() => setReviewing(null)}
          onDone={() => { setReviewing(null); onChange(); }}
        />
      )}
    </div>
  );
}

function ReviewSheet({
  row, action, onClose, onDone,
}: {
  row: AdminPromoCodeRequestRow;
  action: "approve" | "reject";
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const suggested = (row.user_handle ?? "").toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 20);
  const [code, setCode] = useState(suggested);
  const [quota, setQuota] = useState(14);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (action === "approve") {
      if (!/^[A-Z0-9_-]{4,20}$/.test(code)) {
        toast.error(t("referral.admin.badFormat", "Code : 4–20 caractères A-Z, 0-9, _ ou -"));
        return;
      }
    }
    setBusy(true);
    const res = await adminReviewPromoCodeRequest(row.id, action, {
      code: action === "approve" ? code : undefined,
      reward_quota: quota,
      note: note.trim() || undefined,
    });
    setBusy(false);
    if (!res.ok) { toast.error(res.error); return; }
    haptic.success();
    toast.success(action === "approve"
      ? t("referral.admin.requests.approvedToast", "Demande approuvée — code créé et notification envoyée")
      : t("referral.admin.requests.rejectedToast", "Demande refusée — notification envoyée"));
    onDone();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end bg-black/60" onClick={onClose}>
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-background p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-muted" />
        <h3 className="text-[16px] font-bold">
          {action === "approve"
            ? t("referral.admin.requests.approveTitle", "Approuver la demande")
            : t("referral.admin.requests.rejectTitle", "Refuser la demande")}
        </h3>
        <p className="mt-1 text-[12px] text-muted-foreground">
          {row.user_name ?? row.user_handle}
        </p>

        {action === "approve" && (
          <>
            <label className="mt-4 block text-[12px] font-semibold text-muted-foreground">
              {t("referral.admin.codeLabel", "Code public (4–20 caractères)")}
            </label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="AMINATA"
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
          </>
        )}

        <label className="mt-3 block text-[12px] font-semibold text-muted-foreground">
          {action === "approve"
            ? t("referral.admin.requests.noteApprove", "Note interne (optionnel)")
            : t("referral.admin.requests.noteReject", "Motif du refus (envoyé à l'utilisateur)")}
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 500))}
          rows={3}
          className="mt-1 w-full rounded-xl border border-border bg-transparent px-3 py-2 text-[13px]"
        />

        <div className="mt-4 flex gap-2">
          <Press onClick={onClose}
            className="!min-h-11 inline-flex flex-1 items-center justify-center rounded-2xl bg-muted py-3 text-[14px] font-semibold">
            {t("common.cancel", "Annuler")}
          </Press>
          <Press disabled={busy} onClick={submit}
            className={`!min-h-11 inline-flex flex-1 items-center justify-center rounded-2xl py-3 text-[14px] font-bold disabled:opacity-50 ${
              action === "approve" ? "bg-foreground text-background" : "bg-red-600 text-white"
            }`}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : (
              action === "approve"
                ? t("referral.admin.requests.approve", "Approuver")
                : t("referral.admin.requests.reject", "Refuser")
            )}
          </Press>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Row
// ============================================================================

function CodeRow({
  row, lang, onChange,
}: { row: AdminPromoCodeRow; lang: "fr" | "en"; onChange: () => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<null | "toggle" | "renew" | "assign" | "delete">(null);
  const [showToken, setShowToken] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
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

  const remove = async () => {
    const ok = window.confirm(
      t(
        "referral.admin.deleteConfirm",
        "Supprimer le code {{c}} ?\n\nSi des filleuls existent, il sera désactivé et rendu inutilisable pour toute nouvelle inscription. Sinon il sera supprimé définitivement.",
        { c: row.code },
      ),
    );
    if (!ok) return;
    setBusy("delete");
    try {
      const r = await adminDeletePromoCode(row.id);
      if (!r.ok) throw new Error(r.error);
      haptic.success();
      toast.success(
        r.mode === "hard_deleted"
          ? t("referral.admin.deleted", "Code {{c}} supprimé", { c: r.code })
          : t("referral.admin.softDeleted", "Code {{c}} désactivé (des filleuls existent)", { c: r.code }),
      );
      onChange();
    } catch (e) { toast.error(String((e as Error).message ?? e)); }
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
            {claimed ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-bold text-green-700 dark:text-green-400">
                <CheckCircle2 size={11} />
                {t("referral.admin.statusClaimed", "Réclamé par @{{h}}", { h: row.owner_handle ?? "—" })}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">
                <Clock size={11} />
                {t("referral.admin.statusPending", "En attente de réclamation")}
              </span>
            )}
          </div>
          <div className="mt-0.5 truncate text-[12px] text-muted-foreground">
            {claimed
              ? (row.owner_name ?? "")
              : t("referral.admin.awaiting", "En attente de réclamation par l'influenceur")}
          </div>
        </div>
        <div className="text-right text-[11px] text-muted-foreground">
          {t("referral.quota", "Quota")}: <span className="font-bold text-foreground">{row.reward_quota}</span>
        </div>
      </div>

      {/* Activation token — only meaningful when unclaimed, but kept visible after claim for audit */}
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

      {/* Onboarding message CTA — only for unclaimed codes */}
      {!claimed && row.claim_token && (
        <Press
          onClick={() => { haptic.light(); setShowOnboarding(true); }}
          className="!min-h-9 mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-amber-500/50 bg-amber-500/5 py-2 text-[12px] font-semibold text-amber-700 dark:text-amber-400"
        >
          <MessageCircle size={12} />
          {t("referral.admin.sendOnboarding", "Envoyer les infos à l'influenceur")}
        </Press>
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
        <Press disabled={busy !== null} onClick={remove}
          className="!min-h-9 inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[12px] font-semibold text-rose-700 dark:text-rose-400">
          <Trash2 size={12} /> {t("referral.admin.delete", "Supprimer")}
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

      {showOnboarding && row.claim_token && (
        <OnboardingSheet
          code={row.code}
          token={row.claim_token}
          lang={lang}
          onClose={() => setShowOnboarding(false)}
        />
      )}
    </div>
  );
}

// ============================================================================
// Onboarding sheet — shown after creation and re-openable from unclaimed rows.
// Displays BOTH values (public code + activation token) with per-value copy
// plus a one-tap "Copy the message" that copies a WhatsApp-ready blurb.
// ============================================================================

function OnboardingSheet({
  code, token, lang, onClose,
}: { code: string; token: string; lang: "fr" | "en"; onClose: () => void }) {
  const { t } = useTranslation();

  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); haptic.success(); toast.success(label); }
    catch { toast.error("Copy failed"); }
  };

  const copyMsg = () => copy(
    buildInfluencerOnboardingMessage(code, token, lang),
    t("referral.admin.msgCopied", "Message copié — colle-le dans WhatsApp"),
  );

  return (
    <div className="fixed inset-0 z-[85] flex items-end bg-black/60" onClick={onClose}>
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-background p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-muted" />
        <h3 className="text-[17px] font-bold">
          {t("referral.admin.onboardingTitle", "Code créé ✅")}
        </h3>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {t("referral.admin.onboardingIntro", "Envoie ces informations à ton influenceur :")}
        </p>

        {/* Public code */}
        <div className="mt-4 rounded-2xl border border-border p-4">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {t("referral.admin.publicLabel", "Code public à partager")}
          </div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <span className="font-mono text-[24px] font-black tracking-wide">{code}</span>
            <Press onClick={() => copy(code, t("common.copied", "Copié"))}
              className="!min-h-9 inline-flex items-center gap-1 rounded-xl bg-muted px-3 py-2 text-[12px] font-semibold">
              <Copy size={12} /> {t("common.copy", "Copier")}
            </Press>
          </div>
        </div>

        {/* Activation token */}
        <div className="mt-3 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4">
          <div className="text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400">
            {t("referral.admin.secretLabel", "Code d'activation (secret)")}
          </div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <span className="font-mono text-[22px] font-black tracking-[0.25em]">{token}</span>
            <Press onClick={() => copy(token, t("common.copied", "Copié"))}
              className="!min-h-9 inline-flex items-center gap-1 rounded-xl bg-amber-500/15 px-3 py-2 text-[12px] font-semibold text-amber-700 dark:text-amber-400">
              <Copy size={12} /> {t("common.copy", "Copier")}
            </Press>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {t("referral.admin.secretHint", "L'influenceur en aura besoin une fois pour activer son compte partenaire.")}
          </p>
        </div>

        {/* One-tap WhatsApp-ready message */}
        <Press onClick={copyMsg}
          className="!min-h-11 mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-foreground py-3 text-[14px] font-bold text-background">
          <MessageCircle size={14} /> {t("referral.admin.copyMessage", "Copier le message (WhatsApp)")}
        </Press>

        <Press onClick={onClose}
          className="!min-h-10 mt-2 inline-flex w-full items-center justify-center rounded-2xl bg-muted py-2 text-[13px] font-semibold">
          {t("common.close", "Fermer")}
        </Press>
      </div>
    </div>
  );
}

// ============================================================================
// Create sheet — DEFAULT is unassigned. Direct-assign is a collapsed advanced toggle.
// ============================================================================

function CreateSheet({ onClose, onCreated }: { onClose: () => void; onCreated: (code: string, token: string) => void }) {
  const { t } = useTranslation();
  const [code, setCode] = useState("");
  const [quota, setQuota] = useState(14);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<UserSearchRow[]>([]);
  const [owner, setOwner] = useState<UserSearchRow | null>(null);
  const [assignNow, setAssignNow] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!assignNow || !q.trim()) { setResults([]); return; }
    const id = setTimeout(async () => { setResults(await adminSearchUsersByHandle(q, 8)); }, 200);
    return () => clearTimeout(id);
  }, [q, assignNow]);

  const submit = async () => {
    if (!/^[A-Za-z0-9_-]{4,20}$/.test(code.trim())) { toast.error(t("referral.admin.badFormat", "Code : 4–20 caractères A-Z, 0-9, _ ou -")); return; }
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
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-background p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-muted" />
        <h3 className="text-[16px] font-bold">{t("referral.admin.create", "Nouveau code")}</h3>
        <p className="mt-1 text-[12px] text-muted-foreground">
          {t("referral.admin.createIntro", "Par défaut, le code est « à réclamer » : l'influenceur active son compte avec un code d'activation secret.")}
        </p>

        <label className="mt-4 block text-[12px] font-semibold text-muted-foreground">
          {t("referral.admin.codeLabel", "Code public (4–20 caractères)")}
        </label>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="AMINATA"
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

        {/* Default mode banner */}
        {!assignNow && (
          <div className="mt-4 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-3">
            <div className="flex items-center gap-1.5 text-[12px] font-bold text-amber-700 dark:text-amber-400">
              <KeyRound size={12} /> {t("referral.admin.claimModeTitle", "Mode « Code à réclamer » (recommandé)")}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t("referral.admin.claimModeHint", "Après création, tu recevras un code d'activation secret à transmettre à l'influenceur.")}
            </p>
          </div>
        )}

        {/* Advanced: direct-assign toggle */}
        <div className="mt-3 rounded-2xl border border-border">
          <button
            type="button"
            onClick={() => setAdvancedOpen((o) => !o)}
            className="flex w-full items-center justify-between px-3 py-2.5 text-left text-[12px] font-semibold"
          >
            <span className="text-muted-foreground">
              {t("referral.admin.advanced", "Options avancées")}
            </span>
            {advancedOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {advancedOpen && (
            <div className="border-t border-border p-3">
              <label className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold">
                <input type="checkbox" checked={assignNow} onChange={(e) => setAssignNow(e.target.checked)} />
                {t("referral.admin.assignDirect", "Assigner directement à un compte existant (avancé)")}
              </label>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {t("referral.admin.assignDirectHint", "L'influenceur n'aura pas besoin du code d'activation. À utiliser uniquement si tu es sûre du compte destinataire.")}
              </p>

              {assignNow && (
                <>
                  <div className="mt-3 flex items-center gap-2 rounded-xl border border-border px-3">
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

// ============================================================================
// Assign sheet (from list row)
// ============================================================================

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
