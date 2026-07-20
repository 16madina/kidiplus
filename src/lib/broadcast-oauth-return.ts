/**
 * After Facebook/YouTube OAuth the SPA remounts on `/` and loses Broadcast stage.
 * Stash intent before leaving; restore on return (web redirect or native deep link).
 */

export type BroadcastOAuthReturn = {
  stage: "setup" | "live";
};

const STORAGE_KEY = "kidi:broadcast_oauth_return";

export function stashBroadcastOAuthReturn(
  stage: BroadcastOAuthReturn["stage"] = "setup",
): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ stage }));
  } catch {
    /* ignore */
  }
}

export function takeBroadcastOAuthReturn(): BroadcastOAuthReturn | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(STORAGE_KEY);
    const parsed = JSON.parse(raw) as BroadcastOAuthReturn;
    if (parsed?.stage === "setup" || parsed?.stage === "live") return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

/** Soft return path for OAuth callback redirect (web). */
export function broadcastOAuthReturnPath(
  provider: "facebook" | "youtube",
): string {
  return `/?golive=setup&${provider}=pending`;
}

export function navigateToLiveTab(): void {
  try {
    window.dispatchEvent(
      new CustomEvent("kidi:navigate-tab", { detail: "live" }),
    );
  } catch {
    /* ignore */
  }
}
