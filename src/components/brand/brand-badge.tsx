// BrandBadge — payment-brand icons for TopUpSheet / PaymentSheet.
// Logos are embedded data URIs (see brand-logos.ts) so they always render:
// Lovable /public URLs 403, and CDN /__l5e/ assets are flaky on native.

import type { CSSProperties } from "react";
import { WAVE_LOGO_URI, ORANGE_LOGO_URI, DJAMO_LOGO_URI } from "@/components/brand/brand-logos";

export type BrandKey = "wave" | "orange" | "djamo" | "card" | "paypal";

interface BrandBadgeProps {
  brand: BrandKey;
  size?: number;
  className?: string;
}

const BG: Record<BrandKey, string> = {
  wave: "transparent",
  orange: "#0B0B0B",
  djamo: "#4136F1",
  card: "#0F172A",
  paypal: "#003087",
};

/** Official-ish PayPal mark as inline SVG data URI (no network). */
const PAYPAL_LOGO_URI =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none">
      <rect width="48" height="48" rx="12" fill="#003087"/>
      <path fill="#fff" d="M18.2 34.5h-3.6c-.5 0-.8-.4-.7-.9l2.8-17.7c.1-.5.5-.9 1-.9h7.6c3.8 0 6.5 1.1 7.8 3.2 1.2 1.9 1.1 4.5-.2 7.4-1.6 3.5-4.7 5.3-9.1 5.3h-2.6l-.9 5.6c-.1.5-.5.9-1 .9h-1.1z"/>
      <path fill="#009cde" d="M28.4 14.2c-.4-.1-.9-.2-1.5-.2h-5.9c-.3 0-.6.2-.7.5l-2.4 15.1-.1.5h3.4l.8-5.1.1-.4c.1-.3.4-.5.7-.5h1.6c3.5 0 6.2-1.4 7-5.5.3-1.7.1-3.1-.7-4.1-.3-.3-.7-.6-1.3-.8z"/>
      <path fill="#012169" d="M29.8 19.1c-.1 0-.1 0-.2 0h-.2c-.1 0-.1 0-.2 0-.9.1-1.9.1-2.8.1h-1.5c-.3 0-.6.2-.7.5l-1 6.2-.1.4c0 .3.2.5.5.5h2.1c.3 0 .5-.2.5-.4l.4-2.6.1-.3c.1-.3.4-.5.7-.5h.4c2.4 0 4.3-1 4.8-3.8.2-.9.1-1.7-.3-2.3-.2-.3-.5-.5-.7-.6-.4.1-.7.1-1 .2z"/>
    </svg>`,
  );

const LOGO_SRC: Partial<Record<BrandKey, string>> = {
  wave: WAVE_LOGO_URI,
  orange: ORANGE_LOGO_URI,
  djamo: DJAMO_LOGO_URI,
  paypal: PAYPAL_LOGO_URI,
};

export function BrandBadge({ brand, size = 48, className }: BrandBadgeProps) {
  const style: CSSProperties = {
    width: size,
    height: size,
    backgroundColor: BG[brand],
    borderRadius: Math.round(size * 0.26),
  };

  const logo = LOGO_SRC[brand];
  if (logo) {
    const pad =
      brand === "wave" || brand === "paypal"
        ? 0
        : brand === "djamo"
          ? Math.round(size * 0.14)
          : Math.round(size * 0.16);
    return (
      <div
        className={`grid shrink-0 place-items-center overflow-hidden ${className ?? ""}`}
        style={style}
        aria-hidden="true"
      >
        <img
          src={logo}
          alt=""
          draggable={false}
          style={{
            width: size - pad * 2,
            height: size - pad * 2,
            objectFit: brand === "wave" || brand === "paypal" ? "cover" : "contain",
            display: "block",
          }}
        />
      </div>
    );
  }

  // Card only
  return (
    <div
      className={`grid shrink-0 place-items-center overflow-hidden ${className ?? ""}`}
      style={style}
      aria-hidden="true"
    >
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
        <path d="M2.5 10h19" />
      </svg>
    </div>
  );
}
