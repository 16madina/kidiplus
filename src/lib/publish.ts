/** Open the seller TikTok-style camera (Story / Photo / Vidéo). */
export const OPEN_PUBLISH_EVENT = "kidi:open-publish";

export type PublishKind = "story" | "video" | "photo" | "carousel" | "announce";

/** Opens the in-app publish camera. Live announce stays on the Live tab. */
export function openPublish() {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(OPEN_PUBLISH_EVENT));
  } catch {
    /* ignore */
  }
}
