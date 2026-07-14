// Soft URL paths for profile sections that are actually PushScreen overlays
// (not real pages). Deep links / emails / typed URLs used to hit TanStack's
// 404. We stash the intended section, redirect to `/`, then open auth (guest)
// or the matching overlay (signed-in).

export type SoftSection = "wallet" | "orders" | "earnings" | "shop" | "sell";

const STORAGE_KEY = "kidi:open-section";

const SECTION_BY_PATH: Record<string, SoftSection> = {
  "/wallet": "wallet",
  "/orders": "orders",
  "/earnings": "earnings",
  "/shop": "shop",
  "/my-shop": "shop",
  "/sell/onboarding": "sell",
  "/sell": "sell",
};

export function softSectionFromPath(pathname: string): SoftSection | null {
  const clean = pathname.replace(/\/+$/, "") || "/";
  return SECTION_BY_PATH[clean] ?? null;
}

export function stashSoftSection(section: SoftSection): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, section);
  } catch {
    /* ignore */
  }
}

export function takeSoftSection(): SoftSection | null {
  try {
    const v = window.sessionStorage.getItem(STORAGE_KEY);
    if (v) window.sessionStorage.removeItem(STORAGE_KEY);
    if (
      v === "wallet" ||
      v === "orders" ||
      v === "earnings" ||
      v === "shop" ||
      v === "sell"
    ) {
      return v;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export const OPEN_SECTION_EVENT = "kidi:open-section";

export function dispatchOpenSection(section: SoftSection): void {
  try {
    window.dispatchEvent(
      new CustomEvent<SoftSection>(OPEN_SECTION_EVENT, { detail: section }),
    );
  } catch {
    /* ignore */
  }
}
