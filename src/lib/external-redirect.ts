// Navigate the browser to an external payment page (PayPal, Stripe...).
// Inside an iframe (Lovable preview, embedded webviews) providers refuse to be
// framed, so we escape to the top-level window or open a new tab instead.

export type ExternalRedirectMode = "same-tab" | "top-frame" | "new-tab" | "blocked";

export function isFramed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.top !== window.self;
  } catch {
    return true;
  }
}

export function redirectExternal(url: string): ExternalRedirectMode {
  if (typeof window === "undefined") return "blocked";
  if (!isFramed()) {
    window.location.assign(url);
    return "same-tab";
  }
  try {
    if (window.top) {
      window.top.location.href = url;
      return "top-frame";
    }
  } catch {
    // Cross-origin parent: fall through to a new tab.
  }
  const win = window.open(url, "_blank", "noopener,noreferrer");
  if (win) return "new-tab";
  window.location.assign(url);
  return "same-tab";
}
