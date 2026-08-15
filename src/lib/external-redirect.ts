// Navigate the browser to an external payment page (PayPal, Stripe...).
// Inside an iframe (Lovable preview, embedded webviews) providers refuse to be
// framed, so we escape to the top-level window or open a new tab instead.
export function redirectExternal(url: string) {
  if (typeof window === "undefined") return;
  const framed = window.top !== window.self;
  if (!framed) {
    window.location.assign(url);
    return;
  }
  try {
    if (window.top) {
      window.top.location.href = url;
      return;
    }
  } catch {
    // Cross-origin parent: fall through to a new tab.
  }
  const win = window.open(url, "_blank", "noopener,noreferrer");
  if (!win) window.location.assign(url);
}
