/**
 * Hard stop for Vitrine feed audio/video.
 * Needed because `display:none` tabs (and overlays like Publish) do not
 * always stop HTMLVideoElement playback in mobile WebViews.
 */

const EVT = "kidi:vitrine-playback";

const reasons = new Set<string>();

export function isVitrinePlaybackSuspended() {
  return reasons.size > 0;
}

/** Pause + mute every feed video currently in the DOM. */
export function silenceVitrineVideos() {
  if (typeof document === "undefined") return;
  try {
    document.querySelectorAll<HTMLVideoElement>("video[data-vitrine-feed]").forEach((v) => {
      try {
        v.pause();
        v.muted = true;
        v.volume = 0;
      } catch {
        /* ignore */
      }
    });
  } catch {
    /* ignore */
  }
}

function emit() {
  try {
    window.dispatchEvent(
      new CustomEvent(EVT, { detail: { suspended: isVitrinePlaybackSuspended() } }),
    );
  } catch {
    /* ignore */
  }
}

/** Suspend feed playback for a named reason (tab, publish, …). */
export function suspendVitrinePlayback(reason = "default") {
  reasons.add(reason);
  silenceVitrineVideos();
  emit();
}

/** Clear one suspend reason; playback may resume when none remain. */
export function resumeVitrinePlayback(reason = "default") {
  reasons.delete(reason);
  emit();
}

export function subscribeVitrinePlayback(cb: () => void) {
  if (typeof window === "undefined") return () => undefined;
  const h = () => cb();
  window.addEventListener(EVT, h);
  return () => window.removeEventListener(EVT, h);
}
