/** Open the seller Publish chooser from anywhere in the app. */
export const OPEN_PUBLISH_EVENT = "kidi:open-publish";

export type PublishKind = "story" | "video" | "photo" | "carousel" | "announce";

export function openPublish() {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(OPEN_PUBLISH_EVENT));
  } catch {
    /* ignore */
  }
}
