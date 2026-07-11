// Admin push broadcast panel.
// - Mode toggle: "Tous les utilisateurs" / "Utilisateurs ciblés"
// - Multi-select user search (typeahead) reusing fetchAdminUsers
// - Predefined templates (bienvenue, avertissement, nouveau live, promo, info, custom)
// - Custom title + body inputs
// - Send button + result summary
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bell, Loader2, Search, Users, X, Check } from "lucide-react";
import { Press } from "@/components/press";
import { haptic } from "@/lib/haptics";
import { fetchAdminUsers, type AdminUserRow } from "@/lib/admin-db";
import { sendAdminPush } from "@/lib/push-admin.functions";

type Template = {
  id: string;
  label: string;
  emoji: string;
  title: string;
  body: string;
};

const TEMPLATES: Template[] = [
  {
    id: "welcome",
    label: "Bienvenue",
    emoji: "👋",
    title: "Bienvenue sur KiDi+ 🎉",
    body: "Découvre les lives en cours et fais tes premières enchères !",
  },
  {
    id: "warning",
    label: "Avertissement",
    emoji: "⚠️",
    title: "Avertissement ⚠️",
    body: "Ton comportement enfreint nos règles. Merci de consulter la charte KiDi+.",
  },
  {
    id: "live",
    label: "Nouveau live",
    emoji: "🔴",
    title: "Un live vient de commencer 🔴",
    body: "Rejoins la vente en direct maintenant sur KiDi+ !",
  },
  {
    id: "promo",
    label: "Promo",
    emoji: "🎁",
    title: "Offre spéciale KiDi+ 🎁",
    body: "Profite de nos meilleures ventes flash cette semaine !",
  },
  {
    id: "info",
    label: "Info",
    emoji: "ℹ️",
    title: "Information KiDi+",
    body: "Une mise à jour importante est disponible dans ton app.",
  },
  {
    id: "reminder",
    label: "Rappel",
    emoji: "⏰",
    title: "Ne rate pas ton live ⏰",
    body: "Le live que tu suis commence bientôt !",
  },
  {
    id: "payment",
    label: "Paiement",
    emoji: "💳",
    title: "Paiement en attente 💳",
    body: "Finalise le paiement de ta commande pour la sécuriser.",
  },
  {
    id: "thanks",
    label: "Merci",
    emoji: "💛",
    title: "Merci de faire partie de KiDi+ 💛",
    body: "Ta communauté te remercie pour ton soutien.",
  },
];

export function AdminPushPanel() {
  const send = useServerFn(sendAdminPush);
  const [mode, setMode] = useState<"all" | "user_ids">("user_ids");
  const [templateId, setTemplateId] = useState<string>("welcome");
  const [title, setTitle] = useState(TEMPLATES[0].title);
  const [body, setBody] = useState(TEMPLATES[0].body);
  const [selected, setSelected] = useState<AdminUserRow[]>([]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<AdminUserRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState<{
    targetedUsers: number;
    sent: number;
    failed: number;
    invalidTokens: number;
  } | null>(null);

  // Debounced user search
  useEffect(() => {
    if (mode !== "user_ids") return;
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    const h = window.setTimeout(async () => {
      const r = await fetchAdminUsers(q.trim(), 20, 0);
      setResults(r.rows);
      setSearching(false);
    }, 250);
    return () => window.clearTimeout(h);
  }, [q, mode]);

  const canSend = useMemo(() => {
    if (!title.trim() && !body.trim()) return false;
    if (mode === "user_ids" && selected.length === 0) return false;
    return !sending;
  }, [title, body, mode, selected, sending]);

  function pickTemplate(t: Template) {
    haptic.selection();
    setTemplateId(t.id);
    setTitle(t.title);
    setBody(t.body);
  }

  function toggleUser(u: AdminUserRow) {
    haptic.selection();
    setSelected((prev) => {
      if (prev.some((x) => x.id === u.id)) return prev.filter((x) => x.id !== u.id);
      return [...prev, u];
    });
  }

  async function onSend() {
    if (!canSend) return;
    const targetLabel =
      mode === "all"
        ? "TOUS les utilisateurs avec un appareil enregistré"
        : `${selected.length} utilisateur(s) sélectionné(s)`;
    if (!window.confirm(`Envoyer cette notification à ${targetLabel} ?`)) return;

    setSending(true);
    setLastResult(null);
    try {
      const r = await send({
        data: {
          mode,
          userIds: mode === "user_ids" ? selected.map((u) => u.id) : undefined,
          title: title.trim(),
          body: body.trim(),
        },
      });
      setLastResult(r);
      haptic.success();
      if (r.sent === 0 && r.targetedUsers === 0) {
        toast.warning("Aucun destinataire avec appareil enregistré");
      } else if (r.sent === 0) {
        toast.error("Aucune push envoyée (échecs uniquement)");
      } else {
        toast.success(`Push envoyée à ${r.sent} appareil(s)`);
      }
    } catch (e) {
      console.error(e);
      toast.error(String((e as Error).message ?? e));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Mode */}
      <Section title="Destinataires">
        <div className="grid grid-cols-2 gap-2">
          <Press
            onClick={() => {
              haptic.selection();
              setMode("user_ids");
            }}
            className="flex items-center justify-center gap-2 rounded-2xl border p-3 text-[13px] font-semibold"
            style={{
              borderColor: mode === "user_ids" ? "var(--primary)" : "var(--border)",
              background: mode === "user_ids" ? "color-mix(in oklab, var(--primary) 12%, transparent)" : undefined,
            }}
          >
            <Search size={14} /> Cibler
          </Press>
          <Press
            onClick={() => {
              haptic.selection();
              setMode("all");
              setSelected([]);
            }}
            className="flex items-center justify-center gap-2 rounded-2xl border p-3 text-[13px] font-semibold"
            style={{
              borderColor: mode === "all" ? "var(--primary)" : "var(--border)",
              background: mode === "all" ? "color-mix(in oklab, var(--primary) 12%, transparent)" : undefined,
            }}
          >
            <Users size={14} /> Tous
          </Press>
        </div>
      </Section>

      {/* User search (only in user_ids mode) */}
      {mode === "user_ids" && (
        <Section title="Rechercher des utilisateurs">
          <div className="flex items-center gap-2 rounded-2xl border border-border px-3 py-2">
            <Search size={14} className="text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nom, @handle ou email…"
              className="min-w-0 flex-1 bg-transparent text-[14px] outline-none"
            />
            {searching && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
          </div>

          {selected.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {selected.map((u) => (
                <span
                  key={u.id}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[11px] font-semibold"
                >
                  {u.display_name}
                  <button
                    aria-label="Retirer"
                    onClick={() => toggleUser(u)}
                    className="ml-0.5 rounded-full p-0.5 hover:bg-background"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {results.length > 0 && (
            <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto">
              {results.map((u) => {
                const picked = selected.some((x) => x.id === u.id);
                return (
                  <li key={u.id}>
                    <button
                      onClick={() => toggleUser(u)}
                      className="flex w-full items-center gap-2 rounded-xl border border-border p-2 text-left"
                      style={{
                        background: picked ? "color-mix(in oklab, var(--primary) 10%, transparent)" : undefined,
                      }}
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-[11px] font-bold">
                        {(u.display_name || "?").slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold">{u.display_name}</p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          @{u.handle} · {u.email}
                        </p>
                      </div>
                      {picked && <Check size={14} className="text-primary" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      )}

      {/* Templates */}
      <Section title="Messages prédéfinis">
        <div className="grid grid-cols-2 gap-2">
          {TEMPLATES.map((t) => {
            const active = templateId === t.id;
            return (
              <Press
                key={t.id}
                onClick={() => pickTemplate(t)}
                className="flex items-center gap-2 rounded-2xl border p-2.5 text-left text-[12px] font-semibold"
                style={{
                  borderColor: active ? "var(--primary)" : "var(--border)",
                  background: active ? "color-mix(in oklab, var(--primary) 10%, transparent)" : undefined,
                }}
              >
                <span className="text-[16px]">{t.emoji}</span>
                <span className="truncate">{t.label}</span>
              </Press>
            );
          })}
        </div>
      </Section>

      {/* Editable fields */}
      <Section title="Titre">
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setTemplateId("custom");
          }}
          maxLength={80}
          placeholder="Ex : Nouveau live 🔴"
          className="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-[14px] outline-none focus:border-primary"
        />
        <p className="mt-1 text-right text-[10px] text-muted-foreground">{title.length}/80</p>
      </Section>

      <Section title="Message">
        <textarea
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            setTemplateId("custom");
          }}
          maxLength={200}
          rows={3}
          placeholder="Contenu de la notification…"
          className="w-full resize-none rounded-2xl border border-border bg-background px-3 py-2.5 text-[14px] outline-none focus:border-primary"
        />
        <p className="mt-1 text-right text-[10px] text-muted-foreground">{body.length}/200</p>
      </Section>

      {/* Live preview */}
      <Section title="Aperçu">
        <div className="rounded-2xl border border-border bg-muted/40 p-3">
          <div className="flex items-start gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/20">
              <Bell size={14} className="text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold">{title || "KiDi+"}</p>
              <p className="line-clamp-2 text-[12px] text-muted-foreground">{body || "—"}</p>
            </div>
          </div>
        </div>
      </Section>

      {/* Send */}
      <Press
        onClick={onSend}
        disabled={!canSend}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-[14px] font-bold text-primary-foreground disabled:opacity-50"
      >
        {sending ? <Loader2 size={16} className="animate-spin" /> : <Bell size={16} />}
        {sending
          ? "Envoi en cours…"
          : mode === "all"
          ? "Envoyer à tous les utilisateurs"
          : `Envoyer à ${selected.length} utilisateur(s)`}
      </Press>

      {lastResult && (
        <div className="rounded-2xl border border-border p-3 text-[12px]">
          <p className="mb-1 font-semibold">Résultat</p>
          <ul className="space-y-0.5 text-muted-foreground">
            <li>Utilisateurs ciblés : <span className="font-semibold text-foreground">{lastResult.targetedUsers}</span></li>
            <li>Push envoyées : <span className="font-semibold text-foreground">{lastResult.sent}</span></li>
            <li>Échecs : <span className="font-semibold text-foreground">{lastResult.failed}</span></li>
            <li>Tokens invalides supprimés : <span className="font-semibold text-foreground">{lastResult.invalidTokens}</span></li>
          </ul>
        </div>
      )}

      <p className="pt-2 text-center text-[10px] text-muted-foreground">
        Les utilisateurs sans appareil enregistré ne reçoivent rien. Les tokens
        invalides sont automatiquement nettoyés.
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {children}
    </div>
  );
}
