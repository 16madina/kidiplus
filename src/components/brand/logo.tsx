/**
 * KiDi+ brand logo — pure SVG, theme-aware.
 *
 * The wordmark colors are driven by CSS variables so the logo is always
 * legible on both light and dark backgrounds without swapping assets:
 * - "KiDi" uses `var(--foreground)` (dark text on light bg, light text on dark bg)
 * - "+" uses `var(--primary)` (brand gold)
 *
 * Callers can override via the `tone` prop:
 * - "auto"   → foreground + primary (default, theme-aware)
 * - "onDark" → white + gold, for photo/dark hero backgrounds
 * - "onLight"→ navy + gold, for light-only surfaces
 */
export function Logo({
  size = 44,
  tone = "auto",
  className,
  // Legacy props kept for backwards-compat; ignored.
  variant: _variant,
}: {
  size?: number;
  tone?: "auto" | "onDark" | "onLight";
  className?: string;
  variant?: "auto" | "image" | "wordmark";
}) {
  const wordColor =
    tone === "onDark"
      ? "#FFFFFF"
      : tone === "onLight"
        ? "#10162B"
        : "var(--foreground)";
  const plusColor =
    tone === "auto" ? "var(--primary)" : "#E8B93B";

  // Font size roughly matches the previous raster height.
  const fontSize = Math.round(size * 0.78);
  // Approximate width — enough to fit "KiDi+" at font-weight 900.
  const width = Math.round(size * 2.2);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={size}
      viewBox={`0 0 ${width} ${size}`}
      role="img"
      aria-label="KiDi+"
      className={className}
      style={{ display: "block" }}
    >
      <title>KiDi+</title>
      <text
        x="0"
        y={size * 0.82}
        fontFamily="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
        fontWeight={900}
        fontSize={fontSize}
        letterSpacing="-0.03em"
        fill={wordColor}
      >
        KiDi
        <tspan fill={plusColor} dx="1">
          +
        </tspan>
      </text>
    </svg>
  );
}
