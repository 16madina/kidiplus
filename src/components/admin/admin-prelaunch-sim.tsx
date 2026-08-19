// Admin tab: pre-launch / promo live crowd simulation.
// Global settings only — nothing on the live UI. Hosts pick this up remotely.

import { useEffect, useState } from "react";
import { Loader2, Radio, Save } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Press } from "@/components/press";
import { haptic } from "@/lib/haptics";
import {
  DEFAULT_PRELAUNCH_LIVE_SIM,
  fetchPrelaunchLiveSimConfigForAdmin,
  savePrelaunchLiveSimConfig,
  type PrelaunchLiveSimConfig,
} from "@/lib/prelaunch-live-sim";

export function AdminPrelaunchSimPanel() {
  const { t } = useTranslation();
  const [cfg, setCfg] = useState<PrelaunchLiveSimConfig>({ ...DEFAULT_PRELAUNCH_LIVE_SIM });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const next = await fetchPrelaunchLiveSimConfigForAdmin();
        if (!cancelled) setCfg(next);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const patch = <K extends keyof PrelaunchLiveSimConfig>(key: K, value: PrelaunchLiveSimConfig[K]) => {
    setCfg((prev) => ({ ...prev, [key]: value }));
  };

  const onToggle = () => {
    haptic.selection();
    setCfg((prev) => ({ ...prev, enabled: !prev.enabled }));
  };

  const onSave = async () => {
    if (saving) return;
    haptic.selection();
    setSaving(true);
    try {
      const saved = await savePrelaunchLiveSimConfig(cfg);
      setCfg(saved);
      toast.success(
        saved.enabled
          ? t("admin.prelaunchSim.onToast", "Simulation activée et enregistrée")
          : t("admin.prelaunchSim.offToast", "Simulation désactivée et enregistrée"),
      );
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : t("admin.prelaunchSim.saveFail", "Impossible d’enregistrer"),
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-muted-foreground">
        <Loader2 size={16} className="animate-spin" />
        {t("admin.prelaunchSim.loading", "Chargement…")}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <Radio size={18} className={cfg.enabled ? "text-emerald-600" : "text-muted-foreground"} />
          <h2 className="text-[17px] font-semibold">
            {t("admin.prelaunchSim.title", "Simulation pré-lancement")}
          </h2>
        </div>
        <p className="text-[13px] leading-snug text-muted-foreground">
          {t(
            "admin.prelaunchSim.panelHint",
            "Réglages globaux pour les lives promo / tournage. Quand c’est On, les hôtes voient de faux viewers, commentaires et enchères. Mets Off avant l’envoi App Store.",
          )}
        </p>
      </header>

      {/* Master switch */}
      <section className="rounded-2xl border border-border p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[14px] font-semibold">
              {t("admin.prelaunchSim.master", "Simulation")}
            </p>
            <p className="text-[12px] text-muted-foreground">
              {cfg.enabled
                ? t("admin.prelaunchSim.statusOn", "Activée — les lives hôtes simulent la foule")
                : t("admin.prelaunchSim.statusOff", "Désactivée — aucun faux engagement")}
            </p>
          </div>
          <Press
            onClick={onToggle}
            className={`inline-flex h-10 min-w-[88px] items-center justify-center rounded-full px-4 text-[14px] font-semibold ${
              cfg.enabled ? "bg-emerald-600 text-white" : "bg-muted text-foreground"
            }`}
          >
            {cfg.enabled
              ? t("admin.prelaunchSim.turnOff", "Off")
              : t("admin.prelaunchSim.turnOn", "On")}
          </Press>
        </div>
      </section>

      {/* Viewers */}
      <section className="space-y-3 rounded-2xl border border-border p-4">
        <div>
          <p className="text-[14px] font-semibold">
            {t("admin.prelaunchSim.viewersTitle", "Nombre de personnes")}
          </p>
          <p className="text-[12px] text-muted-foreground">
            {t(
              "admin.prelaunchSim.viewersHint",
              "Le compteur oscille entre le minimum et le maximum.",
            )}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label={t("admin.prelaunchSim.viewersMin", "Min")}
            value={cfg.viewersMin}
            min={1}
            max={5000}
            onChange={(n) => patch("viewersMin", n)}
          />
          <NumberField
            label={t("admin.prelaunchSim.viewersMax", "Max")}
            value={cfg.viewersMax}
            min={1}
            max={5000}
            onChange={(n) => patch("viewersMax", n)}
          />
        </div>
      </section>

      {/* Comments */}
      <section className="space-y-3 rounded-2xl border border-border p-4">
        <div>
          <p className="text-[14px] font-semibold">
            {t("admin.prelaunchSim.commentsTitle", "Fréquence des commentaires")}
          </p>
          <p className="text-[12px] text-muted-foreground">
            {t(
              "admin.prelaunchSim.commentsHint",
              "Délai aléatoire entre deux faux commentaires (en secondes).",
            )}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label={t("admin.prelaunchSim.commentMin", "Toutes les… (min)")}
            value={cfg.commentEverySecMin}
            min={1}
            max={120}
            suffix="s"
            onChange={(n) => patch("commentEverySecMin", n)}
          />
          <NumberField
            label={t("admin.prelaunchSim.commentMax", "…à (max)")}
            value={cfg.commentEverySecMax}
            min={1}
            max={120}
            suffix="s"
            onChange={(n) => patch("commentEverySecMax", n)}
          />
        </div>
        <NumberField
          label={t("admin.prelaunchSim.heartChance", "Chance de cœur (%)")}
          value={cfg.heartChancePct}
          min={0}
          max={100}
          suffix="%"
          onChange={(n) => patch("heartChancePct", n)}
        />
      </section>

      {/* Bids */}
      <section className="space-y-3 rounded-2xl border border-border p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[14px] font-semibold">
              {t("admin.prelaunchSim.bidsTitle", "Fausses enchères")}
            </p>
            <p className="text-[12px] text-muted-foreground">
              {t(
                "admin.prelaunchSim.bidsHint",
                "Pendant une enchère active (aucun paiement réel).",
              )}
            </p>
          </div>
          <Press
            onClick={() => {
              haptic.selection();
              patch("fakeBids", !cfg.fakeBids);
            }}
            className={`inline-flex h-9 min-w-[72px] items-center justify-center rounded-full px-3 text-[13px] font-semibold ${
              cfg.fakeBids ? "bg-emerald-600 text-white" : "bg-muted text-foreground"
            }`}
          >
            {cfg.fakeBids
              ? t("admin.prelaunchSim.turnOn", "On")
              : t("admin.prelaunchSim.turnOff", "Off")}
          </Press>
        </div>
        <div className={`grid grid-cols-2 gap-3 ${cfg.fakeBids ? "" : "opacity-40 pointer-events-none"}`}>
          <NumberField
            label={t("admin.prelaunchSim.bidMin", "Toutes les… (min)")}
            value={cfg.bidEverySecMin}
            min={1}
            max={120}
            suffix="s"
            onChange={(n) => patch("bidEverySecMin", n)}
          />
          <NumberField
            label={t("admin.prelaunchSim.bidMax", "…à (max)")}
            value={cfg.bidEverySecMax}
            min={1}
            max={120}
            suffix="s"
            onChange={(n) => patch("bidEverySecMax", n)}
          />
        </div>
      </section>

      <Press
        onClick={() => {
          void onSave();
        }}
        disabled={saving}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-foreground text-[15px] font-semibold text-background disabled:opacity-50"
      >
        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
        {t("admin.prelaunchSim.save", "Enregistrer")}
      </Press>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (n: number) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2">
        <input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!Number.isFinite(n)) return;
            onChange(Math.min(max, Math.max(min, Math.round(n))));
          }}
          className="w-full bg-transparent text-[15px] font-semibold tabular-nums outline-none"
        />
        {suffix ? (
          <span className="shrink-0 text-[12px] text-muted-foreground">{suffix}</span>
        ) : null}
      </div>
    </label>
  );
}

/** @deprecated Use AdminPrelaunchSimPanel in the Simu tab. */
export function AdminPrelaunchSimCard() {
  return <AdminPrelaunchSimPanel />;
}
