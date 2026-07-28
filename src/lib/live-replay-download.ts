/** Download / share a public replay MP4 to the device. */

function safeFilename(title?: string | null): string {
  const base = (title ?? "live")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const stamp = new Date().toISOString().slice(0, 10);
  return `kidiplus-${base || "live"}-${stamp}.mp4`;
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 4_000);
}

/**
 * Best-effort save/share of a replay video.
 * Returns how it was delivered so the UI can toast accordingly.
 */
export async function downloadLiveReplay(
  url: string,
  title?: string | null,
): Promise<"shared" | "downloaded" | "opened"> {
  const filename = safeFilename(title);

  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) throw new Error(`fetch_${res.status}`);
    const blob = await res.blob();
    const file = new File([blob], filename, {
      type: blob.type || "video/mp4",
    });

    const nav = navigator as Navigator & {
      canShare?: (data?: ShareData) => boolean;
    };
    if (typeof navigator.share === "function") {
      const data: ShareData = { files: [file], title: title ?? "KiDi+", text: title ?? "KiDi+" };
      if (!nav.canShare || nav.canShare(data)) {
        try {
          await navigator.share(data);
          return "shared";
        } catch (e) {
          // User cancelled share sheet — don't fall through as error.
          if (e instanceof DOMException && e.name === "AbortError") {
            return "shared";
          }
        }
      }
    }

    triggerBlobDownload(blob, filename);
    return "downloaded";
  } catch {
    // CORS or network — share/open the public URL so the OS can save it.
    try {
      const { nativeShare } = await import("@/lib/native");
      await nativeShare({
        title: title ?? "KiDi+",
        text: title ?? "Replay KiDi+",
        url,
        dialogTitle: "KiDi+",
      });
      return "shared";
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
      return "opened";
    }
  }
}
