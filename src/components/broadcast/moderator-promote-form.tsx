// Host typeahead to promote a follower as live moderator (max 3).
// Search matches handle + display_name among people who follow the host.
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2, Radio, Users } from "lucide-react";
import { Press } from "@/components/press";
import { haptic } from "@/lib/haptics";
import { resolveAvatarUrl } from "@/lib/avatar-url";
import {
  addModerator,
  fetchFollowerModeratorCandidates,
  fetchModeratorCandidatesByIds,
  MAX_LIVE_MODERATORS,
  resolveModeratorCandidateId,
  searchModeratorCandidates,
  type ModeratorCandidate,
} from "@/lib/moderators-db";

export type ModeratorPromoteFormProps = {
  liveId: string;
  /** Host profile id (must match lives.seller_id). */
  hostId: string;
  addedBy: string;
  existingIds: Set<string>;
  /** Signed-in viewers currently in the live (from Supabase presence). */
  presentIds?: Array<{ id: string; name?: string }>;
};

function CandidateAvatar({
  candidate,
  size = 32,
}: {
  candidate: Pick<ModeratorCandidate, "displayName" | "handle" | "avatarUrl" | "avatarPath" | "id">;
  size?: number;
}) {
  const [url, setUrl] = useState<string | null>(candidate.avatarUrl);
  const [failed, setFailed] = useState(false);
  const label = candidate.displayName || candidate.handle || candidate.id.slice(0, 8);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    setUrl(candidate.avatarUrl);
    const raw = candidate.avatarPath || candidate.avatarUrl;
    if (!raw) return;
    void resolveAvatarUrl(raw).then((signed) => {
      if (!alive) return;
      if (signed) setUrl(signed);
    });
    return () => {
      alive = false;
    };
  }, [candidate.avatarUrl, candidate.avatarPath, candidate.id]);

  if (url && !failed) {
    return (
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div
      className="grid place-items-center rounded-full text-[12px] font-bold text-white"
      style={{ width: size, height: size, background: "var(--primary)" }}
    >
      {(label[0] || "?").toUpperCase()}
    </div>
  );
}

function CandidateRow({
  candidate,
  already,
  busy,
  badge,
  onPick,
}: {
  candidate: ModeratorCandidate;
  already: boolean;
  busy: boolean;
  badge?: string;
  onPick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      disabled={busy || already}
      onClick={onPick}
      className="flex w-full items-center gap-2.5 px-3 py-2 text-left disabled:opacity-45"
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      <CandidateAvatar candidate={candidate} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold">
          {candidate.displayName || candidate.handle || "—"}
        </div>
        {candidate.handle ? (
          <div className="truncate text-[11px] text-muted-foreground">
            @{candidate.handle}
          </div>
        ) : null}
      </div>
      {already ? (
        <span className="text-[10px] font-bold uppercase text-muted-foreground">
          {t("moderator.alreadyModShort", "Déjà")}
        </span>
      ) : badge ? (
        <span className="text-[10px] font-bold uppercase text-muted-foreground">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

export function ModeratorPromoteForm({
  liveId,
  hostId,
  addedBy,
  existingIds,
  presentIds = [],
}: ModeratorPromoteFormProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<ModeratorCandidate[]>([]);
  const [present, setPresent] = useState<ModeratorCandidate[]>([]);
  const [followers, setFollowers] = useState<ModeratorCandidate[]>([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const reqId = useRef(0);

  const atLimit = existingIds.size >= MAX_LIVE_MODERATORS;

  const excludeIds = useMemo(() => {
    const s = new Set(existingIds);
    s.add(addedBy);
    s.add(hostId);
    return s;
  }, [existingIds, addedBy, hostId]);

  const presentKey = presentIds.map((p) => p.id).join(",");

  // Quick picks: followers currently in the live + other followers
  useEffect(() => {
    let alive = true;
    const ids = presentIds.map((p) => p.id);
    void (async () => {
      const [inLive, graph] = await Promise.all([
        fetchModeratorCandidatesByIds(ids, { hostId, excludeIds, limit: 16 }),
        fetchFollowerModeratorCandidates(hostId, { excludeIds, limit: 16 }),
      ]);
      if (!alive) return;
      setPresent(inLive);
      const presentSet = new Set(inLive.map((c) => c.id));
      setFollowers(graph.filter((c) => !presentSet.has(c.id)));
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presentKey, hostId, excludeIds]);

  // Debounced autocomplete (followers only)
  useEffect(() => {
    const q = value.trim().replace(/^@+/, "");
    if (q.length < 1 || atLimit) {
      setSuggestions([]);
      setSearching(false);
      return;
    }
    const id = ++reqId.current;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void searchModeratorCandidates(q, { hostId, excludeIds, limit: 8 }).then((rows) => {
        if (reqId.current !== id) return;
        setSuggestions(rows);
        setSearching(false);
        setOpen(true);
      });
    }, 220);
    return () => window.clearTimeout(timer);
  }, [value, excludeIds, hostId, atLimit]);

  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, []);

  const errorToast = (code?: string, fallback?: string) => {
    if (code === "moderator_limit_reached") {
      toast.error(
        t("moderator.limitReached", {
          count: MAX_LIVE_MODERATORS,
          defaultValue: `Maximum {{count}} modérateurs`,
        }),
      );
      return;
    }
    if (code === "moderator_not_follower") {
      toast.error(
        t(
          "moderator.mustFollow",
          "Seuls tes abonnés peuvent être modérateurs",
        ),
      );
      return;
    }
    toast.error(fallback ?? t("moderator.addFailed", "Ajout impossible"));
  };

  const promote = async (userId: string) => {
    if (busy || atLimit) return;
    if (existingIds.has(userId)) {
      toast(t("moderator.alreadyMod", "Déjà modérateur"));
      return;
    }
    if (userId === addedBy || userId === hostId) {
      toast.error(t("moderator.cannotSelf", "Tu ne peux pas te promouvoir"));
      return;
    }
    setBusy(true);
    try {
      const res = await addModerator(liveId, userId, addedBy);
      if (!res.ok) {
        errorToast(res.code, res.error);
        return;
      }
      haptic.selection();
      toast.success(t("moderator.added", "Modérateur ajouté 🛡️"));
      setValue("");
      setSuggestions([]);
      setOpen(false);
      setPresent((prev) => prev.filter((c) => c.id !== userId));
      setFollowers((prev) => prev.filter((c) => c.id !== userId));
    } finally {
      setBusy(false);
    }
  };

  const submitTyped = async () => {
    const raw = value.trim();
    if (!raw || busy || atLimit) return;
    setBusy(true);
    try {
      const q = raw.replace(/^@+/, "").toLowerCase();
      const pool = [...suggestions, ...present, ...followers];
      const fromList =
        pool.find(
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

      const userId = await resolveModeratorCandidateId(raw, hostId);
      if (!userId) {
        toast.error(
          suggestions.length > 1
            ? t("moderator.pickSuggestion", "Choisis un profil dans la liste")
            : t(
                "moderator.notFoundOrNotFollower",
                "Profil introuvable ou pas abonné à toi",
              ),
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

  const showSearchPanel =
    !atLimit &&
    open &&
    (suggestions.length > 0 || (value.trim().length > 0 && !searching));
  const showQuickPicks =
    !atLimit && !value.trim() && (present.length > 0 || followers.length > 0);

  return (
    <div ref={wrapRef} className="relative mt-3">
      <p className="mb-2 text-[11px] text-muted-foreground">
        {t("moderator.followersOnlyHint", {
          count: MAX_LIVE_MODERATORS,
          used: existingIds.size,
          defaultValue:
            "Uniquement tes abonnés · {{used}}/{{count}} modérateurs",
        })}
      </p>

      {atLimit ? (
        <p className="rounded-2xl border px-3 py-2.5 text-[12px] text-muted-foreground" style={{ borderColor: "var(--border)" }}>
          {t("moderator.limitReached", {
            count: MAX_LIVE_MODERATORS,
            defaultValue: `Maximum {{count}} modérateurs`,
          })}
        </p>
      ) : (
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
              onFocus={() => setOpen(true)}
              placeholder={t(
                "moderator.promotePlaceholder",
                "@handle ou nom d'un abonné",
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
      )}

      {showSearchPanel && (
        <ul
          className="absolute inset-x-0 top-[calc(100%+6px)] z-40 max-h-56 overflow-y-auto rounded-2xl border py-1 shadow-lg"
          style={{ borderColor: "var(--border)", background: "var(--card)" }}
        >
          {suggestions.length === 0 ? (
            <li className="px-3 py-2.5 text-[12px] text-muted-foreground">
              {t(
                "moderator.noFollowerMatches",
                "Aucun abonné trouvé",
              )}
            </li>
          ) : (
            suggestions.map((s) => (
              <li key={s.id}>
                <CandidateRow
                  candidate={s}
                  already={existingIds.has(s.id)}
                  busy={busy}
                  onPick={() => void promote(s.id)}
                />
              </li>
            ))
          )}
        </ul>
      )}

      {showQuickPicks && (
        <div className="mt-3 space-y-3">
          {present.length > 0 && (
            <section>
              <div className="mb-1 flex items-center gap-1.5 px-0.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                <Radio size={12} />
                {t("moderator.inLiveNow", "Dans le live")}
              </div>
              <ul
                className="overflow-hidden rounded-2xl border"
                style={{ borderColor: "var(--border)", background: "var(--card)" }}
              >
                {present.map((s) => (
                  <li key={s.id} className="border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
                    <CandidateRow
                      candidate={s}
                      already={existingIds.has(s.id)}
                      busy={busy}
                      badge={t("moderator.badgeLive", "Live")}
                      onPick={() => void promote(s.id)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}
          {followers.length > 0 && (
            <section>
              <div className="mb-1 flex items-center gap-1.5 px-0.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                <Users size={12} />
                {t("moderator.fromFollowers", "Tes abonnés")}
              </div>
              <ul
                className="max-h-48 overflow-y-auto rounded-2xl border"
                style={{ borderColor: "var(--border)", background: "var(--card)" }}
              >
                {followers.map((s) => (
                  <li key={s.id} className="border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
                    <CandidateRow
                      candidate={s}
                      already={existingIds.has(s.id)}
                      busy={busy}
                      onPick={() => void promote(s.id)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
