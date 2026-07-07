// Small utilities to format currency for the wallet UI.

const CURRENCY_LOCALE: Record<string, string> = {
  eur: "fr-FR",
  usd: "en-US",
  xof: "fr-FR",
};

export function formatMoney(amount: number, currency = "eur"): string {
  const cur = currency.toUpperCase();
  const locale = CURRENCY_LOCALE[currency.toLowerCase()] ?? "fr-FR";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: cur,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${cur}`;
  }
}

/** Short version for the top-bar pill: "10 €" / "10,50 €". */
export function formatMoneyShort(amount: number, currency = "eur"): string {
  const cur = currency.toLowerCase();
  const symbol = cur === "eur" ? "€" : cur === "usd" ? "$" : cur.toUpperCase();
  const n =
    Number.isInteger(amount) ? amount.toString() : amount.toFixed(2).replace(".", ",");
  return `${n} ${symbol}`;
}
