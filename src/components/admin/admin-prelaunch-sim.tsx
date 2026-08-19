// Admin tab: pre-launch / promo live crowd simulation.
// Global settings only — nothing on the live UI. Hosts pick this up remotely.

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
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
  const [lastSavedLabel, setLastSavedLabel] = useState<string | null>(null);
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;

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

  const flushNumberDrafts = async () => {
    const el = document.activeElement;
    if (el instanceof HTMLElement) el.blur();
    // Let NumberField onBlur commit into cfg before we read cfgRef.
    await new Promise<void>((r) => setTimeout(r, 40));
  };

  const onSave = async () => {
    if (saving) return;
    haptic.selection();
    setSaving(true);
    try {
      await flushNumberDrafts();
      const toSave = cfgRef.current;
      const saved = await savePrelaunchLiveSimConfig(toSave);
      setCfg(saved);
      const summary = saved.enabled
        ? t("admin.prelaunchSim.savedOnDetail", {
            defaultValue: "Enregistré ✓ Simulation ON — {{min}}–{{max}} personnes",
            min: saved.viewersMin,
            max: saved.viewersMax,
          })
        : t("admin.prelaunchSim.savedOffDetail", "Enregistré ✓ Simulation OFF");
      setLastSavedLabel(summary);
      toast.success(summary);
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : t("admin.prelaunchSim.saveFail", "Impossible d’enregistrer");
      toast.error(msg);
      setLastSavedLabel(null);
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
            "Pour les lives promo / tournage. On = faux viewers et commentaires. Off avant l’envoi App Store.",
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
                ? t("admin.prelaunchSim.statusOn", "Activée — règle la foule ci-dessous")
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

      <AnimatePresence initial={false}>
        {cfg.enabled ? (
          <motion.div
            key="sim-settings"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden space-y-5"
          >
            {/* Viewers */}
            <section className="space-y-3 rounded-2xl border border-border p-4">
              <div>
                <p className="text-[14px] font-semibold">
                  {t("admin.prelaunchSim.viewersTitle", "Nombre de personnes")}
                </p>
                <p className="text-[12px] text-muted-foreground">
                  {t(
                    "admin.prelaunchSim.viewersHint",
                    "Le compteur de viewers oscille entre ces deux nombres.",
                  )}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <NumberField
                  label={t("admin.prelaunchSim.viewersMin", "Minimum")}
                  value={cfg.viewersMin}
                  min={1}
                  max={5000}
                  onChange={(n) => patch("viewersMin", n)}
                />
                <NumberField
                  label={t("admin.prelaunchSim.viewersMax", "Maximum")}
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
                    "Temps d’attente entre deux faux commentaires (en secondes).",
                  )}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <NumberField
                  label={t("admin.prelaunchSim.commentMin", "Délai min")}
                  value={cfg.commentEverySecMin}
                  min={1}
                  max={120}
                  suffix="s"
                  onChange={(n) => patch("commentEverySecMin", n)}
                />
                <NumberField
                  label={t("admin.prelaunchSim.commentMax", "Délai max")}
                  value={cfg.commentEverySecMax}
                  min={1}
                  max={120}
                  suffix="s"
                  onChange={(n) => patch("commentEverySecMax", n)}
                />
              </div>
              <NumberField
                label={t("admin.prelaunchSim.heartChance", "Chance d’envoyer un cœur")}
                value={cfg.heartChancePct}
                min={0}
                max={100}
                suffix="%"
                onChange={(n) => patch("heartChancePct", n)}
              />
            </section>

            {/* Fake auction bids — clearer copy */}
            <section className="space-y-3 rounded-2xl border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold">
                    {t("admin.prelaunchSim.bidsTitle", "Fausses enchères")}
                  </p>
                  <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
                    {t(
                      "admin.prelaunchSim.bidsHint",
                      "Quand tu lances une enchère sur un produit en live, de faux acheteurs montent le prix à l’écran. Personne ne paie vraiment — c’est uniquement pour la vidéo promo.",
                    )}
                  </p>
                </div>
                <Press
                  onClick={() => {
                    haptic.selection();
                    patch("fakeBids", !cfg.fakeBids);
                  }}
                  className={`mt-0.5 inline-flex h-9 shrink-0 min-w-[72px] items-center justify-center rounded-full px-3 text-[13px] font-semibold ${
                    cfg.fakeBids ? "bg-emerald-600 text-white" : "bg-muted text-foreground"
                  }`}
                >
                  {cfg.fakeBids
                    ? t("admin.prelaunchSim.turnOn", "On")
                    : t("admin.prelaunchSim.turnOff", "Off")}
                </Press>
              </div>
              <AnimatePresence initial={false}>
                {cfg.fakeBids ? (
                  <motion.div
                    key="bid-settings"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22 }}
                    className="overflow-hidden"
                  >
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <NumberField
                        label={t("admin.prelaunchSim.bidMin", "Délai min")}
                        value={cfg.bidEverySecMin}
                        min={1}
                        max={120}
                        suffix="s"
                        onChange={(n) => patch("bidEverySecMin", n)}
                      />
                      <NumberField
                        label={t("admin.prelaunchSim.bidMax", "Délai max")}
                        value={cfg.bidEverySecMax}
                        min={1}
                        max={120}
                        suffix="s"
                        onChange={(n) => patch("bidEverySecMax", n)}
                      />
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </section>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <Press
        type="button"
        onClick={() => {
          void onSave();
        }}
        disabled={saving}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-foreground text-[15px] font-semibold text-background disabled:opacity-50"
      >
        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
        {saving
          ? t("admin.prelaunchSim.saving", "Enregistrement…")
          : t("admin.prelaunchSim.save", "Enregistrer")}
      </Press>
      {lastSavedLabel ? (
        <p className="text-center text-[12px] font-medium text-emerald-600">{lastSavedLabel}</p>
      ) : null}
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
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [value, focused]);

  const commit = (raw: string) => {
    const cleaned = raw.replace(/[^\d]/g, "");
    if (cleaned === "") {
      onChange(min);
      setDraft(String(min));
      return;
    }
    const n = Number(cleaned);
    const clamped = Math.min(max, Math.max(min, Math.round(n)));
    onChange(clamped);
    setDraft(String(clamped));
  };

  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2">
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          value={draft}
          onFocus={(e) => {
            setFocused(true);
            e.currentTarget.select();
          }}
          onBlur={() => {
            setFocused(false);
            commit(draft);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
          onChange={(e) => {
            // Allow empty while typing so the first digit can be erased.
            setDraft(e.target.value.replace(/[^\d]/g, ""));
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
