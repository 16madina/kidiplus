// BrandBadge — self-contained payment-brand icons with brand-accurate colors
// and inline SVG marks. No external image files → guaranteed to render in
// every context (Vite dev, published web, Capacitor iOS/Android, dark mode).
//
// Used in TopUpSheet and PaymentSheet method rows.

import type { CSSProperties } from "react";

export type BrandKey = "wave" | "orange" | "djamo" | "card" | "paypal";

interface BrandBadgeProps {
  brand: BrandKey;
  size?: number; // outer square edge in px (default 48)
  className?: string;
}

const BG: Record<BrandKey, string> = {
  wave: "#1DC8FF",     // Wave cyan
  orange: "#FF7900",   // Orange corporate
  djamo: "#4136F1",    // Djamo indigo
  card: "#0F172A",     // neutral slate for generic card
  paypal: "#003087",   // PayPal blue
};

// White wordmark / letter — keeps consistent contrast on any background,
// works identically in light and dark mode.
export function BrandBadge({ brand, size = 48, className }: BrandBadgeProps) {
  const style: CSSProperties = {
    width: size,
    height: size,
    backgroundColor: BG[brand],
    borderRadius: Math.round(size * 0.26),
  };

  return (
    <div
      className={`grid shrink-0 place-items-center overflow-hidden ${className ?? ""}`}
      style={style}
      aria-hidden="true"
    >
      {brand === "card" ? (
        <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
          <path d="M2.5 10h19" />
        </svg>
      ) : brand === "wave" ? (
        // Stylized "wave" wordmark: bold W with a subtle wave underline curve.
        <svg width={size * 0.72} height={size * 0.72} viewBox="0 0 40 40" fill="none">
          <text
            x="20" y="24"
            textAnchor="middle"
            fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
            fontWeight={900}
            fontSize={20}
            fill="#fff"
            letterSpacing="-0.5"
          >W</text>
          <path d="M8 30 Q14 26 20 30 T32 30" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" fill="none" />
        </svg>
      ) : brand === "orange" ? (
        <svg width={size * 0.72} height={size * 0.72} viewBox="0 0 40 40" fill="none">
          <text
            x="20" y="27"
            textAnchor="middle"
            fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
            fontWeight={900}
            fontSize={22}
            fill="#fff"
          >O</text>
        </svg>
      ) : brand === "djamo" ? (
        // Djamo — bold D
        <svg width={size * 0.72} height={size * 0.72} viewBox="0 0 40 40" fill="none">
          <text
            x="20" y="27"
            textAnchor="middle"
            fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
            fontWeight={900}
            fontSize={22}
            fill="#fff"
          >D</text>
        </svg>
      ) : (
        // PayPal — stylized "PP" wordmark with a subtle second-P shadow tint.
        <svg width={size * 0.78} height={size * 0.78} viewBox="0 0 40 40" fill="none">
          <text
            x="12" y="27"
            textAnchor="middle"
            fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
            fontWeight={900}
            fontStyle="italic"
            fontSize={20}
            fill="#fff"
          >P</text>
          <text
            x="24" y="27"
            textAnchor="middle"
            fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
            fontWeight={900}
            fontStyle="italic"
            fontSize={20}
            fill="#009cde"
          >P</text>
        </svg>
      )}
    </div>
  );
}
