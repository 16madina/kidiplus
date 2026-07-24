import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BottomSheet } from "@/components/live-viewer/bottom-sheet";
import { Press } from "@/components/press";
import { haptic } from "@/lib/haptics";

/** Pick color and/or size before checkout when several options exist. */
export function VariantPickerSheet({
  open,
  onClose,
  productName,
  colors,
  sizes,
  initialColor,
  initialSize,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  productName: string;
  colors: string[];
  sizes: string[];
  initialColor?: string;
  initialSize?: string;
  onConfirm: (v: { color?: string; size?: string }) => void;
}) {
  const { t } = useTranslation();
  const [color, setColor] = useState<string | undefined>(initialColor);
  const [size, setSize] = useState<string | undefined>(initialSize);

  useEffect(() => {
    if (!open) return;
    setColor(initialColor ?? (colors.length === 1 ? colors[0] : undefined));
    setSize(initialSize ?? (sizes.length === 1 ? sizes[0] : undefined));
  }, [open, initialColor, initialSize, colors, sizes]);

  const needColor = colors.length > 1;
  const needSize = sizes.length > 1;
  const canConfirm =
    (!needColor || !!color) &&
    (!needSize || !!size) &&
    (colors.length === 0 || !!color || colors.length === 1) &&
    (sizes.length === 0 || !!size || sizes.length === 1);

  return (
    <BottomSheet open={open} onClose={onClose} heightPercent={55}>
      <div className="flex h-full flex-col px-5 pb-6">
        <h2 className="pt-1 text-[20px] font-bold text-foreground">
          {t("productOptions.pickVariant", "Choisis ta variante")}
        </h2>
        <p className="mt-1 truncate text-[13px] text-muted-foreground">{productName}</p>

        {colors.length > 0 && (
          <div className="mt-5">
            <p className="text-[13px] font-semibold">
              {t("productOptions.colors", "Couleurs")}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {colors.map((c) => {
                const active = color === c;
                return (
                  <Press
                    key={c}
                    onClick={() => {
                      haptic.selection();
                      setColor(c);
                    }}
                    className="!min-h-10 rounded-full px-3.5 text-[13px] font-semibold"
                    style={{
                      background: active ? "oklch(0.18 0.04 260)" : "var(--muted)",
                      color: active ? "white" : "var(--foreground)",
                      border: active ? "none" : "1px solid var(--border)",
                    }}
                  >
                    {c}
                  </Press>
                );
              })}
            </div>
          </div>
        )}

        {sizes.length > 0 && (
          <div className="mt-5">
            <p className="text-[13px] font-semibold">
              {t("productOptions.sizes", "Tailles")}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {sizes.map((s) => {
                const active = size === s;
                return (
                  <Press
                    key={s}
                    onClick={() => {
                      haptic.selection();
                      setSize(s);
                    }}
                    className="!min-h-10 rounded-full px-3.5 text-[13px] font-semibold"
                    style={{
                      background: active ? "oklch(0.18 0.04 260)" : "var(--muted)",
                      color: active ? "white" : "var(--foreground)",
                      border: active ? "none" : "1px solid var(--border)",
                    }}
                  >
                    {s}
                  </Press>
                );
              })}
            </div>
          </div>
        )}

        <Press
          onClick={() => {
            if (!canConfirm) return;
            haptic.medium();
            onConfirm({
              color: color ?? (colors.length === 1 ? colors[0] : undefined),
              size: size ?? (sizes.length === 1 ? sizes[0] : undefined),
            });
          }}
          disabled={!canConfirm}
          className="!min-h-13 mt-auto h-13 w-full rounded-2xl bg-primary text-[15px] font-bold text-primary-foreground disabled:opacity-40"
        >
          {t("productOptions.confirmVariant", "Continuer")}
        </Press>
      </div>
    </BottomSheet>
  );
}
