import type { Lang } from "@/i18n";

/**
 * Locale-aware viewer count formatter.
 *  - fr: "1,1 k spectateurs", "890"
 *  - en: "1.1k viewers",       "890"
 * The word (viewers/spectateurs) is appended by the caller via i18n plurals
 * — this helper only formats the number.
 */
export function formatCount(n: number, lang: Lang): string {
  if (n < 1000) return String(n);
  const v = n / 1000;
  if (lang === "fr") {
    const s = v.toFixed(1).replace(".", ",");
    return `${s.endsWith(",0") ? s.slice(0, -2) : s} k`;
  }
  const s = v.toFixed(1);
  return `${s.endsWith(".0") ? s.slice(0, -2) : s}k`;
}

/**
 * Format a price in EUR according to the active locale.
 */
export function formatPrice(amount: number, lang: Lang): string {
  const locale = lang === "fr" ? "fr-FR" : "en-GB";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Very small relative-time formatter — good enough for feed timestamps.
 * Returns i18n keys + a `count` value the caller can pass into t().
 */
export function relativeTimeParts(from: Date | number): {
  key:
    | "time.now"
    | "time.minuteAgo"
    | "time.hourAgo"
    | "time.dayAgo"
    | "time.weekAgo"
    | "time.monthAgo"
    | "time.yearAgo";
  count: number;
} {
  const then = typeof from === "number" ? from : from.getTime();
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return { key: "time.now", count: 0 };
  const min = Math.floor(diffSec / 60);
  if (min < 60) return { key: "time.minuteAgo", count: min };
  const hr = Math.floor(min / 60);
  if (hr < 24) return { key: "time.hourAgo", count: hr };
  const day = Math.floor(hr / 24);
  if (day < 7) return { key: "time.dayAgo", count: day };
  const week = Math.floor(day / 7);
  if (week < 4) return { key: "time.weekAgo", count: week };
  const month = Math.floor(day / 30);
  if (month < 12) return { key: "time.monthAgo", count: month };
  const year = Math.floor(day / 365);
  return { key: "time.yearAgo", count: year };
}
