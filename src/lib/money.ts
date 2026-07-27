// Multi-currency money layer.
//
// Supported currencies: XOF (FCFA — zero-decimal), EUR, CAD, USD, GBP.
// One live = one currency. Wallets are per-user. Reference rates mirror
// public.fx_rate server-side — keep the two in sync.

export type Currency = "XOF" | "EUR" | "CAD" | "USD" | "GBP";
export type Locale = "fr" | "en" | string;

const SUPPORTED: readonly Currency[] = ["XOF", "EUR", "CAD", "USD", "GBP"] as const;

export function normalizeCurrency(input: string | null | undefined): Currency {
  const c = (input ?? "").toUpperCase();
  return (SUPPORTED as readonly string[]).includes(c) ? (c as Currency) : "EUR";
}

/** True for currencies without minor units (Stripe zero-decimal list). */
export function isZeroDecimal(currency: Currency): boolean {
  return currency === "XOF";
}

/**
 * Currency-aware rounding: XOF → integer, others → 2 decimals.
 */
export function roundForCurrency(amount: number, currency: Currency): number {
  if (isZeroDecimal(currency)) return Math.round(amount);
  return Math.round(amount * 100) / 100;
}

/** Convert a display amount to the integer Stripe expects. */
export function toStripeMinor(amount: number, currency: Currency): number {
  const rounded = roundForCurrency(amount, currency);
  return isZeroDecimal(currency) ? Math.round(rounded) : Math.round(rounded * 100);
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function intlLocale(currency: Currency, locale: Locale): string {
  const lang = (locale || "fr").toLowerCase().slice(0, 2);
  if (lang === "en") return currency === "USD" ? "en-US" : "en-GB";
  return currency === "CAD" ? "fr-CA" : "fr-FR";
}

/**
 * Format an amount with the correct symbol/locale for the given currency.
 *  - fr + XOF: "5 000 FCFA"     · en + XOF: "5,000 FCFA"
 *  - fr + EUR: "7,60 €"          · en + EUR: "€7.60"
 *  - fr + CAD: "12,50 $ CA"      · en + CAD: "CA$12.50"
 */
export function formatMoney(
  amount: number,
  currency: string | null | undefined = "EUR",
  locale: Locale = "fr",
): string {
  const cur = normalizeCurrency(currency);
  const digits = isZeroDecimal(cur) ? 0 : 2;

  // Use "XOF" via Intl to get correct grouping, then swap the code for the
  // widely-recognised "FCFA" symbol used on the ground.
  if (cur === "XOF") {
    const nf = new Intl.NumberFormat(intlLocale(cur, locale), {
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    });
    return `${nf.format(Math.round(amount))} FCFA`;
  }

  try {
    return new Intl.NumberFormat(intlLocale(cur, locale), {
      style: "currency",
      currency: cur,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(amount);
  } catch {
    return `${amount.toFixed(digits)} ${cur}`;
  }
}

/** Compact version for top-bar pills. XOF drops decimals; EUR/CAD keep them only if non-integer. */
export function formatMoneyShort(
  amount: number,
  currency: string | null | undefined = "EUR",
  locale: Locale = "fr",
): string {
  const cur = normalizeCurrency(currency);
  if (isZeroDecimal(cur)) return formatMoney(amount, cur, locale);
  if (Number.isInteger(amount)) {
    const lang = (locale || "fr").slice(0, 2);
    if (lang === "en") {
      if (cur === "EUR") return `€${amount}`;
      if (cur === "CAD") return `CA$${amount}`;
      if (cur === "USD") return `$${amount}`;
      if (cur === "GBP") return `£${amount}`;
      return `${amount} ${cur}`;
    }
    const symbol =
      cur === "EUR" ? "€"
      : cur === "CAD" ? "$ CA"
      : cur === "USD" ? "$ US"
      : cur === "GBP" ? "£"
      : cur;
    return `${amount} ${symbol}`;
  }
  return formatMoney(amount, cur, locale);
}

// ---------------------------------------------------------------------------
// Country → currency mapping
// ---------------------------------------------------------------------------

const XOF_COUNTRIES = [
  "cote d'ivoire", "côte d'ivoire", "ci",
  "senegal", "sénégal", "sn",
  "mali", "ml",
  "burkina", "burkina faso", "bf",
  "benin", "bénin", "bj",
  "togo", "tg",
  "niger", "ne",
  "guinee-bissau", "guinée-bissau", "guinea-bissau", "gw",
];
const CAD_COUNTRIES = ["canada", "ca"];
const USD_COUNTRIES = ["etats-unis", "états-unis", "united states", "usa", "us"];
const GBP_COUNTRIES = ["royaume-uni", "united kingdom", "uk", "gb", "angleterre", "england"];
const EUR_COUNTRIES = [
  "france", "fr",
  "belgique", "belgium", "be",
  "suisse", "switzerland", "ch",
  "espagne", "spain", "es",
  "italie", "italy", "it",
  "allemagne", "germany", "de",
  "portugal", "pt",
  "pays-bas", "netherlands", "nl",
  "luxembourg", "lu",
  "irlande", "ireland", "ie",
  "autriche", "austria", "at",
];

/** Best-effort currency guess for a country string (accepts free text w/ flag). */
export function currencyForCountry(country: string | null | undefined): Currency {
  if (!country) return "EUR";
  const c = country.toLowerCase();
  if (XOF_COUNTRIES.some((k) => c.includes(k))) return "XOF";
  if (CAD_COUNTRIES.some((k) => c.includes(k) || c.endsWith(k))) return "CAD";
  if (USD_COUNTRIES.some((k) => c.includes(k) || c === k)) return "USD";
  if (GBP_COUNTRIES.some((k) => c.includes(k) || c === k)) return "GBP";
  if (EUR_COUNTRIES.some((k) => c.includes(k))) return "EUR";
  return "EUR";
}

// ---------------------------------------------------------------------------
// Currency-specific presets & increments
// ---------------------------------------------------------------------------

export type BidRules = {
  /** Smallest step used above `threshold`. */
  step: number;
  /** Smaller step used below `threshold` (used to keep low-price auctions moving). */
  smallStep: number;
  threshold: number;
};

export function bidRulesFor(currency: Currency): BidRules {
  switch (currency) {
    case "XOF": return { step: 500, smallStep: 250, threshold: 5000 };
    case "CAD": return { step: 1, smallStep: 1, threshold: 0 };
    case "EUR":
    case "USD":
    case "GBP":
    default:    return { step: 1, smallStep: 0.5, threshold: 10 };
  }
}

/** Next bid increment for a current price in the given currency. */
export function nextBidAmount(currentPrice: number, currency: Currency): number {
  const rules = bidRulesFor(currency);
  const step = currentPrice < rules.threshold ? rules.smallStep : rules.step;
  return roundForCurrency(currentPrice + step, currency);
}

/** Increment size for the given current price + currency (for stepper +/− buttons). */
export function bidStepFor(currentPrice: number, currency: Currency): number {
  const rules = bidRulesFor(currency);
  return currentPrice < rules.threshold ? rules.smallStep : rules.step;
}

/** Sane upper cap: max(100× start price, currency floor). Mirrors server enforcement. */
export function maxBidAmount(startPrice: number, currency: Currency): number {
  const floor =
    currency === "XOF" ? 1_000_000 : currency === "CAD" ? 3000 : 2000;
  return Math.max((startPrice || 0) * 100, floor);
}

export function topUpPresets(currency: Currency): number[] {
  switch (currency) {
    case "XOF": return [2000, 5000, 10000, 25000];
    case "CAD":
    case "USD":
    case "GBP": return [5, 10, 25, 50];
    case "EUR":
    default:    return [5, 10, 25, 50];
  }
}

export function topUpLimits(currency: Currency): { min: number; max: number } {
  switch (currency) {
    case "XOF": return { min: 1000, max: 300000 };
    case "CAD":
    case "USD":
    case "GBP": return { min: 2, max: 500 };
    case "EUR":
    default:    return { min: 2, max: 500 };
  }
}

// ---------------------------------------------------------------------------
// Conversion (settlement-grade — mirrored server-side in public.fx_rate /
// public.convert_money — keep these two in sync)
// ---------------------------------------------------------------------------

/** Safety margin applied to non-peg pairs (buyer pays a bit more). */
export const FX_MARGIN = 0.015;

// 1 EUR references (XOF is an official BCEAO peg — no margin).
// Mirror public.fx_rate server-side when touching these.
const EUR_TO: Record<Currency, number> = {
  EUR: 1,
  XOF: 655.957,
  CAD: 1.47,
  USD: 1.09,
  GBP: 0.85,
};

function isPegPair(from: Currency, to: Currency): boolean {
  return (from === "EUR" && to === "XOF") || (from === "XOF" && to === "EUR");
}

/** Exchange rate `from → to` (1 unit of `from` = rate units of `to`). */
export function fxRate(from: Currency, to: Currency): number {
  if (from === to) return 1;
  const raw = EUR_TO[to] / EUR_TO[from];
  return isPegPair(from, to) ? raw : raw * (1 - FX_MARGIN);
}

/**
 * Settlement-grade converter. Rounds correctly for the target currency and
 * rounds UP on non-XOF to avoid off-by-cent underpays against the seller.
 */
export function convertMoney(
  amount: number,
  from: string | null | undefined,
  to: string | null | undefined,
): number {
  const f = normalizeCurrency(from);
  const t = normalizeCurrency(to);
  if (f === t) return roundForCurrency(amount, t);
  const raw = amount * fxRate(f, t);
  if (t === "XOF") return Math.round(raw);
  return Math.ceil(raw * 100) / 100;
}

/** Kept for legacy call sites — now equivalent to convertMoney. */
export function approxConvert(amount: number, from: Currency, to: Currency): number {
  return convertMoney(amount, from, to);
}

/** "≈ 7,62 €" — small muted hint below a primary price. */
export function approxLabel(
  amount: number,
  from: string | null | undefined,
  to: string | null | undefined,
  locale: Locale = "fr",
): string {
  const f = normalizeCurrency(from);
  const t = normalizeCurrency(to);
  if (f === t) return "";
  return `≈ ${formatMoney(convertMoney(amount, f, t), t, locale)}`;
}

/** Alias with clearer name for new call sites. */
export const formatConvertedHint = approxLabel;

// ---------------------------------------------------------------------------
// Currency symbol used for compact input labels ("€", "$ CA", "FCFA")
// ---------------------------------------------------------------------------

export function currencySymbol(currency: string | null | undefined): string {
  const c = normalizeCurrency(currency);
  if (c === "EUR") return "€";
  if (c === "CAD") return "$ CA";
  if (c === "USD") return "$ US";
  if (c === "GBP") return "£";
  return "FCFA";
}
