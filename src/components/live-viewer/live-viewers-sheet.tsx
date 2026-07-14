// Bottom sheet listing people currently connected to a live (presence).
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, Loader2, Users } from "lucide-react";
import { BottomSheet } from "./bottom-sheet";
import { Press } from "@/components/press";
import { resolveAvatarUrl } from "@/lib/avatar-url";
import { supabase } from "@/integrations/supabase/client";
import type { LivePresenceViewer } from "@/lib/live-room";
import { haptic } from "@/lib/haptics";

export type LiveViewerRow = {
  id: string;
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
};

async function fetchViewerProfiles(
  viewers: LivePresenceViewer[],
): Promise<LiveViewerRow[]> {
  const ids = [...new Set(viewers.map((v) => v.identity).filter(Boolean))];
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, handle, avatar_url")
    .in("id", ids.slice(0, 200));
  if (error) {
    console.error("[fetchViewerProfiles]", error);
  }
  const byId = new Map((data ?? []).map((p) => [p.id, p]));

  return Promise.all(
    viewers.map(async (v) => {
      const p = byId.get(v.identity);
      const rawAvatar = p?.avatar_url ?? null;
      return {
        id: v.identity,
        displayName:
          (p?.display_name ?? null) ||
          v.name ||
          (p?.handle ? `@${p.handle}` : v.identity.slice(0, 8)),
        handle: p?.handle ?? null,
        avatarUrl: rawAvatar ? await resolveAvatarUrl(rawAvatar) : null,
      };
    }),
  );
}

function ViewerAvatar({
  row,
  size = 40,
}: {
  row: LiveViewerRow;
  size?: number;
}) {
  const [url, setUrl] = useState(row.avatarUrl);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setUrl(row.avatarUrl);
    setFailed(false);
  }, [row.avatarUrl, row.id]);

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
      className="grid place-items-center rounded-full text-[14px] font-bold text-white"
      style={{ width: size, height: size, background: "var(--primary)" }}
    >
      {(row.displayName[0] || "?").toUpperCase()}
    </div>
  );
}

export function LiveViewersSheet({
  open,
  onClose,
  presentViewers,
  viewerCount,
  onOpenProfile,
}: {
  open: boolean;
  onClose: () => void;
  presentViewers: LivePresenceViewer[];
  /** Total presence count (includes host + guests). */
  viewerCount: number;
  onOpenProfile?: (userId: string) => void;
}) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<LiveViewerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const presentKey = presentViewers.map((v) => v.identity).join(",");

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    void fetchViewerProfiles(presentViewers).then((r) => {
      if (!alive) return;
      setRows(r);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
    // presentKey tracks identity membership without reference churn
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, presentKey]);

  // Host is in viewerCount but not in presentViewers; guests have no UUID.
  const guestCount = Math.max(0, viewerCount - 1 - presentViewers.length);

  return (
    <BottomSheet open={open} onClose={onClose} heightPercent={62}>
      <div className="flex h-full min-h-0 flex-col px-4">
        <div className="flex items-center gap-2 pb-3 pt-1">
          <Eye size={18} />
          <h2 className="text-[18px] font-bold">
            {t("live.viewersSheetTitle", "Spectateurs")}
          </h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[12px] font-bold tabular-nums text-muted-foreground">
            {viewerCount}
          </span>
        </div>

        <div
          className="min-h-0 flex-1 overflow-y-auto"
          style={{
            paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
              <Loader2 size={18} className="animate-spin" />
              <span className="text-[13px]">{t("common.loading", "Chargement…")}</span>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
              <Users size={28} className="opacity-50" />
              <p className="text-[13px]">
                {t(
                  "live.viewersEmpty",
                  "Personne de connecté pour le moment",
                )}
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-1">
              {rows.map((row) => {
                const clickable = !!onOpenProfile;
                const content = (
                  <>
                    <ViewerAvatar row={row} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold">
                        {row.displayName}
                      </p>
                      {row.handle ? (
                        <p className="truncate text-[12px] text-muted-foreground">
                          @{row.handle}
                        </p>
                      ) : null}
                    </div>
                  </>
                );
                return (
                  <li key={row.id}>
                    {clickable ? (
                      <Press
                        onClick={() => {
                          haptic.selection();
                          onOpenProfile?.(row.id);
                          onClose();
                        }}
                        className="!min-h-0 flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left"
                      >
                        {content}
                      </Press>
                    ) : (
                      <div className="flex items-center gap-3 rounded-xl px-2 py-2.5">
                        {content}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {guestCount > 0 && (
            <p className="mt-4 px-1 text-[12px] text-muted-foreground">
              {t("live.viewersGuests", { count: guestCount })}
            </p>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
