// BrandBadge — payment-brand icons for TopUpSheet / PaymentSheet.
// Logos are Vite-imported from src/assets/img (hashed same-origin URLs).
// Paths under /public often 403 on Lovable/Cloudflare and break in Capacitor.

import type { CSSProperties } from "react";
import waveLogo from "@/assets/img/brands/wave.png";
import orangeMoneyLogo from "@/assets/img/brands/orange-money.png";
import djamoLogo from "@/assets/img/brands/djamo.png";

export type BrandKey = "wave" | "orange" | "djamo" | "card" | "paypal";

interface BrandBadgeProps {
  brand: BrandKey;
  size?: number; // outer square edge in px (default 48)
  className?: string;
}

const BG: Record<BrandKey, string> = {
  wave: "transparent",
  orange: "#0B0B0B",
  djamo: "#4136F1",
  card: "#0F172A",
  paypal: "#003087",
};

const LOGO_SRC: Partial<Record<BrandKey, string>> = {
  wave: waveLogo,
  orange: orangeMoneyLogo,
  djamo: djamoLogo,
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
      brand === "wave" ? 0 : brand === "djamo" ? Math.round(size * 0.14) : Math.round(size * 0.16);
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
            objectFit: brand === "wave" ? "cover" : "contain",
            display: "block",
          }}
        />
      </div>
    );
  }

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
      ) : (
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
