import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Press } from "@/components/press";
import { haptic } from "@/lib/haptics";
import {
  PRESET_COLORS,
  PRESET_SIZES,
  PRODUCT_CONDITIONS,
  conditionLabel,
  type ProductCondition,
} from "@/lib/live-product-options";

export type ProductOptionsValue = {
  brand: string;
  condition: ProductCondition | null;
  colors: string[];
  sizes: string[];
};

/** Shared optional brand / condition / colors / sizes editor (shop + live). */
export function ProductOptionsFields({
  value,
  onChange,
  defaultOpen = false,
}: {
  value: ProductOptionsValue;
  onChange: (next: ProductOptionsValue) => void;
  defaultOpen?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);
  const [customColor, setCustomColor] = useState("");
  const [customSize, setCustomSize] = useState("");

  const toggle = (list: string[], item: string) =>
    list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

  const addCustom = (raw: string, key: "colors" | "sizes", clear: () => void) => {
    const v = raw.trim();
    if (!v) return;
    const list = value[key];
    if (!list.includes(v)) onChange({ ...value, [key]: [...list, v] });
    clear();
    haptic.selection();
  };

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => {
          haptic.selection();
          setOpen((v) => !v);
        }}
        className="flex w-full items-center justify-between rounded-2xl border bg-muted/60 px-4 py-3 text-left"
        style={{ borderColor: "var(--border)" }}
      >
        <div>
          <p className="text-[14px] font-semibold text-foreground">
            {t("productOptions.title", "Options")}
          </p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {t("productOptions.subtitle", "Marque, état, couleurs, tailles")}
          </p>
        </div>
        <span
          className="text-muted-foreground transition-transform"
          style={{ transform: open ? "rotate(90deg)" : undefined }}
        >
          ›
        </span>
      </button>

      {open && (
        <div
          className="mt-3 space-y-4 rounded-2xl border px-4 py-4"
          style={{ borderColor: "var(--border)" }}
        >
          <div>
            <label className="text-[13px] font-semibold text-foreground">
              {t("productOptions.brand", "Marque")}
            </label>
            <input
              value={value.brand}
              onChange={(e) => onChange({ ...value, brand: e.target.value.slice(0, 60) })}
              placeholder={t("productOptions.brandPlaceholder", "ex : Nike, Zara…")}
              className="mt-1.5 h-11 w-full rounded-xl border bg-muted px-3 text-[14px] outline-none"
              style={{ borderColor: "var(--border)" }}
            />
          </div>

          <div>
            <p className="text-[13px] font-semibold text-foreground">
              {t("productOptions.conditionLabel", "État")}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {PRODUCT_CONDITIONS.map((c) => {
                const active = value.condition === c;
                return (
                  <Press
                    key={c}
                    onClick={() => {
                      haptic.selection();
                      onChange({ ...value, condition: active ? null : c });
                    }}
                    className="!min-h-9 rounded-full px-3 text-[12px] font-semibold"
                    style={{
                      background: active ? "oklch(0.18 0.04 260)" : "var(--muted)",
                      color: active ? "white" : "var(--foreground)",
                      border: active ? "none" : "1px solid var(--border)",
                    }}
                  >
                    {conditionLabel(c, t)}
                  </Press>
                );
              })}
            </div>
          </div>

          <TagRow
            label={t("productOptions.colors", "Couleurs")}
            presets={[...PRESET_COLORS]}
            selected={value.colors}
            onToggle={(v) => {
              haptic.selection();
              onChange({ ...value, colors: toggle(value.colors, v) });
            }}
            custom={customColor}
            onCustomChange={setCustomColor}
            onAddCustom={() => addCustom(customColor, "colors", () => setCustomColor(""))}
            customPlaceholder={t("productOptions.customColor", "Autre couleur")}
          />

          <TagRow
            label={t("productOptions.sizes", "Tailles")}
            presets={[...PRESET_SIZES]}
            selected={value.sizes}
            onToggle={(v) => {
              haptic.selection();
              onChange({ ...value, sizes: toggle(value.sizes, v) });
            }}
            custom={customSize}
            onCustomChange={setCustomSize}
            onAddCustom={() => addCustom(customSize, "sizes", () => setCustomSize(""))}
            customPlaceholder={t("productOptions.customSize", "Autre taille")}
          />
        </div>
      )}
    </div>
  );
}

function TagRow({
  label,
  presets,
  selected,
  onToggle,
  custom,
  onCustomChange,
  onAddCustom,
  customPlaceholder,
}: {
  label: string;
  presets: string[];
  selected: string[];
  onToggle: (v: string) => void;
  custom: string;
  onCustomChange: (v: string) => void;
  onAddCustom: () => void;
  customPlaceholder: string;
}) {
  return (
    <div>
      <p className="text-[13px] font-semibold text-foreground">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {presets.map((p) => {
          const active = selected.includes(p);
          return (
            <Press
              key={p}
              onClick={() => onToggle(p)}
              className="!min-h-9 rounded-full px-3 text-[12px] font-semibold"
              style={{
                background: active ? "oklch(0.18 0.04 260)" : "var(--muted)",
                color: active ? "white" : "var(--foreground)",
                border: active ? "none" : "1px solid var(--border)",
              }}
            >
              {p}
            </Press>
          );
        })}
        {selected
          .filter((s) => !presets.includes(s))
          .map((s) => (
            <Press
              key={s}
              onClick={() => onToggle(s)}
              className="!min-h-9 rounded-full px-3 text-[12px] font-semibold text-white"
              style={{ background: "oklch(0.18 0.04 260)" }}
            >
              {s}
            </Press>
          ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          value={custom}
          onChange={(e) => onCustomChange(e.target.value.slice(0, 24))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAddCustom();
            }
          }}
          placeholder={customPlaceholder}
          className="h-10 flex-1 rounded-xl border bg-muted px-3 text-[13px] outline-none"
          style={{ borderColor: "var(--border)" }}
        />
        <Press
          onClick={onAddCustom}
          className="!min-h-10 rounded-xl px-3 text-[13px] font-semibold"
          style={{ background: "var(--muted)", border: "1px solid var(--border)" }}
        >
          +
        </Press>
      </div>
    </div>
  );
}
