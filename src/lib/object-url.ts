// Tiny helper for object-URL lifetime on picked images.
// Usage: keep the returned tracker in a ref; call track(url) whenever you
// swap the shown blob URL, and call disposeAll() on unmount.
export function createObjectUrlTracker() {
  const urls = new Set<string>();
  return {
    track(url: string): string {
      urls.add(url);
      return url;
    },
    revoke(url: string | null | undefined) {
      if (!url) return;
      if (urls.has(url) || url.startsWith("blob:")) {
        try { URL.revokeObjectURL(url); } catch {}
        urls.delete(url);
      }
    },
    disposeAll() {
      urls.forEach((u) => {
        try { URL.revokeObjectURL(u); } catch {}
      });
      urls.clear();
    },
  };
}

export function isBlobUrl(u: string | null | undefined): boolean {
  return !!u && u.startsWith("blob:");
}
