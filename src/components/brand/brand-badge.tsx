// BrandBadge — payment-brand icons as INLINE React SVG (not <img data:>).
// Lovable/Cloudflare CSP often blocks data: image URLs, which left empty or
// black squares in the payment method list.

import type { ReactNode } from "react";

export type BrandKey = "wave" | "orange" | "djamo" | "card" | "paypal";

interface BrandBadgeProps {
  brand: BrandKey;
  size?: number;
  className?: string;
}

function Shell({
  size,
  className,
  children,
}: {
  size: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={className}
      style={{ width: size, height: size, flexShrink: 0, lineHeight: 0 }}
      aria-hidden="true"
    >
      {children}
    </div>
  );
}

function WaveMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <rect width="48" height="48" rx="12" fill="#1DC8FF" />
      <ellipse cx="24" cy="26" rx="11" ry="13" fill="#101820" />
      <ellipse cx="24" cy="28" rx="7" ry="8.5" fill="#FFFFFF" />
      <circle cx="20.5" cy="22" r="2.2" fill="#FFFFFF" />
      <circle cx="27.5" cy="22" r="2.2" fill="#FFFFFF" />
      <path d="M22.5 25.5 24 27.2 25.5 25.5Z" fill="#FF8A00" />
      <ellipse cx="19.5" cy="38.5" rx="3.2" ry="1.6" fill="#FF8A00" />
      <ellipse cx="28.5" cy="38.5" rx="3.2" ry="1.6" fill="#FF8A00" />
      <path
        d="M13 24c-2.5-1-4.2-3.2-4.5-5.5-.2-1.2.8-1.6 1.5-.8 1.4 1.6 3.2 3.2 5.5 4.2"
        fill="#101820"
      />
    </svg>
  );
}

function OrangeMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <rect width="48" height="48" rx="12" fill="#FFFFFF" />
      <rect x="0.75" y="0.75" width="46.5" height="46.5" rx="11.25" stroke="#EEEEEE" />
      <g transform="translate(24 24) rotate(-135) translate(-24 -24)">
        <path d="M24 11v20" stroke="#FF7900" strokeWidth="5.5" strokeLinecap="round" />
        <path
          d="M15.5 22.5 24 31l8.5-8.5"
          stroke="#FF7900"
          strokeWidth="5.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

function DjamoMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <rect width="48" height="48" rx="12" fill="#4136F1" />
      <text
        x="24"
        y="30"
        textAnchor="middle"
        fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        fontSize="12"
        fontWeight="800"
        fill="#FFFFFF"
        letterSpacing="-0.3"
      >
        djamo
      </text>
    </svg>
  );
}

function PaypalMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <rect width="48" height="48" rx="12" fill="#003087" />
      <path
        fill="#fff"
        d="M18.2 34.5h-3.6c-.5 0-.8-.4-.7-.9l2.8-17.7c.1-.5.5-.9 1-.9h7.6c3.8 0 6.5 1.1 7.8 3.2 1.2 1.9 1.1 4.5-.2 7.4-1.6 3.5-4.7 5.3-9.1 5.3h-2.6l-.9 5.6c-.1.5-.5.9-1 .9h-1.1z"
      />
      <path
        fill="#009cde"
        d="M28.4 14.2c-.4-.1-.9-.2-1.5-.2h-5.9c-.3 0-.6.2-.7.5l-2.4 15.1-.1.5h3.4l.8-5.1.1-.4c.1-.3.4-.5.7-.5h1.6c3.5 0 6.2-1.4 7-5.5.3-1.7.1-3.1-.7-4.1-.3-.3-.7-.6-1.3-.8z"
      />
      <path
        fill="#012169"
        d="M29.8 19.1c-.2 0-.4 0-.6.1-.9.1-1.9.1-2.8.1h-1.5c-.3 0-.6.2-.7.5l-1 6.2-.1.4c0 .3.2.5.5.5h2.1c.3 0 .5-.2.5-.4l.4-2.6.1-.3c.1-.3.4-.5.7-.5h.4c2.4 0 4.3-1 4.8-3.8.2-.9.1-1.7-.3-2.3-.2-.3-.5-.5-.7-.6-.4.1-.7.1-1.2.2z"
      />
    </svg>
  );
}

function CardMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <rect width="48" height="48" rx="12" fill="#0F172A" />
      <g
        transform="translate(12 14)"
        fill="none"
        stroke="#fff"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="0.5" y="1" width="23" height="17" rx="2.5" />
        <path d="M0.5 7h23" />
      </g>
    </svg>
  );
}

export function BrandBadge({ brand, size = 48, className }: BrandBadgeProps) {
  if (brand === "wave") {
    return (
      <Shell size={size} className={className}>
        <WaveMark size={size} />
      </Shell>
    );
  }
  if (brand === "orange") {
    return (
      <Shell size={size} className={className}>
        <OrangeMark size={size} />
      </Shell>
    );
  }
  if (brand === "djamo") {
    return (
      <Shell size={size} className={className}>
        <DjamoMark size={size} />
      </Shell>
    );
  }
  if (brand === "paypal") {
    return (
      <Shell size={size} className={className}>
        <PaypalMark size={size} />
      </Shell>
    );
  }
  return (
    <Shell size={size} className={className}>
      <CardMark size={size} />
    </Shell>
  );
}
