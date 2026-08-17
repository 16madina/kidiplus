import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Radio, Search, Swords } from "lucide-react";
import { BottomSheet } from "@/components/live-viewer/bottom-sheet";
import { Press } from "@/components/press";
import { haptic } from "@/lib/haptics";
import { fetchActiveLives, searchActiveLives } from "@/lib/lives-db";
import { searchSellerProfiles } from "@/lib/sellers-db";
import { resolveAvatarUrl } from "@/lib/avatar-url";
import type { LiveStream } from "@/lib/live-mock";
import {
  BATTLE_DEFAULT_DURATION_SEC,
  BATTLE_DURATIONS_SEC,
  BATTLE_PROTO_DEMO_SEC,
} from "@/lib/battle-constants";
import type { BattleInviteDraft } from "@/lib/battle-context";

type Tab = "live" | "search";

type Row = BattleInviteDraft & { coverUrl?: string | null };

function Avatar({
  url,
  name,
  size = 44,
}: {
  url: string | null;
  name: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
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
      className="grid place-items-center rounded-full bg-muted text-[13px] font-bold"
      style={{ width: size, height: size }}
    >
      {(name.trim()[0] ?? "?").toUpperCase()}
    </div>
  );
}

async function withResolvedAvatars(rows: Row[]): Promise<Row[]> {
  return Promise.all(
    rows.map(async (r) => ({
      ...r,
      avatarUrl: r.avatarUrl ? (await resolveAvatarUrl(r.avatarUrl)) ?? r.avatarUrl : null,
    })),
  );
}

function streamToRow(s: LiveStream): Row | null {
  if (!s.sellerId) return null;
  return {
    toSellerId: s.sellerId,
    toLiveId: s.liveId ?? s.id,
    displayName: s.seller,
    handle: null,
    avatarUrl: s.avatar || null,
    isLive: true,
    coverUrl: s.thumbnail || null,
  };
}

export function BattleInviteSheet({
  open,
  onClose,
  excludeSellerId,
  onInvite,
}: {
  open: boolean;
  onClose: () => void;
  excludeSellerId: string | null;
  onInvite: (draft: BattleInviteDraft, durationSec: number) => void;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("live");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [liveRows, setLiveRows] = useState<Row[]>([]);
  const [searchRows, setSearchRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Row | null>(null);
  const [durationSec, setDurationSec] = useState<number>(BATTLE_DEFAULT_DURATION_SEC);

  useEffect(() => {
    if (!open) return;
    setTab("live");
    setQuery("");
    setSelected(null);
    setDurationSec(BATTLE_DEFAULT_DURATION_SEC);
    let cancelled = false;
    setLoading(true);
    void fetchActiveLives(80)
      .then(async (lives) => {
        const rows = lives
          .map(streamToRow)
          .filter((r): r is Row => !!r && r.toSellerId !== excludeSellerId);
        const resolved = await withResolvedAvatars(rows);
        if (!cancelled) setLiveRows(resolved);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, excludeSellerId]);

  useEffect(() => {
    if (!open || tab !== "search") return;
    const q = query.trim();
    if (q.length < 2) {
      setSearchRows([]);
      return;
    }
    let cancelled = false;
    const tmr = window.setTimeout(() => {
      setLoading(true);
      void (async () => {
        const [lives, profiles] = await Promise.all([
          searchActiveLives(q, 40),
          searchSellerProfiles(q, 30),
        ]);
        const liveBySeller = new Map<string, LiveStream>();
        for (const s of lives) {
          if (s.sellerId) liveBySeller.set(s.sellerId, s);
        }
        const fromProfiles: Row[] = profiles
          .filter((p) => p.id !== excludeSellerId)
          .map((p) => {
            const live = liveBySeller.get(p.id);
            return {
              toSellerId: p.id,
              toLiveId: live?.liveId ?? live?.id ?? null,
              displayName: p.display_name || p.handle || t("battle.unknownSeller"),
              handle: p.handle,
              avatarUrl: p.avatar_url,
              isLive: !!live,
            };
          });
        const extraLive = lives
          .map(streamToRow)
          .filter((r): r is Row => !!r && r.toSellerId !== excludeSellerId)
          .filter((r) => !fromProfiles.some((p) => p.toSellerId === r.toSellerId));
        const merged = await withResolvedAvatars([...fromProfiles, ...extraLive]);
        if (!cancelled) setSearchRows(merged);
      })().finally(() => {
        if (!cancelled) setLoading(false);
      });
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(tmr);
    };
  }, [open, tab, query, excludeSellerId, t]);

  const list = tab === "live" ? liveRows : searchRows;

  return (
    <BottomSheet open={open} onClose={onClose} heightPercent={82} zIndex={96}>
      <div className="flex h-full min-h-0 flex-col px-4">
        <div className="flex items-center gap-2 pb-3 pt-1">
          <Swords size={18} className="text-[oklch(0.72_0.16_80)]" />
          <h2 className="text-[18px] font-bold">{t("battle.invite.title")}</h2>
        </div>
        <p className="pb-3 text-[12px] leading-snug text-muted-foreground">
          {t("battle.invite.subtitle")}
        </p>

        <div
          className="mb-3 grid grid-cols-2 rounded-full p-1"
          style={{ backgroundColor: "var(--muted)" }}
        >
          {(["live", "search"] as const).map((id) => (
            <Press
              key={id}
              onClick={() => {
                haptic.selection();
                setTab(id);
              }}
              className="!min-h-9 rounded-full text-[13px] font-semibold"
              style={{
                backgroundColor: tab === id ? "oklch(0.85 0.18 90)" : "transparent",
                color: tab === id ? "#10162B" : undefined,
              }}
            >
              {id === "live" ? t("battle.invite.tabLive") : t("battle.invite.tabSearch")}
            </Press>
          ))}
        </div>

        {tab === "search" && (
          <div className="relative mb-3">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("battle.invite.searchPlaceholder")}
              className="h-11 w-full rounded-full border-0 bg-muted pl-9 pr-4 text-[14px] outline-none placeholder:text-muted-foreground"
            />
          </div>
        )}

        <div
          className="min-h-0 flex-1 overflow-y-auto"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {loading && list.length === 0 ? (
            <div className="grid place-items-center py-10 text-muted-foreground">
              <Loader2 size={22} className="animate-spin" />
            </div>
          ) : list.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-muted-foreground">
              {tab === "live"
                ? t("battle.invite.emptyLive")
                : query.trim().length < 2
                  ? t("battle.invite.searchHint")
                  : t("battle.invite.emptySearch")}
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5 pb-3">
              {list.map((row) => {
                const active = selected?.toSellerId === row.toSellerId;
                return (
                  <li key={row.toSellerId}>
                    <Press
                      onClick={() => {
                        haptic.selection();
                        setSelected(row);
                      }}
                      className="flex w-full items-center gap-3 rounded-2xl border px-2 py-2 text-left"
                      style={{
                        borderColor: active ? "oklch(0.85 0.18 90)" : "var(--border)",
                        backgroundColor: active ? "oklch(0.85 0.18 90 / 0.12)" : undefined,
                      }}
                    >
                      <Avatar url={row.avatarUrl} name={row.displayName} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-bold">{row.displayName}</p>
                        <p className="truncate text-[12px] text-muted-foreground">
                          {row.handle ? `@${row.handle}` : t("battle.invite.shop")}
                        </p>
                      </div>
                      {row.isLive ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">
                          <Radio size={10} />
                          {t("battle.invite.liveBadge")}
                        </span>
                      ) : (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                          {t("battle.invite.offlineBadge")}
                        </span>
                      )}
                    </Press>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {selected && (
            <div
            className="shrink-0 border-t pt-3"
            style={{
              borderColor: "var(--border)",
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
            }}
          >
            {!selected.isLive && (
              <p className="mb-2 text-[11px] leading-snug text-amber-700 dark:text-amber-200">
                {t("battle.invite.notLiveHint")}
              </p>
            )}
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("battle.invite.duration")}
            </p>
            <div className="mb-3 flex flex-wrap gap-1.5">
              <Press
                onClick={() => {
                  haptic.selection();
                  setDurationSec(BATTLE_PROTO_DEMO_SEC);
                }}
                className="!min-h-9 rounded-full px-3 text-[12px] font-bold"
                style={{
                  backgroundColor:
                    durationSec === BATTLE_PROTO_DEMO_SEC
                      ? "oklch(0.85 0.18 90)"
                      : "var(--muted)",
                  color: durationSec === BATTLE_PROTO_DEMO_SEC ? "#10162B" : undefined,
                }}
              >
                {t("battle.duration.demo")}
              </Press>
              {BATTLE_DURATIONS_SEC.map((sec) => (
                <Press
                  key={sec}
                  onClick={() => {
                    haptic.selection();
                    setDurationSec(sec);
                  }}
                  className="!min-h-9 flex-1 rounded-full text-[12px] font-bold"
                  style={{
                    backgroundColor:
                      durationSec === sec ? "oklch(0.85 0.18 90)" : "var(--muted)",
                    color: durationSec === sec ? "#10162B" : undefined,
                  }}
                >
                  {t("battle.duration.min", { count: sec / 60 })}
                </Press>
              ))}
            </div>
            <Press
              onClick={() => {
                haptic.medium();
                onInvite(selected, durationSec);
              }}
              className="!min-h-12 w-full rounded-full text-[15px] font-black"
              style={{ backgroundColor: "oklch(0.85 0.18 90)", color: "#10162B" }}
            >
              {t("battle.invite.cta")}
            </Press>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
