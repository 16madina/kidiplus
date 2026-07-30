import { useCallback, useEffect, useState } from "react";
import { Calendar, Loader2, Radio } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PushScreen } from "@/components/push-screen";
import { Press } from "@/components/press";
import { useAuth } from "@/lib/auth-context";
import { haptic } from "@/lib/haptics";
import {
  fetchMyScheduledLives,
  resolveLiveImage,
  type ScheduledLiveRow,
} from "@/lib/lives-db";
import { createVitrinePost } from "@/lib/vitrine-db";

const GOLD = "#E8B93B";

function formatWhen(iso: string | null, lang: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return (
    d.toLocaleDateString(lang, { weekday: "short", day: "numeric", month: "short" }) +
    " · " +
    d.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" })
  );
}

export function AnnounceLiveSheet({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [rows, setRows] = useState<ScheduledLiveRow[]>([]);
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [caption, setCaption] = useState("");

  const reload = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const list = await fetchMyScheduledLives(user.id);
    setRows(list);
    setLoading(false);
    const entries = await Promise.all(
      list
        .filter((r) => r.cover_url)
        .map(
          async (r) =>
            [r.id, (await resolveLiveImage("live-covers", r.cover_url, "card")) ?? ""] as const,
        ),
    );
    setCovers(Object.fromEntries(entries.filter(([, u]) => u)));
  }, [user]);

  useEffect(() => {
    if (!open) return;
    setCaption("");
    setBusyId(null);
    void reload();
  }, [open, reload]);

  const publish = async (row: ScheduledLiveRow) => {
    if (busyId) return;
    setBusyId(row.id);
    haptic.medium();
    try {
      const cover = covers[row.id] ?? "";
      const mediaUrls = cover ? [cover] : [];
      const post = await createVitrinePost({
        mediaUrls,
        mediaType: "image",
        caption:
          caption.trim() ||
          t("publish.announceDefaultCaption", {
            title: row.title,
            defaultValue: `Live à venir · ${row.title}`,
          }),
        liveId: row.id,
      });
      if (!post) {
        toast.error(t("vitrine.publishFail", { defaultValue: "Impossible de publier." }));
        return;
      }
      toast.success(
        t("publish.announcePublished", { defaultValue: "Annonce publiée dans la Vitrine" }),
      );
      onDone?.();
      onClose();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <PushScreen
      open={open}
      onClose={onClose}
      title={t("publish.types.announce", { defaultValue: "Annonce de live" })}
      zIndex={86}
    >
      <div className="flex h-full flex-col px-4 py-3">
        <p className="mb-2 text-[13px] text-muted-foreground">
          {t("publish.announceHint", {
            defaultValue: "Choisis un live programmé. L’annonce apparaît dans Pour toi et Bientôt.",
          })}
        </p>

        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value.slice(0, 500))}
          rows={2}
          placeholder={t("publish.announceCaption", {
            defaultValue: "Message (optionnel)…",
          })}
          className="mb-3 w-full resize-none rounded-2xl border border-border bg-card px-3 py-2.5 text-[14px] outline-none"
        />

        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="animate-spin text-muted-foreground" size={22} />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <Calendar size={28} className="text-muted-foreground" />
            <p className="text-[14px] font-semibold">
              {t("golive.entry.emptyScheduled", { defaultValue: "Aucun live programmé" })}
            </p>
            <p className="text-[13px] text-muted-foreground">
              {t("publish.announceEmpty", {
                defaultValue: "Programme un live d’abord, puis publie l’annonce.",
              })}
            </p>
            <Press
              onClick={() => {
                onClose();
                window.dispatchEvent(new CustomEvent("kidi:navigate-tab", { detail: "live" }));
              }}
              className="mt-1 !min-h-10 h-10 rounded-full px-4 text-[13px] font-bold text-[#10162B]"
              style={{ background: GOLD }}
            >
              {t("golive.entry.schedule", { defaultValue: "Programmer un live" })}
            </Press>
          </div>
        ) : (
          <ul className="flex flex-col gap-2 overflow-y-auto pb-6">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-2.5"
              >
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-muted">
                  {covers[row.id] ? (
                    <img src={covers[row.id]} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-muted-foreground">
                      <Radio size={20} />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold">{row.title}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {formatWhen(row.scheduled_at, i18n.language)}
                  </div>
                </div>
                <Press
                  onClick={() => void publish(row)}
                  disabled={busyId === row.id}
                  className="!min-h-9 h-9 shrink-0 rounded-full px-3 text-[12px] font-bold text-[#10162B] disabled:opacity-50"
                  style={{ background: GOLD }}
                >
                  {busyId === row.id ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    t("vitrine.publish", { defaultValue: "Publier" })
                  )}
                </Press>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PushScreen>
  );
}
