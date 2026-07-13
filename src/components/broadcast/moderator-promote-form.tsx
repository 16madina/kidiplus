// Host typeahead to promote a KiDi+ user as live moderator.
// Search matches handle + display_name; tap a suggestion to promote.
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Press } from "@/components/press";
import { haptic } from "@/lib/haptics";
import {
  addModerator,
  resolveModeratorCandidateId,
  searchModeratorCandidates,
  type ModeratorCandidate,
} from "@/lib/moderators-db";

export type ModeratorPromoteFormProps = {
  liveId: string;
  addedBy: string;
  existingIds: Set<string>;
};

export function ModeratorPromoteForm({
  liveId,
  addedBy,
  existingIds,
}: ModeratorPromoteFormProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<ModeratorCandidate[]>([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const reqId = useRef(0);

  const excludeIds = useMemo(() => {
    const s = new Set(existingIds);
    s.add(addedBy);
    return s;
  }, [existingIds, addedBy]);

  // Debounced autocomplete
  useEffect(() => {
    const q = value.trim().replace(/^@+/, "");
    if (q.length < 1) {
      setSuggestions([]);
      setSearching(false);
      return;
    }
    const id = ++reqId.current;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void searchModeratorCandidates(q, { excludeIds, limit: 8 }).then((rows) => {
        if (reqId.current !== id) return;
        setSuggestions(rows);
        setSearching(false);
        setOpen(true);
      });
    }, 220);
    return () => window.clearTimeout(timer);
  }, [value, excludeIds]);

  // Close suggestions on outside tap
  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, []);

  const promote = async (userId: string) => {
    if (busy) return;
    if (existingIds.has(userId)) {
      toast(t("moderator.alreadyMod", "Déjà modérateur"));
      return;
    }
    if (userId === addedBy) {
      toast.error(t("moderator.cannotSelf", "Tu ne peux pas te promouvoir"));
      return;
    }
    setBusy(true);
    try {
      const res = await addModerator(liveId, userId, addedBy);
      if (!res.ok) {
        toast.error(res.error ?? t("moderator.addFailed", "Ajout impossible"));
        return;
      }
      haptic.selection();
      toast.success(t("moderator.added", "Modérateur ajouté 🛡️"));
      setValue("");
      setSuggestions([]);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const submitTyped = async () => {
    const raw = value.trim();
    if (!raw || busy) return;
    setBusy(true);
    try {
      // Prefer explicit suggestion match first
      const q = raw.replace(/^@+/, "").toLowerCase();
      const fromList =
        suggestions.find(
          (s) =>
            s.handle?.toLowerCase() === q ||
            s.displayName?.toLowerCase() === q ||
            s.id === raw,
        ) ??
        (suggestions.length === 1 ? suggestions[0] : null);

      if (fromList) {
        setBusy(false);
        await promote(fromList.id);
        return;
      }

      const userId = await resolveModeratorCandidateId(raw);
      if (!userId) {
        toast.error(
          suggestions.length > 1
            ? t("moderator.pickSuggestion", "Choisis un profil dans la liste")
            : t("moderator.notFound", "Profil introuvable"),
        );
        setOpen(suggestions.length > 0);
        return;
      }
      setBusy(false);
      await promote(userId);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={wrapRef} className="relative mt-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submitTyped();
        }}
        className="flex items-center gap-2"
      >
        <div className="relative min-w-0 flex-1">
          <input
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setOpen(true);
            }}
            onFocus={() => {
              if (suggestions.length > 0) setOpen(true);
            }}
            placeholder={t(
              "moderator.promotePlaceholder",
              "@handle ou nom du spectateur",
            )}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="w-full rounded-full border px-3 py-2 text-[13px] outline-none"
            style={{ borderColor: "var(--border)", background: "var(--card)" }}
          />
          {searching && (
            <Loader2
              size={14}
              className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground"
            />
          )}
        </div>
        <Press
          onClick={busy ? undefined : () => void submitTyped()}
          disabled={busy || !value.trim()}
          className="!min-h-9 h-9 shrink-0 rounded-full bg-foreground px-3 text-[12px] font-bold text-background disabled:opacity-50"
        >
          {busy ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            t("moderator.promote", "Promouvoir 🛡️")
          )}
        </Press>
      </form>

      {open && (suggestions.length > 0 || (value.trim().length > 0 && !searching)) && (
        <ul
          className="absolute inset-x-0 top-[calc(100%+6px)] z-40 max-h-56 overflow-y-auto rounded-2xl border py-1 shadow-lg"
          style={{
            borderColor: "var(--border)",
            background: "var(--card)",
          }}
        >
          {suggestions.length === 0 ? (
            <li className="px-3 py-2.5 text-[12px] text-muted-foreground">
              {t("moderator.noMatches", "Aucun profil trouvé")}
            </li>
          ) : (
            suggestions.map((s) => {
              const already = existingIds.has(s.id);
              const label = s.displayName || s.handle || s.id.slice(0, 8);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    disabled={busy || already}
                    onClick={() => void promote(s.id)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left disabled:opacity-45"
                    style={{ WebkitTapHighlightColor: "transparent" }}
                  >
                    {s.avatarUrl ? (
                      <img
                        src={s.avatarUrl}
                        alt=""
                        className="h-8 w-8 rounded-full object-cover"
                      />
                    ) : (
                      <div
                        className="grid h-8 w-8 place-items-center rounded-full text-[12px] font-bold text-white"
                        style={{ background: "var(--primary)" }}
                      >
                        {(label[0] || "?").toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold">
                        {s.displayName || s.handle || "—"}
                      </div>
                      {s.handle ? (
                        <div className="truncate text-[11px] text-muted-foreground">
                          @{s.handle}
                        </div>
                      ) : null}
                    </div>
                    {already ? (
                      <span className="text-[10px] font-bold uppercase text-muted-foreground">
                        {t("moderator.alreadyModShort", "Déjà")}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
