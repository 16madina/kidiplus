/** Shared helpers for Phase-1 optional live product attributes. */

export type ProductCondition = "new" | "like_new" | "good" | "used";

export const PRODUCT_CONDITIONS: ProductCondition[] = [
  "new",
  "like_new",
  "good",
  "used",
];

export const PRESET_COLORS = [
  "Noir",
  "Blanc",
  "Beige",
  "Rouge",
  "Bleu",
  "Vert",
  "Rose",
  "Marron",
  "Gris",
  "Doré",
  "Argenté",
] as const;

export const PRESET_SIZES = [
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "XXL",
  "Unique",
  "36",
  "37",
  "38",
  "39",
  "40",
  "41",
  "42",
  "43",
  "44",
] as const;

export function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);
}

export function normalizeCondition(value: unknown): ProductCondition | null {
  if (typeof value !== "string") return null;
  return (PRODUCT_CONDITIONS as string[]).includes(value)
    ? (value as ProductCondition)
    : null;
}

export function conditionLabel(
  condition: ProductCondition | null | undefined,
  t: (key: string, fallback: string) => string,
): string | null {
  if (!condition) return null;
  switch (condition) {
    case "new":
      return t("productOptions.condition.new", "Neuf");
    case "like_new":
      return t("productOptions.condition.likeNew", "Comme neuf");
    case "good":
      return t("productOptions.condition.good", "Bon état");
    case "used":
      return t("productOptions.condition.used", "Occasion");
    default:
      return null;
  }
}

/** Compact meta line under the product name, e.g. "Nike · Noir · M · Neuf". */
export function formatProductMetaLine(opts: {
  brand?: string | null;
  colors?: string[] | null;
  sizes?: string[] | null;
  condition?: ProductCondition | null;
  conditionText?: string | null;
}): string {
  const parts: string[] = [];
  const brand = opts.brand?.trim();
  if (brand) parts.push(brand);

  const colors = (opts.colors ?? []).map((c) => c.trim()).filter(Boolean);
  if (colors.length === 1) parts.push(colors[0]);
  else if (colors.length > 1) parts.push(colors.slice(0, 3).join("/"));

  const sizes = (opts.sizes ?? []).map((s) => s.trim()).filter(Boolean);
  if (sizes.length === 1) parts.push(sizes[0]);
  else if (sizes.length > 1) parts.push(sizes.slice(0, 4).join("/"));

  const cond = opts.conditionText?.trim();
  if (cond) parts.push(cond);

  return parts.join(" · ");
}

export function formatVariantSuffix(color?: string | null, size?: string | null): string {
  const parts = [color, size].map((v) => (v ?? "").trim()).filter(Boolean);
  return parts.length ? ` (${parts.join(" · ")})` : "";
}

export function itemNameWithVariant(
  baseName: string,
  color?: string | null,
  size?: string | null,
): string {
  return `${baseName.trim()}${formatVariantSuffix(color, size)}`;
}

export function variantSelectionState(colors: string[], sizes: string[]) {
  const color = colors.length === 1 ? colors[0] : undefined;
  const size = sizes.length === 1 ? sizes[0] : undefined;
  return {
    color,
    size,
    needsPick: colors.length > 1 || sizes.length > 1,
    hasOptions: colors.length > 0 || sizes.length > 0,
  };
}
