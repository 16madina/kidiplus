// Publishable Stripe key for the browser.
//
// This is a PUBLIC token (pk_test_… / pk_live_…) — safe in the client bundle.
// We prefer the value returned by the API (in case the server ever overrides
// it), and fall back to the compile-time env var injected by Vite. This is
// important because in the Cloudflare Worker runtime `process.env.VITE_*` is
// NOT exposed to server functions, so the server may legitimately return an
// empty publishableKey while the browser still has it locally.
export function resolvePublishableKey(fromServer?: string | null): string {
  const server = (fromServer ?? "").trim();
  if (server) return server;
  const client = (import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN ?? "").trim();
  return client;
}
