// Panneau admin : conversion en masse des anciennes vidéos .mov en MP4/H.264.
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Check, Loader2, RefreshCw, TriangleAlert, Wand2 } from "lucide-react";
import { Press } from "@/components/press";
import { haptic } from "@/lib/haptics";
import {
  listLegacyMovPosts,
  repairAllLegacyMovPosts,
  type LegacyVideoPost,
  type RepairOutcome,
} from "@/lib/vitrine-video-repair";

export function AdminVideoRepairPanel() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<LegacyVideoPost[]>([]);
  const [running, setRunning] = useState(false);
  const [current, setCurrent] = useState(-1);
  const [ratio, setRatio] = useState(0);
  const [results, setResults] = useState<Record<string, RepairOutcome>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setPosts(await listLegacyMovPosts());
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const run = async () => {
    if (running || posts.length === 0) return;
    haptic.medium();
    setRunning(true);
    setResults({});
    const all = await repairAllLegacyMovPosts(
      posts,
      (outcome) => setResults((p) => ({ ...p, [outcome.post.id]: outcome })),
      (i, r) => { setCurrent(i); setRatio(r); },
    );
    setRunning(false);
    setCurrent(-1);
    setRatio(0);
    const ok = all.filter((r) => r.status === "converted").length;
    const ko = all.length - ok;
    toast[ko > 0 ? "warning" : "success"](
      t("admin.videoRepair.done", "{{ok}} converties, {{ko}} échouées", { ok, ko }),
    );
    void load();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <Wand2 size={16} />
          <h3 className="text-[15px] font-bold">
            {t("admin.videoRepair.title", "Conversion des anciennes vidéos")}
          </h3>
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
          {t(
            "admin.videoRepair.hint",
            "Les vidéos .mov (iPhone) ne se lisent pas sur Android. L'encodage se fait sur cet appareil : utilise Safari sur iPhone ou Mac, garde l'écran allumé et cette page ouverte jusqu'à la fin.",
          )}
        </p>

        <div className="mt-3 flex items-center gap-2">
          <Press
            onClick={run}
            disabled={running || loading || posts.length === 0}
            className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-[13px] font-semibold text-background disabled:opacity-50"
          >
            {running ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
            {running
              ? t("admin.videoRepair.running", "Conversion…")
              : t("admin.videoRepair.start", "Convertir tout ({{n}})", { n: posts.length })}
          </Press>
          <Press
            onClick={() => void load()}
            disabled={running}
            className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-2 text-[13px] font-semibold disabled:opacity-50"
          >
            <RefreshCw size={14} />
          </Press>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin" /></div>
      ) : posts.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-muted-foreground">
          {t("admin.videoRepair.empty", "Aucune ancienne vidéo .mov à convertir.")}
        </p>
      ) : (
        <ul className="space-y-2">
          {posts.map((p, i) => {
            const r = results[p.id];
            const active = running && current === i;
            return (
              <li key={p.id} className="rounded-xl border border-border bg-card px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-semibold">{p.url.split("/").pop()}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(p.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {active ? (
                    <span className="shrink-0 text-[11px] font-semibold tabular-nums">
                      {Math.round(ratio * 100)}%
                    </span>
                  ) : r?.status === "converted" ? (
                    <Check size={16} className="shrink-0 text-emerald-500" />
                  ) : r ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-amber-500">
                      <TriangleAlert size={13} />{r.message}
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
