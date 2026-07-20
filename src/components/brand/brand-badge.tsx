// BrandBadge — payment-brand icons for TopUpSheet / PaymentSheet.
// Wave uses an embedded PNG (penguin). Orange / Djamo / PayPal are inline
// SVG so they can never render as black squares.

import type { CSSProperties } from "react";
import { WAVE_LOGO_URI } from "@/components/brand/brand-logos";

export type BrandKey = "wave" | "orange" | "djamo" | "card" | "paypal";

interface BrandBadgeProps {
  brand: BrandKey;
  size?: number;
  className?: string;
}

function svgUri(svg: string): string {
  return "data:image/svg+xml," + encodeURIComponent(svg);
}

const ORANGE_LOGO_URI = svgUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none">
  <rect width="48" height="48" rx="12" fill="#FFFFFF"/>
  <rect x="0.75" y="0.75" width="46.5" height="46.5" rx="11.25" stroke="#EEEEEE"/>
  <!-- Orange Money arrow (down-left), rounded stroke -->
  <g transform="translate(24 24) rotate(-135) translate(-24 -24)">
    <path d="M24 12v18" stroke="#FF7900" stroke-width="5.5" stroke-linecap="round"/>
    <path d="M15.5 22.5L24 31l8.5-8.5" stroke="#FF7900" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </g>
</svg>`);

const DJAMO_LOGO_URI = svgUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none">
  <rect width="48" height="48" rx="12" fill="#4136F1"/>
  <text x="24" y="30" text-anchor="middle"
    font-family="system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
    font-size="13" font-weight="800" fill="#FFFFFF" letter-spacing="-0.3">djamo</text>
</svg>`);

const PAYPAL_LOGO_URI = svgUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none">
  <rect width="48" height="48" rx="12" fill="#003087"/>
  <path fill="#fff" d="M18.2 34.5h-3.6c-.5 0-.8-.4-.7-.9l2.8-17.7c.1-.5.5-.9 1-.9h7.6c3.8 0 6.5 1.1 7.8 3.2 1.2 1.9 1.1 4.5-.2 7.4-1.6 3.5-4.7 5.3-9.1 5.3h-2.6l-.9 5.6c-.1.5-.5.9-1 .9h-1.1z"/>
  <path fill="#009cde" d="M28.4 14.2c-.4-.1-.9-.2-1.5-.2h-5.9c-.3 0-.6.2-.7.5l-2.4 15.1-.1.5h3.4l.8-5.1.1-.4c.1-.3.4-.5.7-.5h1.6c3.5 0 6.2-1.4 7-5.5.3-1.7.1-3.1-.7-4.1-.3-.3-.7-.6-1.3-.8z"/>
  <path fill="#012169" d="M29.8 19.1c-.1 0-.1 0-.2 0h-.2c-.1 0-.1 0-.2 0-.9.1-1.9.1-2.8.1h-1.5c-.3 0-.6.2-.7.5l-1 6.2-.1.4c0 .3.2.5.5.5h2.1c.3 0 .5-.2.5-.4l.4-2.6.1-.3c.1-.3.4-.5.7-.5h.4c2.4 0 4.3-1 4.8-3.8.2-.9.1-1.7-.3-2.3-.2-.3-.5-.5-.7-.6-.4.1-.7.1-1 .2z"/>
</svg>`);

const LOGO_SRC: Partial<Record<BrandKey, string>> = {
  wave: WAVE_LOGO_URI,
  orange: ORANGE_LOGO_URI,
  djamo: DJAMO_LOGO_URI,
  paypal: PAYPAL_LOGO_URI,
};

export function BrandBadge({ brand, size = 48, className }: BrandBadgeProps) {
  const logo = LOGO_SRC[brand];

  if (logo) {
    const style: CSSProperties = {
      width: size,
      height: size,
      borderRadius: Math.round(size * 0.26),
      overflow: "hidden",
      backgroundColor: "transparent",
      flexShrink: 0,
    };
    return (
      <div className={`grid place-items-center ${className ?? ""}`} style={style} aria-hidden="true">
        <img
          src={logo}
          alt=""
          draggable={false}
          width={size}
          height={size}
          style={{ width: size, height: size, objectFit: "cover", display: "block" }}
        />
      </div>
    );
  }

  return (
    <div
      className={`grid place-items-center overflow-hidden ${className ?? ""}`}
      style={{
        width: size,
        height: size,
        backgroundColor: "#0F172A",
        borderRadius: Math.round(size * 0.26),
        flexShrink: 0,
      }}
      aria-hidden="true"
    >
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
        <path d="M2.5 10h19" />
      </svg>
    </div>
  );
}
